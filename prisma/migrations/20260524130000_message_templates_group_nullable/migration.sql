-- Allow NULL group for personal templates; company rows remain non-null in application logic.

ALTER TABLE "message_templates" ALTER COLUMN "group" DROP DEFAULT;

ALTER TABLE "message_templates" ALTER COLUMN "group" DROP NOT NULL;

UPDATE "message_templates"
SET "group" = NULL
WHERE "type" = 'personal';
