import { config } from 'dotenv';
import { db } from '../../db';
import { roles, systemSettings } from '../../db/schema';
import { and, asc, eq } from 'drizzle-orm';

config({ path: '.env' });

const DISCORD_API_BASE = 'https://discord.com/api/v10';

const IPC_BOT_BASE_URL = process.env.IPC_BOT_BASE_URL || 'http://localhost:3001';

async function getGuildId(): Promise<string | null> {
    const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, 'GUILD_ID'));
    return row?.value?.trim() || null;
}

/**
 * Add a Discord role to a guild member.
 */
export async function addRole(discordUserId: string, roleId: string): Promise<boolean> {
    const token = process.env.DISCORD_TOKEN;
    const guildId = await getGuildId();
    if (!token || !guildId) return false;

    try {
        const res = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`, {
            method: 'PUT',
            headers: { Authorization: `Bot ${token}` },
        });
        if (!res.ok) {
            console.error(`❌ [Discord API] Ошибка addRole: ${res.status} ${res.statusText}`);
            const text = await res.text();
            console.error(`❌ [Discord API] Детали addRole: ${text}`);
        }
        return res.ok;
    } catch (err) {
        console.error(`❌ [Discord API] Исключение addRole:`, err);
        return false;
    }
}

/**
 * Remove a Discord role from a guild member.
 */
export async function removeRole(discordUserId: string, roleId: string): Promise<boolean> {
    const token = process.env.DISCORD_TOKEN;
    const guildId = await getGuildId();
    if (!token || !guildId) return false;

    try {
        const res = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bot ${token}` },
        });
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Set a guild member's nickname.
 */
export async function setNickname(discordUserId: string, nickname: string): Promise<boolean> {
    const token = process.env.DISCORD_TOKEN;
    const guildId = await getGuildId();
    if (!token || !guildId) return false;

    try {
        const res = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/members/${discordUserId}`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bot ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ nick: nickname }),
        });
        if (!res.ok) {
            console.error(`❌ [Discord API] Ошибка setNickname: ${res.status} ${res.statusText}`);
            const text = await res.text();
            console.error(`❌ [Discord API] Детали setNickname: ${text}`);
        }
        return res.ok;
    } catch (err) {
        console.error(`❌ [Discord API] Исключение setNickname:`, err);
        return false;
    }
}

/**
 * Unban a user from the Discord guild.
 */
export async function unbanMember(discordUserId: string): Promise<boolean> {
    const token = process.env.DISCORD_TOKEN;
    const guildId = await getGuildId();
    if (!token || !guildId) return false;

    try {
        const res = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/bans/${discordUserId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bot ${token}` },
        });
        if (!res.ok && res.status !== 404) {
            console.error(`❌ [Discord API] Ошибка unbanMember: ${res.status} ${res.statusText}`);
        }
        return res.ok || res.status === 404;
    } catch (err) {
        console.error(`❌ [Discord API] Исключение unbanMember:`, err);
        return false;
    }
}

/**
 * Get Discord role ID by key from role_settings.
 */
export async function getRoleIdByKey(key: string): Promise<string | null> {
    const legacyMap: Record<string, string> = {
        KINGSIZE: 'main',
        NEWKINGSIZE: 'new',
        BLACKLIST: 'blacklist',
    };

    if (key === 'TIER1') return getTierRoleDiscordIdByIndex(0);
    if (key === 'TIER2') return getTierRoleDiscordIdByIndex(1);
    if (key === 'TIER3') return getTierRoleDiscordIdByIndex(2);

    const systemType = legacyMap[key];
    if (!systemType) return null;
    return getDiscordRoleIdBySystemType(systemType as 'main' | 'new' | 'blacklist');
}

/**
 * Get Discord role ID by purpose tag from role_settings.
 * Purpose values: 'family', 'newbie', 'tier_1', 'tier_2', 'tier_3', 'blacklist'
 */
export async function getRoleIdByPurpose(purpose: string): Promise<string | null> {
    const purposeMap: Record<string, 'main' | 'new' | 'blacklist'> = {
        family: 'main',
        newbie: 'new',
        blacklist: 'blacklist',
    };

    if (purpose === 'tier_1') return getTierRoleDiscordIdByIndex(0);
    if (purpose === 'tier_2') return getTierRoleDiscordIdByIndex(1);
    if (purpose === 'tier_3') return getTierRoleDiscordIdByIndex(2);

    const systemType = purposeMap[purpose];
    if (!systemType) return null;
    return getDiscordRoleIdBySystemType(systemType);
}

/**
 * Primary lookup for system Discord role IDs in unified `roles` table.
 */
export async function getDiscordRoleIdBySystemType(systemType: 'main' | 'new' | 'blacklist'): Promise<string | null> {
    const [row] = await db
        .select()
        .from(roles)
        .where(and(eq(roles.type, 'system'), eq(roles.systemType, systemType)))
        .orderBy(asc(roles.priority));

    return row?.discordRoleId?.trim() || null;
}

/**
 * Returns tier Discord role ID by index in priority order.
 * index=0 highest tier (smallest priority), index=1 next, etc.
 */
export async function getTierRoleDiscordIdByIndex(index: number): Promise<string | null> {
    const tierRoles = await db
        .select()
        .from(roles)
        .where(and(eq(roles.type, 'system'), eq(roles.systemType, 'tier')))
        .orderBy(asc(roles.priority));

    const row = tierRoles[index];
    return row?.discordRoleId?.trim() || null;
}

/**
 * Refresh an event embed via the REST API (used by the backend).
 * Redirects the request to the Bot IPC server to ensure discord.js natively handles complex builders.
 */
export async function refreshEventEmbedRest(eventId: string): Promise<boolean> {
    try {
        const res = await fetch(`${IPC_BOT_BASE_URL}/ipc/refresh-event/${eventId}`, {
            method: 'POST'
        });
        if (!res.ok) {
            console.error(`❌ [IPC] Ошибка refreshEventEmbedRest: ${res.statusText}`);
            return false;
        }
        return true;
    } catch (err: any) {
        console.error(`❌ [IPC] Исключение refreshEventEmbedRest:`, err?.message || err);
        return false;
    }
}
