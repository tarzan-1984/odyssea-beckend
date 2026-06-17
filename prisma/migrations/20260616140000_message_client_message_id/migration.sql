-- AlterTable
ALTER TABLE "messages" ADD COLUMN "client_message_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "messages_chat_room_client_message_id_key" ON "messages"("chatRoomId", "client_message_id");
