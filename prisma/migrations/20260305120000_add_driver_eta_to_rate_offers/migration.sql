-- Add driver_eta to rate_offers: time the driver sets in the mobile app (Estimated Time of Arrival)
ALTER TABLE "rate_offers" ADD COLUMN IF NOT EXISTS "driver_eta" TEXT;
