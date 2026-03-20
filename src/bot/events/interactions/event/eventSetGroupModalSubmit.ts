import { ModalSubmitInteraction } from 'discord.js';
import { db } from '../../../../db';
import { events } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { refreshEventEmbed } from './eventEmbedPayload.js';

export async function handleEventSetGroupModalSubmit(interaction: ModalSubmitInteraction) {
    const eventId = interaction.customId.replace('event_setgroup_modal_', '');
    const groupCode = interaction.fields.getTextInputValue('groupCodeInput');

    const [event] = await db.select().from(events).where(eq(events.id, eventId));
    if (!event) {
        await interaction.reply({ content: 'Событие не найдено.', ephemeral: true });
        return;
    }

    await db.update(events).set({ groupCode }).where(eq(events.id, eventId));

    if (interaction.channel) {
        try {
            const originalMsg = await interaction.channel.messages.fetch(event.messageId as string);
            await refreshEventEmbed(originalMsg as any, eventId);
            await interaction.reply({ content: 'Группа успешно обновлена!', ephemeral: true });
        } catch (error) {
            console.error('❌ Внутренняя ошибка (eventInteractions leave):', error);
            await interaction.reply({ content: 'Произошла ошибка при обновлении сообщения.', ephemeral: true });
        }
    } else {
        await interaction.reply({ content: 'Не удалось найти канал.', ephemeral: true });
    }
}

