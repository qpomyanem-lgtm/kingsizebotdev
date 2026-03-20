import afkController from '../features/afk/controller.js';

export default async function afkRoutes(server: any) {
    return afkController(server);
}
