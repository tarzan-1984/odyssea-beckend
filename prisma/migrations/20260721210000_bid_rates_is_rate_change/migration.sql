-- AlterTable
ALTER TABLE `bid_rates`
  ADD COLUMN `is_rate_change` BOOLEAN NOT NULL DEFAULT false;
