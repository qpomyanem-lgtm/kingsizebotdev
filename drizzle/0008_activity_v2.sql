-- Activity system v2: add status tracking, accepted_by, screenshot statuses
ALTER TABLE "activity_threads" ADD COLUMN "accepted_by_discord_id" text;
ALTER TABLE "activity_threads" ADD COLUMN "status" text NOT NULL DEFAULT 'active';
ALTER TABLE "activity_threads" ADD COLUMN "dm_message_id" text;

ALTER TABLE "activity_screenshots" ADD COLUMN "screenshot_status" text NOT NULL DEFAULT 'pending';
ALTER TABLE "activity_screenshots" ADD COLUMN "reviewed_by_discord_id" text;
ALTER TABLE "activity_screenshots" ADD COLUMN "forum_message_id" text;
