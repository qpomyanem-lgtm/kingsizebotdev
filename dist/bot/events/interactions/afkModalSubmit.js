"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAfkModalSubmit = handleAfkModalSubmit;
const db_1 = require("../../../db");
const schema_1 = require("../../../db/schema");
const afkEmbed_1 = require("../../lib/afkEmbed");
const uuid_1 = require("uuid");
async function handleAfkModalSubmit(interaction) {
    const timeStr = interaction.fields.getTextInputValue('afk_time').trim();
    const reason = interaction.fields.getTextInputValue('afk_reason').trim();
    // Extract HH:MM from anywhere in the string
    const timeRegex = /([01]?\d|2[0-3])[\s:-]*([0-5]\d)/;
    const match = timeStr.match(timeRegex);
    if (!match) {
        return interaction.reply({ content: '❌ Не удалось определить время. Пожалуйста, укажите ЧАСЫ МИНУТЫ (например, "до 14 30").', ephemeral: true });
    }
    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    // Current UTC time
    const nowUtc = new Date();
    // Calculate current MSK time (UTC+3)
    const nowMsk = new Date(nowUtc.getTime() + 3 * 60 * 60 * 1000);
    // Create target time in MSK
    const targetMsk = new Date(nowMsk);
    targetMsk.setUTCHours(hours, minutes, 0, 0);
    // If target time is earlier than current time, it means tomorrow in MSK
    if (targetMsk <= nowMsk) {
        targetMsk.setUTCDate(targetMsk.getUTCDate() + 1);
    }
    // Convert target MSK back to UTC for DB storage
    const targetUtc = new Date(targetMsk.getTime() - 3 * 60 * 60 * 1000);
    await db_1.db.insert(schema_1.afkEntries).values({
        id: (0, uuid_1.v4)(),
        discordId: interaction.user.id,
        discordUsername: interaction.user.username,
        discordAvatarUrl: interaction.user.avatarURL() || null,
        reason,
        endsAt: targetUtc,
        status: 'active'
    });
    const timeString = new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
        timeZone: 'Europe/Moscow'
    }).format(targetMsk);
    await interaction.reply({ content: `✅ АФК успешно начат до **${timeString} (МСК)**.`, ephemeral: true });
    await (0, afkEmbed_1.refreshAfkEmbed)(interaction.client);
}
