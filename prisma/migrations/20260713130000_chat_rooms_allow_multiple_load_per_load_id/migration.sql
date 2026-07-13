-- Allow multiple LOAD chats for the same loadId (fork per additional driver from chat settings).
DROP INDEX IF EXISTS "chat_rooms_load_id_type_key";

CREATE INDEX IF NOT EXISTS "chat_rooms_load_id_type_idx" ON "chat_rooms" ("loadId", type);
