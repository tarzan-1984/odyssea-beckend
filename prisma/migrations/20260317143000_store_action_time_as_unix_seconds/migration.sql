DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rate_offers'
      AND column_name = 'action_time_unix'
  ) THEN
    EXECUTE '
      UPDATE "rate_offers"
      SET "action_time" = COALESCE("action_time_unix"::text, "action_time")
      WHERE "action_time_unix" IS NOT NULL
    ';
  END IF;
END $$;

ALTER TABLE "rate_offers"
ALTER COLUMN "action_time" TYPE BIGINT
USING (
  CASE
    WHEN "action_time" IS NULL OR btrim("action_time") = '' THEN NULL
    WHEN btrim("action_time") ~ '^\d+$' THEN btrim("action_time")::BIGINT
    WHEN "action_time" LIKE '%/%' AND "action_time" LIKE '%, %' THEN EXTRACT(
      EPOCH FROM make_timestamptz(
        split_part(split_part("action_time", ', ', 1), '/', 3)::int,
        split_part(split_part("action_time", ', ', 1), '/', 1)::int,
        split_part(split_part("action_time", ', ', 1), '/', 2)::int,
        split_part(split_part("action_time", ', ', 2), ':', 1)::int,
        split_part(split_part("action_time", ', ', 2), ':', 2)::int,
        split_part(split_part("action_time", ', ', 2), ':', 3)::double precision,
        'America/New_York'
      )
    )::BIGINT
    ELSE NULL
  END
);

ALTER TABLE "rate_offers"
DROP COLUMN IF EXISTS "action_time_unix";
