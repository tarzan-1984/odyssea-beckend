-- AlterTable
ALTER TABLE "bid_rates" ADD COLUMN "chat_id" TEXT;

-- CreateIndex
CREATE INDEX "bid_rates_chat_id_idx" ON "bid_rates"("chat_id");

-- AddForeignKey
ALTER TABLE "bid_rates" ADD CONSTRAINT "bid_rates_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chat_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
