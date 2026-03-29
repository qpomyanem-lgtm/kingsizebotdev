import { ModalSubmitInteraction } from 'discord.js';
import { db } from '../../../db';
import { afkEntries } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { refreshAfkEmbed } from '../../lib/afkEmbed';
import { v4 as uuid } from 'uuid';
import { hasPermission, hasSystemRole } from '../../../backend/lib/discordRoles';

export async function handleAfkModalSubmit(interaction: ModalSubmitInteraction) {
    // Acknowledge immediately to gracefully close the modal silently.
    await interaction.deferUpdate().catch(() => {});

    // Permission check (deferred from button handler to avoid interaction timeout)
    const allowed = await hasPermission(interaction.user.id, 'bot:afk:start') ||
                    await hasSystemRole(interaction.user.id, 'main') ||
                    await hasSystemRole(interaction.user.id, 'new');
    if (!allowed) {
        return interaction.followUp({ content: 'У вас нет доступа к системе АФК.', ephemeral: true });
    }

    // Check if user already has an active AFK
    const existing = await db.select().from(afkEntries)
        .where(
            and(
                eq(afkEntries.discordId, interaction.user.id),
                eq(afkEntries.status, 'active')
            )
        );
    if (existing.length > 0) {
        return interaction.followUp({ content: 'У вас уже есть активный АФК. Сначала завершите его.', ephemeral: true });
    }

    const timeStr = interaction.fields.getTextInputValue('afk_time').trim();
    const reason = interaction.fields.getTextInputValue('afk_reason').trim();

    // Extract HH:MM from anywhere in the string
    const timeRegex = /([01]?\d|2[0-3])[\s:-]*([0-5]\d)/;
    const match = timeStr.match(timeRegex);

    if (!match) {
        return interaction.followUp({ content: '❌ Не удалось определить время. Пожалуйста, укажите ЧАСЫ МИНУТЫ (например, "до 14 30").', ephemeral: true });
    }

    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);

    // Current UTC time
    const nowUtc = new Date();
    // Calculate current MSK time (UTC+3)
    const nowMsk = new Date(nowUtc.getTime() + 3 * 60 * 60 * 1000);
    
    // Create target time in MSK
    const targetMsk = new Date(nowMsk);
    targetMsk.setUTCHours(hours, minutes, 0, 0);

    // If target time is earlier than current time, it means tomorrow in MSK
    if (targetMsk <= nowMsk) {
        targetMsk.setUTCDate(targetMsk.getUTCDate() + 1);
    }

    // Convert target MSK back to UTC for DB storage
    const targetUtc = new Date(targetMsk.getTime() - 3 * 60 * 60 * 1000);

    await db.insert(afkEntries).values({
        id: uuid(),
        discordId: interaction.user.id,
        discordUsername: interaction.user.username,
        discordAvatarUrl: interaction.user.avatarURL() || null,
        reason,
        endsAt: targetUtc,
        status: 'active'
    });

    // We do not send a success message to avoid cluttering temporary messages.
    await refreshAfkEmbed(interaction.client);
}
