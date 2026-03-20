import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    GuildMember,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { db } from '../../../../db';
import { events, eventParticipants, members, eventMaps } from '../../../../db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { canManageEvents, TIER_MAP } from './eventShared';
import { refreshEventEmbed } from './eventEmbedPayload.js';

export async function handleEventActionBtn(interaction: ButtonInteraction) {
    const parts = interaction.customId.split('_');
    // Formats:
    //   event_join_<id>, event_leave_<id>, event_manage_<id>,
    //   event_close_<id>, event_setgroup_<id>, event_selectmap_<id>
    const action = parts[1];
    const eventId = parts.slice(2).join('_');

    const [event] = await db.select().from(events).where(eq(events.id, eventId));
    if (!event) {
        await interaction.reply({ content: 'Событие не найдено или уже удалено.', ephemeral: true });
        return;
    }

    // ── manage ──
    if (action === 'manage') {
        const canManage =
            interaction.user.id === event.creatorId ||
            (await canManageEvents(interaction.member as GuildMember | null, interaction.user.id));

        if (!canManage) {
            await interaction.reply({ content: 'У вас нет прав для управления этим списком.', ephemeral: true });
            return;
        }
        if (event.status === 'Closed') {
            await interaction.reply({ content: 'Список уже закрыт.', ephemeral: true });
            return;
        }

        const buttons: ButtonBuilder[] = [
            new ButtonBuilder()
                .setCustomId(`event_close_${eventId}`)
                .setLabel('Закрыть список')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔒'),
            new ButtonBuilder()
                .setCustomId(`event_setgroup_${eventId}`)
                .setLabel('Указать группу')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📝'),
        ];

        // Map selection only for MCL/ВЗЗ
        if (event.eventType === 'MCL' || event.eventType === 'ВЗЗ') {
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`event_selectmap_${eventId}`)
                    .setLabel('Выбрать карту')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🗺️'),
            );
        }

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
        await interaction.reply({ content: 'Управление списком:', components: [row], ephemeral: true });
        return;
    }

    // ── selectmap ──
    if (action === 'selectmap') {
        const canManage =
            interaction.user.id === event.creatorId ||
            (await canManageEvents(interaction.member as GuildMember | null, interaction.user.id));

        if (!canManage) {
            await interaction.reply({ content: 'У вас нет прав.', ephemeral: true });
            return;
        }

        const maps = await db.select().from(eventMaps).orderBy(asc(eventMaps.name));
        if (maps.length === 0) {
            await interaction.reply({
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
        await interaction.showModal(rawModal);
        return;
    }

    // ── setgroup ──
    if (action === 'setgroup') {
        const canChange =
            interaction.user.id === event.creatorId ||
            (await canManageEvents(interaction.member as GuildMember | null, interaction.user.id));
        if (!canChange) {
            await interaction.reply({ content: 'У вас нет прав для изменения этого списка.', ephemeral: true });
            return;
        }
        if (event.status === 'Closed') {
            await interaction.reply({ content: 'Список уже закрыт.', ephemeral: true });
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
        await interaction.showModal(modal);
        return;
    }

    // ── close ──
    if (action === 'close') {
        const canClose =
            interaction.user.id === event.creatorId ||
            (await canManageEvents(interaction.member as GuildMember | null, interaction.user.id));
        if (!canClose) {
            await interaction.reply({ content: 'У вас нет прав для закрытия списка.', ephemeral: true });
            return;
        }

        await db.update(events).set({ status: 'Closed' }).where(eq(events.id, eventId));
        await interaction.update({ content: 'Список закрыт.', components: [] });

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
        await interaction.reply({ content: 'Этот список закрыт, вы не можете изменить свое участие.', ephemeral: true });
        return;
    }

    // Block join/leave when event is in progress (time has arrived)
    const now = new Date();
    if (now >= event.eventTime && (action === 'join' || action === 'leave')) {
        await interaction.reply({ content: 'Мероприятие уже идёт, изменить участие нельзя.', ephemeral: true });
        return;
    }

    if (action === 'join') {
        const [memberData] = await db.select().from(members).where(eq(members.discordId, interaction.user.id));
        const tier = memberData ? TIER_MAP[memberData.tier] || 4 : 4;

        const existing = await db
            .select()
            .from(eventParticipants)
            .where(and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.userId, interaction.user.id)));

        if (existing.length > 0) {
            await interaction.reply({ content: 'Вы уже записаны в этот список.', ephemeral: true });
            return;
        }

        await db.insert(eventParticipants).values({ id: uuidv4(), eventId, userId: interaction.user.id, tier });
        await refreshEventEmbed(interaction.message, eventId);
        await interaction.reply({ content: 'Вы успешно присоединились к списку!', ephemeral: true });
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
            await interaction.reply({ content: 'Вы не находитесь в этом списке.', ephemeral: true });
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
        await refreshEventEmbed(interaction.message, eventId);
        await interaction.reply({ content: 'Вы покинули список.', ephemeral: true });
    }
}

