-- user_devices: stable device id per physical phone (multiple devices per account)
ALTER TABLE "user_devices" ADD COLUMN IF NOT EXISTS "deviceId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "user_devices_userExternalId_deviceId_key"
ON "user_devices"("userExternalId", "deviceId");

-- driver_tracking: snapshot of which device produced each history point
ALTER TABLE "driver_tracking" ADD COLUMN IF NOT EXISTS "device_id" TEXT;
ALTER TABLE "driver_tracking" ADD COLUMN IF NOT EXISTS "device_model" TEXT;
ALTER TABLE "driver_tracking" ADD COLUMN IF NOT EXISTS "device_name" TEXT;
ALTER TABLE "driver_tracking" ADD COLUMN IF NOT EXISTS "device_platform" TEXT;
