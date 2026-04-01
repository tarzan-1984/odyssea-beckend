-- Min meters from last successful reverse geocode before running Expo/Nominatim again
ALTER TABLE "app_settings"
ADD COLUMN IF NOT EXISTS "reverse_geocode_min_distance_m" INTEGER NOT NULL DEFAULT 5000;
