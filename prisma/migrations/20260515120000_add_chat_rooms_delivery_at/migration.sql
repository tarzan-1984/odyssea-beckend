-- Nullable UTC delivery time set when TMS reports load_status=delivered.
ALTER TABLE "chat_rooms" ADD COLUMN "deliveryAt" TIMESTAMP(3);
