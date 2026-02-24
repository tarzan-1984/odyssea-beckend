-- Add empty_miles and total_miles to rate_offers (nullable double precision)
ALTER TABLE "rate_offers" ADD COLUMN IF NOT EXISTS "empty_miles" DOUBLE PRECISION;
ALTER TABLE "rate_offers" ADD COLUMN IF NOT EXISTS "total_miles" DOUBLE PRECISION;
