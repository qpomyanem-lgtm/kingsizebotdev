import activityController from '../features/activity/controller.js';

export default async function activityRoutes(server: any) {
    return activityController(server);
}

