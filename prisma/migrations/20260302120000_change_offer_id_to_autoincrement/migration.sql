-- Drop existing foreign key constraints that reference offers.id
ALTER TABLE "rate_offers" DROP CONSTRAINT IF EXISTS "rate_offers_offer_id_fkey";
ALTER TABLE "chat_rooms" DROP CONSTRAINT IF EXISTS "chat_rooms_offer_id_fkey";

-- Truncate dependent tables first (data is not needed)
TRUNCATE TABLE "rate_offers" CASCADE;
TRUNCATE TABLE "chat_rooms" CASCADE;
TRUNCATE TABLE "offers" CASCADE;

-- Change offers.id from text (cuid) to serial (autoincrement integer)
ALTER TABLE "offers" DROP COLUMN "id";
ALTER TABLE "offers" ADD COLUMN "id" SERIAL PRIMARY KEY;

-- Change rate_offers.id from text (cuid) to serial (autoincrement integer)
ALTER TABLE "rate_offers" DROP COLUMN "id";
ALTER TABLE "rate_offers" ADD COLUMN "id" SERIAL PRIMARY KEY;

-- Change rate_offers.offer_id from text to integer
ALTER TABLE "rate_offers" DROP COLUMN "offer_id";
ALTER TABLE "rate_offers" ADD COLUMN "offer_id" INTEGER NOT NULL;

-- Change chat_rooms.offer_id from text to integer (nullable)
ALTER TABLE "chat_rooms" DROP COLUMN "offer_id";
ALTER TABLE "chat_rooms" ADD COLUMN "offer_id" INTEGER;

-- Restore foreign key constraints
ALTER TABLE "rate_offers" ADD CONSTRAINT "rate_offers_offer_id_fkey"
  FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE;

ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_offer_id_fkey"
  FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE SET NULL;
