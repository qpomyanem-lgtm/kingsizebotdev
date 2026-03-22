import {
    ButtonInteraction,
    ContainerBuilder,
    GuildMember,
    MessageFlags,
    ModalSubmitInteraction,
    TextDisplayBuilder,
} from 'discord.js';
import { db } from '../../../../db';
import { events } from '../../../../db/schema';
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
                label: 'Тип мероприятия',
                description: 'Выберите тип мероприятия для списка',
                component: {
                    type: 21, // RadioGroup
                    custom_id: 'event_type_radio',
                    options: [
                        { value: 'MCL', label: 'MCL', description: 'MCL мероприятие' },
                        { value: 'ВЗЗ', label: 'ВЗЗ', description: 'ВЗЗ мероприятие' },
                        { value: 'Capt', label: 'Капт', description: 'Капт мероприятие' },
                    ],
                },
            },
            {
                type: 1, // ActionRow
                components: [
                    {
                        type: 4, // TextInput
                        custom_id: 'timeInput',
                        label: 'Время (МСК)',
                        placeholder: 'Например, 18:30',
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
                        custom_id: 'dateInput',
                        label: 'Дата (необязательно)',
                        placeholder: 'Например, 25.03',
                        style: 1,
                        required: false,
                    },
                ],
            },
            {
                type: 1,
                components: [
                    {
                        type: 4,
                        custom_id: 'slotsInput',
                        label: 'Количество слотов',
                        placeholder: '10',
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
    let eventType: 'Capt' | 'MCL' | 'ВЗЗ' = 'MCL'; // fallback
    for (const comp of rawComponents) {
        const inner = comp.components?.[0] ?? comp.component;
        if (inner?.customId === 'event_type_radio' || inner?.custom_id === 'event_type_radio') {
            eventType = (inner.value ?? 'MCL') as typeof eventType;
            break;
        }
    }

    const time = interaction.fields.getTextInputValue('timeInput');
    const date = interaction.fields.getTextInputValue('dateInput');
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

    let day: number, month: number, year: number;
    if (date) {
        const dateMatch = date.match(/(\d{1,2})\D+(\d{1,2})(?:\D+(\d{2,4}))?/);
        if (dateMatch) {
            day = Math.min(parseInt(dateMatch[1], 10), 31);
            month = Math.max(1, Math.min(parseInt(dateMatch[2], 10), 12));
            year = dateMatch[3] ? parseInt(dateMatch[3], 10) : nowMoscow.getFullYear();
            if (year < 100) year += 2000;
        } else {
            day = nowMoscow.getDate();
            month = nowMoscow.getMonth() + 1;
            year = nowMoscow.getFullYear();
        }
    } else {
        // No date provided — use today (or tomorrow if time already passed)
        day = nowMoscow.getDate();
        month = nowMoscow.getMonth() + 1;
        year = nowMoscow.getFullYear();

        // Check if the time already passed today in Moscow
        if (hours < nowMoscow.getHours() || (hours === nowMoscow.getHours() && minutes <= nowMoscow.getMinutes())) {
            // Advance to tomorrow
            const tomorrow = new Date(nowMoscow);
            tomorrow.setDate(tomorrow.getDate() + 1);
            day = tomorrow.getDate();
            month = tomorrow.getMonth() + 1;
            year = tomorrow.getFullYear();
        }
    }

    // Build ISO string with Moscow offset (+03:00) — this correctly converts to UTC
    const pad = (n: number) => n.toString().padStart(2, '0');
    const isoMoscow = `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00+03:00`;
    const utcDate = new Date(isoMoscow);

    if (!interaction.channel || interaction.channel.isDMBased() || !('send' in interaction.channel)) {
        await interaction.editReply({ content: 'Невозможно отправить сообщение в этот канал.' });
        return;
    }

    const msg = await interaction.channel.send({
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

