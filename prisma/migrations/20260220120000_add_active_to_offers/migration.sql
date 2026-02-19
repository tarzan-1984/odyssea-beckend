-- Add active column to offers (boolean, default true)
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
