-- CreateTable
CREATE TABLE "user_devices" (
    "id" TEXT NOT NULL,
    "userExternalId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "appVersion" TEXT,
    "deviceName" TEXT,
    "model" TEXT,
    "osVersion" TEXT,
    "pushToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_devices_userExternalId_idx" ON "user_devices"("userExternalId");

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_userExternalId_fkey" FOREIGN KEY ("userExternalId") REFERENCES "users"("externalId") ON DELETE CASCADE ON UPDATE CASCADE;
