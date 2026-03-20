"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminRoleIds = getAdminRoleIds;
exports.getMemberRoleIds = getMemberRoleIds;
exports.hasAdminPanelAccess = hasAdminPanelAccess;
exports.getAdminRoleLabel = getAdminRoleLabel;
exports.hasRoleSettingsAccess = hasRoleSettingsAccess;
const dotenv_1 = require("dotenv");
const db_1 = require("../../db");
const schema_1 = require("../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
(0, dotenv_1.config)({ path: '.env' });
const ADMIN_ROLE_KEYS = ['OWNER', '.', 'DEP', 'HIGH', 'RECRUIT', 'TIER CHECK'];
const DISCORD_API_BASE = 'https://discord.com/api/v10';
const FETCH_TIMEOUT_MS = 5000;
/**
 * Returns Discord role IDs that grant admin panel access (from role_settings).
 * Requires GUILD_ID to be set; returns empty array if not configured.
 */
async function getAdminRoleIds() {
    try {
        const [guildRow] = await db_1.db
            .select()
            .from(schema_1.systemSettings)
            .where((0, drizzle_orm_1.eq)(schema_1.systemSettings.key, 'GUILD_ID'));
        const guildId = guildRow?.value?.trim();
        if (!guildId)
            return [];
        const rows = await db_1.db
            .select({ discordRoleId: schema_1.roleSettings.discordRoleId })
            .from(schema_1.roleSettings)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.roleSettings.requiresAdmin, true), (0, drizzle_orm_1.inArray)(schema_1.roleSettings.key, [...ADMIN_ROLE_KEYS])));
        const ids = rows
            .map((r) => r.discordRoleId?.trim())
            .filter((id) => !!id);
        return ids;
    }
    catch {
        return [];
    }
}
/**
 * Fetches member's role IDs on the guild via Discord REST API (Bot token).
 * Returns empty array on 404, network error, or missing config.
 */
async function getMemberRoleIds(discordUserId) {
    const token = process.env.DISCORD_TOKEN;
    const [guildRow] = await db_1.db
        .select()
        .from(schema_1.systemSettings)
        .where((0, drizzle_orm_1.eq)(schema_1.systemSettings.key, 'GUILD_ID'));
    const guildId = guildRow?.value?.trim();
    if (!token || !guildId)
        return [];
    const url = `${DISCORD_API_BASE}/guilds/${guildId}/members/${discordUserId}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            headers: { Authorization: `Bot ${token}` },
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.status === 404)
            return [];
        if (!res.ok)
            return [];
        const data = (await res.json());
        return Array.isArray(data.roles) ? data.roles : [];
    }
    catch {
        clearTimeout(timeout);
        return [];
    }
}
/**
 * True if the Discord user has admin panel access:
 * - BOT_OWNER_ID always has access, or
 * - User has at least one of the admin Discord roles (OWNER, DEP, HIGH, RECRUIT, TIER CHECK).
 */
async function hasAdminPanelAccess(discordUserId) {
    const botOwnerId = process.env.BOT_OWNER_ID;
    if (botOwnerId && discordUserId === botOwnerId.trim())
        return true;
    const [adminIds, memberIds] = await Promise.all([
        getAdminRoleIds(),
        getMemberRoleIds(discordUserId),
    ]);
    if (adminIds.length === 0)
        return false;
    const set = new Set(memberIds);
    return adminIds.some((id) => set.has(id));
}
/**
 * Returns the role key (OWNER, DEP, HIGH, RECRUIT, TIER CHECK) for display.
 * For BOT_OWNER_ID returns 'Владелец'. For admin users returns first matching key in fixed order; otherwise null.
 */
async function getAdminRoleLabel(discordUserId) {
    const botOwnerId = process.env.BOT_OWNER_ID;
    if (botOwnerId && discordUserId === botOwnerId.trim())
        return 'BOT OWNER';
    const labelByKey = {
        OWNER: 'OWNER',
        '.': '.',
        DEP: 'DEP',
        HIGH: 'HIGH',
        RECRUIT: 'RECRUIT',
        'TIER CHECK': 'TIER CHECK',
    };
    try {
        const [guildRow] = await db_1.db
            .select()
            .from(schema_1.systemSettings)
            .where((0, drizzle_orm_1.eq)(schema_1.systemSettings.key, 'GUILD_ID'));
        const guildId = guildRow?.value?.trim();
        if (!guildId)
            return null;
        const rows = await db_1.db
            .select({ key: schema_1.roleSettings.key, discordRoleId: schema_1.roleSettings.discordRoleId })
            .from(schema_1.roleSettings)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.roleSettings.requiresAdmin, true), (0, drizzle_orm_1.inArray)(schema_1.roleSettings.key, [...ADMIN_ROLE_KEYS])));
        const memberIds = await getMemberRoleIds(discordUserId);
        const memberSet = new Set(memberIds);
        for (const key of ADMIN_ROLE_KEYS) {
            const row = rows.find((r) => r.key === key);
            const id = row?.discordRoleId?.trim();
            if (id && memberSet.has(id))
                return labelByKey[key];
        }
    }
    catch {
        // ignore
    }
    return null;
}
/** Role keys that grant access to role settings (Настройка ролей): only BOT_OWNER_ID, OWNER, and . (Администратор). */
const ROLE_SETTINGS_KEYS = ['OWNER', '.'];
/**
 * Returns Discord role IDs that grant access to role settings (from role_settings).
 */
async function getRoleSettingsRoleIds() {
    try {
        const rows = await db_1.db
            .select({ discordRoleId: schema_1.roleSettings.discordRoleId })
            .from(schema_1.roleSettings)
            .where((0, drizzle_orm_1.inArray)(schema_1.roleSettings.key, [...ROLE_SETTINGS_KEYS]));
        const ids = rows
            .map((r) => r.discordRoleId?.trim())
            .filter((id) => !!id);
        return ids;
    }
    catch {
        return [];
    }
}
/**
 * True if the Discord user can access role settings (Настройка ролей):
 * - BOT_OWNER_ID always, or
 * - User has Discord role OWNER or . (Администратор).
 */
async function hasRoleSettingsAccess(discordUserId) {
    const botOwnerId = process.env.BOT_OWNER_ID;
    if (botOwnerId && discordUserId === botOwnerId.trim())
        return true;
    const [roleSettingsIds, memberIds] = await Promise.all([
        getRoleSettingsRoleIds(),
        getMemberRoleIds(discordUserId),
    ]);
    if (roleSettingsIds.length === 0)
        return false;
    const set = new Set(memberIds);
    return roleSettingsIds.some((id) => set.has(id));
}
