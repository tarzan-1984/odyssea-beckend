-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN "tms_batch_cron_interval_seconds" INTEGER NOT NULL DEFAULT 300;
ALTER TABLE "app_settings" ADD COLUMN "tms_batch_chunk_size" INTEGER NOT NULL DEFAULT 150;
