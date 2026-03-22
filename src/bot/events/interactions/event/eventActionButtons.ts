import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ModalBuilder,
    ModalSubmitInteraction,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { db } from '../../../../db';
import { events, eventParticipants, members, eventMaps, eventLogs, systemSettings } from '../../../../db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { refreshEventEmbed } from './eventEmbedPayload.js';
import { showModalViaInteractionCallback } from '../../../lib/interactionResponses';
import { EVENT_TYPE_LABELS, toUnixTs } from './eventShared';

export async function handleEventActionBtn(interaction: ButtonInteraction) {
    const parts = interaction.customId.split('_');
    // Formats:
    //   event_join_<id>, event_leave_<id>, event_manage_<id>,
    //   event_close_<id>, event_setgroup_<id>, event_selectmap_<id>
    const action = parts[1];
    const eventId = parts.slice(2).join('_');

    const isModalAction = action === 'selectmap' || action === 'setgroup' || action === 'removepick' || action === 'setvoice';
    // For non-modal actions we must ACK quickly to avoid Discord 10062 "Unknown interaction".
    if (!isModalAction) {
        await interaction.deferUpdate().catch(() => {});
    }

    const sendEphemeral = async (payload: any) => {
        if (isModalAction) {
            return interaction.reply(payload);
        }

        // After deferUpdate() followUp() is allowed; if deferUpdate() failed,
        // fall back to reply() to avoid InteractionNotReplied.
        try {
            if (interaction.deferred || interaction.replied) {
                return await interaction.followUp(payload);
            }
            return await interaction.reply(payload);
        } catch (e) {
            // If the interaction token is already expired (10062), there's nothing to do.
            return null;
        }
    };

    const [event] = await db.select().from(events).where(eq(events.id, eventId));
    if (!event) {
        await sendEphemeral({ content: 'Событие не найдено или уже удалено.', ephemeral: true });
        return;
    }

    // ── manage ──
    if (action === 'manage') {
        const canManage = interaction.user.id === event.creatorId;

        if (!canManage) {
            await sendEphemeral({ content: 'У вас нет прав для управления этим списком.', ephemeral: true });
            return;
        }
        if (event.status === 'Closed') {
            await sendEphemeral({ content: 'Список уже закрыт.', ephemeral: true });
            return;
        }

        const buttons: ButtonBuilder[] = [
            new ButtonBuilder()
                .setCustomId(`event_close_${eventId}`)
                .setLabel('Закрыть список')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔒'),
            new ButtonBuilder()
                .setCustomId(`event_removepick_${eventId}`)
                .setLabel('Удалить из списка')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('❌'),
            new ButtonBuilder()
                .setCustomId(`event_setgroup_${eventId}`)
                .setLabel('Указать группу')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📝'),
            new ButtonBuilder()
                .setCustomId(`event_setvoice_${eventId}`)
                .setLabel('Голосовой канал')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔊'),
        ];

        // Map selection only for MCL/ВЗЗ
        if (event.eventType === 'MCL' || event.eventType === 'ВЗЗ') {
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`event_selectmap_${eventId}`)
                    .setLabel('Выбрать карту')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🗺️'),
            );
        }

        const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(0, 5));
        const rows: ActionRowBuilder<ButtonBuilder>[] = [row1];

        // Second row for logs + mention
        const row2Buttons: ButtonBuilder[] = [
            new ButtonBuilder()
                .setCustomId(`event_logs_${eventId}`)
                .setLabel('Логи')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📋'),
            new ButtonBuilder()
                .setCustomId(`event_mention_${eventId}`)
                .setLabel('Упомянуть')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📢'),
        ];
        rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...row2Buttons));

        await sendEphemeral({ content: 'Управление списком:', components: rows, ephemeral: true });
        return;
    }

    // ── removepick (show modal with UserSelect) ──
    if (action === 'removepick') {
        const canManage = interaction.user.id === event.creatorId;
        if (!canManage) {
            await sendEphemeral({ content: 'У вас нет прав для управления этим списком.', ephemeral: true });
            return;
        }

        const participants = await db
            .select()
            .from(eventParticipants)
            .where(eq(eventParticipants.eventId, eventId))
            .orderBy(asc(eventParticipants.joinedAt));

        if (participants.length === 0) {
            await sendEphemeral({ content: 'Список пуст, некого удалять.', ephemeral: true });
            return;
        }

        // Raw modal with UserSelect (type 5) — discord.js doesn't support this natively
        const rawModal = {
            title: 'Удалить из списка',
            custom_id: `event_remove_modal_${eventId}`,
            components: [
                {
                    type: 18, // Label
                    label: 'Выберите участника для удаления',
                    component: {
                        type: 5, // UserSelect
                        custom_id: 'remove_user_select',
                        max_values: 1,
                        required: true,
                    },
                },
            ],
        };

        // @ts-ignore — raw API
        await showModalViaInteractionCallback(interaction, rawModal as any);
        return;
    }

    // ── setvoice ──
    if (action === 'setvoice') {
        const canManage = interaction.user.id === event.creatorId;
        if (!canManage) {
            await sendEphemeral({ content: 'У вас нет прав.', ephemeral: true });
            return;
        }
        if (event.status === 'Closed') {
            await sendEphemeral({ content: 'Список уже закрыт.', ephemeral: true });
            return;
        }

        const voiceSettings = await db
            .select()
            .from(systemSettings)
            .where(
                eq(systemSettings.key, 'EVENT_MCL_VOICE_CHANNEL_ID'),
            );
        const voiceSettings2 = await db
            .select()
            .from(systemSettings)
            .where(
                eq(systemSettings.key, 'EVENT_CAPT_VOICE_CHANNEL_ID'),
            );

        const mclVoice = voiceSettings[0]?.value;
        const captVoice = voiceSettings2[0]?.value;

        const options: { value: string; label: string }[] = [];
        if (mclVoice) options.push({ value: mclVoice, label: 'Голосовой канал MCL / ВЗЗ' });
        if (captVoice) options.push({ value: captVoice, label: 'Голосовой канал Капт' });

        if (options.length === 0) {
            await sendEphemeral({ content: 'Голосовые каналы не настроены в настройках.', ephemeral: true });
            return;
        }

        // Need at least 2 options for RadioGroup
        if (options.length === 1) {
            // Auto-set the only available channel
            await db.update(events).set({ voiceChannelId: options[0].value }).where(eq(events.id, eventId));
            if (event.messageId && event.channelId) {
                try {
                    const channel = await interaction.client.channels.fetch(event.channelId);
                    if (channel && channel.isTextBased() && 'messages' in channel) {
                        const msg = await channel.messages.fetch(event.messageId);
                        await refreshEventEmbed(msg as any, eventId);
                    }
                } catch (e) {
                    console.error('❌ Ошибка обновления ембеда после setvoice:', e);
                }
            }
            await sendEphemeral({ content: `Голосовой канал установлен: <#${options[0].value}>`, ephemeral: true });
            return;
        }

        const rawModal = {
            title: 'Голосовой канал',
            custom_id: `event_setvoice_modal_${eventId}`,
            components: [
                {
                    type: 18, // Label
                    label: 'Выберите голосовой канал',
                    component: {
                        type: 21, // RadioGroup
                        custom_id: 'voice_radio',
                        options,
                    },
                },
            ],
        };

        // @ts-ignore — raw API
        await showModalViaInteractionCallback(interaction, rawModal as any);
        return;
    }

    // ── logs ──
    if (action === 'logs') {
        const canManage = interaction.user.id === event.creatorId;
        if (!canManage) {
            await sendEphemeral({ content: 'У вас нет прав.', ephemeral: true });
            return;
        }

        const logs = await db
            .select()
            .from(eventLogs)
            .where(eq(eventLogs.eventId, eventId))
            .orderBy(asc(eventLogs.createdAt));

        if (logs.length === 0) {
            await sendEphemeral({ content: 'Логов пока нет.', ephemeral: true });
            return;
        }

        const actionLabels: Record<string, string> = {
            join: '➡️ Присоединился',
            leave: '⬅️ Покинул',
            removed: '❌ Удалён',
        };

        const lines = logs.map((l) => {
            const ts = toUnixTs(l.createdAt);
            return `${actionLabels[l.action] ?? l.action} <@${l.userId}> <t:${ts}:T>`;
        });

        let text = `📋 **Логи списка** (${logs.length}):\n\n` + lines.join('\n');
        if (text.length > 1900) {
            text = text.slice(0, 1900) + '\n... (обрезано)';
        }

        await sendEphemeral({ content: text, ephemeral: true });
        return;
    }

    // ── mention ──
    if (action === 'mention') {
        const canManage = interaction.user.id === event.creatorId;
        if (!canManage) {
            await sendEphemeral({ content: 'У вас нет прав.', ephemeral: true });
            return;
        }

        const participants = await db
            .select()
            .from(eventParticipants)
            .where(eq(eventParticipants.eventId, eventId));

        if (participants.length === 0) {
            await sendEphemeral({ content: 'Список пуст.', ephemeral: true });
            return;
        }

        const eventTimeUnix = toUnixTs(event.eventTime);
        const voiceText = event.voiceChannelId ? `\n🔊 Голосовой канал: <#${event.voiceChannelId}>` : '';
        const dmText = `📢 **Напоминание о мероприятии!**\n⏰ Время: <t:${eventTimeUnix}:F> (<t:${eventTimeUnix}:R>)${voiceText}`;

        // Send DM to each participant
        let sent = 0;
        let failed = 0;
        for (const p of participants) {
            try {
                const user = await interaction.client.users.fetch(p.userId);
                await user.send({ content: dmText });
                sent++;
            } catch {
                failed++;
            }
        }

        const resultText = `Уведомления отправлены: ${sent} из ${participants.length}` + (failed > 0 ? ` (не доставлено: ${failed})` : '');
        await sendEphemeral({ content: resultText, ephemeral: true });
        return;
    }

    // ── selectmap ──
    if (action === 'selectmap') {
        const canManage = interaction.user.id === event.creatorId;

        if (!canManage) {
            await sendEphemeral({ content: 'У вас нет прав.', ephemeral: true });
            return;
        }

        const maps = await db.select().from(eventMaps).orderBy(asc(eventMaps.name));
        if (maps.length === 0) {
            await sendEphemeral({
                content: 'Нет доступных карт. Добавьте карты через панель управления.',
                ephemeral: true,
            });
            return;
        }

        // Discord API requires RadioGroup to have 2 to 10 options precisely
        const mapOptions = maps.slice(0, 10).map((m) => ({
            value: m.id,
            label: m.name,
        }));

        // Build raw modal with RadioGroup for map selection
        const rawModal = {
            title: 'Выбрать карту',
            custom_id: `event_map_modal_${eventId}`,
            components: [
                {
                    type: 18, // Label
                    label: 'Карта',
                    description: 'Выберите карту для мероприятия',
                    component: {
                        type: 21, // RadioGroup
                        custom_id: 'map_radio',
                        options: mapOptions,
                    },
                },
            ],
        };

        // @ts-ignore — raw API
        await showModalViaInteractionCallback(interaction, rawModal as any);
        return;
    }

    // ── setgroup ──
    if (action === 'setgroup') {
        const canChange = interaction.user.id === event.creatorId;
        if (!canChange) {
            await sendEphemeral({ content: 'У вас нет прав для изменения этого списка.', ephemeral: true });
            return;
        }
        if (event.status === 'Closed') {
            await sendEphemeral({ content: 'Список уже закрыт.', ephemeral: true });
            return;
        }

        const modal = new ModalBuilder().setCustomId(`event_setgroup_modal_${eventId}`).setTitle('Указать группу');

        const groupInput = new TextInputBuilder()
            .setCustomId('groupCodeInput')
            .setLabel('Код группы')
            .setPlaceholder('Например, ABCD-1234')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(groupInput));
        await showModalViaInteractionCallback(interaction, modal);
        return;
    }

    // ── close ──
    if (action === 'close') {
        const canClose = interaction.user.id === event.creatorId;
        if (!canClose) {
            await sendEphemeral({ content: 'У вас нет прав для закрытия списка.', ephemeral: true });
            return;
        }

        await db.update(events).set({ status: 'Closed' }).where(eq(events.id, eventId));
        // Avoid interaction.update() after deferUpdate().
        await interaction.message.edit({ content: 'Список закрыт.', components: [] }).catch(() => {});

        // Refresh the original event message (not the ephemeral management reply)
        if (interaction.channel && event.messageId) {
            try {
                const originalMsg = await interaction.channel.messages.fetch(event.messageId);
                await refreshEventEmbed(originalMsg as any, eventId);
            } catch (e) {
                console.error('❌ Ошибка обновления списка после его закрытия:', e);
            }
        }
        return;
    }

    // ── join / leave (public) ──
    if (event.status === 'Closed') {
        await sendEphemeral({ content: 'Этот список закрыт, вы не можете изменить свое участие.', ephemeral: true });
        return;
    }

    // Block join/leave when event is in progress (time has arrived)
    const now = new Date();
    if (now >= event.eventTime && (action === 'join' || action === 'leave')) {
        await sendEphemeral({ content: 'Мероприятие уже идёт, изменить участие нельзя.', ephemeral: true });
        return;
    }

    if (action === 'join') {
        const [memberData] = await db.select().from(members).where(eq(members.discordId, interaction.user.id));
        const tierRoleId = memberData?.tierRoleId || null;

        const existing = await db
            .select()
            .from(eventParticipants)
            .where(and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.userId, interaction.user.id)));

        if (existing.length > 0) {
            await sendEphemeral({ content: 'Вы уже записаны в этот список.', ephemeral: true });
            return;
        }

        await db.insert(eventParticipants).values({ id: uuidv4(), eventId, userId: interaction.user.id, tierRoleId });
        await db.insert(eventLogs).values({ id: uuidv4(), eventId, userId: interaction.user.id, action: 'join' });
        await refreshEventEmbed(interaction.message, eventId);
        await sendEphemeral({ content: 'Вы успешно присоединились к списку!', ephemeral: true });
    }

    if (action === 'leave') {
        const existing = await db
            .select()
            .from(eventParticipants)
            .where(
                and(
                    eq(eventParticipants.eventId, eventId),
                    eq(eventParticipants.userId, interaction.user.id),
                ),
            );

        if (existing.length === 0) {
            await sendEphemeral({ content: 'Вы не находитесь в этом списке.', ephemeral: true });
            return;
        }

        await db
            .delete(eventParticipants)
            .where(
                and(
                    eq(eventParticipants.eventId, eventId),
                    eq(eventParticipants.userId, interaction.user.id),
                ),
            );
        await db.insert(eventLogs).values({ id: uuidv4(), eventId, userId: interaction.user.id, action: 'leave' });
        await refreshEventEmbed(interaction.message, eventId);
        await sendEphemeral({ content: 'Вы покинули список.', ephemeral: true });
    }
}

