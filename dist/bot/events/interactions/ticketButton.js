"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleTicketApplyBtn = handleTicketApplyBtn;
const discord_js_1 = require("discord.js");
const db_1 = require("../../../db");
const schema_1 = require("../../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
/**
 * Reads field labels, placeholders, and styles from DB, falling back to defaults.
 */
async function getFieldConfigs() {
    const defaults = [
        { label: 'Вопрос 1', placeholder: '', style: 2 },
        { label: 'Вопрос 2', placeholder: '', style: 2 },
        { label: 'Вопрос 3', placeholder: '', style: 2 },
        { label: 'Вопрос 4', placeholder: '', style: 2 },
        { label: 'Вопрос 5', placeholder: '', style: 2 },
    ];
    try {
        const allKeys = [
            'APPLICATION_FIELD_1', 'APPLICATION_FIELD_2', 'APPLICATION_FIELD_3', 'APPLICATION_FIELD_4', 'APPLICATION_FIELD_5',
            'APPLICATION_FIELD_1_PLACEHOLDER', 'APPLICATION_FIELD_2_PLACEHOLDER', 'APPLICATION_FIELD_3_PLACEHOLDER', 'APPLICATION_FIELD_4_PLACEHOLDER', 'APPLICATION_FIELD_5_PLACEHOLDER',
            'APPLICATION_FIELD_1_STYLE', 'APPLICATION_FIELD_2_STYLE', 'APPLICATION_FIELD_3_STYLE', 'APPLICATION_FIELD_4_STYLE', 'APPLICATION_FIELD_5_STYLE'
        ];
        const rows = await db_1.db.select().from(schema_1.systemSettings).where((0, drizzle_orm_1.inArray)(schema_1.systemSettings.key, allKeys));
        return defaults.map((def, i) => {
            const num = i + 1;
            const labelRow = rows.find(r => r.key === `APPLICATION_FIELD_${num}`);
            const placeholderRow = rows.find(r => r.key === `APPLICATION_FIELD_${num}_PLACEHOLDER`);
            const styleRow = rows.find(r => r.key === `APPLICATION_FIELD_${num}_STYLE`);
            return {
                label: labelRow?.value || def.label,
                placeholder: placeholderRow?.value || def.placeholder,
                style: styleRow?.value ? parseInt(styleRow.value) : def.style
            };
        });
    }
    catch {
        return defaults;
    }
}
async function handleTicketApplyBtn(interaction) {
    const configs = await getFieldConfigs();
    const modal = new discord_js_1.ModalBuilder()
        .setCustomId('ticket_apply_modal')
        .setTitle('Подача заявки');
    const fields = configs.map((cfg, i) => {
        const builder = new discord_js_1.TextInputBuilder()
            .setCustomId(`field_${i + 1}`)
            .setLabel(cfg.label.substring(0, 45)) // Discord limit: 45 chars for label
            .setStyle(cfg.style === 1 ? discord_js_1.TextInputStyle.Short : discord_js_1.TextInputStyle.Paragraph)
            .setRequired(true);
        if (cfg.placeholder) {
            builder.setPlaceholder(cfg.placeholder.substring(0, 100)); // Discord limit: 100 chars
        }
        return builder;
    });
    const rows = fields.map(field => new discord_js_1.ActionRowBuilder().addComponents(field));
    modal.addComponents(...rows);
    await interaction.showModal(modal);
}
