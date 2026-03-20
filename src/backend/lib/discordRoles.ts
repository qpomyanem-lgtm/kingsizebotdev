import { config } from 'dotenv';
import { db } from '../../db';
import { roleSettings, systemSettings } from '../../db/schema';
import { and, eq, inArray } from 'drizzle-orm';

config({ path: '.env' });

const ADMIN_ROLE_KEYS = ['OWNER', '.', 'DEP', 'HIGH', 'RECRUIT', 'TIER CHECK'] as const;
const DISCORD_API_BASE = 'https://discord.com/api/v10';
const FETCH_TIMEOUT_MS = 5000;

/**
 * Returns Discord role IDs that grant admin panel access (from role_settings).
 * Requires GUILD_ID to be set; returns empty array if not configured.
 */
export async function getAdminRoleIds(): Promise<string[]> {
  try {
    const [guildRow] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'GUILD_ID'));
    const guildId = guildRow?.value?.trim();
    if (!guildId) return [];

    const rows = await db
      .select({ discordRoleId: roleSettings.discordRoleId })
      .from(roleSettings)
      .where(
        and(
          eq(roleSettings.requiresAdmin, true),
          inArray(roleSettings.key, [...ADMIN_ROLE_KEYS])
        )
      );

    const ids = rows
      .map((r) => r.discordRoleId?.trim())
      .filter((id): id is string => !!id);
    return ids;
  } catch {
    return [];
  }
}

/**
 * Fetches member's role IDs on the guild via Discord REST API (Bot token).
 * Returns empty array on 404, network error, or missing config.
 */
export async function getMemberRoleIds(discordUserId: string): Promise<string[]> {
  const token = process.env.DISCORD_TOKEN;
  const [guildRow] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, 'GUILD_ID'));
  const guildId = guildRow?.value?.trim();
  if (!token || !guildId) return [];

  const url = `${DISCORD_API_BASE}/guilds/${guildId}/members/${discordUserId}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.status === 404) return [];
    if (!res.ok) return [];
    const data = (await res.json()) as { roles?: string[] };
    return Array.isArray(data.roles) ? data.roles : [];
  } catch {
    clearTimeout(timeout);
    return [];
  }
}

/**
 * True if the Discord user has admin panel access:
 * - BOT_OWNER_ID always has access, or
 * - User has at least one of the admin Discord roles (OWNER, DEP, HIGH, RECRUIT, TIER CHECK).
 */
export async function hasAdminPanelAccess(discordUserId: string): Promise<boolean> {
  const botOwnerId = process.env.BOT_OWNER_ID;
  if (botOwnerId && discordUserId === botOwnerId.trim()) return true;

  const [adminIds, memberIds] = await Promise.all([
    getAdminRoleIds(),
    getMemberRoleIds(discordUserId),
  ]);
  if (adminIds.length === 0) return false;
  const set = new Set(memberIds);
  return adminIds.some((id) => set.has(id));
}

/**
 * Returns the role key (OWNER, DEP, HIGH, RECRUIT, TIER CHECK) for display.
 * For BOT_OWNER_ID returns 'Владелец'. For admin users returns first matching key in fixed order; otherwise null.
 */
export async function getAdminRoleLabel(discordUserId: string): Promise<string | null> {
  const botOwnerId = process.env.BOT_OWNER_ID;
  if (botOwnerId && discordUserId === botOwnerId.trim()) return 'BOT OWNER';

  const labelByKey: Record<(typeof ADMIN_ROLE_KEYS)[number], string> = {
    OWNER: 'OWNER',
    '.': '.',
    DEP: 'DEP',
    HIGH: 'HIGH',
    RECRUIT: 'RECRUIT',
    'TIER CHECK': 'TIER CHECK',
  };

  try {
    const [guildRow] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'GUILD_ID'));
    const guildId = guildRow?.value?.trim();
    if (!guildId) return null;

    const rows = await db
      .select({ key: roleSettings.key, discordRoleId: roleSettings.discordRoleId })
      .from(roleSettings)
      .where(
        and(
          eq(roleSettings.requiresAdmin, true),
          inArray(roleSettings.key, [...ADMIN_ROLE_KEYS])
        )
      );

    const memberIds = await getMemberRoleIds(discordUserId);
    const memberSet = new Set(memberIds);

    for (const key of ADMIN_ROLE_KEYS) {
      const row = rows.find((r) => r.key === key);
      const id = row?.discordRoleId?.trim();
      if (id && memberSet.has(id)) return labelByKey[key];
    }
  } catch {
    // ignore
  }
  return null;
}

/** Role keys that grant access to role settings (Настройка ролей): only BOT_OWNER_ID, OWNER, and . (Администратор). */
const ROLE_SETTINGS_KEYS = ['OWNER', '.'] as const;

/**
 * Returns Discord role IDs that grant access to role settings (from role_settings).
 */
async function getRoleSettingsRoleIds(): Promise<string[]> {
  try {
    const rows = await db
      .select({ discordRoleId: roleSettings.discordRoleId })
      .from(roleSettings)
      .where(inArray(roleSettings.key, [...ROLE_SETTINGS_KEYS]));

    const ids = rows
      .map((r) => r.discordRoleId?.trim())
      .filter((id): id is string => !!id);
    return ids;
  } catch {
    return [];
  }
}

/**
 * True if the Discord user can access role settings (Настройка ролей):
 * - BOT_OWNER_ID always, or
 * - User has Discord role OWNER or . (Администратор).
 */
export async function hasRoleSettingsAccess(discordUserId: string): Promise<boolean> {
  const botOwnerId = process.env.BOT_OWNER_ID;
  if (botOwnerId && discordUserId === botOwnerId.trim()) return true;

  const [roleSettingsIds, memberIds] = await Promise.all([
    getRoleSettingsRoleIds(),
    getMemberRoleIds(discordUserId),
  ]);
  if (roleSettingsIds.length === 0) return false;
  const set = new Set(memberIds);
  return roleSettingsIds.some((id) => set.has(id));
}
