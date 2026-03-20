import { Client, Events } from 'discord.js';
import { randomUUID } from 'crypto';
import { getAdminRoleIds } from '../../backend/lib/discordRoles';
import { addRole, getRoleIdByKey } from '../../backend/lib/discordMemberActions.js';
import { db } from '../../db';
import { users, sessions, members, events, eventParticipants, applications, interviewMessages, activityThreads, activityScreenshots } from '../../db/schema';
import { count, eq, and, lte, ne, inArray, desc } from 'drizzle-orm';
import { handleTicketApplyBtn } from '../events/interactions/ticketButton.js';
import { handleTicketApplyModal } from '../events/interactions/ticketModalSubmit.js';
import { handleAfkStartBtn, handleAfkEndBtn } from '../events/interactions/afkButton.js';
import { handleAfkModalSubmit } from '../events/interactions/afkModalSubmit.js';
import { checkExpiredAfks } from '../lib/afkEmbed.js';
import { refreshServerOnlineEmbed } from '../lib/serverStatusEmbed.js';
import { handleEventCreateBtn, handleEventCreateModalSubmit, handleEventActionBtn, handleEventSetGroupModalSubmit, handleEventMapModalSubmit, refreshEventEmbed } from '../events/interactions/eventInteractions.js';
import { handleInterviewReadyBtn } from '../events/interactions/interviewReady.js';
import { createActivityThreadIpc, handleActivityDmMessage, handleActivityForumMessage, handleActivityUploadBtn, rebuildActivityFromForum } from '../events/interactions/activityInteractions.js';
import { checkAndDeployEmbeds } from '../lib/embedDeployer.js';
import { systemSettings } from '../../db/schema';

const IPC_BACKEND_BASE_URL = process.env.IPC_BACKEND_BASE_URL || 'http://localhost:3000';
const IPC_BOT_BASE_URL = process.env.IPC_BOT_BASE_URL || 'http://localhost:3001';

