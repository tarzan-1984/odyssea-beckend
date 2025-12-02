-- Add latitude/longitude columns to users table to store last known coordinates
-- This migration is additive only and does not modify or remove existing data.

ALTER TABLE "users"
  ADD COLUMN "latitude" double precision,
  ADD COLUMN "longitude" double precision;


