-- CreateEnum
CREATE TYPE "public"."LoadChatLogAction" AS ENUM ('create', 'update');

-- CreateEnum
CREATE TYPE "public"."LoadChatLogSource" AS ENUM ('web', 'tms');

-- CreateTable
CREATE TABLE "public"."load_chats_logs" (
    "id" TEXT NOT NULL,
    "action" "public"."LoadChatLogAction" NOT NULL,
    "source" "public"."LoadChatLogSource" NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "load_chats_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "load_chats_logs_created_at_idx" ON "public"."load_chats_logs"("created_at");

-- CreateIndex
CREATE INDEX "load_chats_logs_action_created_at_idx" ON "public"."load_chats_logs"("action", "created_at" DESC);
