-- Add action_time to rate_offers; drop from offers
ALTER TABLE "rate_offers" ADD COLUMN IF NOT EXISTS "action_time" TEXT;
ALTER TABLE "offers" DROP COLUMN IF EXISTS "action_time";
