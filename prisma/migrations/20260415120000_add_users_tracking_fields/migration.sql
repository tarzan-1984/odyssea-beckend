-- Add tracking fields to users table
ALTER TABLE "public"."users"
ADD COLUMN IF NOT EXISTS "is_tracking" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "public"."users"
ADD COLUMN IF NOT EXISTS "tracking_load_id" TEXT;

