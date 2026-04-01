-- Add autoupdate flag for driver location tracking
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "is_autoupdate" BOOLEAN NOT NULL DEFAULT false;

