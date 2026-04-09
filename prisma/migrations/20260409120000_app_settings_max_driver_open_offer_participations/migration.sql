-- Max concurrent open bids per driver (active offers, not yet assigned). Default 2.
ALTER TABLE "app_settings" ADD COLUMN "max_driver_open_offer_participations" INTEGER NOT NULL DEFAULT 2;
