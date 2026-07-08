-- AlterTable
ALTER TABLE "bid_rates" ADD COLUMN "owner" TEXT;

-- Backfill existing rows with the first administrator user (fallback for legacy data).
UPDATE "bid_rates" br
SET "owner" = u.id
FROM (
    SELECT id
    FROM "users"
    WHERE role = 'ADMINISTRATOR'
    ORDER BY "createdAt" ASC
    LIMIT 1
) u
WHERE br."owner" IS NULL;

-- If no administrator exists, delete orphan bid_rates without owner (should not happen in prod).
DELETE FROM "bid_rates" WHERE "owner" IS NULL;

ALTER TABLE "bid_rates" ALTER COLUMN "owner" SET NOT NULL;

-- CreateIndex
CREATE INDEX "bid_rates_owner_idx" ON "bid_rates"("owner");

-- AddForeignKey
ALTER TABLE "bid_rates" ADD CONSTRAINT "bid_rates_owner_fkey" FOREIGN KEY ("owner") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
