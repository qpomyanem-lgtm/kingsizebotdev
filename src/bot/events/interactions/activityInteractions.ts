import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  Colors,
  EmbedBuilder,
  ForumChannel,
  Message,
} from 'discord.js';
import { randomUUID } from 'crypto';
import { and, count, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../../../db';
import {
  activityDmSessions,
  activityScreenshots,
  activityThreads,
  members,
  systemSettings,
} from '../../../db/schema';

const MAX_SCREENSHOTS = 30;
const DM_SESSION_TTL_MS = 10 * 60_000; // 10 min

const IPC_BACKEND_BASE_URL = process.env.IPC_BACKEND_BASE_URL || 'http://localhost:3000';

function isImageAttachment(att: any) {
  const contentType = (att?.contentType ?? '').toLowerCase();
  if (contentType.startsWith('image/')) return true;

  const name = (att?.name ?? '').toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].some((ext) => name.endsWith(ext))) return true;

  const url = (att?.url ?? '').toLowerCase();
  if (!url) return false;
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif'].some((ext) => url.includes(ext));
}

function extractImageUrlsFromMessage(message: Message) {
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

function parseActivityThreadName(threadName: string) {
  const trimmed = (threadName ?? '').trim();
  if (!trimmed) return null;

  // Examples:
  // "Активность: Nick #1234"
  // "Активность Nick #1234"
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

async function getActiveDmSession(discordId: string) {
  const now = new Date();
  return db
    .select()
    .from(activityDmSessions)
    .where(
      and(
        eq(activityDmSessions.discordId, discordId),
        isNull(activityDmSessions.consumedAt),
        gt(activityDmSessions.expiresAt, now)
      )
    )
    .limit(1);
}

async function countMemberScreenshots(memberId: string) {
  const [row] = await db
    .select({ c: count(activityScreenshots.id) })
    .from(activityScreenshots)
    .where(eq(activityScreenshots.memberId, memberId));

  return Number(row?.c ?? 0);
}

async function triggerSiteRefresh() {
  try {
    await fetch(`${IPC_BACKEND_BASE_URL}/api/activity/ipc/bot-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  } catch {
    // ignore IPC errors
  }
}

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
    await db
      .update(activityThreads)
      .set({ threadName, presentInDiscord: true })
      .where(eq(activityThreads.memberId, memberId));
  }

  if (!threadRow) return { ok: false as const, reason: 'Failed to ensure thread' as const };

  const user = await client.users.fetch(member.discordId).catch(() => null);
  if (user) {
    const embed = new EmbedBuilder()
      .setTitle('📩 Активность')
      .setDescription('Нажмите кнопку и отправьте скриншоты вложениями в следующем DM-сообщении. Бот синхронизирует их с тредом и засчитывает на сайте.')
      .setColor(Colors.Blurple);

    const button = new ButtonBuilder()
      .setCustomId(`activity_upload_${memberId}`)
      .setLabel('Прикрепить активность')
      .setStyle(ButtonStyle.Primary);

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    await user
      .send({
        embeds: [embed],
        components: [actionRow],
      })
      .catch(() => null);
  }

  return { ok: true as const };
}

export async function createActivityThreadIpc(client: Client, memberId: string) {
  return ensureActivityThreadAndSendDm(client, memberId);
}

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
      new EmbedBuilder()
        .setTitle('📩 Активность')
        .setColor(Colors.Green)
        .setDescription('Ожидаю ваше следующее DM-сообщение с вложениями (скриншотами).'),
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

    const embed = new EmbedBuilder()
      .setTitle('Активность')
      .setImage(att.url)
      .setColor(Colors.Blurple);

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

export async function handleActivityForumMessage(client: Client, message: Message) {
  // Ignore our bot reposts
  if (message.author.bot) return false;

  if (!message.attachments?.size && !message.embeds?.length) return false;

  const threadId = message.channelId;

  const [threadRow] = await db
    .select()
    .from(activityThreads)
    .where(eq(activityThreads.discordThreadId, threadId))
    .limit(1);
  if (!threadRow) return false;

  const urls = extractImageUrlsFromMessage(message);
  if (urls.length === 0) return false;

  let currentCount = await countMemberScreenshots(threadRow.memberId);
  let added = 0;

  for (let i = 0; i < urls.length; i++) {
    if (currentCount + added >= MAX_SCREENSHOTS) break;

    const imageUrl = urls[i];
    if (!imageUrl) continue;

    const dedupeKey = `${message.id}:${i}`;

    const inserted = await db
      .insert(activityScreenshots)
      .values({
        id: randomUUID(),
        memberId: threadRow.memberId,
        activityThreadId: threadRow.id,
        sourceDiscordMessageId: message.id,
        sourceAttachmentIndex: i,
        dedupeKey,
        imageUrl,
        sourceType: 'forum',
      })
      .onConflictDoNothing({ target: activityScreenshots.dedupeKey })
      .returning({ id: activityScreenshots.id });

    if (inserted.length === 0) continue;

    currentCount++;
    added++;
  }

  if (added > 0) {
    await triggerSiteRefresh();
  }

  return added > 0;
}

// Rebuild DB from existing forum threads.
export async function rebuildActivityFromForum(client: Client, forumChannelId?: string) {
  const [forumRow] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, 'ACTIVITY_FORUM_CHANNEL_ID'))
    .limit(1);
  const configuredForumId = forumRow?.value?.trim() ?? forumChannelId;
  if (!configuredForumId) return { ok: false as const, reason: 'No forum channel id' as const };

  const forumCh = (await client.channels.fetch(configuredForumId).catch(() => null)) as ForumChannel | null;
  if (!forumCh) return { ok: false as const, reason: 'Forum channel not found' as const };

  let threads: any[] = [];
  try {
    const fetched = await (forumCh as any).threads.fetch({ limit: 1000 });
    const maybeThreads = fetched?.threads ?? fetched;
    if (maybeThreads?.values) threads = [...maybeThreads.values()];
    else if (Array.isArray(maybeThreads)) threads = maybeThreads;
  } catch {
    return { ok: false as const, reason: 'Failed to fetch threads from forum' as const };
  }

  for (const t of threads) {
    const threadId = t?.id as string | undefined;
    if (!threadId) continue;

    const discordStarterId =
      t?.owner_id ?? t?.ownerId ?? t?.creator_id ?? t?.creatorId ?? t?.user_id ?? t?.userId ?? null;

    // Fetch messages to rebuild screenshots.
    const threadChannel: any = await client.channels.fetch(threadId).catch(() => null);
    if (!threadChannel?.messages?.fetch) continue;

    const threadMessages: any = await threadChannel.messages.fetch({ limit: 100 }).catch(() => null);
    const messageList: any[] = threadMessages?.values ? [...threadMessages.values()] : [];
    if (messageList.length === 0) continue;

    // Map discord thread -> member.
    let mappedMember: typeof members.$inferSelect | null = null;
    if (discordStarterId) {
      const [m] = await db.select().from(members).where(eq(members.discordId, discordStarterId)).limit(1);
      mappedMember = m ?? null;
    }

    if (!mappedMember) {
      for (const msg of messageList) {
        if (!msg?.author || msg.author.bot) continue;
        const urls = extractImageUrlsFromMessage(msg as Message);
        if (urls.length === 0) continue;
        const [m] = await db.select().from(members).where(eq(members.discordId, msg.author.id)).limit(1);
        if (m) {
          mappedMember = m;
          break;
        }
      }
    }

    if (!mappedMember) {
      const parsed = parseActivityThreadName(t?.name ?? '');
      if (parsed?.gameStaticId) {
        const candidates = await db.select().from(members).where(eq(members.gameStaticId, parsed.gameStaticId));
        mappedMember = candidates[0] ?? null;
      }
    }

    if (!mappedMember) continue;

    const threadName = t?.name ?? '';

    // Ensure activityThreads row exists.
    await db
      .insert(activityThreads)
      .values({
        id: randomUUID(),
        memberId: mappedMember.id,
        discordForumChannelId: configuredForumId,
        discordThreadId: threadId,
        threadName,
        presentInDiscord: true,
      })
      .onConflictDoNothing({ target: activityThreads.memberId });

    await db
      .update(activityThreads)
      .set({
        discordForumChannelId: configuredForumId,
        discordThreadId: threadId,
        threadName,
        presentInDiscord: true,
      })
      .where(eq(activityThreads.memberId, mappedMember.id));

    const [threadRow] = await db
      .select()
      .from(activityThreads)
      .where(eq(activityThreads.discordThreadId, threadId))
      .limit(1);
    if (!threadRow) continue;

    let currentCount = await countMemberScreenshots(mappedMember.id);
    if (currentCount >= MAX_SCREENSHOTS) continue;

    let added = 0;
    for (const msg of messageList) {
      if (currentCount + added >= MAX_SCREENSHOTS) break;

      const urls = extractImageUrlsFromMessage(msg as Message);
      if (urls.length === 0) continue;

      for (let i = 0; i < urls.length; i++) {
        if (currentCount + added >= MAX_SCREENSHOTS) break;

        const imageUrl = urls[i];
        if (!imageUrl) continue;

        const dedupeKey = `${msg.id}:${i}`;
        const inserted = await db
          .insert(activityScreenshots)
          .values({
            id: randomUUID(),
            memberId: mappedMember.id,
            activityThreadId: threadRow.id,
            sourceDiscordMessageId: msg.id,
            sourceAttachmentIndex: i,
            dedupeKey,
            imageUrl,
            sourceType: (msg.author?.bot ? 'dm' : 'forum') as 'dm' | 'forum',
          })
          .onConflictDoNothing({ target: activityScreenshots.dedupeKey })
          .returning({ id: activityScreenshots.id });

        if (inserted.length === 0) continue;

        currentCount++;
        added++;
      }
    }
  }

  await triggerSiteRefresh();
  return { ok: true as const };
}

