import { FastifyInstance } from 'fastify';
import { db } from '../../../db';
import { members, users, applications, events, eventParticipants } from '../../../db/schema.js';
import { eq, desc, inArray, and, ne } from 'drizzle-orm';
import { lucia } from '../../auth/lucia';
import { z } from 'zod';
import { removeRole, getRoleIdByKey, addRole, setNickname, refreshEventEmbedRest, unbanMember } from '../../lib/discordMemberActions.js';

export default async function membersController(fastify: FastifyInstance) {
    const checkAdmin = async (request: any, reply: any) => {
        const sessionId = lucia.readSessionCookie(request.headers.cookie ?? '');
        if (!sessionId) return reply.status(401).send({ error: 'Unauthorized' });

        const { session, user } = await lucia.validateSession(sessionId);
        if (!session) return reply.status(401).send({ error: 'Unauthorized' });

        const [dbUser] = await db.select().from(users).where(eq(users.discordId, user.discordId));
        if (!dbUser) return reply.status(401).send({ error: 'Unauthorized' });
        request.user = dbUser;
    };

    // GET /api/members - List active members
    fastify.get('/', { preValidation: checkAdmin }, async (_request, reply) => {
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

    // GET /api/members/excluded - List excluded and blacklisted members
    fastify.get('/kicked', { preValidation: checkAdmin }, async (_request, reply) => {
        try {
            const excluded = await db
                .select()
                .from(members)
                .where(inArray(members.status, ['kicked', 'blacklisted']))
                .orderBy(desc(members.joinedAt));
            return reply.send(excluded);
        } catch (error) {
            console.error('❌ Ошибка получения исключенных:', error);
            return reply.status(500).send({ error: 'Internal Server Error' });
        }
    });

    // GET /api/members/:id - Member profile
    fastify.get('/:id', { preValidation: checkAdmin }, async (request, reply) => {
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
        role: z.enum(['NEWKINGSIZE', 'KINGSIZE']).optional(),
        tier: z.enum(['TIER 1', 'TIER 2', 'TIER 3', 'БЕЗ TIER']).optional(),
    });

    fastify.patch('/:id', { preValidation: checkAdmin }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const data = updateSchema.parse(request.body);

            const updateData: Record<string, any> = {};
            if (data.gameNickname !== undefined) updateData.gameNickname = data.gameNickname;
            if (data.gameStaticId !== undefined) updateData.gameStaticId = data.gameStaticId;
            if (data.role !== undefined) updateData.role = data.role;
            if (data.tier !== undefined) updateData.tier = data.tier;

            const [updated] = await db.update(members).set(updateData).where(eq(members.id, id)).returning();

            if (!updated) return reply.status(404).send({ error: 'Member not found' });

            // If nick or static changed, update Discord nickname
            if (data.gameNickname !== undefined || data.gameStaticId !== undefined) {
                const newNick = `${updated.gameNickname} | ${updated.gameStaticId}`;
                await setNickname(updated.discordId, newNick);
            }

            // If role changed, manage Discord roles
            if (data.role !== undefined) {
                const newKingsizeId = await getRoleIdByKey('NEWKINGSIZE');
                const kingsizeId = await getRoleIdByKey('KINGSIZE');

                if (data.role === 'KINGSIZE') {
                    if (newKingsizeId) await removeRole(updated.discordId, newKingsizeId);
                    if (kingsizeId) await addRole(updated.discordId, kingsizeId);
                } else {
                    if (kingsizeId) await removeRole(updated.discordId, kingsizeId);
                    if (newKingsizeId) await addRole(updated.discordId, newKingsizeId);
                }
            }

            // If tier changed, manage Discord TIER roles
            if (data.tier !== undefined) {
                const tier1Id = await getRoleIdByKey('TIER1');
                const tier2Id = await getRoleIdByKey('TIER2');
                const tier3Id = await getRoleIdByKey('TIER3');

                // Remove all existing tier roles first to ensure they only have one
                if (tier1Id) await removeRole(updated.discordId, tier1Id);
                if (tier2Id) await removeRole(updated.discordId, tier2Id);
                if (tier3Id) await removeRole(updated.discordId, tier3Id);

                // Add the selected tier role
                if (data.tier === 'TIER 1' && tier1Id) {
                    await addRole(updated.discordId, tier1Id);
                } else if (data.tier === 'TIER 2' && tier2Id) {
                    await addRole(updated.discordId, tier2Id);
                } else if (data.tier === 'TIER 3' && tier3Id) {
                    await addRole(updated.discordId, tier3Id);
                }

                // Trigger Discord event embed refresh for active events
                try {
                    const userEvents = await db
                        .select({ eventId: eventParticipants.eventId })
                        .from(eventParticipants)
                        .innerJoin(events, eq(events.id, eventParticipants.eventId))
                        .where(and(eq(eventParticipants.userId, updated.discordId), ne(events.status, 'Closed')));

                    if (userEvents.length > 0) {
                        const TIER_MAP: Record<string, number> = {
                            'TIER 1': 1,
                            'TIER 2': 2,
                            'TIER 3': 3,
                            'NONE': 4,
                            'БЕЗ TIER': 4,
                        };

                        const newTierInt = TIER_MAP[data.tier] || 4;
                        const eventIds = userEvents.map((e) => e.eventId);

                        await db
                            .update(eventParticipants)
                            .set({ tier: newTierInt })
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
    fastify.post('/:id/exclude', { preValidation: checkAdmin }, async (request, reply) => {
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
            const newKingsizeId = await getRoleIdByKey('NEWKINGSIZE');
            const kingsizeId = await getRoleIdByKey('KINGSIZE');
            const tier1Id = await getRoleIdByKey('TIER1');
            const tier2Id = await getRoleIdByKey('TIER2');
            const tier3Id = await getRoleIdByKey('TIER3');

            if (newKingsizeId) await removeRole(member.discordId, newKingsizeId);
            if (kingsizeId) await removeRole(member.discordId, kingsizeId);
            if (tier1Id) await removeRole(member.discordId, tier1Id);
            if (tier2Id) await removeRole(member.discordId, tier2Id);
            if (tier3Id) await removeRole(member.discordId, tier3Id);

            // If blacklisted, add BLACKLIST role
            if (blacklist) {
                const blacklistRoleId = await getRoleIdByKey('BLACKLIST');
                if (blacklistRoleId) await addRole(member.discordId, blacklistRoleId);
            }

            // Update member status
            const newStatus = blacklist ? 'blacklisted' : 'kicked';
            const [excluded] = await db
                .update(members)
                .set({ status: newStatus, kickReason: reason, kickedAt: new Date() })
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
    fastify.post('/:id/unblacklist', { preValidation: checkAdmin }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };

            const [member] = await db.select().from(members).where(eq(members.id, id));
            if (!member) return reply.status(404).send({ error: 'Member not found' });
            if (member.status !== 'blacklisted') return reply.status(400).send({ error: 'Member is not blacklisted' });

            // Unban from Discord server and remove BLACKLIST role
            await unbanMember(member.discordId);
            const blacklistRoleId = await getRoleIdByKey('BLACKLIST');
            if (blacklistRoleId) await removeRole(member.discordId, blacklistRoleId);

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

