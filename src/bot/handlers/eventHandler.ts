import { Client, Events, AuditLogEvent } from 'discord.js';
import { randomUUID } from 'crypto';
import { getAdminRoleIds, getAllAccessRoleIds } from '../../backend/lib/discordRoles';
import { addRole, getRoleIdByPurpose } from '../../backend/lib/discordMemberActions.js';
import { db } from '../../db';
import { users, sessions, members, events, eventParticipants, applications, interviewMessages, activityThreads, activityScreenshots, roles } from '../../db/schema';
import { count, eq, and, lte, ne, inArray, desc } from 'drizzle-orm';
import { handleTicketApplyBtn } from '../events/interactions/ticketButton.js';
import { handleTicketApplyModal } from '../events/interactions/ticketModalSubmit.js';
import { handleAfkStartBtn, handleAfkEndBtn } from '../events/interactions/afkButton.js';
import { handleAfkModalSubmit } from '../events/interactions/afkModalSubmit.js';
import { checkExpiredAfks } from '../lib/afkEmbed.js';
import { refreshServerOnlineEmbed } from '../lib/serverStatusEmbed.js';
import { handleEventCreateBtn, handleEventCreateModalSubmit, handleEventActionBtn, handleEventRemoveModalSubmit, handleEventSetGroupModalSubmit, handleEventMapModalSubmit, refreshEventEmbed } from '../events/interactions/eventInteractions.js';
import { handleInterviewReadyBtn } from '../events/interactions/interviewReady.js';
import { createActivityThreadIpc, handleActivityForumMessage, handleActivityUploadBtn, handleActivityModalSubmit, handleActivityReaction, rebuildActivityFromForum, closeActivityThread, isActivityExpired } from '../events/interactions/activityInteractions.js';
import { checkAndDeployEmbeds } from '../lib/embedDeployer.js';
import { refreshApplicationsStatsEmbed } from '../lib/applicationsStatsRefresh.js';
import { systemSettings } from '../../db/schema';

const IPC_BACKEND_BASE_URL = process.env.IPC_BACKEND_BASE_URL || 'http://localhost:3000';
const IPC_BOT_BASE_URL = process.env.IPC_BOT_BASE_URL || 'http://localhost:3001';

