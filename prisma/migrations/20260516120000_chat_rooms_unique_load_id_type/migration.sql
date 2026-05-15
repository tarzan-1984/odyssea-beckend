-- Remove duplicate LOAD chats for the same loadId (keep oldest by createdAt, then id).
-- CASCADE removes participants and messages for deleted duplicate rooms.
DELETE FROM "chat_rooms" cr
WHERE cr.id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY "loadId", type
             ORDER BY "createdAt" ASC, id ASC
           ) AS rn
    FROM "chat_rooms"
    WHERE type = 'LOAD' AND "loadId" IS NOT NULL
  ) ranked
  WHERE ranked.rn > 1
);

-- Enforce at most one row per (loadId, type); for TMS LOAD chats this blocks duplicate loadId.
CREATE UNIQUE INDEX "chat_rooms_load_id_type_key" ON "chat_rooms" ("loadId", type);
