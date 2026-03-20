import { ModalSubmitInteraction } from 'discord.js';
import { db } from '../../../../db';
import { events } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { refreshEventEmbed } from './eventEmbedPayload.js';

export async function handleEventMapModalSubmit(interaction: any) {
    const eventId = interaction.customId.replace('event_map_modal_', '');

    // Extract radio value from raw components
    const rawData = interaction.components ?? [];
    let mapId = '';
    function findRadio(arr: any[]) {
        for (const comp of arr) {
            if (comp.customId === 'map_radio' || comp.custom_id === 'map_radio') {
                mapId = comp.value ?? '';
                return;
            }
            if (comp.component) findRadio([comp.component]);
            if (comp.components) findRadio(comp.components);
        }
    }
    findRadio(rawData);

    if (!mapId || mapId === 'none') {
        await interaction.reply({ content: 'Карта не выбрана.', ephemeral: true });
        return;
    }

    const [event] = await db.select().from(events).where(eq(events.id, eventId));
    if (!event) {
        await interaction.reply({ content: 'Событие не найдено.', ephemeral: true });
        return;
    }

    await db.update(events).set({ mapId }).where(eq(events.id, eventId));

    if (interaction.channel) {
        try {
            const originalMsg = await interaction.channel.messages.fetch(event.messageId as string);
            await refreshEventEmbed(originalMsg as any, eventId);
            await interaction.reply({ content: 'Карта успешно обновлена!', ephemeral: true });
        } catch (error) {
            console.error('❌ Внутренняя ошибка (eventInteractions map):', error);
            await interaction.reply({ content: 'Произошла ошибка.', ephemeral: true });
        }
    } else {
        await interaction.reply({ content: 'Не удалось найти канал.', ephemeral: true });
    }
}

