-- AlterTable
ALTER TABLE "public"."chat_room_participants" ADD COLUMN     "isHidden" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."notifications" ADD COLUMN     "avatar" TEXT;
