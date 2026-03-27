import { FastifyInstance } from 'fastify';
import { db } from '../../../db';
import { applications, users, systemSettings, interviewMessages, roles } from '../../../db/schema';
import { and, eq, desc, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { requirePermission } from '../../lib/discordRoles';

// Add type for user in FastifyRequest
declare module 'fastify' {
    interface FastifyRequest {
        user?: { id: string; discordId: string; username: string; [key: string]: any } | null;
        session?: any;
    }
}

import { members } from '../../../db/schema';
import { randomUUID } from 'crypto';
import { addRole, getRoleIdByPurpose, setNickname } from '../../lib/discordMemberActions.js';

const IPC_BOT_BASE_URL = process.env.IPC_BOT_BASE_URL || 'http://localhost:3001';

// Validation schema for updating status
const updateStatusSchema = z.object({
    status: z.enum(['pending', 'interview', 'interview_ready', 'accepted', 'rejected', 'excluded', 'blacklist']),
    rejectionReason: z.string().optional(),
    gameNickname: z
        .string()
        .max(22, 'Nickname must be maximum 22 characters')
        .regex(/^[A-Z]/, 'Nickname must start with a capital English letter')
        .optional(),
    gameStaticId: z.string().optional(),
});

export default async function applicationsController(fastify: FastifyInstance) {

    // GET /api/applications - List all applications
    fastify.get('/', { preHandler: [requirePermission('site:applications:view')] }, async (_request, reply) => {
        try {
            const allApplications = await db.select().from(applications).orderBy(desc(applications.createdAt));
            return reply.send(allApplications);
        } catch (error) {
            console.error('❌ Ошибка получения заявок:', error);
            return reply.status(500).send({ error: 'Internal Server Error' });
        }
    });

    // GET /api/applications/archive - Archived applications with member exclusion data
    fastify.get('/archive', { preHandler: [requirePermission('site:archive:view')] }, async (_request, reply) => {
        try {
            const archivedApps = await db
                .select({
                    id: applications.id,
                    discordId: applications.discordId,
                    discordUsername: applications.discordUsername,
                    discordAvatarUrl: applications.discordAvatarUrl,
                    field1: applications.field1,
                    field2: applications.field2,
                    field3: applications.field3,
                    field4: applications.field4,
                    field5: applications.field5,
                    status: applications.status,
                    createdAt: applications.createdAt,
                    handledByAdminUsername: applications.handledByAdminUsername,
                    updatedAt: applications.updatedAt,
                    rejectionReason: applications.rejectionReason,
                    memberKickReason: members.kickReason,
                    memberKickedAt: members.kickedAt,
                    memberKickedByAdminUsername: members.kickedByAdminUsername,
                    memberStatus: members.status,
                })
                .from(applications)
                .leftJoin(members, eq(members.applicationId, applications.id))
                .where(inArray(applications.status, ['accepted', 'rejected', 'excluded', 'blacklist']))
                .orderBy(desc(applications.updatedAt));
            return reply.send(archivedApps);
        } catch (error) {
            console.error('❌ Ошибка получения архива:', error);
            return reply.status(500).send({ error: 'Internal Server Error' });
        }
    });

    // PATCH /api/applications/:id/status - Update application status
    fastify.patch('/:id/status', { preHandler: [requirePermission('site:applications:actions')] }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const { status, rejectionReason, gameNickname } = updateStatusSchema.parse(request.body);
            const gameStaticId = "0000";

            // Required fields validation
            if (status === 'rejected' && !rejectionReason) {
                return reply.status(400).send({
                    error: 'Rejection reason is required when rejecting an application',
                });
            }

            if (status === 'accepted') {
                if (!gameNickname) {
                    return reply
                        .status(400)
                        .send({ error: 'gameNickname is required when accepting an application' });
                }
            }

            // Get the admin username who is making the change
            const [adminUser] = await db.select().from(users).where(eq(users.id, request.user!.id));
            const currentAdminUsername = adminUser ? adminUser.username || 'System' : 'Unknown';

            // Get original application
            const [existingApp] = await db.select().from(applications).where(eq(applications.id, id));
            if (!existingApp) {
                return reply.status(404).send({ error: 'Application not found' });
            }

            // Update application record
            const updatePayload: Record<string, any> = {
                status,
                handledByAdminUsername: currentAdminUsername,
                handledByAdminId: request.user!.id,
                updatedAt: new Date(),
            };

            if (status === 'rejected') {
                updatePayload.rejectionReason = rejectionReason;
            }

            const [updatedApplication] = await db
                .update(applications)
                .set(updatePayload)
                .where(eq(applications.id, id))
                .returning();

            // Trigger Bot IPC for DM (Interview)
            if (status === 'interview' && existingApp.status !== 'interview') {
                try {
                    await fetch(`${IPC_BOT_BASE_URL}/ipc/send-interview-dm/${id}`, { method: 'POST' });
                } catch (ipcErr) {
                    console.error('❌ Ошибка связи с ботом для отправки ЛС об обзвоне:', ipcErr);
                }
            }

            // Trigger Bot IPC for DM (Rejection)
            if (status === 'rejected' && existingApp.status !== 'rejected') {
                try {
                    await fetch(`${IPC_BOT_BASE_URL}/ipc/send-reject-dm/${id}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ reason: rejectionReason }),
                    });
                } catch (ipcErr) {
                    console.error('❌ Ошибка связи с ботом для отправки ЛС об отказе:', ipcErr);
                }
            }

            // Handle Member logic if accepted
            if (status === 'accepted') {
                console.log('=== [ПРИНЯТИЕ] Запуск процедуры принятия ===');
                console.log('📌 [ПРИНЯТИЕ] Заявка:', existingApp.id, 'Discord:', existingApp.discordId);
                console.log('📌 [ПРИНЯТИЕ] Ник:', gameNickname, 'Статик:', gameStaticId);

                // Ensure they aren't already a member (just in case of double click)
                const [existingMember] = await db.select().from(members).where(eq(members.discordId, existingApp.discordId));

                let acceptedMemberId: string | null = existingMember?.id ?? null;
                let acceptedRoleName = 'Новенький';

                try {
                    const [newRole] = await db
                        .select()
                        .from(roles)
                        .where(and(eq(roles.type, 'system'), eq(roles.systemType, 'new')));
                    acceptedRoleName = newRole?.name || 'Новенький';

                    let memberId = existingMember?.id;
                    if (!existingMember) {
                        // Create member
                        memberId = randomUUID();
                        console.log('➕ [ПРИНЯТИЕ] Создание нового участника с id:', memberId);
                        await db.insert(members).values({
                            id: memberId,
                            discordId: existingApp.discordId,
                            discordUsername: existingApp.discordUsername,
                            discordAvatarUrl: existingApp.discordAvatarUrl,
                            gameNickname: gameNickname!,
                            gameStaticId: gameStaticId!,
                            roleId: newRole?.id || null,
                            tierRoleId: null,
                            status: 'active',
                            applicationId: existingApp.id,
                        });
                        console.log('✅ [ПРИНЯТИЕ] Участник успешно добавлен в БД');
                    } else {
                        console.log('🔄 [ПРИНЯТИЕ] Обновление существующего участника');
                        await db
                            .update(members)
                            .set({
                                gameNickname: gameNickname!,
                                gameStaticId: gameStaticId!,
                                roleId: newRole?.id || null,
                                tierRoleId: null,
                                status: 'active',
                                applicationId: existingApp.id,
                            })
                            .where(eq(members.id, existingMember.id));
                        console.log('✅ [ПРИНЯТИЕ] Участник успешно обновлен в БД');
                    }

                    acceptedMemberId = memberId;
                } catch (dbErr) {
                    console.error('❌ [ПРИНЯТИЕ] ОШИБКА при добавлении/обновлении участника:', dbErr);
                    return reply.status(500).send({ error: 'Failed to update member in Database' });
                }

                // Discord Integrations
                let newKingsizeRoleId = '';
                let newNick = '';
                try {
                    console.log('🔍 [ПРИНЯТИЕ] Поиск ID роли новенького в настройках...');
                    newKingsizeRoleId = await getRoleIdByPurpose('newbie') || '';
                    console.log('🔍 [ПРИНЯТИЕ] ID роли новенького из БД:', newKingsizeRoleId);

                    if (newKingsizeRoleId) {
                        console.log(
                            '⚙️ [ПРИНЯТИЕ] Выдача роли новенького пользователю',
                            existingApp.discordId,
                            'с ролью',
                            newKingsizeRoleId,
                        );
                        const roleResult = await addRole(existingApp.discordId, newKingsizeRoleId);
                        console.log('✅ [ПРИНЯТИЕ] Результат addRole:', roleResult);
                    } else {
                        console.warn('⚠️ [ПРИНЯТИЕ] ВНИМАНИЕ: ID роли новенького пуст в настройках!');
                    }

                    newNick = gameNickname!;
                    console.log('⚙️ [ПРИНЯТИЕ] Смена никнейма на:', newNick);
                    const nickResult = await setNickname(existingApp.discordId, newNick);
                    console.log('✅ [ПРИНЯТИЕ] Результат setNickname:', nickResult);
                } catch (discordErr) {
                    console.error('❌ [ПРИНЯТИЕ] Ошибка синхронизации с Discord:', discordErr);
                }

                // Activity forum thread creation (once per accepted transition)
                if (existingApp.status !== 'accepted' && acceptedMemberId) {
                    try {
                        const [activitySetting] = await db.select().from(systemSettings).where(eq(systemSettings.key, 'NEW_MEMBER_ACTIVITY_ENABLED'));
                        const isActivityEnabled = activitySetting ? activitySetting.value === 'true' : true;

                        if (isActivityEnabled) {
                            await fetch(`${IPC_BOT_BASE_URL}/ipc/create-activity-thread/${acceptedMemberId}`, {
                                method: 'POST',
                            });
                        }
                    } catch (ipcErr) {
                        console.error('❌ Ошибка связи с ботом для создания activity thread:', ipcErr);
                    }

                    // Send Welcome DM
                    try {
                        await fetch(`${IPC_BOT_BASE_URL}/ipc/send-accept-dm/${id}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ newNickname: newNick, roleId: newKingsizeRoleId, roleName: acceptedRoleName }),
                        });
                    } catch (ipcErr) {
                        console.error('❌ Ошибка связи с ботом для отправки ЛС о принятии:', ipcErr);
                    }
                }

                console.log('=== [ПРИНЯТИЕ] Процедура завершена ===');
            }

            // Notify all connected clients about application status change
            fastify.io.emit('applications_refresh');

            return reply.send(updatedApplication);
        } catch (error) {
            if (error instanceof z.ZodError) {
                return reply.status(400).send({ error: 'Invalid input', details: error.errors });
            }
            console.error('❌ Ошибка обновления статуса заявки:', error);
            return reply.status(500).send({ error: 'Internal Server Error' });
        }
    });

    // GET /api/applications/fields - Get field labels + placeholders (no auth, bot also needs this)
    fastify.get('/fields', async (_request, reply) => {
        try {
            const allKeys = [
                'APPLICATION_FIELD_1',
                'APPLICATION_FIELD_2',
                'APPLICATION_FIELD_3',
                'APPLICATION_FIELD_4',
                'APPLICATION_FIELD_5',
                'APPLICATION_FIELD_1_PLACEHOLDER',
                'APPLICATION_FIELD_2_PLACEHOLDER',
                'APPLICATION_FIELD_3_PLACEHOLDER',
                'APPLICATION_FIELD_4_PLACEHOLDER',
                'APPLICATION_FIELD_5_PLACEHOLDER',
                'APPLICATION_FIELD_1_STYLE',
                'APPLICATION_FIELD_2_STYLE',
                'APPLICATION_FIELD_3_STYLE',
                'APPLICATION_FIELD_4_STYLE',
                'APPLICATION_FIELD_5_STYLE',
            ];

            const rows = await db.select().from(systemSettings).where(inArray(systemSettings.key, allKeys));

            const defaultLabels = ['Вопрос 1', 'Вопрос 2', 'Вопрос 3', 'Вопрос 4', 'Вопрос 5'];
            const fields = defaultLabels.map((def, i) => {
                const num = i + 1;
                const labelRow = rows.find((r) => r.key === `APPLICATION_FIELD_${num}`);
                const placeholderRow = rows.find((r) => r.key === `APPLICATION_FIELD_${num}_PLACEHOLDER`);
                const styleRow = rows.find((r) => r.key === `APPLICATION_FIELD_${num}_STYLE`);

                return {
                    key: `APPLICATION_FIELD_${num}`,
                    label: labelRow?.value || def,
                    placeholder: placeholderRow?.value || '',
                    style: styleRow?.value ? parseInt(styleRow.value) : 2, // Default: 2 (Paragraph)
                };
            });

            return reply.send(fields);
        } catch (error) {
            console.error('❌ Ошибка получения меток полей:', error);
            return reply.status(500).send({ error: 'Internal Server Error' });
        }
    });

    // PATCH /api/applications/fields - Update field labels + placeholders + styles (admin only)
    fastify.patch('/fields', { preHandler: [requirePermission('site:application_settings:actions')] }, async (request, reply) => {
        try {
            const body = request.body as { fields: Array<{ key: string; label: string; placeholder?: string; style?: number }> };
            if (!body?.fields || !Array.isArray(body.fields)) {
                return reply.status(400).send({ error: 'Invalid payload' });
            }

            for (const field of body.fields) {
                // Upsert label
                const existingLabel = await db.select().from(systemSettings).where(eq(systemSettings.key, field.key));
                if (existingLabel.length > 0) {
                    await db.update(systemSettings).set({ value: field.label }).where(eq(systemSettings.key, field.key));
                } else {
                    await db.insert(systemSettings).values({ key: field.key, value: field.label });
                }

                // Upsert placeholder
                const placeholderKey = `${field.key}_PLACEHOLDER`;
                const existingPh = await db.select().from(systemSettings).where(eq(systemSettings.key, placeholderKey));
                if (existingPh.length > 0) {
                    await db
                        .update(systemSettings)
                        .set({ value: field.placeholder || null })
                        .where(eq(systemSettings.key, placeholderKey));
                } else {
                    await db.insert(systemSettings).values({ key: placeholderKey, value: field.placeholder || null });
                }

                // Upsert style
                const styleKey = `${field.key}_STYLE`;
                const styleValue = field.style ? field.style.toString() : '2'; // Default 2 (Paragraph)
                const existingStyle = await db.select().from(systemSettings).where(eq(systemSettings.key, styleKey));
                if (existingStyle.length > 0) {
                    await db.update(systemSettings).set({ value: styleValue }).where(eq(systemSettings.key, styleKey));
                } else {
                    await db.insert(systemSettings).values({ key: styleKey, value: styleValue });
                }
            }

            return reply.send({ success: true });
        } catch (error) {
            console.error('❌ Ошибка обновления меток полей:', error);
            return reply.status(500).send({ error: 'Internal Server Error' });
        }
    });

    // GET /api/applications/:id/messages - Get chat history
    fastify.get('/:id/messages', { preHandler: [requirePermission('site:applications:view')] }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const msgs = await db
                .select()
                .from(interviewMessages)
                .where(eq(interviewMessages.applicationId, id))
                .orderBy(interviewMessages.createdAt);
            return reply.send(msgs);
        } catch (e) {
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    // POST /api/applications/:id/messages - Admin sends a chat message
    fastify.post('/:id/messages', { preHandler: [requirePermission('site:applications:actions')] }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const body = request.body as { content: string };
            if (!body.content?.trim()) return reply.status(400).send({ error: 'Content required' });

            const messageId = randomUUID();

            // Save to DB
            const [msg] = await db
                .insert(interviewMessages)
                .values({
                    id: messageId,
                    applicationId: id,
                    senderType: 'admin',
                    senderId: request.user!.id,
                    content: body.content.trim(),
                })
                .returning();

            // Trigger bot to send DM to the user over Discord
            try {
                await fetch(`${IPC_BOT_BASE_URL}/ipc/send-interview-message/${id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: body.content.trim(), adminUsername: request.user!.username }),
                });
            } catch (err) {
                console.error('❌ IPC err:', err);
            }

            // Emit WS event
            fastify.io.emit(`interview_message_${id}`, msg);
            fastify.io.emit('applications_refresh');

            return reply.send(msg);
        } catch (e) {
            console.error('❌ Ошибка отправки сообщения:', e);
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    // POST /api/applications/ipc/bot-event - Receive events from Discord Bot
    fastify.post('/ipc/bot-event', async (request, reply) => {
        try {
            const body = request.body as { event: string; payload: any };
            if (body.event === 'interview_ready') {
                fastify.io.emit('applications_refresh');
            } else if (body.event === 'new_application') {
                fastify.io.emit('applications_refresh');
            } else if (body.event === 'new_message') {
                const msg = body.payload;
                fastify.io.emit(`interview_message_${msg.applicationId}`, msg);
                fastify.io.emit('applications_refresh');
            }
            return reply.send({ success: true });
        } catch (e) {
            return reply.status(500).send({ error: 'IPC Error' });
        }
    });
}

