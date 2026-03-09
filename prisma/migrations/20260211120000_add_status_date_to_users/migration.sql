-- AlterTable: add statusDate column to users (date/time when driver set status)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "statusDate" TEXT;
