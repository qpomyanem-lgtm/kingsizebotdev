import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, Colors, EmbedBuilder, ForumChannel } from 'discord.js';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db';
import { activityScreenshots, activityThreads, members, systemSettings } from '../../../../db/schema';
import { buildThreadStatusMessage, MAX_SCREENSHOTS, ACTIVITY_DAYS_LIMIT } from './activityShared';

async function ensureActivityThreadAndSendDm(client: Client, memberId: string, acceptedByDiscordId?: string) {
    const [member] = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
    if (!member) return { ok: false as const, reason: 'Member not found' as const };

    const [forumRow] = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, 'ACTIVITY_FORUM_CHANNEL_ID'))
        .limit(1);

    const forumChannelId = forumRow?.value?.trim();
    if (!forumChannelId) return { ok: false as const, reason: 'ACTIVITY_FORUM_CHANNEL_ID not set' as const };

    const [existing] = await db.select().from(activityThreads).where(eq(activityThreads.memberId, memberId)).limit(1);

    const threadName = `Активность: ${member.gameNickname} #${member.gameStaticId}`;

    // If a completed thread already exists, remove its screenshots then the thread so a fresh one is created
    if (existing && existing.status === 'completed') {
        await db.delete(activityScreenshots).where(eq(activityScreenshots.activityThreadId, existing.id));
        await db.delete(activityThreads).where(eq(activityThreads.id, existing.id));
    }

    let threadRow = (!existing || existing.status === 'completed') ? null : existing;
    if (!threadRow) {
        const forumCh = (await client.channels.fetch(forumChannelId).catch(() => null)) as ForumChannel | null;
        if (!forumCh) return { ok: false as const, reason: 'Forum channel not found' as const };

        const statusContent = await buildThreadStatusMessage(memberId, member.discordId, acceptedByDiscordId ?? null, new Date());

        const created = await forumCh.threads
            .create({
                name: threadName,
                autoArchiveDuration: 1440,
                message: {
                    content: statusContent,
                },
            })
            .catch((e: any) => {
                throw e;
            });

        await db.insert(activityThreads).values({
            id: randomUUID(),
            memberId,
            discordForumChannelId: forumChannelId,
            discordThreadId: created.id,
            threadName,
            presentInDiscord: true,
            acceptedByDiscordId: acceptedByDiscordId ?? null,
            status: 'active',
        });

        threadRow = (
            await db.select().from(activityThreads).where(eq(activityThreads.memberId, memberId)).limit(1)
        )[0];
    } else {
        await db.update(activityThreads).set({ threadName, presentInDiscord: true }).where(eq(activityThreads.memberId, memberId));
    }

    if (!threadRow) return { ok: false as const, reason: 'Failed to ensure thread' as const };

    const user = await client.users.fetch(member.discordId).catch(() => null);
    if (user) {
        const embed = new EmbedBuilder()
            .setTitle('📩 Активность')
            .setDescription(
                `Нажмите кнопку ниже, чтобы прикрепить скриншоты активности.\n\nЛимит: **${MAX_SCREENSHOTS}** скриншотов за **${ACTIVITY_DAYS_LIMIT}** дней.`,
            )
            .setColor(Colors.Blurple);

        const button = new ButtonBuilder().setCustomId(`activity_upload_${memberId}`).setLabel('📎 Прикрепить скриншот').setStyle(ButtonStyle.Primary);
        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

        const dmMsg = await user.send({ embeds: [embed], components: [actionRow] }).catch(() => null);

        if (dmMsg) {
            // Pin the message
            await dmMsg.pin().catch(() => null);
            // Save DM message ID for future updates
            await db.update(activityThreads).set({ dmMessageId: dmMsg.id }).where(eq(activityThreads.id, threadRow.id));
        }
    }

    return { ok: true as const };
}

export async function createActivityThreadIpc(client: Client, memberId: string, acceptedByDiscordId?: string) {
    return ensureActivityThreadAndSendDm(client, memberId, acceptedByDiscordId);
}