export async function loadEvents(client: Client) {
    console.log('🛠  Загрузка событий...');

    const bgJobsDisabled = process.env.BOT_DISABLE_BG_JOBS === '1';

    client.once(Events.ClientReady, async (c) => {
        console.log(`✅ Успешно! Бот авторизован как ${c.user.tag}`);

        // Prevent heavy background jobs from stacking up and delaying interaction handlers.
        let isReconcilingActivityForums = false;
        let isAutoRefreshingActiveEvents = false;
        const shouldSkipBgJobs = () => Date.now() < ((globalThis as any).__discordBgSkipUntil ?? 0);

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
            if (bgJobsDisabled) return;
            if (shouldSkipBgJobs()) return;
            checkExpiredAfks(c).catch(console.error);
        }, 60_000);

        // Start Applications Stats refresh interval (every 30 seconds)
        setInterval(() => {
            if (bgJobsDisabled) return;
            if (shouldSkipBgJobs()) return;
            refreshApplicationsStatsEmbed(c).catch(console.error);
        }, 30_000);

        // Start Majestic API Online check interval (every 30 seconds)
        setInterval(() => {
            if (bgJobsDisabled) return;
            if (shouldSkipBgJobs()) return;
            refreshServerOnlineEmbed(c).catch(console.error);
        }, 30_000);

        // Run embed deployer immediately and then every 15 seconds
        if (!bgJobsDisabled && !shouldSkipBgJobs()) {
            checkAndDeployEmbeds(c).catch(console.error);
        }
        setInterval(() => {
            if (bgJobsDisabled) return;
            if (shouldSkipBgJobs()) return;
            checkAndDeployEmbeds(c).catch(console.error);
        }, 15_000);

        // Reconcile activity forum threads with DB state
        // - if threads were deleted manually in Discord, they should disappear from the site
        // - but never delete everything when Discord fetch returns an empty list
        setInterval(async () => {
            if (bgJobsDisabled) return;
            if (shouldSkipBgJobs()) return;
            if (isReconcilingActivityForums) return;
            isReconcilingActivityForums = true;
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
            } finally {
                isReconcilingActivityForums = false;
            }
        }, 300_000);

        // Auto-refresh event embeds when they transition to InProgress (every 30s)
        setInterval(async () => {
            if (bgJobsDisabled) return;
            if (shouldSkipBgJobs()) return;
            if (isAutoRefreshingActiveEvents) return;
            isAutoRefreshingActiveEvents = true;
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
            } finally {
                isAutoRefreshingActiveEvents = false;
            }
        }, 30_000);
    });

    // Detect when managed embeds are deleted from Discord, and reset their MESSAGE_ID so they redeploy
    client.on('messageDelete', async (message) => {
        try {
            // `messageDelete` can be received as partial without `author`,
            // so we must also check `authorId`.
            const botUserId = client.user?.id;
            const messageAuthorId = (message as any).authorId as string | undefined;
            const isOurBotMessage = Boolean(message.author?.bot) || (botUserId ? messageAuthorId === botUserId : false);
            if (!isOurBotMessage) return;
            
            const managedKeys = ['TICKETS_MESSAGE_ID', 'AFK_MESSAGE_ID', 'EVENTS_MESSAGE_ID', 'ONLINE_MESSAGE_ID', 'APPLICATIONS_STATS_MESSAGE_ID'];
            
            // Look up if this deleted message was one of our system settings
            const settings = await db.select().from(systemSettings);
            const foundSetting = settings.find(s => s.value === message.id && managedKeys.includes(s.key));
            
            if (foundSetting) {
                console.log(`🗑️ Системное сообщение удалено (${foundSetting.key}). Сброс конфигурации для авто-переотправки.`);
                await db.update(systemSettings)
                    .set({ value: null })
                    .where(eq(systemSettings.key, foundSetting.key));
                
                // Immediately trigger logic
                if (!bgJobsDisabled) {
                    checkAndDeployEmbeds(client).catch(console.error);
                }
            }
        } catch (error) {
            console.error('❌ Ошибка в обработчике messageDelete:', error);
        }
    });

    // Auto-terminate sessions when access role is removed
    client.on('guildMemberUpdate', async (oldMember, newMember) => {
        // NOTE: oldMember.roles.cache may be empty when the member was not previously cached (partial).
        // Therefore we always check the newMember's CURRENT roles against the access role list,
        // rather than comparing old vs new. If the user has no access roles but has active sessions,
        // those sessions are revoked.
        const newRoles = new Set(newMember.roles.cache.map(r => r.id));
        const oldRoles = oldMember.partial ? null : new Set(oldMember.roles.cache.map(r => r.id));

        // --- 1. Auto-terminate sessions when any access role is removed ---
        try {
            const botOwnerId = process.env.BOT_OWNER_ID;
            if (!botOwnerId || newMember.id !== botOwnerId.trim()) {
                const allAccessRoleIds = await getAllAccessRoleIds();
                if (allAccessRoleIds.length > 0) {
                    const stillHasAccess = allAccessRoleIds.some(id => newRoles.has(id));

                    // Optimization: if oldMember is not partial, skip DB check when no access role was removed
                    const hadAccessBefore = oldRoles !== null ? allAccessRoleIds.some(id => oldRoles.has(id)) : true;

                    if (!stillHasAccess && hadAccessBefore) {
                        const [user] = await db.select().from(users).where(eq(users.discordId, newMember.id));
                        if (user) {
                            await db.delete(sessions).where(eq(sessions.userId, user.id));
                            console.log(`🔒 Отозваны все сессии для ${newMember.user.tag} (${newMember.id}) — нет ролей доступа`);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('❌ Ошибка отзыва сессий при изменении ролей:', err);
        }

        // --- 2. Auto-sync roster when KINGSIZE, NEWKINGSIZE, or TIER roles are changed ---
        try {
            const systemRoles = await db.select().from(roles);
            const mainRoleRow = systemRoles.find(r => r.type === 'system' && r.systemType === 'main');
            const newRoleRow = systemRoles.find(r => r.type === 'system' && r.systemType === 'new');
            const tierRoleRows = systemRoles
                .filter(r => r.type === 'system' && r.systemType === 'tier')
                .sort((a, b) => a.priority - b.priority);

            const kingsizeDiscordId = mainRoleRow?.discordRoleId?.trim() || null;
            const newKingsizeDiscordId = newRoleRow?.discordRoleId?.trim() || null;

            const hasKingsizeNow = kingsizeDiscordId ? newRoles.has(kingsizeDiscordId) : false;
            const hasNewKingsizeNow = newKingsizeDiscordId ? newRoles.has(newKingsizeDiscordId) : false;
            // When oldMember is partial, we don't know what roles they had before.
            // Use false as fallback so role-gain actions (thread creation) still trigger,
            // but guard role-loss actions separately.
            const isPartial = oldRoles === null;
            const hasKingsizeBefore = kingsizeDiscordId ? (oldRoles?.has(kingsizeDiscordId) ?? false) : false;
            const hasNewKingsizeBefore = newKingsizeDiscordId ? (oldRoles?.has(newKingsizeDiscordId) ?? false) : false;

            // Close activity thread when member gets Main role OR loses New role
            const gainedMain = hasKingsizeNow && !hasKingsizeBefore && !isPartial;
            const lostNew = !hasNewKingsizeNow && hasNewKingsizeBefore && !isPartial;
            if (gainedMain || lostNew) {
                try {
                    const [existingMember] = await db.select().from(members).where(eq(members.discordId, newMember.id));
                    if (existingMember) {
                        const [thread] = await db.select().from(activityThreads).where(and(eq(activityThreads.memberId, existingMember.id), eq(activityThreads.status, 'active'))).limit(1);
                        if (thread) {
                            await closeActivityThread(client, thread);
                            console.log(`✅ Активность закрыта для ${newMember.user.tag} — ${gainedMain ? 'получена роль Main' : 'снята роль New'}`);
                        }
                    }
                } catch (e) {
                    console.error('❌ Ошибка закрытия активности:', e);
                }
            }

            // Determine who assigned the New role (from audit log)
            let roleAssignerDiscordId: string | null = null;

            if (hasNewKingsizeNow && !hasNewKingsizeBefore) {
                try {
                    const auditLogs = await newMember.guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 10 }).catch(() => null);
                    if (auditLogs) {
                        // Find the most recent role update for this user within 30 seconds
                        for (const entry of auditLogs.entries.values()) {
                            if (entry.targetId !== newMember.id) continue;
                            if (Date.now() - entry.createdTimestamp > 30_000) continue;
                            // Check if the New role was added in this entry
                            const addedRoles = entry.changes?.find(c => c.key === '$add');
                            const rolesAdded = (addedRoles?.new as any[]) ?? [];
                            const newRoleAdded = rolesAdded.some((r: any) => r.id === newKingsizeDiscordId);
                            if (newRoleAdded && entry.executorId && entry.executorId !== client.user?.id) {
                                roleAssignerDiscordId = entry.executorId;
                                break;
                            }
                        }
                    }
                } catch { /* ignore audit log errors */ }
            }

            // Dynamic tier detection: find the highest-priority tier role the user has
            let currentTierRoleId: string | null = null;
            for (const tierRole of tierRoleRows) {
                const discordId = tierRole.discordRoleId?.trim();
                if (discordId && newRoles.has(discordId)) {
                    currentTierRoleId = tierRole.id;
                    break; // tierRoleRows sorted by priority asc, first match = highest tier
                }
            }

            const currentRoleId = hasKingsizeNow ? (mainRoleRow?.id || null) : (newRoleRow?.id || null);

            const [existing] = await db.select().from(members).where(eq(members.discordId, newMember.id));

            if (hasKingsizeNow || hasNewKingsizeNow) {
                if (!existing) {
                    const newMemberId = randomUUID();
                    await db.insert(members).values({
                        id: newMemberId,
                        discordId: newMember.id,
                        discordUsername: newMember.user.username,
                        discordAvatarUrl: newMember.user.displayAvatarURL(),
                        gameNickname: newMember.nickname || newMember.user.globalName || newMember.user.username,
                        gameStaticId: '0000',
                        roleId: currentRoleId,
                        tierRoleId: currentTierRoleId,
                        status: 'active'
                    });
                    console.log(`📋 Автоматически добавлен ${newMember.user.tag} в состав семьи`);
                } else {
                    const needsStatusUpdate = existing.status !== 'active';
                    const needsRoleUpdate = existing.roleId !== currentRoleId;
                    const needsTierUpdate = existing.tierRoleId !== currentTierRoleId;
                    
                    if (needsStatusUpdate || needsRoleUpdate || needsTierUpdate) {
                        await db.update(members)
                            .set({ 
                                status: 'active',
                                roleId: currentRoleId,
                                tierRoleId: currentTierRoleId,
                                discordUsername: newMember.user.username,
                                discordAvatarUrl: newMember.user.displayAvatarURL()
                            })
                            .where(eq(members.discordId, newMember.id));
                        console.log(`🔄 Автоматически обновлен ${newMember.user.tag} в составе семьи`);

                        if (needsTierUpdate) {
                            try {
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
                                        .set({ tierRoleId: currentTierRoleId })
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

                // Create activity thread when New role was just assigned (after member is ensured in DB)
                if (hasNewKingsizeNow && !hasNewKingsizeBefore) {
                    try {
                        const memberId = existing?.id ?? (await db.select().from(members).where(eq(members.discordId, newMember.id)).limit(1))[0]?.id;
                        if (memberId) {
                            const [activeThread] = await db.select().from(activityThreads).where(and(eq(activityThreads.memberId, memberId), eq(activityThreads.status, 'active'))).limit(1);
                            if (activeThread) {
                                // Close stale thread before creating a new one
                                await closeActivityThread(client, activeThread);
                                console.log(`🔄 Закрыт предыдущий тред активности для ${newMember.user.tag}`);
                            }
                            await createActivityThreadIpc(client, memberId, roleAssignerDiscordId ?? undefined);
                            console.log(`📋 Создание треда активности для ${newMember.user.tag} — получена роль New (принял: ${roleAssignerDiscordId ?? 'неизвестно'})`);
                        }
                    } catch (e) {
                        console.error('❌ Ошибка создания активности при выдаче New:', e);
                    }
                }
            } else if (!isPartial) {
                // User DOES NOT have KINGSIZE or NEWKINGSIZE (and we know their old roles).
                // If they exist and are active, we must "kick" them.
                if (existing && existing.status === 'active') {
                    await db.update(members)
                        .set({ status: 'kicked', tierRoleId: null, kickReason: 'Утеряна роль семьи', kickedAt: new Date() })
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

            const blacklistRoleId = await getRoleIdByPurpose('blacklist');
            if (blacklistRoleId) {
                await addRole(member.id, blacklistRoleId);
                console.log(`⛔ Автоматически восстановлена роль BLACKLIST для ${member.user.tag} (${member.id})`);
            }
        } catch (err) {
            console.error('❌ Ошибка восстановления черного списка:', err);
        }
    });

    // Auto-track kicks: when a member with KINGSIZE/NEWKINGSIZE leaves or is kicked
    client.on('guildMemberRemove', async (member) => {
        try {
            const [dbMember] = await db.select().from(members).where(eq(members.discordId, member.id));
            if (!dbMember || dbMember.status !== 'active') return;

            // Check if this removal was caused by a ban — if so, let guildBanAdd handle it
            try {
                const banAuditLogs = await member.guild.fetchAuditLogs({
                    type: AuditLogEvent.MemberBanAdd,
                    limit: 5,
                });
                const banLog = banAuditLogs.entries.find(
                    (entry) => entry.target?.id === member.id && (Date.now() - entry.createdTimestamp) < 15000
                );
                if (banLog) {
                    console.log(`ℹ️ ${member.user.tag} удалён из-за бана — обработка передана guildBanAdd`);
                    return;
                }
            } catch (e) {
                // If we can't check audit logs, proceed with kick handling
            }

            // Try to fetch audit log to determine if this was a kick and get reason
            let kickReason: string | null = 'Покинул сервер';
            try {
                const auditLogs = await member.guild.fetchAuditLogs({
                    type: AuditLogEvent.MemberKick,
                    limit: 5,
                });
                const kickLog = auditLogs.entries.find(
                    (entry) => entry.target?.id === member.id && (Date.now() - entry.createdTimestamp) < 10000
                );
                if (kickLog) {
                    kickReason = kickLog.reason || 'Кикнут (причина не указана)';
                }
            } catch (e) {
                console.error('⚠️ Не удалось получить аудит-лог для кика:', e);
            }

            await db.update(members)
                .set({ status: 'kicked', tierRoleId: null, kickReason, kickedAt: new Date() })
                .where(eq(members.id, dbMember.id));

            // Update linked application status
            if (dbMember.applicationId) {
                await db.update(applications).set({ status: 'excluded' }).where(eq(applications.id, dbMember.applicationId));
            }

            console.log(`👢 Участник ${member.user.tag} покинул/кикнут с сервера — исключен из состава (причина: ${kickReason})`);
        } catch (err) {
            console.error('❌ Ошибка обработки guildMemberRemove:', err);
        }
    });

    // Auto-track bans: when a member is banned on the server
    client.on('guildBanAdd', async (ban) => {
        try {
            const [dbMember] = await db.select().from(members).where(eq(members.discordId, ban.user.id));
            if (!dbMember) return;
            if (dbMember.status === 'blacklisted') return; // Already blacklisted

            // Fetch full ban info for reason
            let banReason: string | null = 'Заблокирован (причина не указана)';
            try {
                const fullBan = await ban.guild.bans.fetch(ban.user.id);
                if (fullBan.reason) banReason = fullBan.reason;
            } catch (e) {
                console.error('⚠️ Не удалось получить информацию о бане:', e);
            }

            await db.update(members)
                .set({ status: 'blacklisted', tierRoleId: null, kickReason: banReason, kickedAt: new Date() })
                .where(eq(members.id, dbMember.id));

            // Update linked application status
            if (dbMember.applicationId) {
                await db.update(applications).set({ status: 'blacklist' }).where(eq(applications.id, dbMember.applicationId));
            }

            console.log(`⛔ Участник ${ban.user.tag} забанен на сервере — добавлен в ЧС (причина: ${banReason})`);
        } catch (err) {
            console.error('❌ Ошибка обработки guildBanAdd:', err);
        }
    });

    // Handle reactions on activity thread messages (✅ approve, ❌ reject)
    client.on('messageReactionAdd', async (reaction, user) => {
        try {
            if (user.bot) return;
            // Fetch partial reaction/message if needed
            if (reaction.partial) {
                try { await reaction.fetch(); } catch { return; }
            }
            if (reaction.message.partial) {
                try { await reaction.message.fetch(); } catch { return; }
            }
            await handleActivityReaction(client, reaction as any, user as any);
        } catch (e) {
            console.error('❌ Ошибка handleActivityReaction:', e);
        }
    });

    // Check for expired activity threads (7-day limit)
    setInterval(async () => {
        if (bgJobsDisabled) return;
        try {
            const activeThreads = await db.select().from(activityThreads).where(eq(activityThreads.status, 'active'));
            for (const thread of activeThreads) {
                if (isActivityExpired(thread.createdAt)) {
                    await closeActivityThread(client, thread);
                    console.log(`⏰ Активность закрыта по истечении 7 дней: ${thread.threadName}`);
                }
            }
        } catch (e) {
            console.error('❌ Ошибка проверки истечения активности:', e);
        }
    }, 60_000);

    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (message.guildId) return; // Only process DMs

        try {

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

    // Cache raw modal data because discord.js doesn't expose resolved attachments on ModalSubmitInteraction
    const activityModalRawCache = new Map<string, { resolved: any; components: any[] }>();
    client.on('raw', (packet: any) => {
        if (packet.t === 'INTERACTION_CREATE' && packet.d?.type === 5 && packet.d?.data?.custom_id?.startsWith('activity_modal_')) {
            const data = packet.d.data;
            activityModalRawCache.set(data.custom_id, {
                resolved: data.resolved ?? {},
                components: data.components ?? [],
            });
            // Auto-clean after 60s
            setTimeout(() => activityModalRawCache.delete(data.custom_id), 60_000);
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
            } else if (interaction.customId.startsWith('event_remove_modal_')) {
                await handleEventRemoveModalSubmit(interaction).catch(console.error);
            } else if (interaction.customId.startsWith('activity_modal_')) {
                const rawData = activityModalRawCache.get(interaction.customId);
                activityModalRawCache.delete(interaction.customId);
                await handleActivityModalSubmit(client, interaction, rawData).catch(console.error);
            }
        }
    });

    console.log('✅ Все события успешно загружены!');
}
