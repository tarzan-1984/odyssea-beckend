-- CreateEnum (no-op if already created by earlier migration revision)
DO $$ BEGIN
    CREATE TYPE "LoadBoardShipmentStatus" AS ENUM ('posted', 'unposted');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "load_board_shipments" ADD COLUMN IF NOT EXISTS "rate" DOUBLE PRECISION;

DO $$ BEGIN
    ALTER TABLE "load_board_shipments" ADD COLUMN "status" "LoadBoardShipmentStatus" NOT NULL DEFAULT 'posted';
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "load_board_shipments_status_idx" ON "load_board_shipments"("status");
