"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activityRelations = exports.activityDmSessions = exports.activityScreenshots = exports.activityThreads = exports.interviewMessages = exports.eventParticipants = exports.events = exports.eventMaps = exports.afkEntries = exports.members = exports.applications = exports.systemSettings = exports.roleSettings = exports.sessions = exports.users = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
exports.users = (0, pg_core_1.pgTable)('users', {
    id: (0, pg_core_1.text)('id').primaryKey(),
    discordId: (0, pg_core_1.text)('discord_id').notNull().unique(),
    username: (0, pg_core_1.text)('username').notNull(),
    avatarUrl: (0, pg_core_1.text)('avatar_url'),
    role: (0, pg_core_1.text)('role').default('user').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.sessions = (0, pg_core_1.pgTable)('sessions', {
    id: (0, pg_core_1.text)('id').primaryKey(),
    userId: (0, pg_core_1.text)('user_id')
        .notNull()
        .references(() => exports.users.id),
    expiresAt: (0, pg_core_1.timestamp)('expires_at', {
        withTimezone: true,
        mode: 'date',
    }).notNull(),
});
exports.roleSettings = (0, pg_core_1.pgTable)('role_settings', {
    key: (0, pg_core_1.text)('key').primaryKey(),
    discordRoleId: (0, pg_core_1.text)('discord_role_id'),
    name: (0, pg_core_1.text)('name').notNull(),
    requiresAdmin: (0, pg_core_1.boolean)('requires_admin').default(false).notNull(),
});
exports.systemSettings = (0, pg_core_1.pgTable)('system_settings', {
    key: (0, pg_core_1.text)('key').primaryKey(),
    value: (0, pg_core_1.text)('value'),
});
exports.applications = (0, pg_core_1.pgTable)('applications', {
    id: (0, pg_core_1.text)('id').primaryKey(), // We'll use uuid() for this
    discordId: (0, pg_core_1.text)('discord_id').notNull(),
    discordUsername: (0, pg_core_1.text)('discord_username').notNull(),
    discordAvatarUrl: (0, pg_core_1.text)('discord_avatar_url'),
    field1: (0, pg_core_1.text)('field_1').notNull(),
    field2: (0, pg_core_1.text)('field_2').notNull(),
    field3: (0, pg_core_1.text)('field_3').notNull(),
    field4: (0, pg_core_1.text)('field_4').notNull(),
    field5: (0, pg_core_1.text)('field_5').notNull(),
    status: (0, pg_core_1.text)('status', { enum: ['pending', 'interview', 'interview_ready', 'accepted', 'rejected', 'excluded', 'blacklist'] }).default('pending').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    handledByAdminUsername: (0, pg_core_1.text)('handled_by_admin_username'),
    handledByAdminId: (0, pg_core_1.text)('handled_by_admin_id'), // To restrict chat to a single admin
    rejectionReason: (0, pg_core_1.text)('rejection_reason'),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
exports.members = (0, pg_core_1.pgTable)('members', {
    id: (0, pg_core_1.text)('id').primaryKey(), // We'll use uuid() for this
    discordId: (0, pg_core_1.text)('discord_id').notNull(),
    discordUsername: (0, pg_core_1.text)('discord_username').notNull(),
    discordAvatarUrl: (0, pg_core_1.text)('discord_avatar_url'),
    gameNickname: (0, pg_core_1.text)('game_nickname').notNull(),
    gameStaticId: (0, pg_core_1.text)('game_static_id').notNull(),
    role: (0, pg_core_1.text)('role', { enum: ['KINGSIZE', 'NEWKINGSIZE'] }).default('NEWKINGSIZE').notNull(),
    tier: (0, pg_core_1.text)('tier', { enum: ['TIER 1', 'TIER 2', 'TIER 3', 'NONE'] }).default('NONE').notNull(),
    status: (0, pg_core_1.text)('status', { enum: ['active', 'kicked', 'blacklisted'] }).default('active').notNull(),
    applicationId: (0, pg_core_1.text)('application_id'),
    joinedAt: (0, pg_core_1.timestamp)('joined_at').defaultNow().notNull(),
});
exports.afkEntries = (0, pg_core_1.pgTable)('afk_entries', {
    id: (0, pg_core_1.text)('id').primaryKey(),
    discordId: (0, pg_core_1.text)('discord_id').notNull(),
    discordUsername: (0, pg_core_1.text)('discord_username').notNull(),
    discordAvatarUrl: (0, pg_core_1.text)('discord_avatar_url'),
    reason: (0, pg_core_1.text)('reason').notNull(),
    startsAt: (0, pg_core_1.timestamp)('starts_at').defaultNow().notNull(),
    endsAt: (0, pg_core_1.timestamp)('ends_at').notNull(),
    status: (0, pg_core_1.text)('status', { enum: ['active', 'ended'] }).default('active').notNull(),
    endedByType: (0, pg_core_1.text)('ended_by_type', { enum: ['self', 'admin', 'expired'] }),
    endedByAdmin: (0, pg_core_1.text)('ended_by_admin'),
    endedAt: (0, pg_core_1.timestamp)('ended_at'),
    messageId: (0, pg_core_1.text)('message_id'),
    channelId: (0, pg_core_1.text)('channel_id'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.eventMaps = (0, pg_core_1.pgTable)('event_maps', {
    id: (0, pg_core_1.text)('id').primaryKey(),
    name: (0, pg_core_1.text)('name').notNull(),
    imageUrl: (0, pg_core_1.text)('image_url').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.events = (0, pg_core_1.pgTable)('events', {
    id: (0, pg_core_1.text)('id').primaryKey(),
    messageId: (0, pg_core_1.text)('message_id'),
    channelId: (0, pg_core_1.text)('channel_id'),
    creatorId: (0, pg_core_1.text)('creator_id').notNull(),
    eventType: (0, pg_core_1.text)('event_type', { enum: ['Capt', 'MCL', 'ВЗЗ'] }).notNull(),
    eventTime: (0, pg_core_1.timestamp)('event_time').notNull(),
    slots: (0, pg_core_1.integer)('slots').notNull(),
    status: (0, pg_core_1.text)('status', { enum: ['Open', 'Closed'] }).default('Open').notNull(),
    groupCode: (0, pg_core_1.text)('group_code'),
    mapId: (0, pg_core_1.text)('map_id'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.eventParticipants = (0, pg_core_1.pgTable)('event_participants', {
    id: (0, pg_core_1.text)('id').primaryKey(),
    eventId: (0, pg_core_1.text)('event_id').notNull().references(() => exports.events.id),
    userId: (0, pg_core_1.text)('user_id').notNull(),
    tier: (0, pg_core_1.integer)('tier').notNull(),
    joinedAt: (0, pg_core_1.timestamp)('joined_at').defaultNow().notNull(),
});
exports.interviewMessages = (0, pg_core_1.pgTable)('interview_messages', {
    id: (0, pg_core_1.text)('id').primaryKey(),
    applicationId: (0, pg_core_1.text)('application_id').notNull().references(() => exports.applications.id),
    senderType: (0, pg_core_1.text)('sender_type', { enum: ['user', 'admin'] }).notNull(),
    senderId: (0, pg_core_1.text)('sender_id').notNull(), // discordId or admin userId
    content: (0, pg_core_1.text)('content').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
// ──────────────────────────────────────────────────────────────
// Activity (screenshots) forum sync
// ──────────────────────────────────────────────────────────────
exports.activityThreads = (0, pg_core_1.pgTable)('activity_threads', {
    id: (0, pg_core_1.text)('id').primaryKey(),
    memberId: (0, pg_core_1.text)('member_id').notNull().references(() => exports.members.id).unique(),
    discordForumChannelId: (0, pg_core_1.text)('discord_forum_channel_id').notNull(),
    discordThreadId: (0, pg_core_1.text)('discord_thread_id').notNull().unique(),
    threadName: (0, pg_core_1.text)('thread_name').notNull(),
    presentInDiscord: (0, pg_core_1.boolean)('present_in_discord').notNull().default(true),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
exports.activityScreenshots = (0, pg_core_1.pgTable)('activity_screenshots', {
    id: (0, pg_core_1.text)('id').primaryKey(),
    memberId: (0, pg_core_1.text)('member_id').notNull().references(() => exports.members.id),
    activityThreadId: (0, pg_core_1.text)('activity_thread_id').notNull().references(() => exports.activityThreads.id),
    // Message where the attachment came from:
    // - DM upload -> message.id from DM
    // - Manual post -> message.id from forum thread
    sourceDiscordMessageId: (0, pg_core_1.text)('source_discord_message_id').notNull(),
    sourceAttachmentIndex: (0, pg_core_1.integer)('source_attachment_index').notNull(),
    // Unique dedupe key: `${sourceDiscordMessageId}:${sourceAttachmentIndex}`
    dedupeKey: (0, pg_core_1.text)('dedupe_key').notNull().unique(),
    imageUrl: (0, pg_core_1.text)('image_url').notNull(),
    sourceType: (0, pg_core_1.text)('source_type', { enum: ['dm', 'forum'] }).notNull().default('dm'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.activityDmSessions = (0, pg_core_1.pgTable)('activity_dm_sessions', {
    id: (0, pg_core_1.text)('id').primaryKey(),
    memberId: (0, pg_core_1.text)('member_id').notNull().references(() => exports.members.id),
    discordId: (0, pg_core_1.text)('discord_id').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    expiresAt: (0, pg_core_1.timestamp)('expires_at', { withTimezone: true }).notNull(),
    consumedAt: (0, pg_core_1.timestamp)('consumed_at', { withTimezone: true }),
});
exports.activityRelations = (0, drizzle_orm_1.relations)(exports.activityThreads, ({ one, many }) => ({
    screenshots: many(exports.activityScreenshots),
}));
