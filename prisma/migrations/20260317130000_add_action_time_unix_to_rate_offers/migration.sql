ALTER TABLE "rate_offers"
ADD COLUMN IF NOT EXISTS "action_time_unix" BIGINT;

UPDATE "rate_offers"
SET "action_time_unix" = EXTRACT(
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
WHERE "action_time" IS NOT NULL
  AND btrim("action_time") <> ''
  AND "action_time" LIKE '%/%'
  AND "action_time" LIKE '%, %';
