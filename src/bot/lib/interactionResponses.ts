import type { ButtonInteraction, MessageComponentInteraction, ModalBuilder } from 'discord.js';

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

/**
 * Sends a deferred update (type 6) via raw fetch to avoid discord.js REST queue delays.
 * Use this instead of interaction.deferUpdate() when latency matters.
 */
export async function deferUpdateViaCallback(
    interaction: MessageComponentInteraction,
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
            body: JSON.stringify({ type: 6 }),
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

/**
 * Sends an ephemeral reply via raw fetch to avoid discord.js REST queue delays.
 */
export async function replyEphemeralViaCallback(
    interaction: MessageComponentInteraction,
    content: string,
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
                type: 4,
                data: { content, flags: 64 },
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

/**
 * Lowest-level function: send any interaction callback directly via raw HTTP.
 * Used from `raw` WebSocket handler to respond before discord.js even processes the event.
 * Bypasses discord.js REST queue entirely.
 * Includes automatic retry on 10062 (Unknown Interaction).
 */
export async function respondToInteraction(
    interactionId: string,
    token: string,
    body: object,
): Promise<boolean> {
    const ok = await _sendInteractionCallback(interactionId, token, body);
    if (ok) return true;

    // Retry once after a brief delay — interaction may have a registration race on Discord's side
    await new Promise(r => setTimeout(r, 300));
    return _sendInteractionCallback(interactionId, token, body);
}

async function _sendInteractionCallback(
    interactionId: string,
    token: string,
    body: object,
): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);

        const res = await fetch(`${DISCORD_API_BASE}/interactions/${interactionId}/${token}/callback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        clearTimeout(timer);

        // CRITICAL: Always consume response body to release connection back to pool.
        const text = await res.text().catch(() => '');

        if (!res.ok) {
            console.error(`⚠️ respondToInteraction failed: ${res.status} ${text}`);
            return false;
        }
        return true;
    } catch (e: any) {
        if (e?.name === 'AbortError') {
            console.error('⚠️ respondToInteraction timeout (>2.5s)');
        } else {
            console.error('⚠️ respondToInteraction error:', e);
        }
        return false;
    }
}

/**
 * Pre-warm the HTTP connection pool to Discord API.
 * Call once at startup so that interaction responses don't pay cold-start penalty.
 */
export async function warmupDiscordConnection(): Promise<void> {
    try {
        const res = await fetch(`${DISCORD_API_BASE}/gateway`, { method: 'GET' });
        await res.text();
        console.log('🔌 Discord API connection pool прогрет');
    } catch {
        console.warn('⚠️ Не удалось прогреть соединение с Discord API');
    }
}

/**
 * Periodically ping Discord API to keep the HTTP connection pool warm.
 * This prevents cold-start TLS/TCP overhead when responding to interactions.
 */
export function startConnectionKeepAlive(): void {
    setInterval(async () => {
        try {
            const res = await fetch(`${DISCORD_API_BASE}/gateway`, { method: 'GET' });
            await res.text();
        } catch { /* ignore */ }
    }, 25_000);
}
