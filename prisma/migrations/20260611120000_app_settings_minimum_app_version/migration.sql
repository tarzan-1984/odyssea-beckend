ALTER TABLE "app_settings"
ADD COLUMN IF NOT EXISTS "minimum_app_version" TEXT NOT NULL DEFAULT '';
