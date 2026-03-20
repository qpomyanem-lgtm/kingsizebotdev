import type { ButtonInteraction, ModalBuilder } from 'discord.js';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

type ModalLike = ModalBuilder | Record<string, unknown>;

function toModalData(modal: ModalLike): Record<string, unknown> {
    // ModalBuilder has toJSON().
    const maybeToJSON = (modal as any)?.toJSON;
    if (typeof maybeToJSON === 'function') return maybeToJSON.call(modal);
    return modal as Record<string, unknown>;
}

/**
 * Sends interaction callback manually with a short timeout.
 * discord.js `interaction.showModal()` sometimes waits too long (connect timeout),
 * causing interaction token to expire -> 10062 / "This interaction failed".
 */
export async function showModalViaInteractionCallback(
    interaction: ButtonInteraction,
    modal: ModalLike,
    timeoutMs = 2500
): Promise<void> {
    const interactionId = interaction.id;
    const token = (interaction as any).token as string | undefined;
    if (!token) throw new Error('Missing interaction token');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(`${DISCORD_API_BASE}/interactions/${interactionId}/${token}/callback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 9, // Modal
                data: toModalData(modal),
            }),
            signal: controller.signal,
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw Object.assign(new Error(`Discord interaction callback failed: ${res.status} ${res.statusText}`), {
                status: res.status,
                body: text,
            });
        }
    } finally {
        clearTimeout(timeout);
    }
}

