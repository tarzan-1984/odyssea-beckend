-- AlterTable
ALTER TABLE "bid_rates" ADD COLUMN "route" JSONB;

-- Migrate legacy origin/destination into offers-compatible route JSON.
UPDATE "bid_rates"
SET "route" = jsonb_build_array(
    jsonb_build_object(
        'type', 'pick_up_location',
        'location', "origin",
        'time', ''
    ),
    jsonb_build_object(
        'type', 'delivery_location',
        'location', "destination",
        'time', ''
    )
)
WHERE "route" IS NULL;

ALTER TABLE "bid_rates" DROP COLUMN "origin";
ALTER TABLE "bid_rates" DROP COLUMN "destination";
