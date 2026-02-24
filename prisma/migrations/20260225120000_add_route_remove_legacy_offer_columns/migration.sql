-- Add route column (JSONB) and remove legacy offer location/miles columns in one migration
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "route" JSONB;

ALTER TABLE "offers" DROP COLUMN IF EXISTS "pick_up_location",
  DROP COLUMN IF EXISTS "pick_up_time",
  DROP COLUMN IF EXISTS "delivery_location",
  DROP COLUMN IF EXISTS "delivery_time",
  DROP COLUMN IF EXISTS "empty_miles",
  DROP COLUMN IF EXISTS "total_miles";
