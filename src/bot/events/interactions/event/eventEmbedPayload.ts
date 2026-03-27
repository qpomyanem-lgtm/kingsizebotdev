import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    Message,
    MessageFlags,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
} from 'discord.js';
import { db } from '../../../../db';
import { events, eventParticipants, eventMaps, roles } from '../../../../db/schema';
import { eq, asc } from 'drizzle-orm';
import { toUnixTs } from './eventShared';

export async function getEventEmbedPayload(eventId: string): Promise<any | null> {
    const [event] = await db.select().from(events).where(eq(events.id, eventId));
    if (!event) return null;

    const participants = await db
        .select()
        .from(eventParticipants)
        .where(eq(eventParticipants.eventId, eventId))
        .orderBy(asc(eventParticipants.joinedAt));

    const tierRoles = await db
        .select()
        .from(roles)
        .where(eq(roles.systemType, 'tier'))
        .orderBy(asc(roles.priority));

    const tierRankByRoleId = new Map<string, number>();
    const tierNameByRoleId = new Map<string, string>();
    tierRoles.forEach((r, i) => {
        tierRankByRoleId.set(r.id, i + 1);
        tierNameByRoleId.set(r.id, r.name);
    });

    participants.sort((a, b) => {
        const aRank = a.tierRoleId ? (tierRankByRoleId.get(a.tierRoleId) ?? 999) : 999;
        const bRank = b.tierRoleId ? (tierRankByRoleId.get(b.tierRoleId) ?? 999) : 999;
        if (aRank !== bRank) return aRank - bRank;
        return a.joinedAt.getTime() - b.joinedAt.getTime();
    });

    const mainList = participants.slice(0, event.slots);
    const reserveList = participants.slice(event.slots);

    const formatParticipant = (p: (typeof participants)[number]) => {
        const tierName = p.tierRoleId ? (tierNameByRoleId.get(p.tierRoleId) || 'Без Tier') : 'Без Tier';
        return `✦ <@${p.userId}> ✶ ${tierName}`;
    };

    // Build main list text
    let mainListText = '### Основной список:\n\n';
    if (mainList.length > 0) {
        mainListText += mainList.map(formatParticipant).join('\n');
    } else {
        mainListText += '-# Основной список пуст';
    }

    // Build reserve text
    let reserveText = '### Резерв:\n\n';
    if (reserveList.length > 0) {
        reserveText += reserveList.map(formatParticipant).join('\n');
    } else {
        reserveText += '-# Резервный список пуст';
    }

    // Event time as Unix timestamp
    const eventTimeUnix = toUnixTs(event.eventTime);
    const nowUnix = toUnixTs(new Date());

    const isClosed = event.status === 'Closed';
    const isInProgress = !isClosed && nowUnix >= eventTimeUnix;
    const isOpen = !isClosed && !isInProgress;

    // Colors: Open=green, InProgress=blue, Closed=red
    const accentColor = isClosed ? 0xed4245 : isInProgress ? 0x5865f2 : 0x57f287;
    const canJoinLeave = isOpen; // only when open

    // Info block
    let infoText =
        `**◆ Дата и время проведения:** <t:${eventTimeUnix}:F> (<t:${eventTimeUnix}:R>)\n` +
        `**◆ Количество слотов:** ${mainList.length} / ${event.slots}\n` +
        `**◆ В резерве:** ${reserveList.length}`;

    if (event.groupCode) {
        infoText += `\n**◆ Группа:** ||${event.groupCode}||`;
    }

    if (event.voiceChannelId) {
        infoText += `\n**◆ Голосовой канал:** <#${event.voiceChannelId}>`;
    }

    // Title with custom emoji for Capt
    const title = `<:swords:1486775719811088455> Список #${event.id.slice(0, 4)}`;

    // Build container
    const container = new ContainerBuilder()
        .setAccentColor(accentColor)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(mainListText))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(reserveText))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText));



    // No map — use builders
    const joinLeaveOff = !canJoinLeave;
    container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`event_join_${eventId}`)
                .setLabel('ПРИСОЕДИНИТЬСЯ')
                .setEmoji({ id: '1486862619091537950', name: 'plus' })
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(joinLeaveOff),
            new ButtonBuilder()
                .setCustomId(`event_leave_${eventId}`)
                .setLabel('ПОКИНУТЬ')
                .setEmoji({ id: '1486862629673898107', name: 'minus' })
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(joinLeaveOff),
            new ButtonBuilder()
                .setCustomId(`event_manage_${eventId}`)
                .setLabel('УПРАВЛЕНИЕ')
                .setEmoji({ id: '1486862826428432415', name: 'settings' })
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(isClosed),
        ),
    );

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# Обновлено <t:${nowUnix}:f>`),
    );

    return { embeds: [], components: [container], flags: MessageFlags.IsComponentsV2 };
}

export async function refreshEventEmbed(message: Message, eventId: string) {
    const payload = await getEventEmbedPayload(eventId);
    if (!payload) return;
    await message.edit(payload);
}

