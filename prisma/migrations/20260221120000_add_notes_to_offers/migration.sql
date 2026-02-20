-- Add notes column to offers
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "notes" TEXT;
