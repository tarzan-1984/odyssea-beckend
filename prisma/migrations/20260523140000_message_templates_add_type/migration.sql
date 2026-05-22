-- CreateEnum
CREATE TYPE "MessageTemplateType" AS ENUM ('personal', 'company');

-- AlterTable
ALTER TABLE "message_templates" ADD COLUMN "type" "MessageTemplateType" NOT NULL DEFAULT 'personal';
