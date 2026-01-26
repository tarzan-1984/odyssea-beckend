-- Convert users.company from TEXT (nullable) to TEXT[] with default empty array.
-- Non-destructive migration: preserves existing values by wrapping them into a single-element array.

-- Ensure column exists (created by previous migration).
-- Convert type: NULL -> empty array, non-empty string -> [string], empty string -> empty array.
ALTER TABLE "users"
  ALTER COLUMN "company" TYPE TEXT[]
  USING (
    CASE
      WHEN "company" IS NULL OR btrim("company") = '' THEN ARRAY[]::TEXT[]
      ELSE ARRAY["company"]::TEXT[]
    END
  );

-- Make it consistent with Prisma `String[] @default([])`
ALTER TABLE "users" ALTER COLUMN "company" SET DEFAULT '{}'::TEXT[];
UPDATE "users" SET "company" = '{}'::TEXT[] WHERE "company" IS NULL;
ALTER TABLE "users" ALTER COLUMN "company" SET NOT NULL;