// ── ModalSubmit: Remove participant via UserSelect ──────────────────

export async function handleEventRemoveModalSubmit(interaction: ModalSubmitInteraction) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const eventId = interaction.customId.replace('event_remove_modal_', '');

    const [event] = await db.select().from(events).where(eq(events.id, eventId));
    if (!event) {
        await interaction.editReply({ content: 'Событие не найдено.' });
        return;
    }

    if (interaction.user.id !== event.creatorId) {
        await interaction.editReply({ content: 'У вас нет прав для управления этим списком.' });
        return;
    }

    // Extract selected user ID from raw components (UserSelect)
    const rawComponents = (interaction as any).components ?? [];
    let selectedUserId: string | null = null;
    for (const comp of rawComponents) {
        const inner = comp.components?.[0] ?? comp.component;
        if (inner?.customId === 'remove_user_select' || inner?.custom_id === 'remove_user_select') {
            const values = inner.values ?? [];
            if (values.length > 0) {
                selectedUserId = values[0];
            }
            break;
        }
    }

    if (!selectedUserId) {
        await interaction.editReply({ content: 'Вы не выбрали участника.' });
        return;
    }

    // Check if user is actually in the event
    const [participant] = await db
        .select()
        .from(eventParticipants)
        .where(and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.userId, selectedUserId)));

    if (!participant) {
        await interaction.editReply({ content: `<@${selectedUserId}> не находится в этом списке.` });
        return;
    }

    await db.delete(eventParticipants).where(eq(eventParticipants.id, participant.id));

    // Refresh the original event embed
    if (event.messageId && event.channelId) {
        try {
            const channel = await interaction.client.channels.fetch(event.channelId);
            if (channel && channel.isTextBased() && 'messages' in channel) {
                const msg = await channel.messages.fetch(event.messageId);
                await refreshEventEmbed(msg as any, eventId);
            }
        } catch (e) {
            console.error('❌ Ошибка обновления списка после удаления участника:', e);
        }
    }

    // Log removal
    await db.insert(eventLogs).values({ id: uuidv4(), eventId, userId: selectedUserId, action: 'removed' });

    await interaction.editReply({ content: `Участник <@${selectedUserId}> удалён из списка.` });
}

