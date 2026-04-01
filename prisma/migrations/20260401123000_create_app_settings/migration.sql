-- Create singleton app settings table
CREATE TABLE IF NOT EXISTS "app_settings" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "location_min_interval_ms" INTEGER NOT NULL DEFAULT 60000,
  "location_min_distance_m" INTEGER NOT NULL DEFAULT 1000,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- Ensure singleton row exists
INSERT INTO "app_settings" ("id", "location_min_interval_ms", "location_min_distance_m")
VALUES ('global', 60000, 1000)
ON CONFLICT ("id") DO NOTHING;

