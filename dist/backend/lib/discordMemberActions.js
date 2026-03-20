"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addRole = addRole;
exports.removeRole = removeRole;
exports.setNickname = setNickname;
exports.getRoleIdByKey = getRoleIdByKey;
exports.refreshEventEmbedRest = refreshEventEmbedRest;
const dotenv_1 = require("dotenv");
const db_1 = require("../../db");
const schema_1 = require("../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
(0, dotenv_1.config)({ path: '.env' });
const DISCORD_API_BASE = 'https://discord.com/api/v10';
const IPC_BOT_BASE_URL = process.env.IPC_BOT_BASE_URL || 'http://localhost:3001';
async function getGuildId() {
    const [row] = await db_1.db.select().from(schema_1.systemSettings).where((0, drizzle_orm_1.eq)(schema_1.systemSettings.key, 'GUILD_ID'));
    return row?.value?.trim() || null;
}
/**
 * Add a Discord role to a guild member.
 */
async function addRole(discordUserId, roleId) {
    const token = process.env.DISCORD_TOKEN;
    const guildId = await getGuildId();
    if (!token || !guildId)
        return false;
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
    }
    catch (err) {
        console.error(`❌ [Discord API] Исключение addRole:`, err);
        return false;
    }
}
/**
 * Remove a Discord role from a guild member.
 */
async function removeRole(discordUserId, roleId) {
    const token = process.env.DISCORD_TOKEN;
    const guildId = await getGuildId();
    if (!token || !guildId)
        return false;
    try {
        const res = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bot ${token}` },
        });
        return res.ok;
    }
    catch {
        return false;
    }
}
/**
 * Set a guild member's nickname.
 */
async function setNickname(discordUserId, nickname) {
    const token = process.env.DISCORD_TOKEN;
    const guildId = await getGuildId();
    if (!token || !guildId)
        return false;
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
    }
    catch (err) {
        console.error(`❌ [Discord API] Исключение setNickname:`, err);
        return false;
    }
}
/**
 * Get Discord role ID by key from role_settings.
 */
async function getRoleIdByKey(key) {
    const { roleSettings } = await import('../../db/schema.js');
    const [row] = await db_1.db.select().from(roleSettings).where((0, drizzle_orm_1.eq)(roleSettings.key, key));
    return row?.discordRoleId?.trim() || null;
}
/**
 * Refresh an event embed via the REST API (used by the backend).
 * Redirects the request to the Bot IPC server to ensure discord.js natively handles complex builders.
 */
async function refreshEventEmbedRest(eventId) {
    try {
        const res = await fetch(`${IPC_BOT_BASE_URL}/ipc/refresh-event/${eventId}`, {
            method: 'POST'
        });
        if (!res.ok) {
            console.error(`❌ [IPC] Ошибка refreshEventEmbedRest: ${res.statusText}`);
            return false;
        }
        return true;
    }
    catch (err) {
        console.error(`❌ [IPC] Исключение refreshEventEmbedRest:`, err?.message || err);
        return false;
    }
}
