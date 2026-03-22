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
        mainListText += '-# Список пуст';
    }

    // Build reserve text
    let reserveText = '### Резерв:\n\n';
    if (reserveList.length > 0) {
        reserveText += reserveList.map(formatParticipant).join('\n');
    } else {
        reserveText += '-# Нет участников в резерве';
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

    // Title with custom emoji for MCL
    const titleMap: Record<string, string> = {
        MCL: '<:mcl:1485301422688829582> Список на MCL / ВЗЗ',
        'ВЗЗ': 'Список на MCL / ВЗЗ',
        Capt: '<:cpt:1485302217048326145> Список на капт',
    };
    const title = titleMap[event.eventType] ?? event.eventType;

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

    // Map image (MCL/ВЗЗ only)
    if (event.mapId && (event.eventType === 'MCL' || event.eventType === 'ВЗЗ')) {
        const [map] = await db.select().from(eventMaps).where(eq(eventMaps.id, event.mapId));
        if (map) {
            // MediaGallery raw component (type 12) — discord.js has no builder for addMediaGallery on Container
            // We'll add it via the raw data approach
            const containerData = container.toJSON();
            (containerData as any).components.push({
                type: 12, // MediaGallery
                items: [
                    {
                        media: { url: map.imageUrl },
                        description: `Карта: ${map.name}`,
                    },
                ],
            } as any);

            // Rebuild from raw
            const rawContainer = containerData as any;

            // Buttons — Closed: all disabled; InProgress: join/leave disabled, manage active; Open: all active
            const joinLeaveDisabled = !canJoinLeave;
            rawContainer.components.push({
                type: 1,
                components: [
                    {
                        type: 2,
                        style: joinLeaveDisabled ? 2 : 1,
                        label: 'Присоединиться',
                        emoji: { id: '1485303136049430719', name: 'plus' },
                        custom_id: `event_join_${eventId}`,
                        disabled: joinLeaveDisabled,
                    },
                    {
                        type: 2,
                        style: 2,
                        label: 'Покинуть',
                        custom_id: `event_leave_${eventId}`,
                        disabled: joinLeaveDisabled,
                    },
                    {
                        type: 2,
                        style: isClosed ? 2 : 3,
                        label: 'Управление',
                        custom_id: `event_manage_${eventId}`,
                        disabled: isClosed,
                    },
                ],
            });

            // Footer
            rawContainer.components.push({
                type: 10, // TextDisplay
                content: `-# Список #${event.id.slice(0, 4)}  ✦  Обновлено <t:${nowUnix}:f>`,
            });

            return {
                embeds: [],
                components: [rawContainer as any],
                flags: MessageFlags.IsComponentsV2,
            };
        }
    }

    // No map — use builders
    const joinLeaveOff = !canJoinLeave;
    container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`event_join_${eventId}`)
                .setLabel('Присоединиться')
                .setEmoji({ id: '1485303136049430719', name: 'plus' })
                .setStyle(joinLeaveOff ? ButtonStyle.Secondary : ButtonStyle.Primary)
                .setDisabled(joinLeaveOff),
            new ButtonBuilder()
                .setCustomId(`event_leave_${eventId}`)
                .setLabel('Покинуть')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(joinLeaveOff),
            new ButtonBuilder()
                .setCustomId(`event_manage_${eventId}`)
                .setLabel('Управление')
                .setStyle(isClosed ? ButtonStyle.Secondary : ButtonStyle.Success)
                .setDisabled(isClosed),
        ),
    );

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# Список #${event.id.slice(0, 4)}  ✦  Обновлено <t:${nowUnix}:f>`),
    );

    return { embeds: [], components: [container], flags: MessageFlags.IsComponentsV2 };
}

export async function refreshEventEmbed(message: Message, eventId: string) {
    const payload = await getEventEmbedPayload(eventId);
    if (!payload) return;
    await message.edit(payload);
}

