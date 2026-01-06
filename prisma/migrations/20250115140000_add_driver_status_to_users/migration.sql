-- Add driverStatus column to users table
-- This migration is additive only and does not modify or remove existing data.
-- The column is nullable, so existing records will have NULL value, which is safe.

ALTER TABLE "users"
  ADD COLUMN "driverStatus" TEXT;

