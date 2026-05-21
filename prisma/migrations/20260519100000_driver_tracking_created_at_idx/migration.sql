-- Index for nightly retention deletes (WHERE "createdAt" < cutoff)
CREATE INDEX IF NOT EXISTS "driver_tracking_createdAt_idx"
ON "driver_tracking"("createdAt");
