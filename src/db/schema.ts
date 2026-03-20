import { pgTable, text, timestamp, boolean, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  discordId: text('discord_id').notNull().unique(),
  username: text('username').notNull(),
  avatarUrl: text('avatar_url'),
  role: text('role').default('user').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
});

export const roleSettings = pgTable('role_settings', {
  key: text('key').primaryKey(),
  discordRoleId: text('discord_role_id'),
  name: text('name').notNull(),
  requiresAdmin: boolean('requires_admin').default(false).notNull(),
});

export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value'),
});

export const applications = pgTable('applications', {
  id: text('id').primaryKey(), // We'll use uuid() for this
  discordId: text('discord_id').notNull(),
  discordUsername: text('discord_username').notNull(),
  discordAvatarUrl: text('discord_avatar_url'),
  field1: text('field_1').notNull(),
  field2: text('field_2').notNull(),
  field3: text('field_3').notNull(),
  field4: text('field_4').notNull(),
  field5: text('field_5').notNull(),
  status: text('status', { enum: ['pending', 'interview', 'interview_ready', 'accepted', 'rejected', 'excluded', 'blacklist'] }).default('pending').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  handledByAdminUsername: text('handled_by_admin_username'),
  handledByAdminId: text('handled_by_admin_id'), // To restrict chat to a single admin
  rejectionReason: text('rejection_reason'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const members = pgTable('members', {
  id: text('id').primaryKey(), // We'll use uuid() for this
  discordId: text('discord_id').notNull(),
  discordUsername: text('discord_username').notNull(),
  discordAvatarUrl: text('discord_avatar_url'),
  gameNickname: text('game_nickname').notNull(),
  gameStaticId: text('game_static_id').notNull(),
  role: text('role', { enum: ['KINGSIZE', 'NEWKINGSIZE'] }).default('NEWKINGSIZE').notNull(),
  tier: text('tier', { enum: ['TIER 1', 'TIER 2', 'TIER 3', 'NONE'] }).default('NONE').notNull(),
  status: text('status', { enum: ['active', 'kicked', 'blacklisted'] }).default('active').notNull(),
  applicationId: text('application_id'),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
});

export const afkEntries = pgTable('afk_entries', {
  id: text('id').primaryKey(),
  discordId: text('discord_id').notNull(),
  discordUsername: text('discord_username').notNull(),
  discordAvatarUrl: text('discord_avatar_url'),
  reason: text('reason').notNull(),
  startsAt: timestamp('starts_at').defaultNow().notNull(),
  endsAt: timestamp('ends_at').notNull(),
  status: text('status', { enum: ['active', 'ended'] }).default('active').notNull(),
  endedByType: text('ended_by_type', { enum: ['self', 'admin', 'expired'] }),
  endedByAdmin: text('ended_by_admin'),
  endedAt: timestamp('ended_at'),
  messageId: text('message_id'),
  channelId: text('channel_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const eventMaps = pgTable('event_maps', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  imageUrl: text('image_url').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const events = pgTable('events', {
  id: text('id').primaryKey(),
  messageId: text('message_id'),
  channelId: text('channel_id'),
  creatorId: text('creator_id').notNull(),
  eventType: text('event_type', { enum: ['Capt', 'MCL', 'ВЗЗ'] }).notNull(),
  eventTime: timestamp('event_time').notNull(),
  slots: integer('slots').notNull(),
  status: text('status', { enum: ['Open', 'Closed'] }).default('Open').notNull(),
  groupCode: text('group_code'),
  mapId: text('map_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const eventParticipants = pgTable('event_participants', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id),
  userId: text('user_id').notNull(),
  tier: integer('tier').notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
});

export const interviewMessages = pgTable('interview_messages', {
  id: text('id').primaryKey(),
  applicationId: text('application_id').notNull().references(() => applications.id),
  senderType: text('sender_type', { enum: ['user', 'admin'] }).notNull(),
  senderId: text('sender_id').notNull(), // discordId or admin userId
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ──────────────────────────────────────────────────────────────
// Activity (screenshots) forum sync
// ──────────────────────────────────────────────────────────────

export const activityThreads = pgTable('activity_threads', {
  id: text('id').primaryKey(),
  memberId: text('member_id').notNull().references(() => members.id).unique(),
  discordForumChannelId: text('discord_forum_channel_id').notNull(),
  discordThreadId: text('discord_thread_id').notNull().unique(),
  threadName: text('thread_name').notNull(),
  presentInDiscord: boolean('present_in_discord').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const activityScreenshots = pgTable('activity_screenshots', {
  id: text('id').primaryKey(),
  memberId: text('member_id').notNull().references(() => members.id),
  activityThreadId: text('activity_thread_id').notNull().references(() => activityThreads.id),

  // Message where the attachment came from:
  // - DM upload -> message.id from DM
  // - Manual post -> message.id from forum thread
  sourceDiscordMessageId: text('source_discord_message_id').notNull(),
  sourceAttachmentIndex: integer('source_attachment_index').notNull(),

  // Unique dedupe key: `${sourceDiscordMessageId}:${sourceAttachmentIndex}`
  dedupeKey: text('dedupe_key').notNull().unique(),

  imageUrl: text('image_url').notNull(),
  sourceType: text('source_type', { enum: ['dm', 'forum'] }).notNull().default('dm'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const activityDmSessions = pgTable('activity_dm_sessions', {
  id: text('id').primaryKey(),
  memberId: text('member_id').notNull().references(() => members.id),
  discordId: text('discord_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
});

export const activityRelations = relations(activityThreads, ({ one, many }) => ({
  screenshots: many(activityScreenshots),
}));
