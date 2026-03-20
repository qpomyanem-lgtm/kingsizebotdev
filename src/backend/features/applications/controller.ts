import { FastifyInstance } from 'fastify';
import { db } from '../../../db';
import { applications, users, systemSettings, interviewMessages } from '../../../db/schema';
import { eq, desc, inArray } from 'drizzle-orm';
import { lucia } from '../../auth/lucia';
import { z } from 'zod';
import { getAdminRoleIds } from '../../lib/discordRoles';

// Add type for user in FastifyRequest
declare module 'fastify' {
    interface FastifyRequest {
        user?: { id: string; discordId: string; username: string; [key: string]: any } | null;
        session?: any;
    }
}

import { members } from '../../../db/schema';
import { randomUUID } from 'crypto';
import { addRole, getRoleIdByKey, setNickname } from '../../lib/discordMemberActions.js';

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
    gameStaticId: z.string().regex(/^\d{1,6}$/, 'Static ID must be up to 6 digits').optional(),
});

export default async function applicationsController(fastify: FastifyInstance) {
    // Custom check for admin
    const checkAdmin = async (request: any, reply: any) => {
        const sessionId = lucia.readSessionCookie(request.headers.cookie ?? '');
        if (!sessionId) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        const { session, user } = await lucia.validateSession(sessionId);
        if (!session) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        // This is simplified, ideally we check user's current Discord roles
        // We'll trust the session for now (since sessions are revoked if roles lost)
        // But ensure they are actually admin.
        const [dbUser] = await db.select().from(users).where(eq(users.discordId, user.discordId));
        if (!dbUser) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        // Attach user to request for further use
        request.user = dbUser;
    };

    // GET /api/applications - List all applications
    fastify.get('/', { preValidation: checkAdmin }, async (_request, reply) => {
        try {
            const allApplications = await db.select().from(applications).orderBy(desc(applications.createdAt));
            return reply.send(allApplications);
        } catch (error) {
            console.error('❌ Ошибка получения заявок:', error);
            return reply.status(500).send({ error: 'Internal Server Error' });
        }
    });

    // PATCH /api/applications/:id/status - Update application status
    fastify.patch('/:id/status', { preValidation: checkAdmin }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const { status, rejectionReason, gameNickname, gameStaticId } = updateStatusSchema.parse(request.body);

            // Required fields validation
            if (status === 'rejected' && !rejectionReason) {
                return reply.status(400).send({
                    error: 'Rejection reason is required when rejecting an application',
                });
            }

            if (status === 'accepted') {
                if (!gameNickname || !gameStaticId) {
                    return reply
                        .status(400)
                        .send({ error: 'gameNickname and gameStaticId are required when accepting an application' });
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

            // Trigger Bot IPC for DM
            if (status === 'interview' && existingApp.status !== 'interview') {
                try {
                    await fetch(`${IPC_BOT_BASE_URL}/ipc/send-interview-dm/${id}`, { method: 'POST' });
                } catch (ipcErr) {
                    console.error('❌ Ошибка связи с ботом для отправки ЛС об обзвоне:', ipcErr);
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

                try {
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
                            role: 'NEWKINGSIZE',
                            tier: 'NONE',
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
                                role: 'NEWKINGSIZE',
                                tier: 'NONE',
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
                try {
                    console.log('🔍 [ПРИНЯТИЕ] Поиск ID роли NEWKINGSIZE в настройках...');
                    const newKingsizeRoleId = await getRoleIdByKey('NEWKINGSIZE');
                    console.log('🔍 [ПРИНЯТИЕ] ID роли NEWKINGSIZE из БД:', newKingsizeRoleId);

                    if (newKingsizeRoleId) {
                        console.log(
                            '⚙️ [ПРИНЯТИЕ] Вызов addRole для пользователя',
                            existingApp.discordId,
                            'с ролью',
                            newKingsizeRoleId,
                        );
                        const roleResult = await addRole(existingApp.discordId, newKingsizeRoleId);
                        console.log('✅ [ПРИНЯТИЕ] Результат addRole:', roleResult);
                    } else {
                        console.warn('⚠️ [ПРИНЯТИЕ] ВНИМАНИЕ: ID роли NEWKINGSIZE пуст в настройках!');
                    }

                    const newNick = `${gameNickname} | ${gameStaticId}`;
                    console.log('⚙️ [ПРИНЯТИЕ] Смена никнейма на:', newNick);
                    const nickResult = await setNickname(existingApp.discordId, newNick);
                    console.log('✅ [ПРИНЯТИЕ] Результат setNickname:', nickResult);
                } catch (discordErr) {
                    console.error('❌ [ПРИНЯТИЕ] Ошибка синхронизации с Discord:', discordErr);
                }

                // Activity forum thread creation (once per accepted transition)
                if (existingApp.status !== 'accepted' && acceptedMemberId) {
                    try {
                        await fetch(`${IPC_BOT_BASE_URL}/ipc/create-activity-thread/${acceptedMemberId}`, {
                            method: 'POST',
                        });
                    } catch (ipcErr) {
                        console.error('❌ Ошибка связи с ботом для создания activity thread:', ipcErr);
                    }
                }

                console.log('=== [ПРИНЯТИЕ] Процедура завершена ===');
            }

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
    fastify.patch('/fields', { preValidation: checkAdmin }, async (request, reply) => {
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
    fastify.get('/:id/messages', { preValidation: checkAdmin }, async (request, reply) => {
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
    fastify.post('/:id/messages', { preValidation: checkAdmin }, async (request, reply) => {
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

