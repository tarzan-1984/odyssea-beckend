-- AlterTable: add total_miles to offers (numeric with decimal point).
-- Additive only: no existing rows are modified or deleted; new column is NULL for existing rows.
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "total_miles" DOUBLE PRECISION;
