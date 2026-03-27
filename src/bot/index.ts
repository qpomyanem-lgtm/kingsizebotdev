import { Client, GatewayIntentBits, Collection, Partials, EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { config } from 'dotenv';
import { loadCommands } from './handlers/commandHandler';
import { loadEvents } from './handlers/eventHandler';
import { Agent, setGlobalDispatcher } from 'undici';

config({ path: '.env' });

// Limit outgoing HTTP concurrency for stability (prevents connection timeouts during bursts).
// This affects both `fetch` used in our code and Discord.js REST requests (via undici).
setGlobalDispatcher(
    new Agent({
        connections: 100,
        keepAliveTimeout: 30_000,
    })
);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// Extend client with a commands collection
declare module 'discord.js' {
    export interface Client {
        commands: Collection<string, any>;
    }
}
client.commands = new Collection();

import { connectDB, db } from '../db/index.js';
import { events, applications, systemSettings } from '../db/schema.js';
import { eq } from 'drizzle-orm';

async function startBot() {
    console.log('🤖 Запуск Discord Бота...');
    await connectDB();
    await loadCommands(client);
    await loadEvents(client);

    await client.login(process.env.DISCORD_TOKEN);

    const IPC_BOT_LISTEN_HOST = process.env.IPC_BOT_LISTEN_HOST || '0.0.0.0';

    // Internal IPC Server for Backend -> Bot communication
    const { createServer } = await import('http');
    const ipcServer = createServer(async (req, res) => {
        if (req.method === 'POST' && req.url?.startsWith('/ipc/refresh-event/')) {
            const eventId = req.url.split('/').pop();
            try {
                if (!eventId) throw new Error('No eventId provided');
                const [event] = await db.select().from(events).where(eq(events.id, eventId));

                if (event && event.channelId && event.messageId) {
                    const channel = await client.channels.fetch(event.channelId);
                    if (channel && channel.isTextBased()) {
                        const message = await channel.messages.fetch(event.messageId);
                        const { refreshEventEmbed } = await import('./events/interactions/eventInteractions.js');
                        await refreshEventEmbed(message as any, eventId);
                    }
                }
                res.writeHead(200);
                res.end('OK');
            } catch (err) {
                console.error('❌ [IPC Сервер] Внутренняя ошибка:', err);
                res.writeHead(500);
                res.end('Error');
            }
        } else if (req.method === 'POST' && req.url?.startsWith('/ipc/send-interview-dm/')) {
            const appId = req.url.split('/').pop();
            try {
                if (!appId) throw new Error('No appId provided');
                const [app] = await db.select().from(applications).where(eq(applications.id, appId));
                if (app && app.discordId) {
                    const user = await client.users.fetch(app.discordId).catch(() => null);
                    if (user) {
                        const rawPayload = {
                            flags: 32768,
                            allowed_mentions: { parse: [] },
                            components: [
                                {
                                    type: 17,
                                    components: [
                                        {
                                            type: 10,
                                            content: "### <:interview:1486750210964062368> **Обзвон назначен**\n\n***Администрация готова провести обзвон по вашей заявке. Нажмите кнопку ниже, когда вы будете готовы к обзвону.***"
                                        },
                                        {
                                            type: 1,
                                            components: [
                                                {
                                                    type: 2,
                                                    style: 2,
                                                    label: "К ОБЗВОНУ ГОТОВ",
                                                    custom_id: `interview_ready_${app.id}`,
                                                    emoji: {
                                                        id: "1486751177621246144",
                                                        name: "telephone"
                                                    }
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        };

                        await (user as any).send(rawPayload);
                    }
                }
                res.writeHead(200);
                res.end('OK');
            } catch (err) {
                console.error('❌ [IPC Сервер] Ошибка send-interview-dm:', err);
                res.writeHead(500);
                res.end('Error');
            }
        } else if (req.method === 'POST' && req.url?.startsWith('/ipc/send-interview-message/')) {
            const appId = req.url.split('/').pop();
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    if (!appId) throw new Error('No appId provided');
                    const [app] = await db.select().from(applications).where(eq(applications.id, appId));
                    if (app && app.discordId) {
                        const user = await client.users.fetch(app.discordId).catch(() => null);
                        if (user) {
                            const adminName = data.adminUsername || 'Администратор';
                            const msgContent = data.content || '';
                            const rawPayload = {
                                flags: 32768,
                                allowed_mentions: { parse: [] },
                                components: [
                                    {
                                        type: 17,
                                        components: [
                                            {
                                                type: 10,
                                                content: `### <:message:1486754131069894657> **Сообщение от администратора**\n**${adminName}:**\n> ***${msgContent}***\n-# Вы можете ответить администратору, написав сообщение прямо в этот чат.`
                                            }
                                        ]
                                    }
                                ]
                            };

                            await (user as any).send(rawPayload);
                        }
                    }
                    res.writeHead(200);
                    res.end('OK');
                } catch (err) {
                    console.error('❌ [IPC Сервер] Ошибка send-interview-message:', err);
                    res.writeHead(500);
                    res.end('Error');
                }
            });
            return;
        } else if (req.method === 'POST' && req.url?.startsWith('/ipc/send-reject-dm/')) {
            const appId = req.url.split('/').pop();
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    if (!appId) throw new Error('No appId provided');
                    const [app] = await db.select().from(applications).where(eq(applications.id, appId));
                    if (app && app.discordId) {
                        const user = await client.users.fetch(app.discordId).catch(() => null);
                        if (user) {
                            const reason = data.reason || 'Не указана';
                            const rawPayload = {
                                flags: 32768,
                                allowed_mentions: { parse: [] },
                                components: [
                                    {
                                        type: 17,
                                        components: [
                                            {
                                                type: 10,
                                                content: `### <:reject:1486758295510323260> **ЗАЯВКА ОТКЛОНЕНА**\n\n***К сожалению, ваша заявка была отклонена.***\n> ***Причина: *** ${reason}`
                                            }
                                        ]
                                    }
                                ]
                            };
                            await (user as any).send(rawPayload);
                        }
                    }
                    res.writeHead(200);
                    res.end('OK');
                } catch (err) {
                    console.error('❌ [IPC Сервер] Ошибка send-reject-dm:', err);
                    res.writeHead(500);
                    res.end('Error');
                }
            });
            return;
        } else if (req.method === 'POST' && req.url?.startsWith('/ipc/send-accept-dm/')) {
            const appId = req.url.split('/').pop();
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    if (!appId) throw new Error('No appId provided');
                    const [app] = await db.select().from(applications).where(eq(applications.id, appId));
                    if (app && app.discordId) {
                        const user = await client.users.fetch(app.discordId).catch(() => null);
                        if (user) {
                            const newNickname = data.newNickname || 'Не указан';
                            const roleName = data.roleName || 'Новенький';

                            const rawPayload = {
                                flags: 32768,
                                allowed_mentions: { parse: [] },
                                components: [
                                    {
                                        type: 17,
                                        components: [
                                            {
                                                type: 10,
                                                content: `### <:accept:1486758313252098300> **ЗАЯВКА ПРИНЯТА**\n\n***Поздравляем, ${app.discordUsername}!***\n***Добро пожаловать в KINGSIZE LEGENDARY!***\n***Твой никнейм на сервере изменен на: ${newNickname}***\n***Выдана роль: ${roleName}***`
                                            }
                                        ]
                                    }
                                ]
                            };
                            await (user as any).send(rawPayload);
                        }
                    }
                    res.writeHead(200);
                    res.end('OK');
                } catch (err) {
                    console.error('❌ [IPC Сервер] Ошибка send-accept-dm:', err);
                    res.writeHead(500);
                    res.end('Error');
                }
            });
            return;
        } else if (req.method === 'POST' && req.url?.startsWith('/ipc/create-activity-thread/')) {
            const memberId = req.url.split('/').pop();
            try {
                if (!memberId) throw new Error('No memberId provided');
                const { createActivityThreadIpc } = await import('./events/interactions/activityInteractions.js');
                await createActivityThreadIpc(client, memberId);
                res.writeHead(200);
                res.end('OK');
            } catch (err) {
                console.error('❌ [IPC Сервер] Ошибка create-activity-thread:', err);
                res.writeHead(500);
                res.end('Error');
            }
        } else if (req.method === 'POST' && req.url?.startsWith('/ipc/close-activity-thread/')) {
            const memberId = req.url.split('/').pop();
            try {
                if (!memberId) throw new Error('No memberId provided');
                const { closeActivityByMemberId } = await import('./events/interactions/activityInteractions.js');
                await closeActivityByMemberId(client, memberId);
                res.writeHead(200);
                res.end('OK');
            } catch (err) {
                console.error('❌ [IPC Сервер] Ошибка close-activity-thread:', err);
                res.writeHead(500);
                res.end('Error');
            }
        } else if (req.method === 'POST' && req.url?.startsWith('/ipc/update-activity-message/')) {
            const memberId = req.url.split('/').pop();
            try {
                if (!memberId) throw new Error('No memberId provided');
                const { updateActivityThreadMessage } = await import('./events/interactions/activityInteractions.js');
                await updateActivityThreadMessage(client, memberId);
                res.writeHead(200);
                res.end('OK');
            } catch (err) {
                console.error('❌ [IPC Сервер] Ошибка update-activity-message:', err);
                res.writeHead(500);
                res.end('Error');
            }
        } else if (req.method === 'POST' && req.url === '/ipc/refresh-ticket-panel') {
            try {
                const { buildTicketsPanelPayload } = await import('./embeds/panels/ticketsPanel.js');
                const [appOpenRow] = await db.select().from(systemSettings).where(eq(systemSettings.key, 'APPLICATIONS_OPEN'));
                const applicationsOpen = appOpenRow?.value === 'true';
                const payload = buildTicketsPanelPayload(applicationsOpen);

                const [channelRow] = await db.select().from(systemSettings).where(eq(systemSettings.key, 'TICKETS_CHANNEL_ID'));
                const [messageRow] = await db.select().from(systemSettings).where(eq(systemSettings.key, 'TICKETS_MESSAGE_ID'));
                const channelId = channelRow?.value;
                const messageId = messageRow?.value;

                if (channelId) {
                    const channel = await client.channels.fetch(channelId);
                    if (channel && channel.isTextBased()) {
                        let edited = false;
                        if (messageId) {
                            try {
                                const msg = await channel.messages.fetch(messageId);
                                await msg.edit(payload);
                                edited = true;
                            } catch {
                                // Message was deleted — reset and resend
                            }
                        }
                        if (!edited) {
                            const newMsg = await (channel as any).send(payload);
                            // Update message ID in DB
                            if (messageRow) {
                                await db.update(systemSettings).set({ value: newMsg.id }).where(eq(systemSettings.key, 'TICKETS_MESSAGE_ID'));
                            } else {
                                await db.insert(systemSettings).values({ key: 'TICKETS_MESSAGE_ID', value: newMsg.id });
                            }
                        }
                    }
                }
                res.writeHead(200);
                res.end('OK');
            } catch (err) {
                console.error('❌ [IPC Сервер] Ошибка refresh-ticket-panel:', err);
                res.writeHead(500);
                res.end('Error');
            }
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    });

    // Start on port 3001 (backend is 3000)
    ipcServer.listen(3001, IPC_BOT_LISTEN_HOST, () => {
        console.log(`🔌 IPC Сервер бота запущен на http://${IPC_BOT_LISTEN_HOST}:3001`);
    });
}

startBot().catch(console.error);
