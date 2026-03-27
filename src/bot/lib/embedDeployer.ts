import { Client, TextChannel, MessageFlags } from 'discord.js';
import { db } from '../../db';
import { systemSettings } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { refreshAfkEmbed } from './afkEmbed';
import { refreshServerOnlineEmbed } from './serverStatusEmbed';
import { buildTicketsPanelPayload } from '../embeds/panels/ticketsPanel.js';
import { buildEventsPanelComponents } from '../embeds/panels/eventsPanel.js';
import { buildOnlineStatusPanelComponents } from '../embeds/panels/onlineStatusPanel.js';
import { buildActiveAfkRawPayload } from '../embeds/afk/activeAfkEmbedBuilder.js';
import { buildAfkPanelPayload } from '../embeds/panels/afkPanels.js';

let isDeployingEmbeds = false;

interface EmbedConfig {
    channelKey: string;
    messageKey: string;
    buildPayload: () => Promise<{ components: any[], flags?: number, embeds?: any[] }>;
    onCreated?: (client: Client) => Promise<void>;
}

export async function checkAndDeployEmbeds(client: Client) {
    if (isDeployingEmbeds) return;
    isDeployingEmbeds = true;
    const configs: EmbedConfig[] = [
        {
            channelKey: 'TICKETS_CHANNEL_ID',
            messageKey: 'TICKETS_MESSAGE_ID',
            buildPayload: async () => {
                const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, 'APPLICATIONS_OPEN'));
                const applicationsOpen = row?.value === 'true';
                return buildTicketsPanelPayload(applicationsOpen);
            }
        },
        {
            channelKey: 'EVENTS_CHANNEL_ID',
            messageKey: 'EVENTS_MESSAGE_ID',
            buildPayload: async () => {
                return buildEventsPanelComponents();
            }
        },
        {
            channelKey: 'ONLINE_CHANNEL_ID',
            messageKey: 'ONLINE_MESSAGE_ID',
            buildPayload: async () => {
                return buildOnlineStatusPanelComponents();
            },
            onCreated: async (c) => {
                await refreshServerOnlineEmbed(c);
            }
        },
        {
            channelKey: 'AFK_CHANNEL_ID',
            messageKey: 'AFK_MESSAGE_ID',
            buildPayload: async () => {
                // AFK needs 2 consecutive messages — handled as special case in deployEmbed
                return { components: [], flags: MessageFlags.IsComponentsV2 };
            }
        }
    ];

    try {
        const settings = await db.select().from(systemSettings);
        const settingsMap = new Map(settings.map(s => [s.key, s.value]));

        for (const config of configs) {
            const channelId = settingsMap.get(config.channelKey);
            const messageId = settingsMap.get(config.messageKey);

            if (channelId && !messageId) {
                await deployEmbed(client, channelId, config);
            }
        }
    } catch (error) {
        console.error('❌ Ошибка в checkAndDeployEmbeds:', error);
    } finally {
        isDeployingEmbeds = false;
    }
}

async function deployEmbed(client: Client, channelId: string, config: EmbedConfig) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) return;

        let sentMessageId: string | null = null;

        if (config.channelKey === 'AFK_CHANNEL_ID') {
            // AFK: list message first (tracked), then static image panel
            const listPayload = buildActiveAfkRawPayload([]);
            const msg = await (channel as TextChannel).send(listPayload as any);
            sentMessageId = msg.id;

            const imagePanelPayload = buildAfkPanelPayload();
            await (channel as TextChannel).send(imagePanelPayload as any);

            await refreshAfkEmbed(client);
        } else {
            const payload = await config.buildPayload();
            const msg = await (channel as TextChannel).send(payload);
            sentMessageId = msg.id;

            if (config.onCreated) {
                await config.onCreated(client);
            }
        }

        if (sentMessageId) {
            const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, config.messageKey));
            if (existing.length > 0) {
                await db.update(systemSettings).set({ value: sentMessageId }).where(eq(systemSettings.key, config.messageKey));
            } else {
                await db.insert(systemSettings).values({ key: config.messageKey, value: sentMessageId });
            }
            console.log(`✅ Автоматически развернуто сообщение ${config.messageKey} в канале ${channelId}`);
        }

    } catch (error) {
        console.error(`❌ Ошибка развертывания сообщения для ${config.channelKey}:`, error);
    }
}
