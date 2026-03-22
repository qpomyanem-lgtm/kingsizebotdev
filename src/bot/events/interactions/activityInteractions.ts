// Re-export activity handlers from submodules
export { createActivityThreadIpc } from './activity/activityThreadIpc.js';
export { handleActivityUploadBtn, handleActivityModalSubmit } from './activity/activityDmHandlers.js';
export { handleActivityForumMessage, handleActivityReaction } from './activity/activityForumHandlers.js';
export { rebuildActivityFromForum } from './activity/activityForumHandlers.js';
export { closeActivityThread, closeActivityByMemberId, isActivityExpired, updateThreadMessage } from './activity/activityShared.js';

import { Client } from 'discord.js';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { activityThreads, members } from '../../../db/schema.js';
import { updateThreadMessage } from './activity/activityShared.js';

export async function updateActivityThreadMessage(client: Client, memberId: string) {
    const [threadRow] = await db.select().from(activityThreads).where(eq(activityThreads.memberId, memberId)).limit(1);
    const [member] = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
    if (threadRow && member) {
        await updateThreadMessage(client, threadRow, memberId, member.discordId);
    }
}


