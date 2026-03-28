import { ButtonInteraction, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { db } from '../../../db';
import { systemSettings } from '../../../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { showModalViaInteractionCallback } from '../../lib/interactionResponses';

interface FieldConfig {
    label: string;
    placeholder: string;
    style: number;
}

/**
 * Reads field labels, placeholders, and styles from DB, falling back to defaults.
 */
const DEFAULT_FIELD_CONFIGS: FieldConfig[] = [
    { label: 'Вопрос 1', placeholder: '', style: 2 },
    { label: 'Вопрос 2', placeholder: '', style: 2 },
    { label: 'Вопрос 3', placeholder: '', style: 2 },
    { label: 'Вопрос 4', placeholder: '', style: 2 },
    { label: 'Вопрос 5', placeholder: '', style: 2 },
];

type CachedFieldConfigs = { value: FieldConfig[]; expiresAt: number };
let cachedFieldConfigs: CachedFieldConfigs | null = null;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
    return new Promise((resolve) => {
        const t = setTimeout(() => resolve(null), ms);
        p.then(
            (v) => {
                clearTimeout(t);
                resolve(v);
            },
            () => {
                clearTimeout(t);
                resolve(null);
            }
        );
    });
}

async function getFieldConfigs(): Promise<FieldConfig[]> {
    try {
        const allKeys = [
            'APPLICATION_FIELD_1', 'APPLICATION_FIELD_2', 'APPLICATION_FIELD_3', 'APPLICATION_FIELD_4', 'APPLICATION_FIELD_5',
            'APPLICATION_FIELD_1_PLACEHOLDER', 'APPLICATION_FIELD_2_PLACEHOLDER', 'APPLICATION_FIELD_3_PLACEHOLDER', 'APPLICATION_FIELD_4_PLACEHOLDER', 'APPLICATION_FIELD_5_PLACEHOLDER',
            'APPLICATION_FIELD_1_STYLE', 'APPLICATION_FIELD_2_STYLE', 'APPLICATION_FIELD_3_STYLE', 'APPLICATION_FIELD_4_STYLE', 'APPLICATION_FIELD_5_STYLE'
        ];
        const rows = await db.select().from(systemSettings).where(inArray(systemSettings.key, allKeys));
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
    } catch {
        return DEFAULT_FIELD_CONFIGS;
    }
}

export async function handleTicketApplyBtn(interaction: ButtonInteraction) {
    // Check if applications are open
    try {
        const [appOpenRow] = await db.select().from(systemSettings).where(eq(systemSettings.key, 'APPLICATIONS_OPEN'));
        if (appOpenRow?.value !== 'true') {
            return interaction.reply({ content: '❌ Заявки сейчас закрыты.', ephemeral: true });
        }
    } catch {
        // If DB check fails, allow through as fallback
    }

    const now = Date.now();
    let configs: FieldConfig[];
    if (cachedFieldConfigs && cachedFieldConfigs.expiresAt > now) {
        configs = cachedFieldConfigs.value;
    } else {
        // First call or expired — load from DB synchronously (with timeout fallback)
        const loaded = await withTimeout(getFieldConfigs(), 2000);
        if (loaded) {
            cachedFieldConfigs = { value: loaded, expiresAt: Date.now() + 30_000 };
            configs = loaded;
        } else {
            configs = DEFAULT_FIELD_CONFIGS;
        }
    }

    const modal = new ModalBuilder()
        .setCustomId('ticket_apply_modal')
        .setTitle('Подача заявки');

    const fields = configs.map((cfg, i) => {
        const builder = new TextInputBuilder()
            .setCustomId(`field_${i + 1}`)
            .setLabel(cfg.label.substring(0, 45)) // Discord limit: 45 chars for label
            .setStyle(cfg.style === 1 ? TextInputStyle.Short : TextInputStyle.Paragraph)
            .setRequired(true);

        if (cfg.placeholder) {
            builder.setPlaceholder(cfg.placeholder.substring(0, 100)); // Discord limit: 100 chars
        }

        return builder;
    });

    const rows = fields.map(field => new ActionRowBuilder<TextInputBuilder>().addComponents(field));
    modal.addComponents(...rows);

    try {
        await showModalViaInteractionCallback(interaction, modal);
    } catch (err) {
        console.error('❌ Не удалось показать modal заявки (callback):', err);
    }
}
