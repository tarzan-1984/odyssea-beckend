-- CreateEnum
CREATE TYPE "MessageTemplateGroup" AS ENUM ('Expedite', 'HR', 'Tracking');

-- AlterTable
ALTER TABLE "message_templates" ADD COLUMN "group" "MessageTemplateGroup" NOT NULL DEFAULT 'Expedite';
