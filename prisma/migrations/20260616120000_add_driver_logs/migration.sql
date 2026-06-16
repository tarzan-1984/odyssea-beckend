-- CreateEnum
CREATE TYPE "public"."DriverLogSource" AS ENUM ('webApp', 'mobileApp', 'TMS');

-- CreateTable
CREATE TABLE "public"."driver_logs" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "changes" TEXT NOT NULL,
    "source" "public"."DriverLogSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driver_logs_driver_id_idx" ON "public"."driver_logs"("driver_id");

-- CreateIndex
CREATE INDEX "driver_logs_driver_id_created_at_idx" ON "public"."driver_logs"("driver_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "public"."driver_logs" ADD CONSTRAINT "driver_logs_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("externalId") ON DELETE CASCADE ON UPDATE CASCADE;
