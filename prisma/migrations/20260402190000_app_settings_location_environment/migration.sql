-- Location environment: live (all drivers) vs test (single external id only).
ALTER TABLE "app_settings" ADD COLUMN "location_environment_mode" TEXT NOT NULL DEFAULT 'live';
ALTER TABLE "app_settings" ADD COLUMN "location_test_driver_external_id" TEXT NOT NULL DEFAULT '3343';
