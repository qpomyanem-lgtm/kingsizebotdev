import { GuildMember } from 'discord.js';
import { hasPermission } from '../../../../backend/lib/discordRoles';

export const EVENT_TYPE_LABELS: Record<string, string> = {
    MCL: 'MCL',
    'ВЗЗ': 'ВЗЗ',
    Capt: 'Капт',
};

export async function canCreateEvents(member: GuildMember | null, userId: string): Promise<boolean> {
    return hasPermission(userId, 'bot:event:create');
}

/** Returns Unix timestamp in seconds for a Moscow-time Date */
export function toUnixTs(d: Date): number {
    return Math.floor(d.getTime() / 1000);
}

