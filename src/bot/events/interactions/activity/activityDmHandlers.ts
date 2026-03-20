import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, Client, Colors, EmbedBuilder, Message } from 'discord.js';
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../db';
import { activityDmSessions, activityScreenshots, activityThreads } from '../../../../db/schema';
import { extractImageUrlsFromMessage, getActiveDmSession, isImageAttachment, countMemberScreenshots, triggerSiteRefresh, MAX_SCREENSHOTS, DM_SESSION_TTL_MS } from './activityShared';

export async function handleActivityUploadBtn(interaction: ButtonInteraction) {
    const memberId = interaction.customId.replace('activity_upload_', '');
    if (!memberId) return;

    await interaction.deferUpdate();

    await db.delete(activityDmSessions).where(eq(activityDmSessions.memberId, memberId));

    await db.insert(activityDmSessions).values({
        id: randomUUID(),
        memberId,
        discordId: interaction.user.id,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + DM_SESSION_TTL_MS),
        consumedAt: null,
    });

    // Clear components in the DM message.
    await interaction.message.edit({
        embeds: [
            new EmbedBuilder().setTitle('📩 Активность').setColor(Colors.Green).setDescription('Ожидаю ваше следующее DM-сообщение с вложениями (скриншотами).'),
        ],
        components: [],
    });
}

export async function handleActivityDmMessage(client: Client, message: Message) {
    if (!message.attachments?.size) return false;

    const images = [...message.attachments.values()].filter(isImageAttachment);
    if (images.length === 0) return false;

    const [session] = await getActiveDmSession(message.author.id);
    if (!session) return false;

    const memberId = session.memberId;

    const [threadRow] = await db.select().from(activityThreads).where(eq(activityThreads.memberId, memberId)).limit(1);
    if (!threadRow) return false;

    const threadChannel = await client.channels.fetch(threadRow.discordThreadId).catch(() => null);
    if (!threadChannel) return false;

    let currentCount = await countMemberScreenshots(memberId);
    let added = 0;

    for (let i = 0; i < images.length; i++) {
        if (currentCount + added >= MAX_SCREENSHOTS) break;

        const att = images[i] as any;
        const dedupeKey = `${message.id}:${i}`;

        const inserted = await db
            .insert(activityScreenshots)
            .values({
                id: randomUUID(),
                memberId,
                activityThreadId: threadRow.id,
                sourceDiscordMessageId: message.id,
                sourceAttachmentIndex: i,
                dedupeKey,
                imageUrl: att.url,
                sourceType: 'dm',
            })
            .onConflictDoNothing({ target: activityScreenshots.dedupeKey })
            .returning({ id: activityScreenshots.id });

        if (inserted.length === 0) continue;

        currentCount++;
        added++;

        const embed = new EmbedBuilder().setTitle('Активность').setImage(att.url).setColor(Colors.Blurple);
        await (threadChannel as any).send({ embeds: [embed] }).catch(() => null);
    }

    await db
        .update(activityDmSessions)
        .set({ consumedAt: new Date() })
        .where(eq(activityDmSessions.id, session.id));

    if (added > 0) {
        await triggerSiteRefresh();
        await message.react('✅').catch(() => null);
    }

    return added > 0;
}

