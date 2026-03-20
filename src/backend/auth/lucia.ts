import { Lucia } from "lucia";
import { DrizzlePostgreSQLAdapter } from "@lucia-auth/adapter-drizzle";
import { Discord } from "arctic";
import { db } from "../../db";
import { sessions, users } from "../../db/schema";
import { config } from "dotenv";

config({ path: ".env" });

// Drizzle schema typing can change as we add relations/tables.
// Adapter works at runtime; we cast to keep type-level compatibility.
const adapter = new DrizzlePostgreSQLAdapter(db as any, sessions as any, users as any);

export const lucia = new Lucia(adapter, {
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

declare module "lucia" {
	interface Register {
		Lucia: typeof lucia;
		DatabaseUserAttributes: DatabaseUserAttributes;
	}
}

interface DatabaseUserAttributes {
	discordId: string;
	username: string;
	avatarUrl: string | null;
	role: string;
}

export function createDiscordAuth(redirectUri: string) {
	return new Discord(
		process.env.DISCORD_CLIENT_ID!,
		process.env.DISCORD_CLIENT_SECRET!,
		redirectUri
	);
}
