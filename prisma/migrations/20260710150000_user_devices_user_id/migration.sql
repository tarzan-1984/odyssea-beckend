-- Link user_devices to users.id (nullable; filled on mobile foreground / device register).
ALTER TABLE "user_devices" ADD COLUMN "user_id" TEXT;

CREATE INDEX "user_devices_user_id_idx" ON "user_devices"("user_id");

-- Backfill: match userExternalId -> users.externalId; prefer DRIVER when duplicates exist.
UPDATE "user_devices" ud
SET "user_id" = sub.user_id
FROM (
  SELECT DISTINCT ON (ud_inner.id)
    ud_inner.id AS device_id,
    u.id AS user_id
  FROM "user_devices" ud_inner
  INNER JOIN "users" u ON u."externalId" = ud_inner."userExternalId"
  ORDER BY
    ud_inner.id,
    CASE WHEN u.role = 'DRIVER' THEN 0 ELSE 1 END,
    u."createdAt" ASC
) sub
WHERE ud.id = sub.device_id;

ALTER TABLE "user_devices"
ADD CONSTRAINT "user_devices_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
