import { ButtonInteraction, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { db } from '../../../db';
import { afkEntries } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { refreshAfkEmbed } from '../../lib/afkEmbed';
export async function handleAfkStartBtn(interaction: ButtonInteraction) {
    // Modal already shown via raw WebSocket handler — nothing else to do.
    // Permission and duplicate-AFK checks are in the modal submit handler.
}

export async function handleAfkEndBtn(interaction: ButtonInteraction) {
    // deferUpdate already sent via raw WebSocket handler.

    const existing = await db.select().from(afkEntries)
        .where(
            and(
                eq(afkEntries.discordId, interaction.user.id),
                eq(afkEntries.status, 'active')
            )
        );

    if (existing.length === 0) {
        return interaction.followUp({ content: 'У вас нет активного АФК.', ephemeral: true }).catch(() => {});
    }

    await db.update(afkEntries).set({
        status: 'ended',
        endedByType: 'self',
        endedAt: new Date()
    }).where(eq(afkEntries.id, existing[0].id));

    await refreshAfkEmbed(interaction.client);
}
