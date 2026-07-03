-- Drop soft-delete flag; devices are removed from DB on delete.
ALTER TABLE "user_devices" DROP COLUMN "active_device";
