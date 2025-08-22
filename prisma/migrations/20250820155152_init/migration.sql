-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('ADMINISTRATOR', 'DISPATCHER_EXPEDITE', 'DISPATCHER_TEAM_LEADER', 'EXPEDITE_MANAGER', 'DISPATCHER_FTL', 'RECRUITER', 'RECRUITER_TEAM_LEADER', 'TRACKING', 'TRACKING_TEAM_LEADER', 'FLEET_MANAGER', 'DRIVER');

-- CreateEnum
CREATE TYPE "public"."VehicleType" AS ENUM ('CARGO_VAN', 'SPRINTER_VAN', 'BOX_TRUCK', 'SEMI_TRUCK');

-- CreateEnum
CREATE TYPE "public"."DistanceCoverage" AS ENUM ('LOCAL', 'REGIONAL', 'OTR');

-- CreateEnum
CREATE TYPE "public"."UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "profilePhoto" TEXT,
    "role" "public"."UserRole" NOT NULL,
    "status" "public"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "language" TEXT[],
    "extension" TEXT,
    "vehicleType" "public"."VehicleType",
    "vehicleCapacity" TEXT,
    "vehicleDimensions" TEXT,
    "vehicleModel" TEXT,
    "vehicleBrand" TEXT,
    "vehicleYear" INTEGER,
    "distanceCoverage" "public"."DistanceCoverage",
    "hasPalletJack" BOOLEAN NOT NULL DEFAULT false,
    "hasLiftGate" BOOLEAN NOT NULL DEFAULT false,
    "hasCDL" BOOLEAN NOT NULL DEFAULT false,
    "hasTWIC" BOOLEAN NOT NULL DEFAULT false,
    "hasTSA" BOOLEAN NOT NULL DEFAULT false,
    "hasHazmatCert" BOOLEAN NOT NULL DEFAULT false,
    "hasTankerEndorsement" BOOLEAN NOT NULL DEFAULT false,
    "hasDolly" BOOLEAN NOT NULL DEFAULT false,
    "hasCanada" BOOLEAN NOT NULL DEFAULT false,
    "hasMexico" BOOLEAN NOT NULL DEFAULT false,
    "hasETracks" BOOLEAN NOT NULL DEFAULT false,
    "hasLoadBars" BOOLEAN NOT NULL DEFAULT false,
    "hasRamp" BOOLEAN NOT NULL DEFAULT false,
    "hasDockHigh" BOOLEAN NOT NULL DEFAULT false,
    "hasPPE" BOOLEAN NOT NULL DEFAULT false,
    "hasRealID" BOOLEAN NOT NULL DEFAULT false,
    "hasPrinter" BOOLEAN NOT NULL DEFAULT false,
    "hasSleeper" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."password_reset_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."otp_codes" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."chat_rooms" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "type" TEXT NOT NULL,
    "loadId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."chat_room_participants" (
    "id" TEXT NOT NULL,
    "chatRoomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_room_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."messages" (
    "id" TEXT NOT NULL,
    "chatRoomId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT,
    "content" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "public"."password_reset_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "public"."refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "chat_room_participants_chatRoomId_userId_key" ON "public"."chat_room_participants"("chatRoomId", "userId");

-- AddForeignKey
ALTER TABLE "public"."password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_room_participants" ADD CONSTRAINT "chat_room_participants_chatRoomId_fkey" FOREIGN KEY ("chatRoomId") REFERENCES "public"."chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_room_participants" ADD CONSTRAINT "chat_room_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_chatRoomId_fkey" FOREIGN KEY ("chatRoomId") REFERENCES "public"."chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
