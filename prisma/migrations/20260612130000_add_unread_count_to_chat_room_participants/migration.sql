-- AlterTable
ALTER TABLE "chat_room_participants" ADD COLUMN "unreadCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill unread counts from existing messages
UPDATE "chat_room_participants" crp
SET "unreadCount" = sub.cnt
FROM (
  SELECT
    crp2.id,
    COUNT(m.id)::int AS cnt
  FROM "chat_room_participants" crp2
  INNER JOIN "messages" m ON m."chatRoomId" = crp2."chatRoomId"
    AND m."senderId" <> crp2."userId"
    AND (m."readBy" IS NULL OR NOT (m."readBy" @> to_jsonb(ARRAY[crp2."userId"])))
  GROUP BY crp2.id
) sub
WHERE crp.id = sub.id;
