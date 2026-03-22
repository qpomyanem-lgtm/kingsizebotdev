import { config } from 'dotenv';
import { db } from '../../db';
import { rolePermissions, roles, systemSettings } from '../../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { FastifyRequest, FastifyReply } from 'fastify';
import { lucia } from '../auth/lucia';

config({ path: '.env' });

// Full permission catalog — BOT_OWNER always gets all of these regardless of DB state
const ALL_PERMISSIONS_CATALOG = [
  'site:applications:view','site:application_settings:view','site:activity:view','site:guide:view',
  'site:members:view','site:afk:view','site:mcl:view','site:captures:view','site:mcl_maps:view',
  'site:archive:view','site:logs:view','site:kicked:view',
  'site:settings_server:view','site:settings_roles:view','site:settings_channels:view','site:settings_access:view',
  'site:applications:actions','site:application_settings:actions','site:activity:actions',
  'site:members:actions','site:afk:actions','site:mcl:actions','site:captures:actions',
  'site:mcl_maps:actions','site:kicked:actions',
  'site:settings_server:actions','site:settings_roles:actions','site:settings_channels:actions','site:settings_access:actions',
  'bot:ticket:apply','bot:event:create',
];

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const FETCH_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 60_000; // 60 seconds

// ── Cache layer ──────────────────────────────────────────────

interface CacheEntry<T> { data: T; expires: number; }
const cache = new Map<string, CacheEntry<any>>();

function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expires) { cache.delete(key); return undefined; }
  return entry.data as T;
}
function setCache<T>(key: string, data: T, ttl = CACHE_TTL_MS) {
  cache.set(key, { data, expires: Date.now() + ttl });
}

/** Invalidate all permission-related caches (call after role/permission changes) */
export function invalidatePermissionCache() {
  cache.clear();
}

/** Invalidate all cache entries for a specific Discord user (forces fresh Discord API fetch on next call) */
export function invalidateUserCache(discordUserId: string) {
  for (const key of cache.keys()) {
    if (key.includes(discordUserId)) {
      cache.delete(key);
    }
  }
}

// ── Access role data loading ─────────────────────────────────

interface AccessRole {
  id: string;
  name: string;
  discordRoleId: string | null;
  color: string;
  priority: number;
  isAdmin: boolean;
  canManageSettings: boolean;
}

interface AccessRoleWithPerms extends AccessRole {
  permissions: string[];
}

/** Load all access roles with their permissions (cached 60s) */
async function loadAccessRoles(): Promise<AccessRoleWithPerms[]> {
  const cached = getCached<AccessRoleWithPerms[]>('all_access_roles');
  if (cached) return cached;

  try {
    const accessRows = await db.select().from(roles);
    const perms = await db.select().from(rolePermissions);

    const accessRolesOnly = accessRows.filter(r => r.type === 'access');

    const permsByRoleId = new Map<string, string[]>();
    for (const p of perms) {
      const arr = permsByRoleId.get(p.roleId) || [];
      arr.push(p.permission);
      permsByRoleId.set(p.roleId, arr);
    }

    const result: AccessRoleWithPerms[] = accessRolesOnly
      .sort((a, b) => a.priority - b.priority)
      .map(r => ({
        id: r.id,
        name: r.name,
        discordRoleId: r.discordRoleId,
        color: r.color,
        priority: r.priority,
        isAdmin: r.isAdmin,
        canManageSettings: r.canManageSettings,
        permissions: permsByRoleId.get(r.id) || [],
      }));

    setCache('all_access_roles', result);
    return result;
  } catch {
    return [];
  }
}

// ── Discord API ──────────────────────────────────────────────

/**
 * Fetches member's role IDs on the guild via Discord REST API (Bot token).
 * Cached per user for 60s.
 */
export async function getMemberRoleIds(discordUserId: string): Promise<string[]> {
  const cacheKey = `member_roles:${discordUserId}`;
  const cached = getCached<string[]>(cacheKey);
  if (cached) return cached;

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
    const roles = Array.isArray(data.roles) ? data.roles : [];
    setCache(cacheKey, roles);
    return roles;
  } catch {
    clearTimeout(timeout);
    return [];
  }
}

// ── Permission resolution ────────────────────────────────────

/** Get the access roles that match the user's Discord roles */
async function getUserAccessRoles(discordUserId: string): Promise<AccessRoleWithPerms[]> {
  const cacheKey = `user_access_roles:${discordUserId}`;
  const cached = getCached<AccessRoleWithPerms[]>(cacheKey);
  if (cached) return cached;

  const [allRoles, memberRoleIds] = await Promise.all([
    loadAccessRoles(),
    getMemberRoleIds(discordUserId),
  ]);

  const memberSet = new Set(memberRoleIds);
  const matched = allRoles.filter(r => r.discordRoleId && memberSet.has(r.discordRoleId));

  setCache(cacheKey, matched);
  return matched;
}

/** Returns all permission keys for a Discord user (union of all matched roles). BOT_OWNER gets everything. */
export async function getUserPermissions(discordUserId: string): Promise<string[]> {
  const botOwnerId = process.env.BOT_OWNER_ID;
  if (botOwnerId && discordUserId === botOwnerId.trim()) {
    // BOT_OWNER always gets the full permission catalog, regardless of what's in the DB
    return ALL_PERMISSIONS_CATALOG;
  }

  const roles = await getUserAccessRoles(discordUserId);
  const perms = new Set<string>();
  for (const r of roles) r.permissions.forEach(p => perms.add(p));
  return [...perms];
}

