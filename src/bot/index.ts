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
import { events, applications } from '../db/schema.js';
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
                        const embed = new EmbedBuilder()
                            .setTitle('📞 Обзвон назначен')
                            .setDescription('Администрация готова провести обзвон по вашей заявке. Нажмите кнопку ниже, когда вы будете готовы к обзвону.')
                            .setColor(Colors.Blue);
                        
                        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`interview_ready_${app.id}`)
                                .setLabel('К обзвону готов')
                                .setStyle(ButtonStyle.Success)
                        );
                        
                        await user.send({ embeds: [embed], components: [row] });
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
                            const embed = new EmbedBuilder()
                                .setAuthor({ name: data.adminUsername || 'Администратор' })
                                .setDescription(data.content || '')
                                .setColor(Colors.Blurple)
                                .setTimestamp();
                            
                            await user.send({ embeds: [embed] });
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
