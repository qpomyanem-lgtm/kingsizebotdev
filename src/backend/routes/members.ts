import membersController from '../features/members/controller.js';

export default async function memberRoutes(fastify: any) {
    return membersController(fastify);
}
