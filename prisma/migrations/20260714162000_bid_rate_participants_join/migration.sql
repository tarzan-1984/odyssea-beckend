-- AlterTable
ALTER TABLE "bid_rate_participants" ALTER COLUMN "rate" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "bid_rate_participants_user_id_bid_rate_id_key" ON "bid_rate_participants"("user_id", "bid_rate_id");
