-- DropForeignKey
ALTER TABLE "public"."user_devices" DROP CONSTRAINT IF EXISTS "user_devices_userExternalId_fkey";

ALTER TABLE "public"."offers" DROP CONSTRAINT IF EXISTS "offers_external_user_id_fkey";

ALTER TABLE "public"."rate_offers" DROP CONSTRAINT IF EXISTS "rate_offers_driver_id_fkey";

ALTER TABLE "public"."message_templates" DROP CONSTRAINT IF EXISTS "message_templates_externalId_fkey";

ALTER TABLE "public"."driver_logs" DROP CONSTRAINT IF EXISTS "driver_logs_driver_id_fkey";

-- DropIndex
DROP INDEX IF EXISTS "public"."users_externalId_key";

-- CreateIndex
CREATE INDEX "users_externalId_idx" ON "public"."users"("externalId");
