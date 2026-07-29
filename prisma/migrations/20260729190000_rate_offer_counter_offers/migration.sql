-- CreateTable
CREATE TABLE "rate_offer_counter_offers" (
    "id" TEXT NOT NULL,
    "rate_offer_id" INTEGER NOT NULL,
    "offer_id" INTEGER NOT NULL,
    "driver_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_offer_counter_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rate_offer_counter_offers_offer_id_driver_id_created_by_id_idx" ON "rate_offer_counter_offers"("offer_id", "driver_id", "created_by_id");

-- CreateIndex
CREATE INDEX "rate_offer_counter_offers_created_by_id_idx" ON "rate_offer_counter_offers"("created_by_id");

-- CreateIndex
CREATE INDEX "rate_offer_counter_offers_rate_offer_id_idx" ON "rate_offer_counter_offers"("rate_offer_id");

-- AddForeignKey
ALTER TABLE "rate_offer_counter_offers" ADD CONSTRAINT "rate_offer_counter_offers_rate_offer_id_fkey" FOREIGN KEY ("rate_offer_id") REFERENCES "rate_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_offer_counter_offers" ADD CONSTRAINT "rate_offer_counter_offers_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_offer_counter_offers" ADD CONSTRAINT "rate_offer_counter_offers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
