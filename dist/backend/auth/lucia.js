"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lucia = void 0;
exports.createDiscordAuth = createDiscordAuth;
const lucia_1 = require("lucia");
const adapter_drizzle_1 = require("@lucia-auth/adapter-drizzle");
const arctic_1 = require("arctic");
const db_1 = require("../../db");
const schema_1 = require("../../db/schema");
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)({ path: ".env" });
// Drizzle schema typing can change as we add relations/tables.
// Adapter works at runtime; we cast to keep type-level compatibility.
const adapter = new adapter_drizzle_1.DrizzlePostgreSQLAdapter(db_1.db, schema_1.sessions, schema_1.users);
exports.lucia = new lucia_1.Lucia(adapter, {
    sessionCookie: {
        attributes: {
            secure: process.env.NODE_ENV === "production",
        }
    },
    getUserAttributes: (attributes) => {
        return {
            discordId: attributes.discordId,
            username: attributes.username,
            avatarUrl: attributes.avatarUrl,
            role: attributes.role,
        };
    }
});
function createDiscordAuth(redirectUri) {
    return new arctic_1.Discord(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_CLIENT_SECRET, redirectUri);
}
