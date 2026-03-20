import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { db } from '../../../db';
import { roleSettings, systemSettings, members } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { lucia } from '../../auth/lucia';
import { hasRoleSettingsAccess } from '../../lib/discordRoles';
import { getRoleIdByKey } from '../../lib/discordMemberActions.js';
import { config } from 'dotenv';

config({ path: '.env' });
const DISCORD_API_BASE = 'https://discord.com/api/v10';

export default async function settingsController(fastify: FastifyInstance) {
    /** Only BOT_OWNER_ID or Discord roles OWNER / . (Администратор) can access role and system settings. */
    const requireRoleSettingsAccess = async (req: FastifyRequest, reply: FastifyReply) => {
        const sessionId = lucia.readSessionCookie(req.headers.cookie ?? '');
        if (!sessionId) {
            reply.status(401).send({ error: 'Unauthorized' });
            return;
        }

        const { session, user } = await lucia.validateSession(sessionId);
        if (!session || !user) {
            reply.status(401).send({ error: 'Unauthorized' });
            return;
        }

        const allowed = await hasRoleSettingsAccess(user.discordId);
        if (!allowed) {
            reply
                .status(403)
                .send({ error: 'Forbidden. Role settings: only BOT_OWNER, OWNER or Admin role.' });
            return;
        }
    };

    fastify.get(
        '/api/settings/roles',
        { preHandler: [requireRoleSettingsAccess] },
        async (_req: FastifyRequest, reply: FastifyReply) => {
            try {
                const roles = await db.select().from(roleSettings);
                reply.send(roles);
            } catch (error) {
                console.error('❌ Ошибка настроек:', error);
                reply.status(500).send({ error: 'Internal Server Error' });
            }
        },
    );

    fastify.patch(
        '/api/settings/roles',
        { preHandler: [requireRoleSettingsAccess] },
        async (req: FastifyRequest, reply: FastifyReply) => {
            try {
                const body = req.body as { updates?: Array<{ key: string; discordRoleId: string | null }> };
                if (!body || !Array.isArray(body.updates)) {
                    return reply.status(400).send({ error: 'Invalid payload: updates array is required' });
                }

                for (const update of body.updates) {
                    await db
                        .update(roleSettings)
                        .set({ discordRoleId: update.discordRoleId || null })
                        .where(eq(roleSettings.key, update.key));
                }

                reply.send({ success: true });
            } catch (error) {
                console.error('❌ Ошибка настроек:', error);
                reply.status(500).send({ error: 'Internal Server Error' });
            }
        },
    );

    // --- SYSTEM SETTINGS ---

    fastify.get(
        '/api/settings/system',
        { preHandler: [requireRoleSettingsAccess] },
        async (_req: FastifyRequest, reply: FastifyReply) => {
            try {
                const settings = await db.select().from(systemSettings);
                reply.send(settings);
            } catch (error) {
                console.error('❌ Ошибка настроек:', error);
                reply.status(500).send({ error: 'Internal Server Error' });
            }
        },
    );

    fastify.patch(
        '/api/settings/system',
        { preHandler: [requireRoleSettingsAccess] },
        async (req: FastifyRequest, reply: FastifyReply) => {
            try {
                const body = req.body as { updates?: Array<{ key: string; value: string | null }> };
                if (!body || !Array.isArray(body.updates)) {
                    return reply.status(400).send({ error: 'Invalid payload: updates array is required' });
                }

                for (const update of body.updates) {
                    // Upsert logic for system settings
                    const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, update.key));
                    if (existing.length > 0) {
                        await db
                            .update(systemSettings)
                            .set({ value: update.value || null })
                            .where(eq(systemSettings.key, update.key));
                    } else {
                        await db.insert(systemSettings).values({
                            key: update.key,
                            value: update.value || null,
                        });
                    }
                }

                reply.send({ success: true });
            } catch (error) {
                console.error('❌ Ошибка настроек:', error);
                reply.status(500).send({ error: 'Internal Server Error' });
            }
        },
    );

    // --- SYNC MEMBERS ---

    fastify.post(
        '/api/settings/sync-members',
        { preHandler: [requireRoleSettingsAccess] },
        async (_req: FastifyRequest, reply: FastifyReply) => {
            try {
                const [guildRow] = await db.select().from(systemSettings).where(eq(systemSettings.key, 'GUILD_ID'));
                const guildId = guildRow?.value?.trim();
                if (!guildId) {
                    return reply.status(400).send({ error: 'GUILD_ID не настроен в системе.' });
                }

                const token = process.env.DISCORD_TOKEN;
                if (!token) {
                    return reply.status(500).send({ error: 'Токен бота не найден.' });
                }

                const kingsizeId = await getRoleIdByKey('KINGSIZE');
                const newKingsizeId = await getRoleIdByKey('NEWKINGSIZE');

                if (!kingsizeId && !newKingsizeId) {
                    return reply.status(400).send({ error: 'Роли KINGSIZE и NEWKINGSIZE не настроены.' });
                }

                // Fetch guild members (max 1000 per request)
                let allDiscordMembers: any[] = [];
                let after = '0';
                while (true) {
                    const res = await fetch(
                        `${DISCORD_API_BASE}/guilds/${guildId}/members?limit=1000&after=${after}`,
                        { headers: { Authorization: `Bot ${token}` } },
                    );

                    if (!res.ok) {
                        console.error('❌ Ошибка получения участников:', res.status, res.statusText);
                        const errorText = await res.text();
                        console.error('❌ Ответ Discord API:', errorText);
                        return reply.status(500).send({ error: 'Не удалось получить участников с Discord API.' });
                    }

                    const data = await res.json();
                    if (!Array.isArray(data) || data.length === 0) break;

                    allDiscordMembers.push(...data);

                    if (data.length < 1000) break;
                    after = data[data.length - 1].user.id;
                }

                // Fetch TIER roles
                const tier1Id = await getRoleIdByKey('TIER1');
                const tier2Id = await getRoleIdByKey('TIER2');
                const tier3Id = await getRoleIdByKey('TIER3');

                const targetMembers = allDiscordMembers.filter((m) => {
                    const roles = m.roles || [];
                    return roles.includes(kingsizeId) || roles.includes(newKingsizeId);
                });

                const targetDiscordIds = new Set(targetMembers.map((m) => m.user.id));
                const existingDbMembers = await db.select().from(members);

                let addedCount = 0;
                let updatedCount = 0;
                let kickedCount = 0;

                for (const m of targetMembers) {
                    let roleValue: 'KINGSIZE' | 'NEWKINGSIZE' = 'NEWKINGSIZE';
                    if (kingsizeId && m.roles.includes(kingsizeId)) {
                        roleValue = 'KINGSIZE';
                    }

                    let tierValue: 'TIER 1' | 'TIER 2' | 'TIER 3' | 'NONE' = 'NONE';
                    const roles = m.roles || [];
                    if (tier1Id && roles.includes(tier1Id)) tierValue = 'TIER 1';
                    else if (tier2Id && roles.includes(tier2Id)) tierValue = 'TIER 2';
                    else if (tier3Id && roles.includes(tier3Id)) tierValue = 'TIER 3';

                    const existingMember = existingDbMembers.find((dbM) => dbM.discordId === m.user.id);

                    if (!existingMember) {
                        await db.insert(members).values({
                            id: randomUUID(),
                            discordId: m.user.id,
                            discordUsername: m.user.username,
                            discordAvatarUrl: m.user.avatar
                                ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png`
                                : null,
                            gameNickname: m.nick || m.user.global_name || m.user.username,
                            gameStaticId: '0000',
                            role: roleValue,
                            tier: tierValue,
                            status: 'active',
                        });

                        addedCount++;
                    } else {
                        const needsStatusUpdate = existingMember.status !== 'active';
                        const needsRoleUpdate = existingMember.role !== roleValue;
                        const needsTierUpdate = existingMember.tier !== tierValue;

                        if (needsStatusUpdate || needsRoleUpdate || needsTierUpdate) {
                            await db
                                .update(members)
                                .set({
                                    status: 'active',
                                    role: roleValue,
                                    tier: tierValue,
                                    discordUsername: m.user.username,
                                    discordAvatarUrl: m.user.avatar
                                        ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png`
                                        : null,
                                })
                                .where(eq(members.discordId, m.user.id));

                            updatedCount++;
                        }
                    }
                }

                // Kick members who are active but no longer have required roles
                for (const dbM of existingDbMembers) {
                    if (dbM.status === 'active' && !targetDiscordIds.has(dbM.discordId)) {
                        await db
                            .update(members)
                            .set({ status: 'kicked', tier: 'NONE' })
                            .where(eq(members.id, dbM.id));
                        kickedCount++;
                    }
                }

                return reply.send({
                    success: true,
                    added: addedCount,
                    updated: updatedCount,
                    kicked: kickedCount,
                    totalFound: targetMembers.length,
                });
            } catch (error) {
                console.error('❌ Ошибка синхронизации участников:', error);
                return reply.status(500).send({ error: 'Internal Server Error' });
            }
        },
    );
}

