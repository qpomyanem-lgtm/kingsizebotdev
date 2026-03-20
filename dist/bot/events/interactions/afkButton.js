"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAfkStartBtn = handleAfkStartBtn;
exports.handleAfkEndBtn = handleAfkEndBtn;
const discord_js_1 = require("discord.js");
const db_1 = require("../../../db");
const schema_1 = require("../../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const afkEmbed_1 = require("../../lib/afkEmbed");
const interactionResponses_1 = require("../../lib/interactionResponses");
async function handleAfkStartBtn(interaction) {
    // Check if user has at least one configured role
    const configuredRoles = await db_1.db.select().from(schema_1.roleSettings);
    const validRoleIds = configuredRoles.map(r => r.discordRoleId).filter(Boolean);
    // member might be partial, ensure roles can be checked
    const member = interaction.guild?.members.cache.get(interaction.user.id) || await interaction.guild?.members.fetch(interaction.user.id);
    if (!member) {
        return interaction.reply({ content: 'Ошибка получения данных пользователя.', ephemeral: true });
    }
    const hasAnyConfiguredRole = validRoleIds.some(id => member.roles.cache.has(id));
    if (!hasAnyConfiguredRole) {
        return interaction.reply({ content: 'У вас нет доступа к системе АФК (требуется настроенная роль).', ephemeral: true });
    }
    // Check if user already has an active AFK
    const existing = await db_1.db.select().from(schema_1.afkEntries)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.afkEntries.discordId, interaction.user.id), (0, drizzle_orm_1.eq)(schema_1.afkEntries.status, 'active')));
    if (existing.length > 0) {
        return interaction.reply({ content: 'У вас уже есть активный АФК. Сначала завершите его.', ephemeral: true });
    }
    const modal = new discord_js_1.ModalBuilder()
        .setCustomId('afk_start_modal')
        .setTitle('Начать АФК');
    const timeField = new discord_js_1.TextInputBuilder()
        .setCustomId('afk_time')
        .setLabel('Окончание (добавьте ЧЧ:ММ по МСК)')
        .setPlaceholder('Например: Завтра до 14:30')
        .setStyle(discord_js_1.TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(true);
    const reasonField = new discord_js_1.TextInputBuilder()
        .setCustomId('afk_reason')
        .setLabel('Причина')
        .setStyle(discord_js_1.TextInputStyle.Paragraph)
        .setRequired(true);
    modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(timeField), new discord_js_1.ActionRowBuilder().addComponents(reasonField));
    await (0, interactionResponses_1.showModalViaInteractionCallback)(interaction, modal);
}
async function handleAfkEndBtn(interaction) {
    const existing = await db_1.db.select().from(schema_1.afkEntries)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.afkEntries.discordId, interaction.user.id), (0, drizzle_orm_1.eq)(schema_1.afkEntries.status, 'active')));
    if (existing.length === 0) {
        return interaction.reply({ content: 'У вас нет активного АФК.', ephemeral: true });
    }
    await db_1.db.update(schema_1.afkEntries).set({
        status: 'ended',
        endedByType: 'self',
        endedAt: new Date()
    }).where((0, drizzle_orm_1.eq)(schema_1.afkEntries.id, existing[0].id));
    await interaction.reply({ content: '✅ Ваш АФК успешно завершён.', ephemeral: true });
    await (0, afkEmbed_1.refreshAfkEmbed)(interaction.client);
}
