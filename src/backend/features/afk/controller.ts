import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../db';
import { afkEntries } from '../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { lucia } from '../../auth/lucia';
import { getAdminRoleLabel } from '../../lib/discordRoles';

export default async function afkController(server: FastifyInstance) {
    server.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const query = request.query as any;
            const status = query.status as string;

            let result;
            if (status === 'active' || status === 'ended') {
                result = await db
                    .select()
                    .from(afkEntries)
                    .where(eq(afkEntries.status, status))
                    .orderBy(desc(afkEntries.startsAt));
            } else {
                result = await db.select().from(afkEntries).orderBy(desc(afkEntries.startsAt));
            }

            return reply.send(result);
        } catch (error) {
            console.error('❌ Ошибка получения записей AFK:', error);
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    server.post(
        '/:id/end',
        async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
            try {
                const sessionId = lucia.readSessionCookie(request.headers.cookie ?? '');
                if (!sessionId) {
                    return reply.status(401).send({ error: 'Unauthorized' });
                }

                const { session, user } = await lucia.validateSession(sessionId);
                if (!session || !user) {
                    return reply.status(401).send({ error: 'Unauthorized' });
                }

                const adminRoleLabel = await getAdminRoleLabel(user.discordId);
                const allowedLabels = ['BOT OWNER', 'OWNER', '.', 'DEP', 'HIGH'];
                if (!adminRoleLabel || !allowedLabels.includes(adminRoleLabel)) {
                    return reply
                        .status(403)
                        .send({ error: 'Forbidden: Insufficient privileges to end AFK' });
                }

                const afkId = request.params.id;
                const [existingAfk] = await db.select().from(afkEntries).where(eq(afkEntries.id, afkId));

                if (!existingAfk) {
                    return reply.status(404).send({ error: 'AFK entry not found' });
                }

                if (existingAfk.status === 'ended') {
                    return reply.status(400).send({ error: 'AFK entry is already ended' });
                }

                await db
                    .update(afkEntries)
                    .set({
                        status: 'ended',
                        endedByType: 'admin',
                        endedByAdmin: user.username,
                        endedAt: new Date(),
                    })
                    .where(eq(afkEntries.id, afkId));

                return reply.send({ success: true });
            } catch (error) {
                console.error('❌ Ошибка при завершении AFK:', error);
                return reply.status(500).send({ error: 'Internal server error' });
            }
        },
    );
}

