import { Client, TextChannel, MessageFlags } from 'discord.js';
import { db } from '../../db';
import { afkEntries, systemSettings } from '../../db/schema';
import { eq, desc, inArray, and, lte } from 'drizzle-orm';
import { buildActiveAfksDescription, buildActiveAfkContainer } from '../embeds/afk/activeAfkEmbedBuilder';

export async function refreshAfkEmbed(client: Client) {
    try {
        const keys = await db.select().from(systemSettings).where(inArray(systemSettings.key, ['AFK_CHANNEL_ID', 'AFK_MESSAGE_ID']));
        const channelId = keys.find(k => k.key === 'AFK_CHANNEL_ID')?.value;
        const messageId = keys.find(k => k.key === 'AFK_MESSAGE_ID')?.value;

        if (!channelId || !messageId) return;

        const channel = await client.channels.fetch(channelId).catch(() => null) as TextChannel | null;
        if (!channel) return;

        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (!message) return;

        const activeAfks = await db.select().from(afkEntries)
            .where(eq(afkEntries.status, 'active'))
            .orderBy(desc(afkEntries.startsAt));

        const description = buildActiveAfksDescription(
            activeAfks.map((a) => ({ discordId: a.discordId, endsAt: a.endsAt, reason: a.reason })),
        );

        const container = buildActiveAfkContainer(description);

        await message.edit({
            embeds: [],
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    } catch (e) {
        console.error('❌ Ошибка обновления сообщения списка AFK:', e);
    }
}

export async function checkExpiredAfks(client: Client) {
    try {
        const now = new Date();
        const expired = await db.select().from(afkEntries)
            .where(
                and(
                    eq(afkEntries.status, 'active'),
                    lte(afkEntries.endsAt, now)
                )
            );

        if (expired.length === 0) return;

        for (const afk of expired) {
            await db.update(afkEntries).set({
                status: 'ended',
                endedByType: 'expired',
                endedAt: now
            }).where(eq(afkEntries.id, afk.id));
        }

        await refreshAfkEmbed(client);
    } catch (e) {
        console.error('❌ Ошибка проверки истекших AFK:', e);
    }
}

