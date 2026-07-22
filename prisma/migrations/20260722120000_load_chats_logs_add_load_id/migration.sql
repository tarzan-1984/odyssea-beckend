-- AlterTable
ALTER TABLE "public"."load_chats_logs" ADD COLUMN "load_id" TEXT;

-- CreateIndex
CREATE INDEX "load_chats_logs_load_id_idx" ON "public"."load_chats_logs"("load_id");

-- CreateIndex
CREATE INDEX "load_chats_logs_load_id_created_at_idx" ON "public"."load_chats_logs"("load_id", "created_at" DESC);
