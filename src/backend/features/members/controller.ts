import { FastifyInstance } from 'fastify';
import { db } from '../../../db';
import { members, users, applications, events, eventParticipants, roles } from '../../../db/schema.js';
import { eq, desc, inArray, and, ne, asc } from 'drizzle-orm';
import { z } from 'zod';
import { requireAnyPermission, requirePermission } from '../../lib/discordRoles';
import { removeRole, addRole, setNickname, refreshEventEmbedRest, unbanMember } from '../../lib/discordMemberActions.js';

export default async function membersController(fastify: FastifyInstance) {

    // GET /api/members - List active members
    fastify.get('/', { preHandler: [requirePermission('site:members:view')] }, async (_request, reply) => {
        try {
            const allMembers = await db
                .select()
                .from(members)
                .where(eq(members.status, 'active'))
                .orderBy(desc(members.joinedAt));
            return reply.send(allMembers);
        } catch (error) {
            console.error('❌ Ошибка получения участников:', error);
            return reply.status(500).send({ error: 'Internal Server Error' });
        }
    });

    // GET /api/members/roles - Roles metadata for members page
    fastify.get('/roles', { preHandler: [requirePermission('site:members:view')] }, async (_request, reply) => {
        try {
            const allRoles = await db
                .select()
                .from(roles)
                .orderBy(asc(roles.priority));
            return reply.send(allRoles);
        } catch (error) {
            console.error('❌ Ошибка получения ролей для участников:', error);
            return reply.status(500).send({ error: 'Internal Server Error' });
        }
    });

    // GET /api/members/kicked - List excluded and blacklisted members with application info
    fastify.get('/kicked', { preHandler: [requirePermission('site:kicked:view')] }, async (_request, reply) => {
        try {
            const excluded = await db
                .select({
                    id: members.id,
                    discordId: members.discordId,
                    discordUsername: members.discordUsername,
                    discordAvatarUrl: members.discordAvatarUrl,
                    gameNickname: members.gameNickname,
                    gameStaticId: members.gameStaticId,
                    status: members.status,
                    applicationId: members.applicationId,
                    joinedAt: members.joinedAt,
                    kickReason: members.kickReason,
                    kickedAt: members.kickedAt,
                    kickedByAdminUsername: members.kickedByAdminUsername,
                    acceptedByAdminUsername: applications.handledByAdminUsername,
                    acceptedAt: applications.updatedAt,
                })
                .from(members)
                .leftJoin(applications, eq(members.applicationId, applications.id))
                .where(inArray(members.status, ['kicked', 'blacklisted']))
                .orderBy(desc(members.kickedAt));
            return reply.send(excluded);
        } catch (error) {
            console.error('❌ Ошибка получения исключенных:', error);
            return reply.status(500).send({ error: 'Internal Server Error' });
        }
    });

    // GET /api/members/:id - Member profile
    fastify.get('/:id', { preHandler: [requirePermission('site:members:view')] }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const [member] = await db.select().from(members).where(eq(members.id, id));
            if (!member) return reply.status(404).send({ error: 'Member not found' });
            return reply.send(member);
        } catch (error) {
            console.error('❌ Ошибка получения участника:', error);
            return reply.status(500).send({ error: 'Internal Server Error' });
        }
    });

    // PATCH /api/members/:id - Update member (nick, static, role, tier)
    const updateSchema = z.object({
        gameNickname: z.string().optional(),
        gameStaticId: z.string().optional(),
        roleId: z.string().nullable().optional(),
        tierRoleId: z.string().nullable().optional(),
    });

    fastify.patch('/:id', { preHandler: [requirePermission('site:members:actions')] }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const data = updateSchema.parse(request.body);

            const updateData: Record<string, any> = {};
            if (data.gameNickname !== undefined) updateData.gameNickname = data.gameNickname;
            if (data.gameStaticId !== undefined) updateData.gameStaticId = data.gameStaticId;
            if (data.roleId !== undefined) updateData.roleId = data.roleId;
            if (data.tierRoleId !== undefined) updateData.tierRoleId = data.tierRoleId;

            const [updated] = await db.update(members).set(updateData).where(eq(members.id, id)).returning();

            if (!updated) return reply.status(404).send({ error: 'Member not found' });

            // If nick or static changed, update Discord nickname
            if (data.gameNickname !== undefined || data.gameStaticId !== undefined) {
                const newNick = `${updated.gameNickname} | ${updated.gameStaticId}`;
                await setNickname(updated.discordId, newNick);
            }

            // If role changed, manage Discord MAIN/NEW roles
            if (data.roleId !== undefined) {
                const [mainRole, newRole, selectedRole] = await Promise.all([
                    db.select().from(roles).where(and(eq(roles.type, 'system'), eq(roles.systemType, 'main'))),
                    db.select().from(roles).where(and(eq(roles.type, 'system'), eq(roles.systemType, 'new'))),
                    data.roleId ? db.select().from(roles).where(eq(roles.id, data.roleId)) : Promise.resolve([]),
                ]);

                const mainDiscordRoleId = mainRole[0]?.discordRoleId || null;
                const newDiscordRoleId = newRole[0]?.discordRoleId || null;

                if (mainDiscordRoleId) await removeRole(updated.discordId, mainDiscordRoleId);
                if (newDiscordRoleId) await removeRole(updated.discordId, newDiscordRoleId);

                const selectedDiscordRoleId = selectedRole[0]?.discordRoleId || null;
                if (selectedDiscordRoleId) await addRole(updated.discordId, selectedDiscordRoleId);
            }

            // If tier changed, manage Discord TIER roles
            if (data.tierRoleId !== undefined) {
                const tierRoles = await db
                    .select()
                    .from(roles)
                    .where(and(eq(roles.type, 'system'), eq(roles.systemType, 'tier')))
                    .orderBy(asc(roles.priority));

                for (const tierRole of tierRoles) {
                    if (tierRole.discordRoleId) await removeRole(updated.discordId, tierRole.discordRoleId);
                }

                if (data.tierRoleId) {
                    const [selectedTierRole] = await db.select().from(roles).where(eq(roles.id, data.tierRoleId));
                    if (selectedTierRole?.discordRoleId) await addRole(updated.discordId, selectedTierRole.discordRoleId);
                }

                // Trigger Discord event embed refresh for active events
                try {
                    const userEvents = await db
                        .select({ eventId: eventParticipants.eventId })
                        .from(eventParticipants)
                        .innerJoin(events, eq(events.id, eventParticipants.eventId))
                        .where(and(eq(eventParticipants.userId, updated.discordId), ne(events.status, 'Closed')));

                    if (userEvents.length > 0) {
                        const eventIds = userEvents.map((e) => e.eventId);

                        await db
                            .update(eventParticipants)
                            .set({ tierRoleId: data.tierRoleId || null })
                            .where(and(eq(eventParticipants.userId, updated.discordId), inArray(eventParticipants.eventId, eventIds)));

                        for (const ev of userEvents) {
                            refreshEventEmbedRest(ev.eventId).catch((err) => console.error('❌ Ошибка автообновления МП:', err));
                        }
                    }
                } catch (err) {
                    console.error('❌ Ошибка обновления МП после смены тира:', err);
                }
            }

            return reply.send(updated);
        } catch (error) {
            if (error instanceof z.ZodError) {
                return reply.status(400).send({ error: 'Invalid input', details: error.errors });
            }
            console.error('❌ Ошибка обновления участника:', error);
            return reply.status(500).send({ error: 'Internal Server Error' });
        }
    });

    // POST /api/members/:id/exclude - Exclude member (optionally blacklist)
    fastify.post('/:id/exclude', { preHandler: [requireAnyPermission(['site:kicked:actions', 'site:members:actions'])] }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const { reason, blacklist } = z
                .object({
                    reason: z.string().min(1),
                    blacklist: z.boolean().optional().default(false),
                })
                .parse(request.body);

            const [member] = await db.select().from(members).where(eq(members.id, id));
            if (!member) return reply.status(404).send({ error: 'Member not found' });

            // Remove Discord roles
            const systemRoles = await db.select().from(roles).where(eq(roles.type, 'system'));
            for (const systemRole of systemRoles) {
                if (systemRole.discordRoleId) await removeRole(member.discordId, systemRole.discordRoleId);
            }

            // If blacklisted, add BLACKLIST role
            if (blacklist) {
                const [blacklistRole] = await db
                    .select()
                    .from(roles)
                    .where(and(eq(roles.type, 'system'), eq(roles.systemType, 'blacklist')));
                if (blacklistRole?.discordRoleId) await addRole(member.discordId, blacklistRole.discordRoleId);
            }

            // Get admin username
            const adminUsername = (request as any).user?.username || 'System';

            // Update member status
            const newStatus = blacklist ? 'blacklisted' : 'kicked';
            const [excluded] = await db
                .update(members)
                .set({ status: newStatus, tierRoleId: null, kickReason: reason, kickedAt: new Date(), kickedByAdminUsername: adminUsername })
                .where(eq(members.id, id))
                .returning();

            // Also update the application status if it exists
            if (excluded.applicationId) {
                const appStatus = blacklist ? 'blacklist' : 'excluded';
                await db.update(applications).set({ status: appStatus }).where(eq(applications.id, excluded.applicationId));
            }

            return reply.send(excluded);
        } catch (error) {
            if (error instanceof z.ZodError) {
                return reply.status(400).send({ error: 'Reason is required' });
            }
            console.error('❌ Ошибка исключения участника:', error);
            return reply.status(500).send({ error: 'Internal Server Error' });
        }
    });

    // POST /api/members/:id/unblacklist - Remove blacklist from member
    fastify.post('/:id/unblacklist', { preHandler: [requirePermission('site:kicked:actions')] }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };

            const [member] = await db.select().from(members).where(eq(members.id, id));
            if (!member) return reply.status(404).send({ error: 'Member not found' });
            if (member.status !== 'blacklisted') return reply.status(400).send({ error: 'Member is not blacklisted' });

            // Unban from Discord server and remove BLACKLIST role
            await unbanMember(member.discordId);
            const [blacklistRole] = await db
                .select()
                .from(roles)
                .where(and(eq(roles.type, 'system'), eq(roles.systemType, 'blacklist')));
            if (blacklistRole?.discordRoleId) await removeRole(member.discordId, blacklistRole.discordRoleId);

            // Update member status to kicked (stays excluded, just no longer blacklisted)
            const [updated] = await db.update(members).set({ status: 'kicked' }).where(eq(members.id, id)).returning();

            // Update application status from blacklist to excluded
            if (updated.applicationId) {
                await db.update(applications).set({ status: 'excluded' }).where(eq(applications.id, updated.applicationId));
            }

            return reply.send(updated);
        } catch (error) {
            console.error('❌ Ошибка удаления из черного списка:', error);
            return reply.status(500).send({ error: 'Internal Server Error' });
        }
    });
}

