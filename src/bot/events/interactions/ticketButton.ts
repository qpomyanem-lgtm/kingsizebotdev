import { ButtonInteraction, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { db } from '../../../db';
import { systemSettings } from '../../../db/schema';
import { inArray } from 'drizzle-orm';

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

let cachedFieldConfigs: FieldConfig[] | null = null;

async function refreshFieldConfigsCache(): Promise<void> {
    try {
        const allKeys = [
            'APPLICATION_FIELD_1', 'APPLICATION_FIELD_2', 'APPLICATION_FIELD_3', 'APPLICATION_FIELD_4', 'APPLICATION_FIELD_5',
            'APPLICATION_FIELD_1_PLACEHOLDER', 'APPLICATION_FIELD_2_PLACEHOLDER', 'APPLICATION_FIELD_3_PLACEHOLDER', 'APPLICATION_FIELD_4_PLACEHOLDER', 'APPLICATION_FIELD_5_PLACEHOLDER',
            'APPLICATION_FIELD_1_STYLE', 'APPLICATION_FIELD_2_STYLE', 'APPLICATION_FIELD_3_STYLE', 'APPLICATION_FIELD_4_STYLE', 'APPLICATION_FIELD_5_STYLE'
        ];
        const rows = await db.select().from(systemSettings).where(inArray(systemSettings.key, allKeys));
        cachedFieldConfigs = DEFAULT_FIELD_CONFIGS.map((def, i) => {
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
        // keep previous cache or null
    }
}

// Warm up cache on module load (non-blocking)
refreshFieldConfigsCache();
// Refresh cache every 60 seconds in background
setInterval(() => refreshFieldConfigsCache(), 60_000);

/**
 * Build ticket modal data as raw JSON (for use in raw WebSocket handler).
 */
export function buildTicketModalData(): object {
    const configs = cachedFieldConfigs ?? DEFAULT_FIELD_CONFIGS;
    return {
        title: 'Подача заявки',
        custom_id: 'ticket_apply_modal',
        components: configs.map((cfg, i) => ({
            type: 1, // ActionRow
            components: [{
                type: 4, // TextInput
                custom_id: `field_${i + 1}`,
                label: cfg.label.substring(0, 45),
                style: cfg.style === 1 ? 1 : 2,
                required: true,
                ...(cfg.placeholder ? { placeholder: cfg.placeholder.substring(0, 100) } : {}),
            }],
        })),
    };
}

export async function handleTicketApplyBtn(interaction: ButtonInteraction) {
    // Modal already shown via raw WebSocket handler — nothing else to do.
    // APPLICATIONS_OPEN check is in the modal submit handler.
}
