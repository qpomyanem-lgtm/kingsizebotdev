import settingsController from '../features/settings/controller.js';

export default async function settingsRoutes(fastify: any) {
    return settingsController(fastify);
}
