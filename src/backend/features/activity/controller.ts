import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '../../../db';
import { activityScreenshots, activityThreads, members, systemSettings, users } from '../../../db/schema';
import { and, count, eq, inArray, asc } from 'drizzle-orm';
import { lucia } from '../../auth/lucia';
import { hasAdminPanelAccess } from '../../lib/discordRoles';

const MAX_SCREENSHOTS = 30;

async function requireAdminPanel(request: FastifyRequest, reply: FastifyReply) {
    const sessionId = lucia.readSessionCookie(request.headers.cookie ?? '');
    if (!sessionId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return false;
    }

    const { session, user } = await lucia.validateSession(sessionId);
    if (!session || !user) {
        reply.status(401).send({ error: 'Unauthorized' });
        return false;
    }

    const [dbUser] = await db.select().from(users).where(eq(users.discordId, user.discordId));
    if (!dbUser) {
        reply.status(401).send({ error: 'Unauthorized' });
        return false;
    }

    const allowed = await hasAdminPanelAccess(dbUser.discordId);
    if (!allowed) {
        reply.status(403).send({ error: 'Forbidden' });
        return false;
    }

    return true;
}

export default async function activityController(server: FastifyInstance) {
    server.get('/overview', async (request: FastifyRequest, reply: FastifyReply) => {
        if (!(await requireAdminPanel(request, reply))) return;

        try {
            const activeMembers = await db
                .select()
                .from(members)
                .where(eq(members.status, 'active'))
                .orderBy(asc(members.joinedAt));

            if (activeMembers.length === 0) {
                return reply.send([]);
            }

            const memberIds = activeMembers.map((m) => m.id);

            const threads = await db
                .select()
                .from(activityThreads)
                .where(inArray(activityThreads.memberId, memberIds));

            const threadByMemberId = new Map(threads.map((t) => [t.memberId, t]));

            const counts = await db
                .select({
                    memberId: activityScreenshots.memberId,
                    count: count(activityScreenshots.id),
                })
                .from(activityScreenshots)
                .where(inArray(activityScreenshots.memberId, memberIds))
                .groupBy(activityScreenshots.memberId);

            const countByMemberId = new Map(counts.map((c) => [c.memberId, Number(c.count)]));

            const [guildRow] = await db.select().from(systemSettings).where(eq(systemSettings.key, 'GUILD_ID'));
            const guildId = guildRow?.value?.trim();

            const rows = activeMembers
                .map((m) => {
                    const t = threadByMemberId.get(m.id);
                    if (!t) return null; // bot должен создать ветку в форуме — если ее нет, не показываем

                    const screenshotsCount = countByMemberId.get(m.id) ?? 0;
                    const forumUrl = guildId
                        ? `https://discord.com/channels/${guildId}/${t.discordForumChannelId}/${t.discordThreadId}`
                        : null;

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
                        screenshotsMax: MAX_SCREENSHOTS,
                        forumUrl,
                    };
                })
                .filter((r) => r !== null);

            return reply.send(rows as any);
        } catch (e) {
            server.log.error(e);
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    server.get('/:memberId/screenshots', async (request: FastifyRequest, reply: FastifyReply) => {
        if (!(await requireAdminPanel(request, reply))) return;

        try {
            const { memberId } = request.params as { memberId: string };

            const rows = await db
                .select({
                    id: activityScreenshots.id,
                    imageUrl: activityScreenshots.imageUrl,
                    createdAt: activityScreenshots.createdAt,
                    sourceType: activityScreenshots.sourceType,
                    sourceDiscordMessageId: activityScreenshots.sourceDiscordMessageId,
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

