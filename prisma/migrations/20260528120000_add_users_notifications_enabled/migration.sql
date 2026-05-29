-- Per-user push notification opt-in (mobile Settings toggle). Default: enabled.
ALTER TABLE "users" ADD COLUMN "notifications_enabled" BOOLEAN NOT NULL DEFAULT true;
