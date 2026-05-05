ALTER TABLE "app_settings"
ADD COLUMN IF NOT EXISTS "driver_tracking_point_min_interval_ms" INTEGER NOT NULL DEFAULT 1800000;
