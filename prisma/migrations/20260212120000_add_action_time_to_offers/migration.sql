-- AlterTable: add action_time to offers (date and time).
-- Additive only: no existing rows are modified or deleted; new column is NULL for existing rows.
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "action_time" TEXT;
