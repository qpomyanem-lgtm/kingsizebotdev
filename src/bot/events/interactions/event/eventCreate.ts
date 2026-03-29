import {
    ButtonInteraction,
    Client,
    ContainerBuilder,
    GuildMember,
    MessageFlags,
    ModalSubmitInteraction,
    TextBasedChannel,
    TextDisplayBuilder,
} from 'discord.js';
import { db } from '../../../../db';
import { events, systemSettings } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { canCreateEvents, EVENT_TYPE_LABELS } from './eventShared';
import { refreshEventEmbed } from './eventEmbedPayload.js';

// ── 1. Create Button → Show Modal with raw Radio Group ─────────

export async function handleEventCreateBtn(interaction: ButtonInteraction) {
    // Modal already shown via raw WebSocket handler — nothing else to do.
    // Permission check is in the modal submit handler.
}

// ── 2. Create Modal Submit → Insert Event ────────────────────────

export async function handleEventCreateModalSubmit(interaction: ModalSubmitInteraction) {
    // Acknowledge immediately to gracefully close the modal silently.
    await interaction.deferUpdate().catch(() => {});

    // Permission check (deferred from button handler to avoid interaction timeout)
    const allowed = await canCreateEvents(interaction.member as GuildMember | null, interaction.user.id);
    if (!allowed) {
        await interaction.followUp({ content: 'У вас нет прав для создания списков.', ephemeral: true });
        return;
    }

    const eventType = 'Capt';

    const time = interaction.fields.getTextInputValue('timeInput');
    const slotsStr = interaction.fields.getTextInputValue('slotsInput');

    const slots = parseInt(slotsStr, 10);
    if (isNaN(slots) || slots <= 0) {
        await interaction.followUp({ content: 'Количество слотов должно быть положительным числом.', ephemeral: true });
        return;
    }

    // Parse time
    let hours = 0,
        minutes = 0;
    const timeMatch = time.match(/(\d{1,2})\D*(\d{2})?/);
    if (timeMatch) {
        hours = Math.min(parseInt(timeMatch[1], 10), 23);
        minutes = timeMatch[2] ? Math.min(parseInt(timeMatch[2], 10), 59) : 0;
    }

    // Get current Moscow time for date defaults
    const nowMoscow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));

    // Auto-detect date: today or tomorrow if time already passed
    let day = nowMoscow.getDate();
    let month = nowMoscow.getMonth() + 1;
    let year = nowMoscow.getFullYear();

    if (hours < nowMoscow.getHours() || (hours === nowMoscow.getHours() && minutes <= nowMoscow.getMinutes())) {
        const tomorrow = new Date(nowMoscow);
        tomorrow.setDate(tomorrow.getDate() + 1);
        day = tomorrow.getDate();
        month = tomorrow.getMonth() + 1;
        year = tomorrow.getFullYear();
    }

    // Build ISO string with Moscow offset (+03:00) — this correctly converts to UTC
    const pad = (n: number) => n.toString().padStart(2, '0');
    const isoMoscow = `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00+03:00`;
    const utcDate = new Date(isoMoscow);

    // Determine target channel from system settings
    const channelSettingKey = 'EVENT_CAPT_CHANNEL_ID';
    const [channelSetting] = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, channelSettingKey));

    const targetChannelId = channelSetting?.value;
    if (!targetChannelId) {
        await interaction.followUp({
            content: `Канал для ${EVENT_TYPE_LABELS[eventType] ?? eventType} не настроен. Попросите администратора указать канал в настройках.`,
            ephemeral: true
        });
        return;
    }

    const client = interaction.client as Client;
    let targetChannel: TextBasedChannel;
    try {
        const fetched = await client.channels.fetch(targetChannelId);
        if (!fetched || !fetched.isTextBased() || !('send' in fetched)) {
            await interaction.followUp({ content: 'Настроенный канал недоступен или не является текстовым.', ephemeral: true });
            return;
        }
        targetChannel = fetched as TextBasedChannel;
    } catch {
        await interaction.followUp({ content: 'Не удалось получить настроенный канал. Проверьте ID в настройках.', ephemeral: true });
        return;
    }

    // @everyone ping — отдельным сообщением, т.к. Components V2 не поддерживает content
    await (targetChannel as any).send({ content: '@everyone' }).catch(() => {});

    const msg = await (targetChannel as any).send({
        components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('Загрузка списка...'))],
        flags: MessageFlags.IsComponentsV2,
    });

    const eventId = uuidv4();

    // Create a thread for logs on the event message
    try {
        await msg.startThread({
            name: `Список #${eventId.slice(0, 4)}`,
            autoArchiveDuration: 1440,
        });
    } catch (e) {
        console.error('❌ Не удалось создать ветку для логов:', e);
    }

    await db.insert(events).values({
        id: eventId,
        messageId: msg.id,
        channelId: msg.channelId,
        creatorId: interaction.user.id,
        eventType,
        eventTime: utcDate,
        slots,
        status: 'Open',
    });

    await refreshEventEmbed(msg as any, eventId);
}

