-- CreateTable
CREATE TABLE "rate_load_board" (
    "id" SERIAL NOT NULL,
    "load_board_id" INTEGER NOT NULL,
    "driver_id" TEXT NOT NULL,
    "driver_external_id" TEXT,
    "rate" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_selected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_load_board_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rate_load_board_load_board_id_idx" ON "rate_load_board"("load_board_id");

-- CreateIndex
CREATE INDEX "rate_load_board_driver_id_idx" ON "rate_load_board"("driver_id");

-- CreateIndex
CREATE INDEX "rate_load_board_driver_external_id_idx" ON "rate_load_board"("driver_external_id");

-- CreateIndex
CREATE INDEX "rate_load_board_load_board_id_active_idx" ON "rate_load_board"("load_board_id", "active");

-- AddForeignKey
ALTER TABLE "rate_load_board" ADD CONSTRAINT "rate_load_board_load_board_id_fkey" FOREIGN KEY ("load_board_id") REFERENCES "load_board_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_load_board" ADD CONSTRAINT "rate_load_board_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
