-- CreateEnum
CREATE TYPE "LoadBoardLoadType" AS ENUM ('full', 'partial');

-- CreateEnum
CREATE TYPE "LoadBoardEquipment" AS ENUM ('cargo_van', 'box_truck', 'dry_van');

-- CreateEnum
CREATE TYPE "LoadBoardShipmentStatus" AS ENUM ('posted', 'unposted');

-- CreateTable
CREATE TABLE "load_board_shipments" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_external_id" TEXT,
    "route" JSONB NOT NULL,
    "pickup_earliest" TEXT NOT NULL,
    "pickup_latest" TEXT,
    "pickup_hours" TEXT,
    "drop_off_hours" TEXT,
    "weight" DOUBLE PRECISION NOT NULL,
    "commodity" TEXT NOT NULL,
    "special_instructions" JSONB,
    "load_type" "LoadBoardLoadType" NOT NULL,
    "equipment" "LoadBoardEquipment" NOT NULL,
    "equipment_length" DOUBLE PRECISION,
    "equipment_weight" DOUBLE PRECISION,
    "comments" TEXT,
    "reference_id" TEXT,
    "rate" DOUBLE PRECISION,
    "status" "LoadBoardShipmentStatus" NOT NULL DEFAULT 'posted',
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "load_board_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "load_board_shipments_user_id_idx" ON "load_board_shipments"("user_id");

-- CreateIndex
CREATE INDEX "load_board_shipments_user_external_id_idx" ON "load_board_shipments"("user_external_id");

-- CreateIndex
CREATE INDEX "load_board_shipments_created_at_idx" ON "load_board_shipments"("created_at");

-- CreateIndex
CREATE INDEX "load_board_shipments_status_idx" ON "load_board_shipments"("status");

-- AddForeignKey
ALTER TABLE "load_board_shipments" ADD CONSTRAINT "load_board_shipments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
