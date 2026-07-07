-- Link user_devices to users.email (nullable; filled on mobile foreground / device register).
ALTER TABLE "user_devices" ADD COLUMN "email" TEXT;

CREATE INDEX "user_devices_email_idx" ON "user_devices"("email");

ALTER TABLE "user_devices"
ADD CONSTRAINT "user_devices_email_fkey"
FOREIGN KEY ("email") REFERENCES "users"("email")
ON DELETE SET NULL
ON UPDATE CASCADE;
