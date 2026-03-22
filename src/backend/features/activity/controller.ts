import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '../../../db';
import { activityScreenshots, activityThreads, members, systemSettings, users } from '../../../db/schema';
import { and, count, eq, inArray, asc, sql } from 'drizzle-orm';
import { requirePermission } from '../../lib/discordRoles';

const MAX_SCREENSHOTS = 30;
const ACTIVITY_DAYS_LIMIT = 7;

export default async function activityController(server: FastifyInstance) {
    server.get('/overview', { preHandler: [requirePermission('site:activity:view')] }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { status: filterStatus } = request.query as { status?: string };
            
            const activeMembers = await db
                .select()
                .from(members)
                .where(eq(members.status, 'active'))
                .orderBy(asc(members.joinedAt));

            if (activeMembers.length === 0) {
                return reply.send([]);
            }

            const memberIds = activeMembers.map((m) => m.id);

            let threadsQuery = db
                .select()
                .from(activityThreads)
                .where(inArray(activityThreads.memberId, memberIds));

            const threads = await threadsQuery;
            const threadByMemberId = new Map(threads.map((t) => [t.memberId, t]));

            // Count total screenshots
            const counts = await db
                .select({
                    memberId: activityScreenshots.memberId,
                    count: count(activityScreenshots.id),
                })
                .from(activityScreenshots)
                .where(inArray(activityScreenshots.memberId, memberIds))
                .groupBy(activityScreenshots.memberId);

            const countByMemberId = new Map(counts.map((c) => [c.memberId, Number(c.count)]));

            // Count approved screenshots
            const approvedCounts = await db
                .select({
                    memberId: activityScreenshots.memberId,
                    count: count(activityScreenshots.id),
                })
                .from(activityScreenshots)
                .where(and(inArray(activityScreenshots.memberId, memberIds), eq(activityScreenshots.screenshotStatus, 'approved')))
                .groupBy(activityScreenshots.memberId);

            const approvedByMemberId = new Map(approvedCounts.map((c) => [c.memberId, Number(c.count)]));

            // Count pending screenshots
            const pendingCounts = await db
                .select({
                    memberId: activityScreenshots.memberId,
                    count: count(activityScreenshots.id),
                })
                .from(activityScreenshots)
                .where(and(inArray(activityScreenshots.memberId, memberIds), eq(activityScreenshots.screenshotStatus, 'pending')))
                .groupBy(activityScreenshots.memberId);

            const pendingByMemberId = new Map(pendingCounts.map((c) => [c.memberId, Number(c.count)]));

            const [guildRow] = await db.select().from(systemSettings).where(eq(systemSettings.key, 'GUILD_ID'));
            const guildId = guildRow?.value?.trim();

            const rows = activeMembers
                .map((m) => {
                    const t = threadByMemberId.get(m.id);
                    if (!t) return null;

                    // Apply status filter
                    if (filterStatus && t.status !== filterStatus) return null;

                    const screenshotsCount = countByMemberId.get(m.id) ?? 0;
                    const approvedCount = approvedByMemberId.get(m.id) ?? 0;
                    const pendingCount = pendingByMemberId.get(m.id) ?? 0;
                    const forumUrl = guildId
                        ? `https://discord.com/channels/${guildId}/${t.discordForumChannelId}/${t.discordThreadId}`
                        : null;

                    const elapsedDays = Math.min(
                        Math.floor((Date.now() - new Date(t.createdAt).getTime()) / (24 * 60 * 60 * 1000)),
                        ACTIVITY_DAYS_LIMIT
                    );

                    return {
                        memberId: m.id,
                        discordAvatarUrl: m.discordAvatarUrl,
                        discordUsername: m.discordUsername,
                        discordId: m.discordId,

                        nickStatic: `${m.gameNickname} | ${m.gameStaticId}`,
                        gameNickname: m.gameNickname,
                        gameStaticId: m.gameStaticId,

                        joinedAt: m.joinedAt,
                        screenshotsCount,
                        approvedCount,
                        pendingCount,
                        screenshotsMax: MAX_SCREENSHOTS,
                        forumUrl,

                        threadStatus: t.status,
                        acceptedByDiscordId: t.acceptedByDiscordId,
                        threadCreatedAt: t.createdAt,
                        elapsedDays,
                        daysLimit: ACTIVITY_DAYS_LIMIT,
                    };
                })
                .filter((r) => r !== null);

            return reply.send(rows as any);
        } catch (e) {
            server.log.error(e);
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    server.get('/:memberId/screenshots', { preHandler: [requirePermission('site:activity:view')] }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { memberId } = request.params as { memberId: string };

            const rows = await db
                .select({
                    id: activityScreenshots.id,
                    imageUrl: activityScreenshots.imageUrl,
                    createdAt: activityScreenshots.createdAt,
                    sourceType: activityScreenshots.sourceType,
                    sourceDiscordMessageId: activityScreenshots.sourceDiscordMessageId,
                    screenshotStatus: activityScreenshots.screenshotStatus,
                    reviewedByDiscordId: activityScreenshots.reviewedByDiscordId,
                })
                .from(activityScreenshots)
                .where(and(eq(activityScreenshots.memberId, memberId)))
                .orderBy(asc(activityScreenshots.createdAt))
                .limit(MAX_SCREENSHOTS);

            return reply.send(rows);
        } catch (e) {
            server.log.error(e);
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    // Approve/reject screenshot from the web panel
    server.post('/:memberId/screenshots/:screenshotId/review', { preHandler: [requirePermission('site:activity:view')] }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { memberId, screenshotId } = request.params as { memberId: string; screenshotId: string };
            const body = z.object({ status: z.enum(['approved', 'rejected']) }).parse(request.body);

            const [screenshot] = await db.select().from(activityScreenshots)
                .where(and(eq(activityScreenshots.id, screenshotId), eq(activityScreenshots.memberId, memberId)))
                .limit(1);

            if (!screenshot) {
                return reply.status(404).send({ error: 'Screenshot not found' });
            }

            // Get the user performing the review
            const session = (request as any).session;
            const reviewerDiscordId = session?.user?.discordId ?? null;

            await db.update(activityScreenshots).set({
                screenshotStatus: body.status,
                reviewedByDiscordId: reviewerDiscordId,
            }).where(eq(activityScreenshots.id, screenshotId));

            // Notify bot to update the thread status message
            const IPC_BOT_BASE_URL = process.env.IPC_BOT_BASE_URL || 'http://bot:3001';
            fetch(`${IPC_BOT_BASE_URL}/ipc/update-activity-message/${memberId}`, { method: 'POST' }).catch(() => null);

            server.io.emit('activity_refresh', { memberId });
            return reply.send({ success: true });
        } catch (e) {
            if (e instanceof z.ZodError) {
                return reply.status(400).send({ error: 'Invalid body' });
            }
            server.log.error(e);
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    // Close activity thread from the web panel
    server.post('/:memberId/close', { preHandler: [requirePermission('site:activity:view')] }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { memberId } = request.params as { memberId: string };

            const [thread] = await db.select().from(activityThreads)
                .where(and(eq(activityThreads.memberId, memberId), eq(activityThreads.status, 'active')))
                .limit(1);

            if (!thread) {
                return reply.status(404).send({ error: 'Active thread not found' });
            }

            // Delegate closing entirely to the bot (it sets status, locks/archives thread, disables DM button)
            const IPC_BOT_BASE_URL = process.env.IPC_BOT_BASE_URL || 'http://bot:3001';
            await fetch(`${IPC_BOT_BASE_URL}/ipc/close-activity-thread/${memberId}`, { method: 'POST' });

            server.io.emit('activity_refresh', { memberId });
            return reply.send({ success: true });
        } catch (e) {
            server.log.error(e);
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    // Bot -> backend: tell the site to refresh activity data
    server.post('/ipc/bot-event', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const body = z.object({ memberId: z.string().optional() }).optional().parse(request.body);

            // Refresh activity page for all admins.
            server.io.emit('activity_refresh', body ?? {});
            return reply.send({ success: true });
        } catch (e) {
            return reply.status(400).send({ error: 'Bad IPC payload' });
        }
    });
}
