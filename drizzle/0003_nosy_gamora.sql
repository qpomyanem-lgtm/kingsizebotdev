CREATE TABLE IF NOT EXISTS "access_role_permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"permission" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "access_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"discord_role_id" text,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"can_manage_access" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "access_roles_discord_role_id_unique" UNIQUE("discord_role_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_dm_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"discord_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_screenshots" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"activity_thread_id" text NOT NULL,
	"source_discord_message_id" text NOT NULL,
	"source_attachment_index" integer NOT NULL,
	"dedupe_key" text NOT NULL,
	"image_url" text NOT NULL,
	"source_type" text DEFAULT 'dm' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "activity_screenshots_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"discord_forum_channel_id" text NOT NULL,
	"discord_thread_id" text NOT NULL,
	"thread_name" text NOT NULL,
	"present_in_discord" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "activity_threads_member_id_unique" UNIQUE("member_id"),
	CONSTRAINT "activity_threads_discord_thread_id_unique" UNIQUE("discord_thread_id")
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "kick_reason" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "kicked_at" timestamp;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "kicked_by_admin_username" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "access_role_permissions" ADD CONSTRAINT "access_role_permissions_role_id_access_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."access_roles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_dm_sessions" ADD CONSTRAINT "activity_dm_sessions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_screenshots" ADD CONSTRAINT "activity_screenshots_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_screenshots" ADD CONSTRAINT "activity_screenshots_activity_thread_id_activity_threads_id_fk" FOREIGN KEY ("activity_thread_id") REFERENCES "public"."activity_threads"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_threads" ADD CONSTRAINT "activity_threads_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
