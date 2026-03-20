import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, Colors, EmbedBuilder, ForumChannel } from 'discord.js';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db';
import { activityThreads, members, systemSettings } from '../../../../db/schema';
import { DM_SESSION_TTL_MS } from './activityShared';

async function ensureActivityThreadAndSendDm(client: Client, memberId: string) {
    const [member] = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
    if (!member) return { ok: false as const, reason: 'Member not found' as const };

    const [forumRow] = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, 'ACTIVITY_FORUM_CHANNEL_ID'))
        .limit(1);

    const forumChannelId = forumRow?.value?.trim();
    if (!forumChannelId) return { ok: false as const, reason: 'ACTIVITY_FORUM_CHANNEL_ID not set' as const };

    const [existing] = await db.select().from(activityThreads).where(eq(activityThreads.memberId, memberId)).limit(1);

    const threadName = `Активность: ${member.gameNickname} #${member.gameStaticId}`;

    let threadRow = existing;
    if (!threadRow) {
        const forumCh = (await client.channels.fetch(forumChannelId).catch(() => null)) as ForumChannel | null;
        if (!forumCh) return { ok: false as const, reason: 'Forum channel not found' as const };

        const created = await forumCh.threads
            .create({
                name: threadName,
                autoArchiveDuration: 1440,
                message: {
                    content: 'Здесь размещается активность участника.\n\nИспользуйте кнопку в ЛС для отправки скриншотов.',
                },
            })
            .catch((e: any) => {
                throw e;
            });

        await db.insert(activityThreads).values({
            id: randomUUID(),
            memberId,
            discordForumChannelId: forumChannelId,
            discordThreadId: created.id,
            threadName,
            presentInDiscord: true,
        });

        threadRow = (
            await db.select().from(activityThreads).where(eq(activityThreads.memberId, memberId)).limit(1)
        )[0];
    } else {
        await db.update(activityThreads).set({ threadName, presentInDiscord: true }).where(eq(activityThreads.memberId, memberId));
    }

    if (!threadRow) return { ok: false as const, reason: 'Failed to ensure thread' as const };

    const user = await client.users.fetch(member.discordId).catch(() => null);
    if (user) {
        const embed = new EmbedBuilder()
            .setTitle('📩 Активность')
            .setDescription(
                'Нажмите кнопку и отправьте скриншоты вложениями в следующем DM-сообщении. Бот синхронизирует их с тредом и засчитывает на сайте.',
            )
            .setColor(Colors.Blurple);

        const button = new ButtonBuilder().setCustomId(`activity_upload_${memberId}`).setLabel('Прикрепить активность').setStyle(ButtonStyle.Primary);
        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

        await user.send({ embeds: [embed], components: [actionRow] }).catch(() => null);
    }

    void DM_SESSION_TTL_MS; // keep import stable for now
    return { ok: true as const };
}

export async function createActivityThreadIpc(client: Client, memberId: string) {
    return ensureActivityThreadAndSendDm(client, memberId);
}

