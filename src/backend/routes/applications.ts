import applicationsController from '../features/applications/controller.js';

export default async function applicationRoutes(fastify: any) {
    return applicationsController(fastify);
}
