-- Speed up chat room list: lookup by participant userId and archived LOAD filters.

CREATE INDEX IF NOT EXISTS "chat_room_participants_user_id_idx"
  ON "chat_room_participants"("userId");

-- Visible chats only (participants.some userId + isHidden=false).
CREATE INDEX IF NOT EXISTS "chat_room_participants_user_visible_idx"
  ON "chat_room_participants"("userId", "chatRoomId")
  WHERE "isHidden" = false;

-- Archived LOAD chats: filter + sort by updatedAt.
CREATE INDEX IF NOT EXISTS "chat_rooms_load_archived_updated_idx"
  ON "chat_rooms"(type, is_load_archived, "updatedAt" DESC)
  WHERE type = 'LOAD' AND "isArchived" = false;

-- Cron: delivered LOAD chats past archive cutoff.
CREATE INDEX IF NOT EXISTS "chat_rooms_load_delivery_archive_idx"
  ON "chat_rooms"(type, is_load_archived, "deliveryAt")
  WHERE type = 'LOAD' AND "deliveryAt" IS NOT NULL;
