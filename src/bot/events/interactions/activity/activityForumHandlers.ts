import { Client, ForumChannel, Message } from 'discord.js';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db';
import { activityDmSessions, activityScreenshots, activityThreads, members, systemSettings } from '../../../../db/schema';
import {
    countMemberScreenshots,
    extractImageUrlsFromMessage,
    parseActivityThreadName,
    triggerSiteRefresh,
    MAX_SCREENSHOTS,
} from './activityShared';

export async function handleActivityForumMessage(client: Client, message: Message) {
    // Ignore our bot reposts
    if (message.author.bot) return false;

    if (!message.attachments?.size && !message.embeds?.length) return false;

    const threadId = message.channelId;

    const [threadRow] = await db.select().from(activityThreads).where(eq(activityThreads.discordThreadId, threadId)).limit(1);
    if (!threadRow) return false;

    const urls = extractImageUrlsFromMessage(message);
    if (urls.length === 0) return false;

    let currentCount = await countMemberScreenshots(threadRow.memberId);
    let added = 0;

    for (let i = 0; i < urls.length; i++) {
        if (currentCount + added >= MAX_SCREENSHOTS) break;

        const imageUrl = urls[i];
        if (!imageUrl) continue;

        const dedupeKey = `${message.id}:${i}`;

        const inserted = await db
            .insert(activityScreenshots)
            .values({
                id: randomUUID(),
                memberId: threadRow.memberId,
                activityThreadId: threadRow.id,
                sourceDiscordMessageId: message.id,
                sourceAttachmentIndex: i,
                dedupeKey,
                imageUrl,
                sourceType: 'forum',
            })
            .onConflictDoNothing({ target: activityScreenshots.dedupeKey })
            .returning({ id: activityScreenshots.id });

        if (inserted.length === 0) continue;

        currentCount++;
        added++;
    }

    if (added > 0) {
        await triggerSiteRefresh();
    }

    return added > 0;
}

// Rebuild DB from existing forum threads.
export async function rebuildActivityFromForum(client: Client, forumChannelId?: string) {
    const [forumRow] = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, 'ACTIVITY_FORUM_CHANNEL_ID'))
        .limit(1);

    const configuredForumId = forumRow?.value?.trim() ?? forumChannelId;
    if (!configuredForumId) return { ok: false as const, reason: 'No forum channel id' as const };

    const forumCh = (await client.channels.fetch(configuredForumId).catch(() => null)) as ForumChannel | null;
    if (!forumCh) return { ok: false as const, reason: 'Forum channel not found' as const };

    let threads: any[] = [];
    try {
        const fetched = await (forumCh as any).threads.fetch({ limit: 1000 });
        const maybeThreads = fetched?.threads ?? fetched;
        if (maybeThreads?.values) threads = [...maybeThreads.values()];
        else if (Array.isArray(maybeThreads)) threads = maybeThreads;
    } catch {
        return { ok: false as const, reason: 'Failed to fetch threads from forum' as const };
    }

    for (const t of threads) {
        const threadId = t?.id as string | undefined;
        if (!threadId) continue;

        const discordStarterId = t?.owner_id ?? t?.ownerId ?? t?.creator_id ?? t?.creatorId ?? t?.user_id ?? t?.userId ?? null;

        // Fetch messages to rebuild screenshots.
        const threadChannel: any = await client.channels.fetch(threadId).catch(() => null);
        if (!threadChannel?.messages?.fetch) continue;

        const threadMessages: any = await threadChannel.messages.fetch({ limit: 100 }).catch(() => null);
        const messageList: any[] = threadMessages?.values ? [...threadMessages.values()] : [];
        if (messageList.length === 0) continue;

        // Map discord thread -> member.
        let mappedMember: typeof members.$inferSelect | null = null;
        if (discordStarterId) {
            const [m] = await db.select().from(members).where(eq(members.discordId, discordStarterId)).limit(1);
            mappedMember = m ?? null;
        }

        if (!mappedMember) {
            for (const msg of messageList) {
                if (!msg?.author || msg.author.bot) continue;
                const urls = extractImageUrlsFromMessage(msg as Message);
                if (urls.length === 0) continue;
                const [m] = await db.select().from(members).where(eq(members.discordId, msg.author.id)).limit(1);
                if (m) {
                    mappedMember = m;
                    break;
                }
            }
        }

        if (!mappedMember) {
            const parsed = parseActivityThreadName(t?.name ?? '');
            if (parsed?.gameStaticId) {
                const candidates = await db.select().from(members).where(eq(members.gameStaticId, parsed.gameStaticId));
                mappedMember = candidates[0] ?? null;
            }
        }

        if (!mappedMember) continue;

        const threadName = t?.name ?? '';

        // Ensure activityThreads row exists.
        await db
            .insert(activityThreads)
            .values({
                id: randomUUID(),
                memberId: mappedMember.id,
                discordForumChannelId: configuredForumId,
                discordThreadId: threadId,
                threadName,
                presentInDiscord: true,
            })
            .onConflictDoNothing({ target: activityThreads.memberId });

        await db
            .update(activityThreads)
            .set({
                discordForumChannelId: configuredForumId,
                discordThreadId: threadId,
                threadName,
                presentInDiscord: true,
            })
            .where(eq(activityThreads.memberId, mappedMember.id));

        const [threadRow] = await db.select().from(activityThreads).where(eq(activityThreads.discordThreadId, threadId)).limit(1);
        if (!threadRow) continue;

        let currentCount = await countMemberScreenshots(mappedMember.id);
        if (currentCount >= MAX_SCREENSHOTS) continue;

        let added = 0;
        for (const msg of messageList) {
            if (currentCount + added >= MAX_SCREENSHOTS) break;

            const urls = extractImageUrlsFromMessage(msg as Message);
            if (urls.length === 0) continue;

            for (let i = 0; i < urls.length; i++) {
                if (currentCount + added >= MAX_SCREENSHOTS) break;

                const imageUrl = urls[i];
                if (!imageUrl) continue;

                const dedupeKey = `${msg.id}:${i}`;
                const inserted = await db
                    .insert(activityScreenshots)
                    .values({
                        id: randomUUID(),
                        memberId: mappedMember.id,
                        activityThreadId: threadRow.id,
                        sourceDiscordMessageId: msg.id,
                        sourceAttachmentIndex: i,
                        dedupeKey,
                        imageUrl,
                        sourceType: (msg.author?.bot ? 'dm' : 'forum') as 'dm' | 'forum',
                    })
                    .onConflictDoNothing({ target: activityScreenshots.dedupeKey })
                    .returning({ id: activityScreenshots.id });

                if (inserted.length === 0) continue;

                currentCount++;
                added++;
            }
        }
    }

    await triggerSiteRefresh();
    return { ok: true as const };
}

