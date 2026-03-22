-- ============================================================
-- Migration: Unified roles table
-- Merges role_settings + access_roles → roles
-- Updates members (role→roleId, tier→tierRoleId)
-- Updates event_participants (tier→tierRoleId)
-- ============================================================

-- 1. Create unified roles table
CREATE TABLE IF NOT EXISTS "roles" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "discord_role_id" text UNIQUE,
  "color" text DEFAULT '#6366f1' NOT NULL,
  "icon" text,
  "priority" integer DEFAULT 0 NOT NULL,
  "type" text NOT NULL,
  "system_type" text,
  "is_admin" boolean DEFAULT false NOT NULL,
  "can_manage_settings" boolean DEFAULT false NOT NULL,
  "is_everyone" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- 2. Create role_permissions table
CREATE TABLE IF NOT EXISTS "role_permissions" (
  "id" text PRIMARY KEY NOT NULL,
  "role_id" text NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
  "permission" text NOT NULL
);

-- 3. Migrate system roles from role_settings → roles
INSERT INTO "roles" ("id", "name", "discord_role_id", "color", "icon", "priority", "type", "system_type", "is_admin", "can_manage_settings", "is_everyone")
SELECT
  gen_random_uuid()::text,
  rs."name",
  rs."discord_role_id",
  CASE rs."purpose"
    WHEN 'family' THEN '#f59e0b'
    WHEN 'newbie' THEN '#3b82f6'
    WHEN 'tier_1' THEN '#10b981'
    WHEN 'tier_2' THEN '#6366f1'
    WHEN 'tier_3' THEN '#8b5cf6'
    WHEN 'blacklist' THEN '#64748b'
    ELSE '#6366f1'
  END,
  CASE rs."purpose"
    WHEN 'family' THEN 'Crown'
    WHEN 'newbie' THEN 'UserPlus'
    WHEN 'tier_1' THEN 'Target'
    WHEN 'tier_2' THEN 'Target'
    WHEN 'tier_3' THEN 'Star'
    WHEN 'blacklist' THEN 'ShieldBan'
    ELSE 'Circle'
  END,
  CASE rs."purpose"
    WHEN 'family' THEN 0
    WHEN 'newbie' THEN 1
    WHEN 'tier_1' THEN 2
    WHEN 'tier_2' THEN 3
    WHEN 'tier_3' THEN 4
    WHEN 'blacklist' THEN 5
    ELSE 99
  END,
  'system',
  CASE rs."purpose"
    WHEN 'family' THEN 'main'
    WHEN 'newbie' THEN 'new'
    WHEN 'tier_1' THEN 'tier'
    WHEN 'tier_2' THEN 'tier'
    WHEN 'tier_3' THEN 'tier'
    WHEN 'blacklist' THEN 'blacklist'
    ELSE NULL
  END,
  false,
  false,
  false
FROM "role_settings" rs
WHERE rs."purpose" IS NOT NULL
ON CONFLICT ("discord_role_id") DO NOTHING;

-- 4. Migrate access roles from access_roles → roles
-- Use priority + 100 offset to avoid collision with system roles
INSERT INTO "roles" ("id", "name", "discord_role_id", "color", "icon", "priority", "type", "system_type", "is_admin", "can_manage_settings", "is_everyone")
SELECT
  ar."id",
  ar."name",
  ar."discord_role_id",
  ar."color",
  'Shield',
  ar."priority" + 100,
  'access',
  NULL,
  ar."is_admin",
  ar."can_manage_access",
  false
FROM "access_roles" ar
ON CONFLICT ("discord_role_id") DO NOTHING;

-- 5. Migrate permissions from access_role_permissions → role_permissions
INSERT INTO "role_permissions" ("id", "role_id", "permission")
SELECT arp."id", arp."role_id", arp."permission"
FROM "access_role_permissions" arp
WHERE EXISTS (SELECT 1 FROM "roles" r WHERE r."id" = arp."role_id");

-- 6. Create @everyone role
INSERT INTO "roles" ("id", "name", "color", "icon", "priority", "type", "is_admin", "can_manage_settings", "is_everyone")
VALUES (gen_random_uuid()::text, '@everyone', '#94a3b8', 'Globe', 999, 'access', false, false, true);

-- Get the @everyone role id for its permission
INSERT INTO "role_permissions" ("id", "role_id", "permission")
SELECT gen_random_uuid()::text, r."id", 'bot:ticket:apply'
FROM "roles" r WHERE r."is_everyone" = true;

-- 7. Add new columns to members
ALTER TABLE "members" ADD COLUMN "role_id" text REFERENCES "roles"("id");
ALTER TABLE "members" ADD COLUMN "tier_role_id" text REFERENCES "roles"("id");

-- 8. Populate members.role_id from old role enum
UPDATE "members" m
SET "role_id" = r."id"
FROM "roles" r
WHERE r."type" = 'system'
  AND (
    (m."role" = 'KINGSIZE' AND r."system_type" = 'main')
    OR (m."role" = 'NEWKINGSIZE' AND r."system_type" = 'new')
  )
  -- Pick the first match (for main/new there's only one each)
  AND r."id" = (
    SELECT r2."id" FROM "roles" r2
    WHERE r2."type" = 'system'
      AND r2."system_type" = CASE m."role" WHEN 'KINGSIZE' THEN 'main' WHEN 'NEWKINGSIZE' THEN 'new' END
    ORDER BY r2."priority" LIMIT 1
  );

-- 9. Populate members.tier_role_id from old tier enum
-- Map tier names to system roles by matching name
UPDATE "members" m
SET "tier_role_id" = r."id"
FROM "roles" r
WHERE r."type" = 'system' AND r."system_type" = 'tier'
  AND m."tier" != 'NONE'
  AND r."name" = m."tier";

-- 10. Add new column to event_participants
ALTER TABLE "event_participants" ADD COLUMN "tier_role_id" text REFERENCES "roles"("id");

-- 11. Populate event_participants.tier_role_id from old integer tier
-- tier 1,2,3 map to system roles ordered by priority; tier 4 (NONE) stays NULL
UPDATE "event_participants" ep
SET "tier_role_id" = sub."role_id"
FROM (
  SELECT r."id" AS "role_id", ROW_NUMBER() OVER (ORDER BY r."priority") AS "rn"
  FROM "roles" r
  WHERE r."type" = 'system' AND r."system_type" = 'tier'
) sub
WHERE ep."tier" = sub."rn"::integer;

-- 12. Drop old columns from members
ALTER TABLE "members" DROP COLUMN "role";
ALTER TABLE "members" DROP COLUMN "tier";

-- 13. Drop old column from event_participants
ALTER TABLE "event_participants" DROP COLUMN "tier";

-- 14. Drop old tables
DROP TABLE IF EXISTS "access_role_permissions";
DROP TABLE IF EXISTS "access_roles";
DROP TABLE IF EXISTS "role_settings";
