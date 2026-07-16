-- Convert bid_rates created_at / updated_at from TIMESTAMP to Unix seconds (INTEGER).
ALTER TABLE "bid_rates"
  ALTER COLUMN "created_at" DROP DEFAULT,
  ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "bid_rates"
  ALTER COLUMN "created_at" TYPE INTEGER USING EXTRACT(EPOCH FROM "created_at")::INTEGER,
  ALTER COLUMN "updated_at" TYPE INTEGER USING EXTRACT(EPOCH FROM "updated_at")::INTEGER;
