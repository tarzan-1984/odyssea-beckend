CREATE TABLE IF NOT EXISTS geo_reverse_cache (
  id SERIAL PRIMARY KEY,
  grid_lat INTEGER NOT NULL,
  grid_lng INTEGER NOT NULL,
  center_lat DOUBLE PRECISION NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL,
  city VARCHAR(100),
  state VARCHAR(100),
  state_code VARCHAR(10),
  zip VARCHAR(20),
  country_code VARCHAR(2),
  source VARCHAR(20) NOT NULL DEFAULT 'here',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS geo_reverse_cache_grid_uidx
ON geo_reverse_cache (grid_lat, grid_lng);
