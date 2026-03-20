CREATE TABLE IF NOT EXISTS "afk_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"discord_id" text NOT NULL,
	"discord_username" text NOT NULL,
	"discord_avatar_url" text,
	"reason" text NOT NULL,
	"starts_at" timestamp DEFAULT now() NOT NULL,
	"ends_at" timestamp NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"ended_by_type" text,
	"ended_by_admin" text,
	"ended_at" timestamp,
	"message_id" text,
	"channel_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "members" (
	"id" text PRIMARY KEY NOT NULL,
	"discord_id" text NOT NULL,
	"discord_username" text NOT NULL,
	"discord_avatar_url" text,
	"game_nickname" text NOT NULL,
	"game_static_id" text NOT NULL,
	"role" text DEFAULT 'NEWKINGSIZE' NOT NULL,
	"tier" text DEFAULT 'NONE' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"application_id" text,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "rejection_reason" text;