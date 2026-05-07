-- Cache TMS load pickup/delivery coordinates from server-side geocoding (Nominatim).
CREATE TABLE IF NOT EXISTS "public"."load_route_geocodes" (
  "id" TEXT NOT NULL,
  "load_id" TEXT NOT NULL,
  "pickup_lat" DOUBLE PRECISION,
  "pickup_lng" DOUBLE PRECISION,
  "pickup_geocode_query" TEXT,
  "delivery_lat" DOUBLE PRECISION,
  "delivery_lng" DOUBLE PRECISION,
  "delivery_geocode_query" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "load_route_geocodes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "load_route_geocodes_load_id_key"
  ON "public"."load_route_geocodes"("load_id");
