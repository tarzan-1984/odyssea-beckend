-- Partial GIST indexes per country: smaller trees, faster ST_Contains / KNN for geo_zips.
-- Apply after geo_zips data is loaded: yarn db:migrate:geo-zips-indexes

CREATE INDEX IF NOT EXISTS geo_zips_geom_us_idx
ON geo_zips
USING GIST (geom)
WHERE country_code = 'US';

CREATE INDEX IF NOT EXISTS geo_zips_geom_ca_idx
ON geo_zips
USING GIST (geom)
WHERE country_code = 'CA';

CREATE INDEX IF NOT EXISTS geo_zips_geom_mx_idx
ON geo_zips
USING GIST (geom)
WHERE country_code = 'MX';
