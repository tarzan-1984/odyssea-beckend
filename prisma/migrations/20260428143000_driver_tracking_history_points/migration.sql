-- Store driver tracking as history points (many rows per driver/load).
-- Keep this migration defensive because driver_tracking was added before this
-- migration exists in the repo history.

CREATE TABLE IF NOT EXISTS "public"."driver_tracking" (
  "id" TEXT NOT NULL,
  "external_driver_id" TEXT NOT NULL,
  "load_id" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "driver_tracking_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."driver_tracking"
ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "public"."driver_tracking"
ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "public"."driver_tracking"
DROP CONSTRAINT IF EXISTS "driver_tracking_external_driver_id_load_id_key";

DROP INDEX IF EXISTS "public"."driver_tracking_external_driver_id_load_id_key";

CREATE INDEX IF NOT EXISTS "driver_tracking_external_driver_id_idx"
ON "public"."driver_tracking"("external_driver_id");

CREATE INDEX IF NOT EXISTS "driver_tracking_load_id_idx"
ON "public"."driver_tracking"("load_id");

CREATE INDEX IF NOT EXISTS "driver_tracking_external_driver_id_load_id_idx"
ON "public"."driver_tracking"("external_driver_id", "load_id");
