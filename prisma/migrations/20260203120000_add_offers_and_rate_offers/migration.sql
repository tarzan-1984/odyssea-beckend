-- CreateTable: offers (additive, no existing data loss)
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "external_user_id" TEXT,
    "create_time" TEXT NOT NULL,
    "update_time" TEXT NOT NULL,
    "pick_up_location" TEXT NOT NULL,
    "pick_up_time" TEXT NOT NULL,
    "delivery_location" TEXT NOT NULL,
    "delivery_time" TEXT NOT NULL,
    "loaded_miles" DOUBLE PRECISION,
    "empty_miles" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION,
    "commodity" TEXT,
    "special_requirements" JSONB,
    "drivers" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: rate_offers
CREATE TABLE "rate_offers" (
    "id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "driver_id" TEXT,
    "rate" DOUBLE PRECISION,

    CONSTRAINT "rate_offers_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add offer_id to chat_rooms (nullable, no data loss)
ALTER TABLE "chat_rooms" ADD COLUMN IF NOT EXISTS "offer_id" TEXT;

-- AddForeignKey: offers.external_user_id -> users.externalId
ALTER TABLE "offers" ADD CONSTRAINT "offers_external_user_id_fkey"
    FOREIGN KEY ("external_user_id") REFERENCES "users"("externalId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: rate_offers.offer_id -> offers.id
ALTER TABLE "rate_offers" ADD CONSTRAINT "rate_offers_offer_id_fkey"
    FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: rate_offers.driver_id -> users.externalId
ALTER TABLE "rate_offers" ADD CONSTRAINT "rate_offers_driver_id_fkey"
    FOREIGN KEY ("driver_id") REFERENCES "users"("externalId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: chat_rooms.offer_id -> offers.id
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_offer_id_fkey"
    FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: unique constraint on rate_offers if needed (optional, skip if not in schema)
-- Prisma may expect an index on FKs for performance
CREATE INDEX IF NOT EXISTS "rate_offers_offer_id_idx" ON "rate_offers"("offer_id");
CREATE INDEX IF NOT EXISTS "rate_offers_driver_id_idx" ON "rate_offers"("driver_id");
CREATE INDEX IF NOT EXISTS "chat_rooms_offer_id_idx" ON "chat_rooms"("offer_id");
