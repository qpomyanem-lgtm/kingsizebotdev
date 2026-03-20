"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const dotenv_1 = require("dotenv");
const commandHandler_1 = require("./handlers/commandHandler");
const eventHandler_1 = require("./handlers/eventHandler");
const undici_1 = require("undici");
(0, dotenv_1.config)({ path: '.env' });
// Limit outgoing HTTP concurrency for stability (prevents connection timeouts during bursts).
// This affects both `fetch` used in our code and Discord.js REST requests (via undici).
(0, undici_1.setGlobalDispatcher)(new undici_1.Agent({
    connections: 100,
    keepAliveTimeout: 30_000,
}));
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMembers,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.DirectMessages,
        discord_js_1.GatewayIntentBits.MessageContent
    ],
    partials: [discord_js_1.Partials.Message, discord_js_1.Partials.Channel, discord_js_1.Partials.Reaction]
});
client.commands = new discord_js_1.Collection();
const index_js_1 = require("../db/index.js");
const schema_js_1 = require("../db/schema.js");
const drizzle_orm_1 = require("drizzle-orm");
async function startBot() {
    console.log('🤖 Запуск Discord Бота...');
    await (0, index_js_1.connectDB)();
    await (0, commandHandler_1.loadCommands)(client);
    await (0, eventHandler_1.loadEvents)(client);
    await client.login(process.env.DISCORD_TOKEN);
    const IPC_BOT_LISTEN_HOST = process.env.IPC_BOT_LISTEN_HOST || '0.0.0.0';
    // Internal IPC Server for Backend -> Bot communication
    const { createServer } = await import('http');
    const ipcServer = createServer(async (req, res) => {
        if (req.method === 'POST' && req.url?.startsWith('/ipc/refresh-event/')) {
            const eventId = req.url.split('/').pop();
            try {
                if (!eventId)
                    throw new Error('No eventId provided');
                const [event] = await index_js_1.db.select().from(schema_js_1.events).where((0, drizzle_orm_1.eq)(schema_js_1.events.id, eventId));
                if (event && event.channelId && event.messageId) {
                    const channel = await client.channels.fetch(event.channelId);
                    if (channel && channel.isTextBased()) {
                        const message = await channel.messages.fetch(event.messageId);
                        const { refreshEventEmbed } = await import('./events/interactions/eventInteractions.js');
                        await refreshEventEmbed(message, eventId);
                    }
                }
                res.writeHead(200);
                res.end('OK');
            }
            catch (err) {
                console.error('❌ [IPC Сервер] Внутренняя ошибка:', err);
                res.writeHead(500);
                res.end('Error');
            }
        }
        else if (req.method === 'POST' && req.url?.startsWith('/ipc/send-interview-dm/')) {
            const appId = req.url.split('/').pop();
            try {
                if (!appId)
                    throw new Error('No appId provided');
                const [app] = await index_js_1.db.select().from(schema_js_1.applications).where((0, drizzle_orm_1.eq)(schema_js_1.applications.id, appId));
                if (app && app.discordId) {
                    const user = await client.users.fetch(app.discordId).catch(() => null);
                    if (user) {
                        const embed = new discord_js_1.EmbedBuilder()
                            .setTitle('📞 Обзвон назначен')
                            .setDescription('Администрация готова провести обзвон по вашей заявке. Нажмите кнопку ниже, когда вы будете готовы к обзвону.')
                            .setColor(discord_js_1.Colors.Blue);
                        const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
                            .setCustomId(`interview_ready_${app.id}`)
                            .setLabel('К обзвону готов')
                            .setStyle(discord_js_1.ButtonStyle.Success));
                        await user.send({ embeds: [embed], components: [row] });
                    }
                }
                res.writeHead(200);
                res.end('OK');
            }
            catch (err) {
                console.error('❌ [IPC Сервер] Ошибка send-interview-dm:', err);
                res.writeHead(500);
                res.end('Error');
            }
        }
        else if (req.method === 'POST' && req.url?.startsWith('/ipc/send-interview-message/')) {
            const appId = req.url.split('/').pop();
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    if (!appId)
                        throw new Error('No appId provided');
                    const [app] = await index_js_1.db.select().from(schema_js_1.applications).where((0, drizzle_orm_1.eq)(schema_js_1.applications.id, appId));
                    if (app && app.discordId) {
                        const user = await client.users.fetch(app.discordId).catch(() => null);
                        if (user) {
                            const embed = new discord_js_1.EmbedBuilder()
                                .setAuthor({ name: data.adminUsername || 'Администратор' })
                                .setDescription(data.content || '')
                                .setColor(discord_js_1.Colors.Blurple)
                                .setTimestamp();
                            await user.send({ embeds: [embed] });
                        }
                    }
                    res.writeHead(200);
                    res.end('OK');
                }
                catch (err) {
                    console.error('❌ [IPC Сервер] Ошибка send-interview-message:', err);
                    res.writeHead(500);
                    res.end('Error');
                }
            });
            return;
        }
        else if (req.method === 'POST' && req.url?.startsWith('/ipc/create-activity-thread/')) {
            const memberId = req.url.split('/').pop();
            try {
                if (!memberId)
                    throw new Error('No memberId provided');
                const { createActivityThreadIpc } = await import('./events/interactions/activityInteractions.js');
                await createActivityThreadIpc(client, memberId);
                res.writeHead(200);
                res.end('OK');
            }
            catch (err) {
                console.error('❌ [IPC Сервер] Ошибка create-activity-thread:', err);
                res.writeHead(500);
                res.end('Error');
            }
        }
        else {
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
