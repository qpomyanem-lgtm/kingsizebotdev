import { ButtonInteraction, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { db } from '../../../db';
import { afkEntries, roleSettings } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { refreshAfkEmbed } from '../../lib/afkEmbed';

export async function handleAfkStartBtn(interaction: ButtonInteraction) {
    // Check if user has at least one configured role
    const configuredRoles = await db.select().from(roleSettings);
    const validRoleIds = configuredRoles.map(r => r.discordRoleId).filter(Boolean) as string[];
    
    // member might be partial, ensure roles can be checked
    const member = interaction.guild?.members.cache.get(interaction.user.id) || await interaction.guild?.members.fetch(interaction.user.id);
    if (!member) {
        return interaction.reply({ content: 'Ошибка получения данных пользователя.', ephemeral: true });
    }

    const hasAnyConfiguredRole = validRoleIds.some(id => member.roles.cache.has(id));
    if (!hasAnyConfiguredRole) {
        return interaction.reply({ content: 'У вас нет доступа к системе АФК (требуется настроенная роль).', ephemeral: true });
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
        return interaction.reply({ content: 'У вас уже есть активный АФК. Сначала завершите его.', ephemeral: true });
    }

    const modal = new ModalBuilder()
        .setCustomId('afk_start_modal')
        .setTitle('Начать АФК');

    const timeField = new TextInputBuilder()
        .setCustomId('afk_time')
        .setLabel('Окончание (добавьте ЧЧ:ММ по МСК)')
        .setPlaceholder('Например: Завтра до 14:30')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(true);

    const reasonField = new TextInputBuilder()
        .setCustomId('afk_reason')
        .setLabel('Причина')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(timeField),
        new ActionRowBuilder<TextInputBuilder>().addComponents(reasonField)
    );

    await interaction.showModal(modal);
}

export async function handleAfkEndBtn(interaction: ButtonInteraction) {
    const existing = await db.select().from(afkEntries)
        .where(
            and(
                eq(afkEntries.discordId, interaction.user.id),
                eq(afkEntries.status, 'active')
            )
        );

    if (existing.length === 0) {
        return interaction.reply({ content: 'У вас нет активного АФК.', ephemeral: true });
    }

    await db.update(afkEntries).set({
        status: 'ended',
        endedByType: 'self',
        endedAt: new Date()
    }).where(eq(afkEntries.id, existing[0].id));

    await interaction.reply({ content: '✅ Ваш АФК успешно завершён.', ephemeral: true });
    await refreshAfkEmbed(interaction.client);
}
