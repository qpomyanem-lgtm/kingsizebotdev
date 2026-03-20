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

export async function canManageEvents(member: GuildMember | null, userId: string): Promise<boolean> {
    const botOwnerId = process.env.BOT_OWNER_ID;
    if (botOwnerId && userId === botOwnerId.trim()) return true;
    if (!member) return false;

    for (const key of EVENT_MANAGER_ROLE_KEYS) {
        const roleId = await getRoleIdByKey(key);
        if (roleId && member.roles.cache.has(roleId)) return true;
    }
    return false;
}

/** Returns Unix timestamp in seconds for a Moscow-time Date */
export function toUnixTs(d: Date): number {
    return Math.floor(d.getTime() / 1000);
}

