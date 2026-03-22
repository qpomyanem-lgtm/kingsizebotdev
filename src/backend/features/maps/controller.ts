import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../db';
import { eventMaps } from '../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { requirePermission } from '../../lib/discordRoles';
import { v4 as uuidv4 } from 'uuid';

export default async function mapsController(server: FastifyInstance) {
    server.get('/', { preHandler: [requirePermission('site:mcl_maps:view')] }, async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            const maps = await db.select().from(eventMaps).orderBy(desc(eventMaps.createdAt));
            return reply.send(maps);
        } catch (error) {
            console.error('❌ Ошибка получения карт:', error);
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    server.post('/', { preHandler: [requirePermission('site:mcl_maps:actions')] }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { name, imageUrl } = request.body as { name: string; imageUrl: string };
            if (!name?.trim() || !imageUrl?.trim()) {
                return reply.status(400).send({ error: 'Name and imageUrl are required' });
            }

            const id = uuidv4();
            await db.insert(eventMaps).values({
                id,
                name: name.trim(),
                imageUrl: imageUrl.trim(),
            });

            return reply.status(201).send({ id, name: name.trim(), imageUrl: imageUrl.trim() });
        } catch (error) {
            console.error('❌ Ошибка создания карты:', error);
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    server.delete<{ Params: { id: string } }>('/:id', { preHandler: [requirePermission('site:mcl_maps:actions')] }, async (request, reply) => {
        try {
            const mapId = request.params.id;
            const [existing] = await db.select().from(eventMaps).where(eq(eventMaps.id, mapId));
            if (!existing) {
                return reply.status(404).send({ error: 'Map not found' });
            }

            await db.delete(eventMaps).where(eq(eventMaps.id, mapId));
            return reply.send({ success: true });
        } catch (error) {
            console.error('❌ Ошибка удаления карты:', error);
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });
}

