import authController from '../features/auth/controller.js';

export default async function authRoutes(fastify: any) {
    return authController(fastify);
}
