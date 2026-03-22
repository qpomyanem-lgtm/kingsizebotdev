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
import { showModalViaInteractionCallback } from '../../../lib/interactionResponses';

// ── 1. Create Button → Show Modal with raw Radio Group ─────────

export async function handleEventCreateBtn(interaction: ButtonInteraction) {
    const allowed = await canCreateEvents(interaction.member as GuildMember | null, interaction.user.id);
    if (!allowed) {
        await interaction.reply({ content: 'У вас нет прав для создания списков.', ephemeral: true });
        return;
    }

    // Single modal with RadioGroup + TextInputs (raw API for RadioGroup support)
    const rawModal = {
        title: 'Создание списка',
        custom_id: 'event_create_modal',
        components: [
            {
                type: 18, // Label
                label: 'Выберите тип списка:',
                component: {
                    type: 21, // RadioGroup
                    custom_id: 'event_type_radio',
                    options: [
                        { value: 'MCL', label: 'Создать список на MCL / ВЗЗ' },
                        { value: 'Capt', label: 'Создать список на капт' },
                    ],
                },
            },
            {
                type: 1, // ActionRow
                components: [
                    {
                        type: 4, // TextInput
                        custom_id: 'timeInput',
                        label: 'Время проведения(МСК):',
                        style: 1, // Short
                        required: true,
                    },
                ],
            },
            {
                type: 1,
                components: [
                    {
                        type: 4,
                        custom_id: 'slotsInput',
                        label: 'Количество слотов:',
                        style: 1,
                        required: true,
                    },
                ],
            },
        ],
    };

    // @ts-ignore — raw API call for RadioGroup support
    await showModalViaInteractionCallback(interaction, rawModal as any);
}

// ── 2. Create Modal Submit → Insert Event ────────────────────────

export async function handleEventCreateModalSubmit(interaction: ModalSubmitInteraction) {
    // Acknowledge immediately to avoid interaction token expiry.
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    // Extract radio value for event type from raw components
    const rawComponents = (interaction as any).components ?? [];
    type EventType = 'Capt' | 'MCL' | 'ВЗЗ';
    let eventType: EventType = 'MCL'; // fallback
    for (const comp of rawComponents) {
        const inner = comp.components?.[0] ?? comp.component;
        if (inner?.customId === 'event_type_radio' || inner?.custom_id === 'event_type_radio') {
            eventType = (inner.value ?? 'MCL') as EventType;
            break;
        }
    }

    const time = interaction.fields.getTextInputValue('timeInput');
    const slotsStr = interaction.fields.getTextInputValue('slotsInput');

    const slots = parseInt(slotsStr, 10);
    if (isNaN(slots) || slots <= 0) {
        await interaction.editReply({ content: 'Количество слотов должно быть положительным числом.' });
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

    // Determine target channel from system settings based on event type
    const channelSettingKey = eventType === 'Capt' ? 'EVENT_CAPT_CHANNEL_ID' : 'EVENT_MCL_CHANNEL_ID';
    const [channelSetting] = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, channelSettingKey));

    const targetChannelId = channelSetting?.value;
    if (!targetChannelId) {
        await interaction.editReply({
            content: `Канал для ${EVENT_TYPE_LABELS[eventType] ?? eventType} не настроен. Попросите администратора указать канал в настройках.`,
        });
        return;
    }

    const client = interaction.client as Client;
    let targetChannel: TextBasedChannel;
    try {
        const fetched = await client.channels.fetch(targetChannelId);
        if (!fetched || !fetched.isTextBased() || !('send' in fetched)) {
            await interaction.editReply({ content: 'Настроенный канал недоступен или не является текстовым.' });
            return;
        }
        targetChannel = fetched as TextBasedChannel;
    } catch {
        await interaction.editReply({ content: 'Не удалось получить настроенный канал. Проверьте ID в настройках.' });
        return;
    }

    // @everyone ping — отдельным сообщением, т.к. Components V2 не поддерживает content
    await (targetChannel as any).send({ content: '@everyone' }).catch(() => {});

    const msg = await (targetChannel as any).send({
        components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('Загрузка списка...'))],
        flags: MessageFlags.IsComponentsV2,
    });

    const eventId = uuidv4();
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
    await interaction.editReply({
        content: `Список на ${EVENT_TYPE_LABELS[eventType] ?? eventType} успешно создан!`,
    });
}

