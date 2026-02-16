-- DropColumn: remove action_time from offers
ALTER TABLE "offers" DROP COLUMN IF EXISTS "action_time";
