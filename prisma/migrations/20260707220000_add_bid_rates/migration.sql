-- CreateEnum
CREATE TYPE "BidRateStatus" AS ENUM ('blocked', 'in-process', 'completed');

-- CreateTable
CREATE TABLE "bid_rates" (
    "id" SERIAL NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "broker" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "status" "BidRateStatus" NOT NULL DEFAULT 'in-process',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bid_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bid_rate_participants" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "bid_rate_id" INTEGER NOT NULL,

    CONSTRAINT "bid_rate_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bid_rate_participants_user_id_idx" ON "bid_rate_participants"("user_id");

-- CreateIndex
CREATE INDEX "bid_rate_participants_bid_rate_id_idx" ON "bid_rate_participants"("bid_rate_id");

-- AddForeignKey
ALTER TABLE "bid_rate_participants" ADD CONSTRAINT "bid_rate_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid_rate_participants" ADD CONSTRAINT "bid_rate_participants_bid_rate_id_fkey" FOREIGN KEY ("bid_rate_id") REFERENCES "bid_rates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
