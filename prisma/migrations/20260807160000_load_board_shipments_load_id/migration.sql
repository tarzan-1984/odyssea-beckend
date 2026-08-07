-- AlterTable
ALTER TABLE `load_board_shipments` ADD COLUMN `load_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `load_board_shipments_load_id_idx` ON `load_board_shipments`(`load_id`);
