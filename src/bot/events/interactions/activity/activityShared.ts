import { and, count, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../../../../db';
import { activityDmSessions, activityScreenshots, activityThreads, members } from '../../../../db/schema';
import { Message } from 'discord.js';

export const MAX_SCREENSHOTS = 30;
export const DM_SESSION_TTL_MS = 10 * 60_000; // 10 min

export function isImageAttachment(att: any) {
    const contentType = (att?.contentType ?? '').toLowerCase();
    if (contentType.startsWith('image/')) return true;

    const name = (att?.name ?? '').toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].some((ext) => name.endsWith(ext))) return true;

    const url = (att?.url ?? '').toLowerCase();
    if (!url) return false;
    return ['.png', '.jpg', '.jpeg', '.webp', '.gif'].some((ext) => url.includes(ext));
}

export function extractImageUrlsFromMessage(message: Message) {
    const urls: string[] = [];

    if (message.attachments?.size) {
        for (const att of message.attachments.values()) {
            if (isImageAttachment(att)) urls.push((att as any).url as string);
        }
    }

    if (message.embeds?.length) {
        for (const embed of message.embeds) {
            const data = (embed as any)?.data;
            const imgUrl = data?.image?.url as string | undefined;
            if (imgUrl) urls.push(imgUrl);

            const thumbUrl = data?.thumbnail?.url as string | undefined;
            if (thumbUrl) urls.push(thumbUrl);
        }
    }

    return urls.filter(Boolean);
}

export function parseActivityThreadName(threadName: string) {
    const trimmed = (threadName ?? '').trim();
    if (!trimmed) return null;

    if (!trimmed.toLowerCase().includes('актив')) return null;

    const match = trimmed.match(/#(\d{1,10})/);
    if (!match) return null;

    const gameStaticId = match[1];
    const cleaned = trimmed
        .replace(/#\d{1,10}/g, '')
        .replace(/^Активность\s*[:\-–—]?\s*/u, '')
        .replace(/^Активность\s*/u, '')
        .trim();

    return { gameStaticId, gameNickname: cleaned || undefined };
}

export async function getActiveDmSession(discordId: string) {
    const now = new Date();
    return db
        .select()
        .from(activityDmSessions)
        .where(and(eq(activityDmSessions.discordId, discordId), isNull(activityDmSessions.consumedAt), gt(activityDmSessions.expiresAt, now)))
        .limit(1);
}

export async function countMemberScreenshots(memberId: string) {
    const [row] = await db.select({ c: count(activityScreenshots.id) }).from(activityScreenshots).where(eq(activityScreenshots.memberId, memberId));
    return Number(row?.c ?? 0);
}

export async function triggerSiteRefresh() {
    try {
        const IPC_BACKEND_BASE_URL = process.env.IPC_BACKEND_BASE_URL || 'http://localhost:3000';
        await fetch(`${IPC_BACKEND_BASE_URL}/api/activity/ipc/bot-event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
    } catch {
        // ignore IPC errors
    }
}

// Optional export for thread module
export async function ensureActivityThreadPresentInDb(memberId: string, threadRow: any) {
    // Keep for potential reuse; no-op placeholder (not used in current refactor).
    void memberId;
    void threadRow;
}

