-- AlterTable
ALTER TABLE "public"."chat_rooms" ADD COLUMN     "admin" TEXT;

-- AddForeignKey
ALTER TABLE "public"."chat_rooms" ADD CONSTRAINT "chat_rooms_admin_fkey" FOREIGN KEY ("admin") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
