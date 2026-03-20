"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadEvents = loadEvents;
const discord_js_1 = require("discord.js");
const crypto_1 = require("crypto");
const discordRoles_1 = require("../../backend/lib/discordRoles");
const discordMemberActions_js_1 = require("../../backend/lib/discordMemberActions.js");
const db_1 = require("../../db");
const schema_1 = require("../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const ticketButton_js_1 = require("../events/interactions/ticketButton.js");
const ticketModalSubmit_js_1 = require("../events/interactions/ticketModalSubmit.js");
const afkButton_js_1 = require("../events/interactions/afkButton.js");
const afkModalSubmit_js_1 = require("../events/interactions/afkModalSubmit.js");
const afkEmbed_js_1 = require("../lib/afkEmbed.js");
const serverStatusEmbed_js_1 = require("../lib/serverStatusEmbed.js");
const eventInteractions_js_1 = require("../events/interactions/eventInteractions.js");
const interviewReady_js_1 = require("../events/interactions/interviewReady.js");
const activityInteractions_js_1 = require("../events/interactions/activityInteractions.js");
const embedDeployer_js_1 = require("../lib/embedDeployer.js");
const schema_2 = require("../../db/schema");
const IPC_BACKEND_BASE_URL = process.env.IPC_BACKEND_BASE_URL || 'http://localhost:3000';
const IPC_BOT_BASE_URL = process.env.IPC_BOT_BASE_URL || 'http://localhost:3001';
async function loadEvents(client) {
    console.log('🛠  Загрузка событий...');
    client.once(discord_js_1.Events.ClientReady, async (c) => {
        console.log(`✅ Успешно! Бот авторизован как ${c.user.tag}`);
        // Guild lock: read allowed guild from DB and auto-leave unauthorized servers
        const [guildRow] = await db_1.db.select().from(schema_2.systemSettings).where((0, drizzle_orm_1.eq)(schema_2.systemSettings.key, 'GUILD_ID'));
        const allowedGuildId = guildRow?.value;
        if (allowedGuildId) {
            client._allowedGuildId = allowedGuildId; // cache for interactionCreate
            c.guilds.cache.forEach(async (guild) => {
                if (guild.id !== allowedGuildId) {
                    console.log(`🚫 Выход из неавторизованного сервера: ${guild.name} (${guild.id})`);
                    await guild.leave().catch(console.error);
                }
            });
        }
        // Start AFK expiry check interval (every 1 minute)
        setInterval(() => {
            (0, afkEmbed_js_1.checkExpiredAfks)(c).catch(console.error);
        }, 60_000);
        // Start Majestic API Online check interval (every 30 seconds)
        setInterval(() => {
            (0, serverStatusEmbed_js_1.refreshServerOnlineEmbed)(c).catch(console.error);
        }, 30_000);
        // Run embed deployer immediately and then every 15 seconds
        (0, embedDeployer_js_1.checkAndDeployEmbeds)(c).catch(console.error);
        setInterval(() => {
            (0, embedDeployer_js_1.checkAndDeployEmbeds)(c).catch(console.error);
        }, 15_000);
        // Reconcile activity forum threads with DB state
        // - if threads were deleted manually in Discord, they should disappear from the site
        // - but never delete everything when Discord fetch returns an empty list
        setInterval(async () => {
            try {
                const [forumRow] = await db_1.db
                    .select()
                    .from(schema_2.systemSettings)
                    .where((0, drizzle_orm_1.eq)(schema_2.systemSettings.key, 'ACTIVITY_FORUM_CHANNEL_ID'))
                    .limit(1);
                const forumChannelId = forumRow?.value?.trim();
                if (!forumChannelId)
                    return;
                const [threadsCountRow] = await db_1.db
                    .select({ c: (0, drizzle_orm_1.count)(schema_1.activityThreads.id) })
                    .from(schema_1.activityThreads);
                const [screenshotsCountRow] = await db_1.db
                    .select({ c: (0, drizzle_orm_1.count)(schema_1.activityScreenshots.id) })
                    .from(schema_1.activityScreenshots);
                const threadsCount = Number(threadsCountRow?.c ?? 0);
                const screenshotsCount = Number(screenshotsCountRow?.c ?? 0);
                // Rebuild if system was wiped / DB is empty.
                if (threadsCount === 0 || screenshotsCount === 0) {
                    await (0, activityInteractions_js_1.rebuildActivityFromForum)(c, forumChannelId);
                    return;
                }
                const forumChannel = await c.channels.fetch(forumChannelId).catch(() => null);
                const threadsManager = forumChannel?.threads;
                if (!threadsManager)
                    return;
                const threadIds = new Set();
                // Try fetching all threads; fallback to active threads if fetch() is not supported.
                try {
                    const threads = await threadsManager.fetch();
                    threads?.forEach?.((t) => threadIds.add(t.id));
                }
                catch {
                    const threads = await threadsManager.fetchActive?.().catch(() => null);
                    threads?.forEach?.((t) => threadIds.add(t.id));
                }
                const dbThreads = await db_1.db
                    .select()
                    .from(schema_1.activityThreads)
                    .where((0, drizzle_orm_1.eq)(schema_1.activityThreads.discordForumChannelId, forumChannelId));
                // If fetch returned nothing, do not delete anything (fetch failure / permission / pagination).
                if (threadIds.size === 0)
                    return;
                // "Stale" means: DB has a thread, but it wasn't present in fetched list.
                // Confirm individually to avoid false negatives.
                const staleThreads = dbThreads.filter((t) => !threadIds.has(t.discordThreadId));
                if (staleThreads.length === 0)
                    return;
                const toDeleteInternalIds = [];
                for (const t of staleThreads) {
                    const discordThreadId = t.discordThreadId;
                    const existsInDiscord = await c.channels.fetch(discordThreadId).then((ch) => Boolean(ch), () => false);
                    if (!existsInDiscord)
                        toDeleteInternalIds.push(t.id);
                }
                if (toDeleteInternalIds.length === 0)
                    return;
                await db_1.db.delete(schema_1.activityScreenshots).where((0, drizzle_orm_1.inArray)(schema_1.activityScreenshots.activityThreadId, toDeleteInternalIds));
                await db_1.db.delete(schema_1.activityThreads).where((0, drizzle_orm_1.inArray)(schema_1.activityThreads.id, toDeleteInternalIds));
                // Notify site admins to refresh UI.
                await fetch(`${IPC_BACKEND_BASE_URL}/api/activity/ipc/bot-event`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                }).catch(() => null);
            }
            catch (e) {
                console.error('❌ Ошибка reconcile activity threads:', e);
            }
        }, 300_000);
        // Auto-refresh event embeds when they transition to InProgress (every 30s)
        setInterval(async () => {
            try {
                const now = new Date();
                // Find open events whose time has arrived
                const startedEvents = await db_1.db.select().from(schema_1.events)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.events.status, 'Open'), (0, drizzle_orm_1.lte)(schema_1.events.eventTime, now)));
                for (const evt of startedEvents) {
                    if (!evt.messageId || !evt.channelId)
                        continue;
                    try {
                        const channel = await c.channels.fetch(evt.channelId);
                        if (!channel || !('messages' in channel))
                            continue;
                        const msg = await channel.messages.fetch(evt.messageId);
                        if (msg)
                            await (0, eventInteractions_js_1.refreshEventEmbed)(msg, evt.id);
                    }
                    catch (e) {
                        // Message may have been deleted
                    }
                }
            }
            catch (e) {
                console.error('❌ Ошибка автообновления активных мероприятий:', e);
            }
        }, 30_000);
    });
    // Detect when managed embeds are deleted from Discord, and reset their MESSAGE_ID so they redeploy
    client.on('messageDelete', async (message) => {
        try {
            if (!message.author?.bot)
                return; // Only care about our bot's messages
            const managedKeys = ['TICKETS_MESSAGE_ID', 'AFK_MESSAGE_ID', 'EVENTS_MESSAGE_ID', 'ONLINE_MESSAGE_ID'];
            // Look up if this deleted message was one of our system settings
            const settings = await db_1.db.select().from(schema_2.systemSettings);
            const foundSetting = settings.find(s => s.value === message.id && managedKeys.includes(s.key));
            if (foundSetting) {
                console.log(`🗑️ Системное сообщение удалено (${foundSetting.key}). Сброс конфигурации для авто-переотправки.`);
                await db_1.db.update(schema_2.systemSettings)
                    .set({ value: null })
                    .where((0, drizzle_orm_1.eq)(schema_2.systemSettings.key, foundSetting.key));
                // Immediately trigger logic
                (0, embedDeployer_js_1.checkAndDeployEmbeds)(client).catch(console.error);
            }
        }
        catch (error) {
            console.error('❌ Ошибка в обработчике messageDelete:', error);
        }
    });
    // Auto-terminate sessions when admin role is removed
    client.on('guildMemberUpdate', async (oldMember, newMember) => {
        const oldRoles = new Set(oldMember.roles.cache.map(r => r.id));
        const newRoles = new Set(newMember.roles.cache.map(r => r.id));
        const removedRoles = [...oldRoles].filter(id => !newRoles.has(id));
        // --- 1. Auto-terminate sessions when admin role is removed ---
        try {
            if (removedRoles.length > 0) {
                const adminRoleIds = await (0, discordRoles_1.getAdminRoleIds)();
                const lostAdminRole = adminRoleIds.length > 0 && removedRoles.some(id => adminRoleIds.includes(id));
                const stillHasAdmin = adminRoleIds.some(id => newRoles.has(id));
                const botOwnerId = process.env.BOT_OWNER_ID;
                if (lostAdminRole && !stillHasAdmin && (!botOwnerId || newMember.id !== botOwnerId.trim())) {
                    // Invalidate all sessions for this user
                    const [user] = await db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.discordId, newMember.id));
                    if (user) {
                        await db_1.db.delete(schema_1.sessions).where((0, drizzle_orm_1.eq)(schema_1.sessions.userId, user.id));
                        console.log(`🔒 Отозваны все сессии для ${newMember.user.tag} (${newMember.id}) — утеряна роль администратора`);
                    }
                }
            }
        }
        catch (err) {
            console.error('❌ Ошибка отзыва сессий при изменении ролей:', err);
        }
        // --- 2. Auto-sync roster when KINGSIZE, NEWKINGSIZE, or TIER roles are changed ---
        try {
            const kingsizeId = await (0, discordMemberActions_js_1.getRoleIdByKey)('KINGSIZE');
            const newKingsizeId = await (0, discordMemberActions_js_1.getRoleIdByKey)('NEWKINGSIZE');
            const tier1Id = await (0, discordMemberActions_js_1.getRoleIdByKey)('TIER1');
            const tier2Id = await (0, discordMemberActions_js_1.getRoleIdByKey)('TIER2');
            const tier3Id = await (0, discordMemberActions_js_1.getRoleIdByKey)('TIER3');
            const hasKingsizeNow = kingsizeId ? newRoles.has(kingsizeId) : false;
            const hasNewKingsizeNow = newKingsizeId ? newRoles.has(newKingsizeId) : false;
            const hasKingsizeBefore = kingsizeId ? oldRoles.has(kingsizeId) : false;
            const hasNewKingsizeBefore = newKingsizeId ? oldRoles.has(newKingsizeId) : false;
            const hasTier1Now = tier1Id ? newRoles.has(tier1Id) : false;
            const hasTier2Now = tier2Id ? newRoles.has(tier2Id) : false;
            const hasTier3Now = tier3Id ? newRoles.has(tier3Id) : false;
            let currentTierValue = 'NONE';
            if (hasTier1Now)
                currentTierValue = 'TIER 1';
            else if (hasTier2Now)
                currentTierValue = 'TIER 2';
            else if (hasTier3Now)
                currentTierValue = 'TIER 3';
            const [existing] = await db_1.db.select().from(schema_1.members).where((0, drizzle_orm_1.eq)(schema_1.members.discordId, newMember.id));
            if (hasKingsizeNow || hasNewKingsizeNow) {
                let roleValue = hasKingsizeNow ? 'KINGSIZE' : 'NEWKINGSIZE';
                const isInFamilyNow = hasKingsizeNow || hasNewKingsizeNow;
                const wasInFamilyBefore = hasKingsizeBefore || hasNewKingsizeBefore;
                const shouldEnsureActivity = isInFamilyNow && !wasInFamilyBefore;
                if (!existing) {
                    const newMemberId = (0, crypto_1.randomUUID)();
                    await db_1.db.insert(schema_1.members).values({
                        id: newMemberId,
                        discordId: newMember.id,
                        discordUsername: newMember.user.username,
                        discordAvatarUrl: newMember.user.displayAvatarURL(),
                        gameNickname: newMember.nickname || newMember.user.globalName || newMember.user.username,
                        gameStaticId: '0000',
                        role: roleValue,
                        tier: currentTierValue,
                        status: 'active'
                    });
                    console.log(`📋 Автоматически добавлен ${newMember.user.tag} в состав семьи (роль: ${roleValue}, тир: ${currentTierValue})`);
                    if (shouldEnsureActivity) {
                        (0, activityInteractions_js_1.createActivityThreadIpc)(client, newMemberId).catch(console.error);
                    }
                }
                else {
                    const needsStatusUpdate = existing.status !== 'active';
                    const needsRoleUpdate = existing.role !== roleValue;
                    const needsTierUpdate = existing.tier !== currentTierValue;
                    if (needsStatusUpdate || needsRoleUpdate || needsTierUpdate) {
                        await db_1.db.update(schema_1.members)
                            .set({
                            status: 'active',
                            role: roleValue,
                            tier: currentTierValue,
                            discordUsername: newMember.user.username,
                            discordAvatarUrl: newMember.user.displayAvatarURL()
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.members.discordId, newMember.id));
                        console.log(`🔄 Автоматически обновлен ${newMember.user.tag} в составе семьи (роль: ${roleValue}, тир: ${currentTierValue})`);
                        if (shouldEnsureActivity) {
                            (0, activityInteractions_js_1.createActivityThreadIpc)(client, existing.id).catch(console.error);
                        }
                        if (needsTierUpdate) {
                            try {
                                const TIER_MAP = {
                                    'TIER 1': 1, 'TIER 2': 2, 'TIER 3': 3, 'NONE': 4, 'БЕЗ TIER': 4
                                };
                                const newTierInt = TIER_MAP[currentTierValue] || 4;
                                const userEvents = await db_1.db.select({ eventId: schema_1.eventParticipants.eventId })
                                    .from(schema_1.eventParticipants)
                                    .innerJoin(schema_1.events, (0, drizzle_orm_1.eq)(schema_1.events.id, schema_1.eventParticipants.eventId))
                                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.eventParticipants.userId, newMember.id), (0, drizzle_orm_1.ne)(schema_1.events.status, 'Closed')));
                                if (userEvents.length > 0) {
                                    const eventIds = userEvents.map(e => e.eventId);
                                    await db_1.db.update(schema_1.eventParticipants)
                                        .set({ tier: newTierInt })
                                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.eventParticipants.userId, newMember.id), (0, drizzle_orm_1.inArray)(schema_1.eventParticipants.eventId, eventIds)));
                                    // Trigger IPC webhook for each event
                                    for (const ev of userEvents) {
                                        fetch(`${IPC_BOT_BASE_URL}/ipc/refresh-event/${ev.eventId}`, { method: 'POST' }).catch(console.error);
                                    }
                                }
                            }
                            catch (err) {
                                console.error('❌ Ошибка обновления списков мероприятий при смене тира:', err);
                            }
                        }
                    }
                }
            }
            else {
                // User DOES NOT have KINGSIZE or NEWKINGSIZE.
                // If they exist and are active, we must "kick" them.
                if (existing && existing.status === 'active') {
                    await db_1.db.update(schema_1.members)
                        .set({ status: 'kicked', tier: 'NONE' })
                        .where((0, drizzle_orm_1.eq)(schema_1.members.id, existing.id));
                    console.log(`👢 Автоматически исключен ${newMember.user.tag} из состава семьи (утеряна основная роль)`);
                }
            }
        }
        catch (err) {
            console.error('❌ Ошибка синхронизации состава семьи:', err);
        }
    });
    // Auto-restore BLACKLIST role when a blacklisted user rejoins the server
    client.on('guildMemberAdd', async (member) => {
        try {
            const [dbMember] = await db_1.db.select().from(schema_1.members).where((0, drizzle_orm_1.eq)(schema_1.members.discordId, member.id));
            if (!dbMember || dbMember.status !== 'blacklisted')
                return;
            const blacklistRoleId = await (0, discordMemberActions_js_1.getRoleIdByKey)('BLACKLIST');
            if (blacklistRoleId) {
                await (0, discordMemberActions_js_1.addRole)(member.id, blacklistRoleId);
                console.log(`⛔ Автоматически восстановлена роль BLACKLIST для ${member.user.tag} (${member.id})`);
            }
        }
        catch (err) {
            console.error('❌ Ошибка восстановления черного списка:', err);
        }
    });
    client.on('messageCreate', async (message) => {
        if (message.author.bot)
            return;
        if (message.guildId)
            return; // Only process DMs
        try {
            // Activity uploads have priority over interview DM handling.
            try {
                const handled = await (0, activityInteractions_js_1.handleActivityDmMessage)(client, message);
                if (handled)
                    return;
            }
            catch (e) {
                console.error('❌ Ошибка handleActivityDmMessage:', e);
            }
            const debugDm = process.env.DEBUG_DM_MESSAGES === '1';
            // Find active interview for this user
            const apps = await db_1.db.select().from(schema_1.applications)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.applications.discordId, message.author.id), (0, drizzle_orm_1.inArray)(schema_1.applications.status, ['interview', 'interview_ready'])))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.applications.createdAt))
                .limit(1);
            if (apps.length > 0) {
                const app = apps[0];
                const { randomUUID } = await import('crypto');
                const [msg] = await db_1.db.insert(schema_1.interviewMessages).values({
                    id: randomUUID(),
                    applicationId: app.id,
                    senderType: 'user',
                    senderId: message.author.id,
                    content: message.content,
                }).returning();
                if (debugDm) {
                    console.log(`🧾 [DM] Найдена заявка ${app.id} (status=${app.status}) для discord=${message.author.id}. msg=${msg.id}`);
                }
                // Notify backend
                try {
                    const ipcRes = await fetch(`${IPC_BACKEND_BASE_URL}/api/applications/ipc/bot-event`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ event: 'new_message', payload: msg })
                    });
                    if (debugDm) {
                        console.log(`📡 [DM] IPC bot-event response: ${ipcRes.status}`);
                    }
                }
                catch {
                    if (debugDm)
                        console.log('📡 [DM] IPC bot-event failed');
                }
                // Add a checkmark reaction to let user know it was received
                await message.react('✅').catch(() => { });
            }
            else {
                if (process.env.DEBUG_DM_MESSAGES === '1') {
                    console.log(`🧾 [DM] Заявка для discord=${message.author.id} не найдена (message=${(message.content ?? '').slice(0, 50)})`);
                }
            }
        }
        catch (err) {
            console.error('❌ Ошибка при обработке ЛС сообщения:', err);
        }
    });
    // Manual activity posts inside activity threads (forum messages)
    client.on('messageCreate', async (message) => {
        try {
            if (message.author.bot)
                return;
            if (!message.guildId)
                return;
            const isThread = message.channel?.isThread?.() === true;
            if (!isThread)
                return;
            await (0, activityInteractions_js_1.handleActivityForumMessage)(client, message);
        }
        catch (e) {
            console.error('❌ Ошибка handleActivityForumMessage:', e);
        }
    });
    client.on('interactionCreate', async (interaction) => {
        // Guild lock: ignore interactions from unauthorized servers
        const allowed = client._allowedGuildId;
        // Allow DMs (interaction.guildId is null) so DM buttons can be handled.
        if (allowed && interaction.guildId && interaction.guildId !== allowed)
            return;
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command)
                return;
            try {
                await command.execute(interaction);
            }
            catch (error) {
                console.error(error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
                }
                else {
                    await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
                }
            }
        }
        else if (interaction.isButton()) {
            if (interaction.customId === 'ticket_apply_btn') {
                await (0, ticketButton_js_1.handleTicketApplyBtn)(interaction).catch(console.error);
            }
            else if (interaction.customId === 'afk_start_btn') {
                await (0, afkButton_js_1.handleAfkStartBtn)(interaction).catch(console.error);
            }
            else if (interaction.customId === 'afk_end_btn') {
                await (0, afkButton_js_1.handleAfkEndBtn)(interaction).catch(console.error);
            }
            else if (interaction.customId === 'event_create_btn') {
                await (0, eventInteractions_js_1.handleEventCreateBtn)(interaction).catch(console.error);
            }
            else if (interaction.customId.startsWith('event_')) {
                await (0, eventInteractions_js_1.handleEventActionBtn)(interaction).catch(console.error);
            }
            else if (interaction.customId.startsWith('activity_upload_')) {
                await (0, activityInteractions_js_1.handleActivityUploadBtn)(interaction).catch(console.error);
            }
            else if (interaction.customId.startsWith('interview_ready_')) {
                await (0, interviewReady_js_1.handleInterviewReadyBtn)(interaction).catch(console.error);
            }
        }
        else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'ticket_apply_modal') {
                await (0, ticketModalSubmit_js_1.handleTicketApplyModal)(interaction).catch(console.error);
            }
            else if (interaction.customId === 'afk_start_modal') {
                await (0, afkModalSubmit_js_1.handleAfkModalSubmit)(interaction).catch(console.error);
            }
            else if (interaction.customId === 'event_create_modal') {
                await (0, eventInteractions_js_1.handleEventCreateModalSubmit)(interaction).catch(console.error);
            }
            else if (interaction.customId.startsWith('event_setgroup_modal_')) {
                await (0, eventInteractions_js_1.handleEventSetGroupModalSubmit)(interaction).catch(console.error);
            }
            else if (interaction.customId.startsWith('event_map_modal_')) {
                await (0, eventInteractions_js_1.handleEventMapModalSubmit)(interaction).catch(console.error);
            }
        }
    });
    console.log('✅ Все события успешно загружены!');
}
