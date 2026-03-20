"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAndDeployEmbeds = checkAndDeployEmbeds;
const discord_js_1 = require("discord.js");
const db_1 = require("../../db");
const schema_1 = require("../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const afkEmbed_1 = require("./afkEmbed");
const serverStatusEmbed_1 = require("./serverStatusEmbed");
const ticketsPanel_js_1 = require("../embeds/panels/ticketsPanel.js");
const eventsPanel_js_1 = require("../embeds/panels/eventsPanel.js");
const onlineStatusPanel_js_1 = require("../embeds/panels/onlineStatusPanel.js");
const afkPanels_js_1 = require("../embeds/panels/afkPanels.js");
async function checkAndDeployEmbeds(client) {
    const configs = [
        {
            channelKey: 'TICKETS_CHANNEL_ID',
            messageKey: 'TICKETS_MESSAGE_ID',
            buildComponents: () => {
                return (0, ticketsPanel_js_1.buildTicketsPanelComponents)();
            }
        },
        {
            channelKey: 'EVENTS_CHANNEL_ID',
            messageKey: 'EVENTS_MESSAGE_ID',
            buildComponents: () => {
                return (0, eventsPanel_js_1.buildEventsPanelComponents)();
            }
        },
        {
            channelKey: 'ONLINE_CHANNEL_ID',
            messageKey: 'ONLINE_MESSAGE_ID',
            buildComponents: () => {
                return (0, onlineStatusPanel_js_1.buildOnlineStatusPanelComponents)();
            },
            onCreated: async (c) => {
                await (0, serverStatusEmbed_1.refreshServerOnlineEmbed)(c);
            }
        },
        {
            channelKey: 'AFK_CHANNEL_ID',
            messageKey: 'AFK_MESSAGE_ID',
            buildComponents: () => {
                // AFK needs 2 consecutive messages — handled as special case in deployEmbed
                return { components: [], flags: discord_js_1.MessageFlags.IsComponentsV2 };
            }
        }
    ];
    try {
        const settings = await db_1.db.select().from(schema_1.systemSettings);
        const settingsMap = new Map(settings.map(s => [s.key, s.value]));
        for (const config of configs) {
            const channelId = settingsMap.get(config.channelKey);
            const messageId = settingsMap.get(config.messageKey);
            if (channelId && !messageId) {
                await deployEmbed(client, channelId, config);
            }
        }
    }
    catch (error) {
        console.error('❌ Ошибка в checkAndDeployEmbeds:', error);
    }
}
async function deployEmbed(client, channelId, config) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased())
            return;
        let sentMessageId = null;
        if (config.channelKey === 'AFK_CHANNEL_ID') {
            // AFK Special Case: 2 Messages
            const panel1 = (0, afkPanels_js_1.buildAfkStartPanelComponents)();
            await channel.send(panel1);
            const panel2 = (0, afkPanels_js_1.buildAfkEndPanelComponents)();
            const msg2 = await channel.send(panel2);
            sentMessageId = msg2.id;
            await (0, afkEmbed_1.refreshAfkEmbed)(client);
        }
        else {
            const payload = config.buildComponents();
            const msg = await channel.send(payload);
            sentMessageId = msg.id;
            if (config.onCreated) {
                await config.onCreated(client);
            }
        }
        if (sentMessageId) {
            const existing = await db_1.db.select().from(schema_1.systemSettings).where((0, drizzle_orm_1.eq)(schema_1.systemSettings.key, config.messageKey));
            if (existing.length > 0) {
                await db_1.db.update(schema_1.systemSettings).set({ value: sentMessageId }).where((0, drizzle_orm_1.eq)(schema_1.systemSettings.key, config.messageKey));
            }
            else {
                await db_1.db.insert(schema_1.systemSettings).values({ key: config.messageKey, value: sentMessageId });
            }
            console.log(`✅ Автоматически развернуто сообщение ${config.messageKey} в канале ${channelId}`);
        }
    }
    catch (error) {
        console.error(`❌ Ошибка развертывания сообщения для ${config.channelKey}:`, error);
    }
}
