-- AlterTable
ALTER TABLE `bid_rates`
  ADD COLUMN `is_do_not_bid` BOOLEAN NOT NULL DEFAULT false;