// ── ModalSubmit: Set voice channel via RadioGroup ──────────────────

export async function handleEventSetVoiceModalSubmit(interaction: ModalSubmitInteraction) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const eventId = interaction.customId.replace('event_setvoice_modal_', '');

    const [event] = await db.select().from(events).where(eq(events.id, eventId));
    if (!event) {
        await interaction.editReply({ content: 'Событие не найдено.' });
        return;
    }

    if (interaction.user.id !== event.creatorId) {
        await interaction.editReply({ content: 'У вас нет прав.' });
        return;
    }

    // Extract selected voice channel from raw components (RadioGroup — uses .value, not .values)
    const rawComponents = (interaction as any).components ?? [];
    let selectedChannelId: string | null = null;
    for (const comp of rawComponents) {
        const inner = comp.components?.[0] ?? comp.component;
        if (inner?.customId === 'voice_radio' || inner?.custom_id === 'voice_radio') {
            selectedChannelId = inner.value ?? null;
            break;
        }
    }

    if (!selectedChannelId) {
        await interaction.editReply({ content: 'Вы не выбрали канал.' });
        return;
    }

    await db.update(events).set({ voiceChannelId: selectedChannelId }).where(eq(events.id, eventId));

    // Refresh the original event embed
    if (event.messageId && event.channelId) {
        try {
            const channel = await interaction.client.channels.fetch(event.channelId);
            if (channel && channel.isTextBased() && 'messages' in channel) {
                const msg = await channel.messages.fetch(event.messageId);
                await refreshEventEmbed(msg as any, eventId);
            }
        } catch (e) {
            console.error('❌ Ошибка обновления ембеда после setvoice:', e);
        }
    }

    await interaction.editReply({ content: `Голосовой канал установлен: <#${selectedChannelId}>` });
}

