ALTER TABLE geo_zips
ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);

CREATE INDEX IF NOT EXISTS geo_zips_country_code_idx
ON geo_zips (country_code);
