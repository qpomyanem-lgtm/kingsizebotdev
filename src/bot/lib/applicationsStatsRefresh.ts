import { Client, TextChannel } from 'discord.js';
import { db } from '../../db';
import { systemSettings, applications, interviewMessages } from '../../db/schema';
import { eq, inArray, and, sql } from 'drizzle-orm';
import { buildApplicationsStatsPanelPayload, type ApplicationsStats } from '../embeds/panels/applicationsStatsPanel.js';

export async function refreshApplicationsStatsEmbed(client: Client) {
    try {
        const keys = await db
            .select()
            .from(systemSettings)
            .where(
                inArray(systemSettings.key, [
                    'APPLICATIONS_STATS_CHANNEL_ID',
                    'APPLICATIONS_STATS_MESSAGE_ID',
                ])
            );

        const channelId = keys.find(k => k.key === 'APPLICATIONS_STATS_CHANNEL_ID')?.value;
        const messageId = keys.find(k => k.key === 'APPLICATIONS_STATS_MESSAGE_ID')?.value;

        if (!channelId || !messageId) return;

        // Count applications by status
        const activeStatuses = ['pending', 'interview', 'interview_ready'] as const;
        const activeApps = await db
            .select({
                status: applications.status,
                count: sql<number>`count(*)::int`,
            })
            .from(applications)
            .where(inArray(applications.status, [...activeStatuses]))
            .groupBy(applications.status);

        const pending = activeApps.find(r => r.status === 'pending')?.count ?? 0;
        const interview = activeApps.find(r => r.status === 'interview')?.count ?? 0;
        const interviewReady = activeApps.find(r => r.status === 'interview_ready')?.count ?? 0;
        const total = pending + interview + interviewReady;

        // Count unread messages: applications where the latest message is from 'user' (admin hasn't responded)
        const unreadResult = await db.execute(sql`
            SELECT COUNT(DISTINCT a.id)::int AS unread_count
            FROM applications a
            INNER JOIN interview_messages im ON im.application_id = a.id
            WHERE a.status IN ('interview', 'interview_ready')
              AND im.created_at = (
                  SELECT MAX(im2.created_at) FROM interview_messages im2 WHERE im2.application_id = a.id
              )
              AND im.sender_type = 'user'
        `);

        const unreadMessages = (unreadResult as any).rows?.[0]?.unread_count ?? 0;

        const stats: ApplicationsStats = {
            total,
            pending,
            interview,
            interviewReady,
            unreadMessages,
        };

        const payload = buildApplicationsStatsPanelPayload(stats);

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) return;

        const message = await (channel as TextChannel).messages.fetch(messageId).catch(() => null);
        if (message) {
            await message.edit(payload as any);
        }
    } catch (error) {
        console.error('❌ Ошибка обновления панели статистики заявок:', error);
    }
}
