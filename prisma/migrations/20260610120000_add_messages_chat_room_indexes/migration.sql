-- Speed up chat message fetch: last N per room, smart sync (afterCreatedAt), unread counts.
CREATE INDEX IF NOT EXISTS "messages_chat_room_id_created_at_idx"
ON "messages"("chatRoomId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "messages_chat_room_id_sender_id_idx"
ON "messages"("chatRoomId", "senderId");
