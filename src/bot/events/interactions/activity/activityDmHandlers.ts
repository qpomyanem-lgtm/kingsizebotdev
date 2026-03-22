import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, Client, Colors, EmbedBuilder, FileUploadBuilder, LabelBuilder, Message, ModalBuilder, ModalSubmitInteraction } from 'discord.js';
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../db';
import { activityScreenshots, activityThreads, members } from '../../../../db/schema';
import { countMemberScreenshots, isActivityExpired, triggerSiteRefresh, updateThreadMessage, closeActivityThread, MAX_SCREENSHOTS } from './activityShared';

export async function handleActivityUploadBtn(interaction: ButtonInteraction) {
    const memberId = interaction.customId.replace('activity_upload_', '');
    if (!memberId) return;

    // Check if activity is still active
    const [threadRow] = await db.select().from(activityThreads).where(eq(activityThreads.memberId, memberId)).limit(1);
    if (!threadRow || threadRow.status === 'completed') {
        await interaction.reply({ content: '❌ Активность уже завершена.', ephemeral: true }).catch(() => null);
        return;
    }

    // Check limits
    const currentCount = await countMemberScreenshots(memberId);
    if (currentCount >= MAX_SCREENSHOTS) {
        await interaction.reply({ content: '❌ Достигнут лимит скриншотов.', ephemeral: true }).catch(() => null);
        return;
    }

    if (isActivityExpired(threadRow.createdAt)) {
        await interaction.reply({ content: '❌ Время отправки скриншотов истекло (7 дней).', ephemeral: true }).catch(() => null);
        return;
    }

    // Open modal with file upload
    const fileUpload = new FileUploadBuilder()
        .setCustomId('activity_file_upload')
        .setRequired(true)
        .setMaxValues(10);

    const label = new LabelBuilder()
        .setLabel('Прикрепите скриншоты активности')
        .setDescription('Можно загрузить до 10 файлов за раз')
        .setFileUploadComponent(fileUpload);

    const modal = new ModalBuilder()
        .setCustomId(`activity_modal_${memberId}`)
        .setTitle('📎 Загрузка скриншотов')
        .addComponents(label);

    await interaction.showModal(modal);
}

export async function handleActivityModalSubmit(client: Client, interaction: ModalSubmitInteraction, rawData?: { resolved: any; components: any[] }) {
    const memberId = interaction.customId.replace('activity_modal_', '');
    if (!memberId) return;

    await interaction.deferReply({ ephemeral: true });

    const [threadRow] = await db.select().from(activityThreads).where(eq(activityThreads.memberId, memberId)).limit(1);
    if (!threadRow || threadRow.status === 'completed') {
        await interaction.editReply({ content: '❌ Активность уже завершена.' }).catch(() => null);
        return;
    }

    const [member] = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
    if (!member) {
        await interaction.editReply({ content: '❌ Участник не найден.' }).catch(() => null);
        return;
    }

    // Extract uploaded files from raw Discord data (discord.js doesn't expose resolved on ModalSubmitInteraction)
    const imageAttachments: { url: string; name: string; contentType: string }[] = [];

    if (rawData?.resolved?.attachments) {
        // Get attachment IDs from components -> component.values
        const attachmentIds = new Set<string>();
        for (const row of rawData.components) {
            const comp = row.component ?? row;
            if (comp.type === 19 && comp.values) {
                for (const id of comp.values) attachmentIds.add(id);
            }
            // Also check nested components array
            if (row.components) {
                for (const c of Array.isArray(row.components) ? row.components : [row.components]) {
                    if (c.type === 19 && c.values) {
                        for (const id of c.values) attachmentIds.add(id);
                    }
                }
            }
        }

        const resolvedAttachments = rawData.resolved.attachments;
        // If we found IDs, use them; otherwise iterate all resolved attachments
        const idsToProcess = attachmentIds.size > 0 ? attachmentIds : Object.keys(resolvedAttachments);
        for (const id of idsToProcess) {
            const att = resolvedAttachments[id];
            if (!att) continue;
            const url = att.url || att.proxy_url;
            if (!url) continue;
            const ct = att.content_type || 'image/png';
            const name = att.filename || 'screenshot.png';
            if (ct.startsWith('image/') || /\.(png|jpg|jpeg|webp|gif)$/i.test(name)) {
                imageAttachments.push({ url, name, contentType: ct });
            }
        }
    }

    if (imageAttachments.length === 0) {
        await interaction.editReply({ content: '❌ Не найдено изображений. Прикрепите PNG, JPG, WEBP или GIF файлы.' }).catch(() => null);
        return;
    }

    const threadChannel = await client.channels.fetch(threadRow.discordThreadId).catch(() => null) as any;
    if (!threadChannel) {
        await interaction.editReply({ content: '❌ Тред активности не найден.' }).catch(() => null);
        return;
    }

    let currentCount = await countMemberScreenshots(memberId);
    let added = 0;

    for (let i = 0; i < imageAttachments.length; i++) {
        if (currentCount + added >= MAX_SCREENSHOTS) break;

        const att = imageAttachments[i];
        const uniqueId = randomUUID();
        const dedupeKey = `modal:${uniqueId}`;

        const inserted = await db
            .insert(activityScreenshots)
            .values({
                id: uniqueId,
                memberId,
                activityThreadId: threadRow.id,
                sourceDiscordMessageId: interaction.id,
                sourceAttachmentIndex: i,
                dedupeKey,
                imageUrl: att.url,
                sourceType: 'dm',
                screenshotStatus: 'pending',
            })
            .onConflictDoNothing({ target: activityScreenshots.dedupeKey })
            .returning({ id: activityScreenshots.id });

        if (inserted.length === 0) continue;

        added++;

        // Send only the image in the thread (no embed), with approve/reject buttons
        const forumMsg = await threadChannel.send({ content: att.url }).catch(() => null);

        if (forumMsg) {
            // Save forumMessageId for this screenshot
            await db.update(activityScreenshots).set({ forumMessageId: forumMsg.id }).where(eq(activityScreenshots.id, uniqueId));
        }
    }

    currentCount += added;

    if (added > 0) {
        await triggerSiteRefresh();
        // Update the status message in the thread
        await updateThreadMessage(client, threadRow, memberId, member.discordId);
    }

    // Check if limits reached — close the thread
    if (currentCount >= MAX_SCREENSHOTS || isActivityExpired(threadRow.createdAt)) {
        await closeActivityThread(client, threadRow);
        await interaction.editReply({ content: `✅ Загружено ${added} скриншот(ов). Активность завершена!` }).catch(() => null);
    } else {
        await interaction.editReply({ content: `✅ Загружено ${added} скриншот(ов). Всего: ${currentCount}/${MAX_SCREENSHOTS}` }).catch(() => null);
    }
}

