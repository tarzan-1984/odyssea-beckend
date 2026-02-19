-- Add active column to rate_offers (boolean, default true)
ALTER TABLE "rate_offers" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
