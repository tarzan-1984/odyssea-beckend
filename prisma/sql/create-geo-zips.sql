CREATE TABLE IF NOT EXISTS geo_zips (
  id SERIAL PRIMARY KEY,
  zip VARCHAR(20),
  city VARCHAR(100),
  state VARCHAR(100),
  state_code VARCHAR(10),
  country_code VARCHAR(2),
  geom geometry(MultiPolygon, 4326)
);

CREATE INDEX IF NOT EXISTS geo_zips_geom_idx
ON geo_zips
USING GIST (geom);
