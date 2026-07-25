-- Allow arbitrary TMS action strings (e.g. save_manage_teams) in load_chats_logs.action
ALTER TABLE "public"."load_chats_logs"
  ALTER COLUMN "action" TYPE TEXT USING "action"::text;

DROP TYPE "public"."LoadChatLogAction";
