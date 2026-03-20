import { GuildMember } from 'discord.js';
import { getRoleIdByKey } from '../../../../backend/lib/discordMemberActions.js';

export const EVENT_MANAGER_ROLE_KEYS = ['HIGH', 'DEP', '.', 'OWNER'] as const;

// Used when creating participants from member tier.
export const TIER_MAP: Record<string, number> = {
    'TIER 1': 1,
    'TIER 2': 2,
    'TIER 3': 3,
    'NONE': 4,
};

export const DISCORD_TIER_STR: Record<number, string> = {
    1: 'TIER 1',
    2: 'TIER 2',
    3: 'TIER 3',
    4: 'Без Tier',
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
    MCL: 'MCL',
    'ВЗЗ': 'ВЗЗ',
    Capt: 'Капт',
};

type CachedRoleId = { value: string | null; expiresAt: number };
const roleIdCache: Record<string, CachedRoleId | undefined> = {};
const roleIdLoadPromises: Record<string, Promise<string | null> | undefined> = {};

const ROLE_ID_CACHE_TTL_MS = 60_000;
const ROLE_ID_LOAD_TIMEOUT_MS = 5_000;

function startRoleIdLoad(key: string) {
    if (roleIdLoadPromises[key]) return;

    // Best-effort background load; if it takes too long, we just keep cache empty.
    roleIdLoadPromises[key] = Promise.race([
        getRoleIdByKey(key),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), ROLE_ID_LOAD_TIMEOUT_MS)),
    ])
        .then((value) => {
            roleIdCache[key] = { value, expiresAt: Date.now() + ROLE_ID_CACHE_TTL_MS };
            return value;
        })
        .catch(() => {
            roleIdCache[key] = { value: null, expiresAt: Date.now() + 10_000 };
            return null;
        })
        .finally(() => {
            roleIdLoadPromises[key] = undefined;
        });
}

function getRoleIdCachedInstant(key: string): string | null {
    const cached = roleIdCache[key];
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.value ?? null;

    // Trigger background load but do not block button handlers.
    startRoleIdLoad(key);
    return null;
}

export async function canManageEvents(member: GuildMember | null, userId: string): Promise<boolean> {
    const botOwnerId = process.env.BOT_OWNER_ID;
    if (botOwnerId && userId === botOwnerId.trim()) return true;
    if (!member) return false;

    const roleIds = EVENT_MANAGER_ROLE_KEYS.map((k) => getRoleIdCachedInstant(k));
    return roleIds.some((roleId) => !!roleId && member.roles.cache.has(roleId));
}

/** Returns Unix timestamp in seconds for a Moscow-time Date */
export function toUnixTs(d: Date): number {
    return Math.floor(d.getTime() / 1000);
}

