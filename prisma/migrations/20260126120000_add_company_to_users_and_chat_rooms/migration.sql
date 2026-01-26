-- Add nullable company column to users and chat_rooms.
-- This is a non-destructive change (existing data is preserved).

ALTER TABLE "users" ADD COLUMN "company" TEXT;

ALTER TABLE "chat_rooms" ADD COLUMN "company" TEXT;

