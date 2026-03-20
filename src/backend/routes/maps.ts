import mapsController from '../features/maps/controller.js';

export default async function mapsRoutes(server: any) {
    return mapsController(server);
}
