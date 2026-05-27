-- CreateTable
CREATE TABLE "user_notification_sounds" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_notification_sounds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_notification_sounds_user_id_created_at_idx" ON "user_notification_sounds"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_notification_sounds_user_id_s3_key_key" ON "user_notification_sounds"("user_id", "s3_key");

-- AddForeignKey
ALTER TABLE "user_notification_sounds" ADD CONSTRAINT "user_notification_sounds_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

