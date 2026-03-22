-- Add 'none' as default type for new roles (no constraint change needed, type is text)
ALTER TABLE "roles" ALTER COLUMN "type" SET DEFAULT 'none';
