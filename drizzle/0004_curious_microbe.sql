ALTER TABLE "role_settings" ADD COLUMN "purpose" text;--> statement-breakpoint
ALTER TABLE "role_settings" DROP COLUMN IF EXISTS "requires_admin";--> statement-breakpoint
ALTER TABLE "role_settings" ADD CONSTRAINT "role_settings_purpose_unique" UNIQUE("purpose");