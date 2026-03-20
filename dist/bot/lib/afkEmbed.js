"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshAfkEmbed = refreshAfkEmbed;
exports.checkExpiredAfks = checkExpiredAfks;
const discord_js_1 = require("discord.js");
const db_1 = require("../../db");
const schema_1 = require("../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const activeAfkEmbedBuilder_1 = require("../embeds/afk/activeAfkEmbedBuilder");
async function refreshAfkEmbed(client) {
    try {
        const keys = await db_1.db.select().from(schema_1.systemSettings).where((0, drizzle_orm_1.inArray)(schema_1.systemSettings.key, ['AFK_CHANNEL_ID', 'AFK_MESSAGE_ID']));
        const channelId = keys.find(k => k.key === 'AFK_CHANNEL_ID')?.value;
        const messageId = keys.find(k => k.key === 'AFK_MESSAGE_ID')?.value;
        if (!channelId || !messageId)
            return;
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel)
            return;
        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (!message)
            return;
        const activeAfks = await db_1.db.select().from(schema_1.afkEntries)
            .where((0, drizzle_orm_1.eq)(schema_1.afkEntries.status, 'active'))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.afkEntries.startsAt));
        const description = (0, activeAfkEmbedBuilder_1.buildActiveAfksDescription)(activeAfks.map((a) => ({ discordId: a.discordId, endsAt: a.endsAt, reason: a.reason })));
        const container = (0, activeAfkEmbedBuilder_1.buildActiveAfkContainer)(description);
        await message.edit({
            embeds: [],
            components: [container],
            flags: discord_js_1.MessageFlags.IsComponentsV2
        });
    }
    catch (e) {
        console.error('❌ Ошибка обновления сообщения списка AFK:', e);
    }
}
async function checkExpiredAfks(client) {
    try {
        const now = new Date();
        const expired = await db_1.db.select().from(schema_1.afkEntries)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.afkEntries.status, 'active'), (0, drizzle_orm_1.lte)(schema_1.afkEntries.endsAt, now)));
        if (expired.length === 0)
            return;
        for (const afk of expired) {
            await db_1.db.update(schema_1.afkEntries).set({
                status: 'ended',
                endedByType: 'expired',
                endedAt: now
            }).where((0, drizzle_orm_1.eq)(schema_1.afkEntries.id, afk.id));
        }
        await refreshAfkEmbed(client);
    }
    catch (e) {
        console.error('❌ Ошибка проверки истекших AFK:', e);
    }
}
