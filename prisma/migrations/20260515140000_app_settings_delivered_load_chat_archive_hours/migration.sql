-- Hours after LOAD deliveryAt before cron archives and deletes the chat. Default 5.
ALTER TABLE "app_settings" ADD COLUMN "delivered_load_chat_archive_after_hours" INTEGER NOT NULL DEFAULT 5;
