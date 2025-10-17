-- AlterTable
ALTER TABLE "public"."chat_room_participants" ADD COLUMN     "mute" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pin" BOOLEAN NOT NULL DEFAULT false;