/** Check if a Discord user has a specific permission. BOT_OWNER always returns true. */
export async function hasPermission(discordUserId: string, permission: string): Promise<boolean> {
  const botOwnerId = process.env.BOT_OWNER_ID;
  if (botOwnerId && discordUserId === botOwnerId.trim()) return true;

  const perms = await getUserPermissions(discordUserId);
  return perms.includes(permission);
}

// ── Backward-compatible functions ────────────────────────────

/**
 * Returns Discord role IDs that grant admin panel access (isAdmin = true).
 */
export async function getAdminRoleIds(): Promise<string[]> {
  const allRoles = await loadAccessRoles();
  return allRoles
    .filter(r => r.isAdmin && r.discordRoleId)
    .map(r => r.discordRoleId!);
}

/**
 * Returns ALL Discord role IDs that are tracked as access roles in the system
 * (type = 'access', regardless of isAdmin flag).
 */
export async function getAllAccessRoleIds(): Promise<string[]> {
  const allRoles = await loadAccessRoles();
  return allRoles
    .filter(r => r.discordRoleId)
    .map(r => r.discordRoleId!);
}

/**
 * True if the Discord user has admin panel access:
 * - BOT_OWNER_ID always has access, or
 * - User has at least one access role with isAdmin = true.
 */
export async function hasAdminPanelAccess(discordUserId: string): Promise<boolean> {
  const botOwnerId = process.env.BOT_OWNER_ID;
  if (botOwnerId && discordUserId === botOwnerId.trim()) return true;

  const roles = await getUserAccessRoles(discordUserId);
  return roles.some(r => r.isAdmin);
}

/**
 * True if the Discord user has ANY access role in the system (type = 'access').
 * This is the correct gate for the panel login — any access role grants entry.
 * BOT_OWNER_ID always has access.
 */
export async function hasPanelAccess(discordUserId: string): Promise<boolean> {
  const botOwnerId = process.env.BOT_OWNER_ID;
  if (botOwnerId && discordUserId === botOwnerId.trim()) return true;

  const roles = await getUserAccessRoles(discordUserId);
  return roles.length > 0;
}

/**
 * Returns the display name of the highest-priority access role for a user.
 * BOT_OWNER returns 'BOT OWNER'.
 */
export async function getAdminRoleLabel(discordUserId: string): Promise<string | null> {
  const botOwnerId = process.env.BOT_OWNER_ID;
  if (botOwnerId && discordUserId === botOwnerId.trim()) return 'BOT OWNER';

  const roles = await getUserAccessRoles(discordUserId);
  if (roles.length === 0) return null;
  // Already sorted by priority (lowest = highest rank)
  return roles[0].name;
}

/**
 * True if the Discord user can manage access settings (canManageAccess = true).
 * BOT_OWNER always has access.
 */
export async function hasRoleSettingsAccess(discordUserId: string): Promise<boolean> {
  const botOwnerId = process.env.BOT_OWNER_ID;
  if (botOwnerId && discordUserId === botOwnerId.trim()) return true;

  const roles = await getUserAccessRoles(discordUserId);
  return roles.some(r => r.canManageSettings);
}

/**
 * Returns true when user has a system role by systemType (main/new/tier/blacklist).
 */
export async function hasSystemRole(
  discordUserId: string,
  systemType: 'main' | 'new' | 'tier' | 'blacklist',
): Promise<boolean> {
  const [memberRoleIds, systemRows] = await Promise.all([
    getMemberRoleIds(discordUserId),
    db.select().from(roles),
  ]);

  const systemDiscordRoleIds = systemRows
    .filter(r => r.type === 'system' && r.systemType === systemType && !!r.discordRoleId)
    .map(r => r.discordRoleId as string);

  if (systemDiscordRoleIds.length === 0) return false;
  const memberSet = new Set(memberRoleIds);
  return systemDiscordRoleIds.some(id => memberSet.has(id));
}

// ── Fastify middleware factory ───────────────────────────────

/**
 * Creates a Fastify preHandler that requires a specific permission.
 * Validates session via Lucia and checks permission via access_roles.
 */
export function requirePermission(permission: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const sessionId = lucia.readSessionCookie(req.headers.cookie ?? '');
    if (!sessionId) {
      reply.status(401).send({ error: 'Unauthorized' });
      return;
    }

    let session: any;
    let user: any;
    try {
      const validated = await lucia.validateSession(sessionId);
      session = validated.session;
      user = validated.user;
    } catch {
      reply.status(401).send({ error: 'Unauthorized' });
      return;
    }

    if (!session || !user) {
      reply.status(401).send({ error: 'Unauthorized' });
      return;
    }

    const allowed = await hasPermission(user.discordId, permission);
    if (!allowed) {
      reply.status(403).send({ error: 'Forbidden', requiredPermission: permission });
      return;
    }

    // Attach user to request for downstream handlers
    (req as any).user = user;
  };
}

export function requireAnyPermission(permissions: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const sessionId = lucia.readSessionCookie(req.headers.cookie ?? '');
    if (!sessionId) {
      reply.status(401).send({ error: 'Unauthorized' });
      return;
    }

    let session: any;
    let user: any;
    try {
      const validated = await lucia.validateSession(sessionId);
      session = validated.session;
      user = validated.user;
    } catch {
      reply.status(401).send({ error: 'Unauthorized' });
      return;
    }

    if (!session || !user) {
      reply.status(401).send({ error: 'Unauthorized' });
      return;
    }

    const results = await Promise.all(permissions.map((permission) => hasPermission(user.discordId, permission)));
    const allowed = results.some(Boolean);
    if (!allowed) {
      reply.status(403).send({ error: 'Forbidden', requiredPermission: permissions.join(' | ') });
      return;
    }

    (req as any).user = user;
  };
}
