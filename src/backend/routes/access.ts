import accessController from '../features/access/controller.js';

export default async function accessRoutes(fastify: any) {
    return accessController(fastify);
}
