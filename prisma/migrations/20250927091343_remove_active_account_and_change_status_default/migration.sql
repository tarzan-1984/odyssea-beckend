/*
  Warnings:

  - You are about to drop the column `country` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `distanceCoverage` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `extension` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `hasCDL` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `hasCanada` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `hasDockHigh` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `hasDolly` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `hasETracks` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `hasHazmatCert` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `hasLiftGate` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `hasLoadBars` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `hasMexico` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `hasPPE` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `hasPalletJack` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `hasPrinter` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `hasRamp` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `hasRealID` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `hasSleeper` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `hasTSA` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `hasTWIC` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `hasTankerEndorsement` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `language` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `vehicleBrand` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `vehicleCapacity` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `vehicleDimensions` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `vehicleModel` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `vehicleType` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `vehicleYear` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `vin` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[externalId]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."users" DROP COLUMN "country",
DROP COLUMN "distanceCoverage",
DROP COLUMN "extension",
DROP COLUMN "hasCDL",
DROP COLUMN "hasCanada",
DROP COLUMN "hasDockHigh",
DROP COLUMN "hasDolly",
DROP COLUMN "hasETracks",
DROP COLUMN "hasHazmatCert",
DROP COLUMN "hasLiftGate",
DROP COLUMN "hasLoadBars",
DROP COLUMN "hasMexico",
DROP COLUMN "hasPPE",
DROP COLUMN "hasPalletJack",
DROP COLUMN "hasPrinter",
DROP COLUMN "hasRamp",
DROP COLUMN "hasRealID",
DROP COLUMN "hasSleeper",
DROP COLUMN "hasTSA",
DROP COLUMN "hasTWIC",
DROP COLUMN "hasTankerEndorsement",
DROP COLUMN "language",
DROP COLUMN "vehicleBrand",
DROP COLUMN "vehicleCapacity",
DROP COLUMN "vehicleDimensions",
DROP COLUMN "vehicleModel",
DROP COLUMN "vehicleType",
DROP COLUMN "vehicleYear",
DROP COLUMN "vin",
ADD COLUMN     "deactivateAccount" BOOLEAN DEFAULT false,
ADD COLUMN     "externalId" TEXT,
ALTER COLUMN "status" SET DEFAULT 'INACTIVE';

-- DropEnum
DROP TYPE "public"."DistanceCoverage";

-- DropEnum
DROP TYPE "public"."VehicleType";

-- CreateTable
CREATE TABLE "public"."notifications_sent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatRoomId" TEXT,
    "messageIds" TEXT[],
    "notificationType" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_sent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FileObject" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime" TEXT,
    "size" INTEGER,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileObject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FileObject_key_key" ON "public"."FileObject"("key");

-- CreateIndex
CREATE UNIQUE INDEX "users_externalId_key" ON "public"."users"("externalId");

-- AddForeignKey
ALTER TABLE "public"."notifications_sent" ADD CONSTRAINT "notifications_sent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
