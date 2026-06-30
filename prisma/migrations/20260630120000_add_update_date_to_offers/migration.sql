-- Last edit time (America/New_York wall clock) when offer was modified via PATCH /offers/:id
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "update_date" TEXT;
