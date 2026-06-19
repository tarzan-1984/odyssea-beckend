-- Speeds chat list membership filter:
-- participants.some({ userId, isHidden: false })
CREATE INDEX IF NOT EXISTS "chat_room_participants_user_hidden_room_idx"
ON "chat_room_participants"("userId", "isHidden", "chatRoomId");
