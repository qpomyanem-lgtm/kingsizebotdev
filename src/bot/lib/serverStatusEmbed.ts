import { Client, TextChannel, MessageFlags } from 'discord.js';
import { db } from '../../db';
import { systemSettings } from '../../db/schema';
import { inArray } from 'drizzle-orm';
import { buildOnlineStatusContainer } from '../embeds/online/onlineStatusEmbedBuilder';

export async function refreshServerOnlineEmbed(client: Client) {
    try {
        const keys = await db.select().from(systemSettings).where(inArray(systemSettings.key, ['ONLINE_CHANNEL_ID', 'ONLINE_MESSAGE_ID']));
        const channelId = keys.find(k => k.key === 'ONLINE_CHANNEL_ID')?.value;
        const messageId = keys.find(k => k.key === 'ONLINE_MESSAGE_ID')?.value;

        if (!channelId || !messageId) return;

        const channel = await client.channels.fetch(channelId).catch(() => null) as TextChannel | null;
        if (!channel) return;

        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (!message) return;

        let description = '';
        let accentColor = 0xE02424;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch('https://api.majestic-files.net/meta/servers?region=ru', {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Majestic-Status-Bot/1.0',
                    'Accept': 'application/json'
                }
            });
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const data = await response.json();
                
                function findServerById(obj: any, id: string): any {
                    if (!obj || typeof obj !== 'object') return null;
                    if (Array.isArray(obj)) {
                        for (const item of obj) {
                            const found = findServerById(item, id);
                            if (found) return found;
                        }
                    } else {
                        if (obj.id === id && obj.name) return obj;
                        for (const key of Object.keys(obj)) {
                            const found = findServerById(obj[key], id);
                            if (found) return found;
                        }
                    }
                    return null;
                }

                let serverData = findServerById(data, 'ru15');

                if (serverData) {
                    const isOnline = serverData.status ? '🟢 Онлайн' : '🔴 Офлайн';
                    const players = serverData.players ?? 0;
                    const queue = serverData.queuedPlayers ?? 0;
                    
                    description = `**Статус:** ${isOnline}\n`;
                    description += `**Игроков:** ${players}\n`;
                    if (queue > 0) {
                        description += `**В очереди:** ${queue}\n`;
                    }
                    
                    accentColor = serverData.status ? 0x31C48D : 0xE02424;
                } else {
                    description = '⚠️ Сервер ru15 (Phoenix) не найден в списке.';
                    accentColor = 0xE02424;
                }
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

        } catch (apiError) {
            console.error('❌ Ошибка получения данных Majestic API:', apiError instanceof Error ? apiError.message : String(apiError));
            description = '⚠️ Сервер временно недоступен или API не отвечает.';
            accentColor = 0xE02424;
        }

        const container = buildOnlineStatusContainer(description, accentColor);

        await message.edit({
            embeds: [],
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    } catch (e) {
        console.error('❌ Ошибка обновления сообщения со статусом сервера:', e);
    }
}

