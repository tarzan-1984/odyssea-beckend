-- Safe enum → TEXT conversion for load_chats_logs.action (idempotent).
-- prisma db push cannot cast LoadChatLogAction → TEXT when the column has data;
-- run this before db push on deploy.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type t
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'LoadChatLogAction'
      AND n.nspname = 'public'
  ) THEN
    ALTER TABLE "public"."load_chats_logs"
      ALTER COLUMN "action" TYPE TEXT USING "action"::text;
    DROP TYPE "public"."LoadChatLogAction";
  END IF;
END $$;
