-- Speeds tracking-load map history:
-- WHERE "load_id" = $1 ORDER BY "createdAt" ASC
CREATE INDEX IF NOT EXISTS "driver_tracking_load_id_createdAt_idx"
ON "driver_tracking"("load_id", "createdAt");
