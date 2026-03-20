"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleTicketApplyBtn = handleTicketApplyBtn;
const discord_js_1 = require("discord.js");
const db_1 = require("../../../db");
const schema_1 = require("../../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const interactionResponses_1 = require("../../lib/interactionResponses");
/**
 * Reads field labels, placeholders, and styles from DB, falling back to defaults.
 */
const DEFAULT_FIELD_CONFIGS = [
    { label: 'Вопрос 1', placeholder: '', style: 2 },
    { label: 'Вопрос 2', placeholder: '', style: 2 },
    { label: 'Вопрос 3', placeholder: '', style: 2 },
    { label: 'Вопрос 4', placeholder: '', style: 2 },
    { label: 'Вопрос 5', placeholder: '', style: 2 },
];
let cachedFieldConfigs = null;
function withTimeout(p, ms) {
    return new Promise((resolve) => {
        const t = setTimeout(() => resolve(null), ms);
        p.then((v) => {
            clearTimeout(t);
            resolve(v);
        }, () => {
            clearTimeout(t);
            resolve(null);
        });
    });
}
async function getFieldConfigs() {
    try {
        const allKeys = [
            'APPLICATION_FIELD_1', 'APPLICATION_FIELD_2', 'APPLICATION_FIELD_3', 'APPLICATION_FIELD_4', 'APPLICATION_FIELD_5',
            'APPLICATION_FIELD_1_PLACEHOLDER', 'APPLICATION_FIELD_2_PLACEHOLDER', 'APPLICATION_FIELD_3_PLACEHOLDER', 'APPLICATION_FIELD_4_PLACEHOLDER', 'APPLICATION_FIELD_5_PLACEHOLDER',
            'APPLICATION_FIELD_1_STYLE', 'APPLICATION_FIELD_2_STYLE', 'APPLICATION_FIELD_3_STYLE', 'APPLICATION_FIELD_4_STYLE', 'APPLICATION_FIELD_5_STYLE'
        ];
        const rows = await db_1.db.select().from(schema_1.systemSettings).where((0, drizzle_orm_1.inArray)(schema_1.systemSettings.key, allKeys));
        return DEFAULT_FIELD_CONFIGS.map((def, i) => {
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
        return DEFAULT_FIELD_CONFIGS;
    }
}
async function handleTicketApplyBtn(interaction) {
    const now = Date.now();
    const cached = cachedFieldConfigs && cachedFieldConfigs.expiresAt > now ? cachedFieldConfigs.value : null;
    const configs = cached ?? DEFAULT_FIELD_CONFIGS;
    // Refresh cache in background (best-effort). This won't affect the current modal.
    if (!cachedFieldConfigs || cachedFieldConfigs.expiresAt <= now) {
        void withTimeout(getFieldConfigs(), 3000)
            .then((loaded) => {
            if (!loaded)
                return;
            cachedFieldConfigs = { value: loaded, expiresAt: Date.now() + 30_000 };
        })
            .catch(() => { });
    }
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
    try {
        await (0, interactionResponses_1.showModalViaInteractionCallback)(interaction, modal);
    }
    catch (err) {
        console.error('❌ Не удалось показать modal заявки (callback):', err);
    }
}