export async function loadEvents(client: Client) {
    console.log('🛠  Загрузка событий...');

    client.once(Events.ClientReady, async (c) => {
        console.log(`✅ Успешно! Бот авторизован как ${c.user.tag}`);

        // Guild lock: read allowed guild from DB and auto-leave unauthorized servers
        const [guildRow] = await db.select().from(systemSettings).where(eq(systemSettings.key, 'GUILD_ID'));
        const allowedGuildId = guildRow?.value;
        if (allowedGuildId) {
            (client as any)._allowedGuildId = allowedGuildId; // cache for interactionCreate
            c.guilds.cache.forEach(async (guild) => {
                if (guild.id !== allowedGuildId) {
                    console.log(`🚫 Выход из неавторизованного сервера: ${guild.name} (${guild.id})`);
                    await guild.leave().catch(console.error);
                }
            });
        }
        
        // Start AFK expiry check interval (every 1 minute)
        setInterval(() => {
            checkExpiredAfks(c).catch(console.error);
        }, 60_000);

        // Start Majestic API Online check interval (every 30 seconds)
        setInterval(() => {
            refreshServerOnlineEmbed(c).catch(console.error);
        }, 30_000);

        // Run embed deployer immediately and then every 15 seconds
        checkAndDeployEmbeds(c).catch(console.error);
        setInterval(() => {
            checkAndDeployEmbeds(c).catch(console.error);
        }, 15_000);

        // Reconcile activity forum threads with DB state
        // - if threads were deleted manually in Discord, they should disappear from the site
        // - but never delete everything when Discord fetch returns an empty list
        setInterval(async () => {
            try {
                const [forumRow] = await db
                    .select()
                    .from(systemSettings)
                    .where(eq(systemSettings.key, 'ACTIVITY_FORUM_CHANNEL_ID'))
                    .limit(1);

                const forumChannelId = forumRow?.value?.trim();
                if (!forumChannelId) return;

                const [threadsCountRow] = await db
                    .select({ c: count(activityThreads.id) })
                    .from(activityThreads);
                const [screenshotsCountRow] = await db
                    .select({ c: count(activityScreenshots.id) })
                    .from(activityScreenshots);

                const threadsCount = Number(threadsCountRow?.c ?? 0);
                const screenshotsCount = Number(screenshotsCountRow?.c ?? 0);

                // Rebuild if system was wiped / DB is empty.
                if (threadsCount === 0 || screenshotsCount === 0) {
                    await rebuildActivityFromForum(c, forumChannelId);
                    return;
                }

                const forumChannel = await c.channels.fetch(forumChannelId).catch(() => null) as any;
                const threadsManager = forumChannel?.threads;
                if (!threadsManager) return;

                const threadIds = new Set<string>();
                // Try fetching all threads; fallback to active threads if fetch() is not supported.
                try {
                    const threads = await threadsManager.fetch();
                    threads?.forEach?.((t: any) => threadIds.add(t.id));
                } catch {
                    const threads = await threadsManager.fetchActive?.().catch(() => null);
                    threads?.forEach?.((t: any) => threadIds.add(t.id));
                }

                const dbThreads = await db
                    .select()
                    .from(activityThreads)
                    .where(eq(activityThreads.discordForumChannelId, forumChannelId));

                // If fetch returned nothing, do not delete anything (fetch failure / permission / pagination).
                if (threadIds.size === 0) return;

                // "Stale" means: DB has a thread, but it wasn't present in fetched list.
                // Confirm individually to avoid false negatives.
                const staleThreads = dbThreads.filter((t: any) => !threadIds.has(t.discordThreadId));
                if (staleThreads.length === 0) return;

                const toDeleteInternalIds: string[] = [];
                for (const t of staleThreads) {
                    const discordThreadId = t.discordThreadId;
                    const existsInDiscord = await c.channels.fetch(discordThreadId).then(
                        (ch) => Boolean(ch),
                        () => false
                    );
                    if (!existsInDiscord) toDeleteInternalIds.push(t.id);
                }

                if (toDeleteInternalIds.length === 0) return;

                await db.delete(activityScreenshots).where(inArray(activityScreenshots.activityThreadId, toDeleteInternalIds));
                await db.delete(activityThreads).where(inArray(activityThreads.id, toDeleteInternalIds));

                // Notify site admins to refresh UI.
                    await fetch(`${IPC_BACKEND_BASE_URL}/api/activity/ipc/bot-event`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                }).catch(() => null);
            } catch (e) {
                console.error('❌ Ошибка reconcile activity threads:', e);
            }
        }, 300_000);

        // Auto-refresh event embeds when they transition to InProgress (every 30s)
        setInterval(async () => {
            try {
                const now = new Date();
                // Find open events whose time has arrived
                const startedEvents = await db.select().from(events)
                    .where(and(eq(events.status, 'Open'), lte(events.eventTime, now)));

                for (const evt of startedEvents) {
                    if (!evt.messageId || !evt.channelId) continue;
                    try {
                        const channel = await c.channels.fetch(evt.channelId);
                        if (!channel || !('messages' in channel)) continue;
                        const msg = await (channel as any).messages.fetch(evt.messageId);
                        if (msg) await refreshEventEmbed(msg, evt.id);
                    } catch (e) {
                        // Message may have been deleted
                    }
                }
            } catch (e) {
                console.error('❌ Ошибка автообновления активных мероприятий:', e);
            }
        }, 30_000);
    });

    // Detect when managed embeds are deleted from Discord, and reset their MESSAGE_ID so they redeploy
    client.on('messageDelete', async (message) => {
        try {
            if (!message.author?.bot) return; // Only care about our bot's messages
            
            const managedKeys = ['TICKETS_MESSAGE_ID', 'AFK_MESSAGE_ID', 'EVENTS_MESSAGE_ID', 'ONLINE_MESSAGE_ID'];
            
            // Look up if this deleted message was one of our system settings
            const settings = await db.select().from(systemSettings);
            const foundSetting = settings.find(s => s.value === message.id && managedKeys.includes(s.key));
            
            if (foundSetting) {
                console.log(`🗑️ Системное сообщение удалено (${foundSetting.key}). Сброс конфигурации для авто-переотправки.`);
                await db.update(systemSettings)
                    .set({ value: null })
                    .where(eq(systemSettings.key, foundSetting.key));
                
                // Immediately trigger logic
                checkAndDeployEmbeds(client).catch(console.error);
            }
        } catch (error) {
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
                const adminRoleIds = await getAdminRoleIds();
                const lostAdminRole = adminRoleIds.length > 0 && removedRoles.some(id => adminRoleIds.includes(id));
                const stillHasAdmin = adminRoleIds.some(id => newRoles.has(id));
                const botOwnerId = process.env.BOT_OWNER_ID;

                if (lostAdminRole && !stillHasAdmin && (!botOwnerId || newMember.id !== botOwnerId.trim())) {
                    // Invalidate all sessions for this user
                    const [user] = await db.select().from(users).where(eq(users.discordId, newMember.id));
                    if (user) {
                        await db.delete(sessions).where(eq(sessions.userId, user.id));
                        console.log(`🔒 Отозваны все сессии для ${newMember.user.tag} (${newMember.id}) — утеряна роль администратора`);
                    }
                }
            }
        } catch (err) {
            console.error('❌ Ошибка отзыва сессий при изменении ролей:', err);
        }

        // --- 2. Auto-sync roster when KINGSIZE, NEWKINGSIZE, or TIER roles are changed ---
        try {
            const kingsizeId = await getRoleIdByKey('KINGSIZE');
            const newKingsizeId = await getRoleIdByKey('NEWKINGSIZE');
            const tier1Id = await getRoleIdByKey('TIER1');
            const tier2Id = await getRoleIdByKey('TIER2');
            const tier3Id = await getRoleIdByKey('TIER3');

            const hasKingsizeNow = kingsizeId ? newRoles.has(kingsizeId) : false;
            const hasNewKingsizeNow = newKingsizeId ? newRoles.has(newKingsizeId) : false;
            const hasKingsizeBefore = kingsizeId ? oldRoles.has(kingsizeId) : false;
            const hasNewKingsizeBefore = newKingsizeId ? oldRoles.has(newKingsizeId) : false;
            
            const hasTier1Now = tier1Id ? newRoles.has(tier1Id) : false;
            const hasTier2Now = tier2Id ? newRoles.has(tier2Id) : false;
            const hasTier3Now = tier3Id ? newRoles.has(tier3Id) : false;

            let currentTierValue: 'TIER 1' | 'TIER 2' | 'TIER 3' | 'NONE' = 'NONE';
            if (hasTier1Now) currentTierValue = 'TIER 1';
            else if (hasTier2Now) currentTierValue = 'TIER 2';
            else if (hasTier3Now) currentTierValue = 'TIER 3';

            const [existing] = await db.select().from(members).where(eq(members.discordId, newMember.id));

            if (hasKingsizeNow || hasNewKingsizeNow) {
                let roleValue: 'KINGSIZE' | 'NEWKINGSIZE' = hasKingsizeNow ? 'KINGSIZE' : 'NEWKINGSIZE';
                const isInFamilyNow = hasKingsizeNow || hasNewKingsizeNow;
                const wasInFamilyBefore = hasKingsizeBefore || hasNewKingsizeBefore;
                const shouldEnsureActivity = isInFamilyNow && !wasInFamilyBefore;

                if (!existing) {
                    const newMemberId = randomUUID();
                    await db.insert(members).values({
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
                        createActivityThreadIpc(client, newMemberId).catch(console.error);
                    }
                } else {
                    const needsStatusUpdate = existing.status !== 'active';
                    const needsRoleUpdate = existing.role !== roleValue;
                    const needsTierUpdate = existing.tier !== currentTierValue;
                    
                    if (needsStatusUpdate || needsRoleUpdate || needsTierUpdate) {
                        await db.update(members)
                            .set({ 
                                status: 'active',
                                role: roleValue,
                                tier: currentTierValue,
                                discordUsername: newMember.user.username,
                                discordAvatarUrl: newMember.user.displayAvatarURL()
                            })
                            .where(eq(members.discordId, newMember.id));
                        console.log(`🔄 Автоматически обновлен ${newMember.user.tag} в составе семьи (роль: ${roleValue}, тир: ${currentTierValue})`);

                    if (shouldEnsureActivity) {
                        createActivityThreadIpc(client, existing.id).catch(console.error);
                    }

                        if (needsTierUpdate) {
                            try {
                                const TIER_MAP: Record<string, number> = {
                                    'TIER 1': 1, 'TIER 2': 2, 'TIER 3': 3, 'NONE': 4, 'БЕЗ TIER': 4
                                };
                                const newTierInt = TIER_MAP[currentTierValue] || 4;
            
                                const userEvents = await db.select({ eventId: eventParticipants.eventId })
                                    .from(eventParticipants)
                                    .innerJoin(events, eq(events.id, eventParticipants.eventId))
                                    .where(
                                        and(
                                            eq(eventParticipants.userId, newMember.id),
                                            ne(events.status, 'Closed')
                                        )
                                    );
                                    
                                if (userEvents.length > 0) {
                                    const eventIds = userEvents.map(e => e.eventId);
                                    await db.update(eventParticipants)
                                        .set({ tier: newTierInt })
                                        .where(
                                            and(
                                                eq(eventParticipants.userId, newMember.id),
                                                inArray(eventParticipants.eventId, eventIds)
                                            )
                                        );
                                    
                                    // Trigger IPC webhook for each event
                                    for (const ev of userEvents) {
                                        fetch(`${IPC_BOT_BASE_URL}/ipc/refresh-event/${ev.eventId}`, { method: 'POST' }).catch(console.error);
                                    }
                                }
                            } catch (err) {
                                console.error('❌ Ошибка обновления списков мероприятий при смене тира:', err);
                            }
                        }
                    }
                }
            } else {
                // User DOES NOT have KINGSIZE or NEWKINGSIZE.
                // If they exist and are active, we must "kick" them.
                if (existing && existing.status === 'active') {
                    await db.update(members)
                        .set({ status: 'kicked', tier: 'NONE' })
                        .where(eq(members.id, existing.id));
                    console.log(`👢 Автоматически исключен ${newMember.user.tag} из состава семьи (утеряна основная роль)`);
                }
            }
        } catch (err) {
            console.error('❌ Ошибка синхронизации состава семьи:', err);
        }
    });

    // Auto-restore BLACKLIST role when a blacklisted user rejoins the server
    client.on('guildMemberAdd', async (member) => {
        try {
            const [dbMember] = await db.select().from(members).where(eq(members.discordId, member.id));
            if (!dbMember || dbMember.status !== 'blacklisted') return;

            const blacklistRoleId = await getRoleIdByKey('BLACKLIST');
            if (blacklistRoleId) {
                await addRole(member.id, blacklistRoleId);
                console.log(`⛔ Автоматически восстановлена роль BLACKLIST для ${member.user.tag} (${member.id})`);
            }
        } catch (err) {
            console.error('❌ Ошибка восстановления черного списка:', err);
        }
    });

    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (message.guildId) return; // Only process DMs

        try {
            // Activity uploads have priority over interview DM handling.
            try {
                const handled = await handleActivityDmMessage(client, message as any);
                if (handled) return;
            } catch (e) {
                console.error('❌ Ошибка handleActivityDmMessage:', e);
            }

            const debugDm = process.env.DEBUG_DM_MESSAGES === '1';

            // Find active interview for this user
            const apps = await db.select().from(applications)
                .where(and(eq(applications.discordId, message.author.id), inArray(applications.status, ['interview', 'interview_ready'])))
                .orderBy(desc(applications.createdAt))
                .limit(1);

            if (apps.length > 0) {
                const app = apps[0];
                const { randomUUID } = await import('crypto');

                const [msg] = await db.insert(interviewMessages).values({
                    id: randomUUID(),
                    applicationId: app.id,
                    senderType: 'user',
                    senderId: message.author.id,
                    content: message.content,
                }).returning();

                if (debugDm) {
                    console.log(
                        `🧾 [DM] Найдена заявка ${app.id} (status=${app.status}) для discord=${message.author.id}. msg=${msg.id}`
                    );
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
                } catch {
                    if (debugDm) console.log('📡 [DM] IPC bot-event failed');
                }
                
                // Add a checkmark reaction to let user know it was received
                await message.react('✅').catch(() => {});
            } else {
                if (process.env.DEBUG_DM_MESSAGES === '1') {
                    console.log(`🧾 [DM] Заявка для discord=${message.author.id} не найдена (message=${(message.content ?? '').slice(0, 50)})`);
                }
            }
        } catch (err) {
            console.error('❌ Ошибка при обработке ЛС сообщения:', err);
        }
    });

    // Manual activity posts inside activity threads (forum messages)
    client.on('messageCreate', async (message) => {
        try {
            if (message.author.bot) return;
            if (!message.guildId) return;

            const isThread = (message.channel as any)?.isThread?.() === true;
            if (!isThread) return;

            await handleActivityForumMessage(client, message as any);
        } catch (e) {
            console.error('❌ Ошибка handleActivityForumMessage:', e);
        }
    });

    client.on('interactionCreate', async (interaction) => {
        // Guild lock: ignore interactions from unauthorized servers
        const allowed = (client as any)._allowedGuildId;
        // Allow DMs (interaction.guildId is null) so DM buttons can be handled.
        if (allowed && interaction.guildId && interaction.guildId !== allowed) return;

        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
                }
            }
        } else if (interaction.isButton()) {
            if (interaction.customId === 'ticket_apply_btn') {
                await handleTicketApplyBtn(interaction).catch(console.error);
            } else if (interaction.customId === 'afk_start_btn') {
                await handleAfkStartBtn(interaction).catch(console.error);
            } else if (interaction.customId === 'afk_end_btn') {
                await handleAfkEndBtn(interaction).catch(console.error);
            } else if (interaction.customId === 'event_create_btn') {
                await handleEventCreateBtn(interaction).catch(console.error);
            } else if (interaction.customId.startsWith('event_')) {
                await handleEventActionBtn(interaction).catch(console.error);
            } else if (interaction.customId.startsWith('activity_upload_')) {
                await handleActivityUploadBtn(interaction).catch(console.error);
            } else if (interaction.customId.startsWith('interview_ready_')) {
                await handleInterviewReadyBtn(interaction).catch(console.error);
            }
        } else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'ticket_apply_modal') {
                await handleTicketApplyModal(interaction).catch(console.error);
            } else if (interaction.customId === 'afk_start_modal') {
                await handleAfkModalSubmit(interaction).catch(console.error);
            } else if (interaction.customId === 'event_create_modal') {
                await handleEventCreateModalSubmit(interaction).catch(console.error);
            } else if (interaction.customId.startsWith('event_setgroup_modal_')) {
                await handleEventSetGroupModalSubmit(interaction).catch(console.error);
            } else if (interaction.customId.startsWith('event_map_modal_')) {
                await handleEventMapModalSubmit(interaction).catch(console.error);
            }
        }
    });

    console.log('✅ Все события успешно загружены!');
}
