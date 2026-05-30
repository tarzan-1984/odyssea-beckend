#!/usr/bin/env python3
"""
Download Canada FSA boundaries (Statistics Canada ArcGIS) + GeoNames city lookup,
then load into geo_zips on the geo PostgreSQL database.

Usage:
  GEO_DATABASE_URL="postgresql://...?sslmode=require" python scripts/import-canada-geo-zips.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
import zipfile
from collections import Counter, defaultdict
from io import BytesIO
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_batch

ARCGIS_LAYER = (
    "https://geo.statcan.gc.ca/geo_wa/rest/services/2021/"
    "Digital_boundary_files/MapServer/14/query"
)
GEONAMES_CA_ZIP = "https://download.geonames.org/export/zip/CA.zip"
PAGE_SIZE = 200

PRUID_TO_STATE_CODE: dict[str, str] = {
    "10": "NL",
    "11": "PE",
    "12": "NS",
    "13": "NB",
    "24": "QC",
    "35": "ON",
    "46": "MB",
    "47": "SK",
    "48": "AB",
    "59": "BC",
    "60": "YT",
    "61": "NT",
    "62": "NU",
}


def fetch_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def load_geonames_fsa_cities() -> dict[str, str]:
    print("Downloading GeoNames CA.zip...")
    with urllib.request.urlopen(GEONAMES_CA_ZIP, timeout=60) as response:
        payload = response.read()

    counts: dict[str, Counter[str]] = defaultdict(Counter)
    with zipfile.ZipFile(BytesIO(payload)) as archive:
        with archive.open("CA.txt") as handle:
            for raw_line in handle:
                line = raw_line.decode("utf-8").strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split("\t")
                if len(parts) < 3:
                    continue
                postal = parts[1].replace(" ", "").upper()
                place = parts[2].strip()
                if len(postal) < 3 or not place:
                    continue
                fsa = postal[:3]
                counts[fsa][place] += 1

    return {fsa: counter.most_common(1)[0][0] for fsa, counter in counts.items()}


def fetch_all_fsa_features() -> list[dict]:
    features: list[dict] = []
    offset = 0

    while True:
        params = urllib.parse.urlencode(
            {
                "where": "1=1",
                "outFields": "CFSAUID,PRNAME,PRUID",
                "f": "geojson",
                "outSR": "4326",
                "resultOffset": offset,
                "resultRecordCount": PAGE_SIZE,
            }
        )
        url = f"{ARCGIS_LAYER}?{params}"
        print(f"Fetching FSA page offset={offset}...")
        data = fetch_json(url)
        page = data.get("features") or []
        if not page:
            break
        features.extend(page)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    return features


def geometry_to_multipolygon_wkt(geometry: dict) -> str | None:
    geom_type = geometry.get("type")
    coords = geometry.get("coordinates")
    if not geom_type or coords is None:
        return None

    payload = json.dumps({"type": geom_type, "coordinates": coords})
    return payload


def truncate(value: str | None, max_len: int) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    return trimmed[:max_len]


def main() -> None:
    database_url = os.environ.get("GEO_DATABASE_URL", "").strip()
    if not database_url:
        raise SystemExit("GEO_DATABASE_URL is not set")

    fsa_cities = load_geonames_fsa_cities()
    print(f"GeoNames FSA city lookup entries: {len(fsa_cities)}")

    features = fetch_all_fsa_features()
    print(f"Downloaded FSA features: {len(features)}")
    if not features:
        raise SystemExit("No FSA features downloaded")

    rows: list[tuple] = []
    skipped = 0

    for feature in features:
        props = feature.get("properties") or {}
        geometry = feature.get("geometry")
        fsa = str(props.get("CFSAUID") or "").strip().upper()
        state = str(props.get("PRNAME") or "").strip()
        pruid = str(props.get("PRUID") or "").strip()
        state_code = PRUID_TO_STATE_CODE.get(pruid, "")

        if not fsa or not geometry:
            skipped += 1
            continue

        geom_json = geometry_to_multipolygon_wkt(geometry)
        if not geom_json:
            skipped += 1
            continue

        city = truncate(fsa_cities.get(fsa, ""), 100)
        rows.append(
            (
                truncate(fsa, 20),
                city,
                truncate(state, 100),
                truncate(state_code, 10),
                geom_json,
            )
        )

    print(f"Prepared rows: {len(rows)} (skipped {skipped})")

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM geo_zips")
            print("Cleared geo_zips")

            execute_batch(
                cur,
                """
                INSERT INTO geo_zips (zip, city, state, state_code, geom)
                VALUES (
                    %s,
                    %s,
                    %s,
                    %s,
                    ST_Multi(ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)))
                )
                """,
                rows,
                page_size=100,
            )

            cur.execute("SELECT COUNT(*) FROM geo_zips")
            total = cur.fetchone()[0]

            cur.execute(
                """
                SELECT city, state, state_code, zip
                FROM geo_zips
                WHERE ST_Contains(
                    geom,
                    ST_SetSRID(ST_Point(-79.3832, 43.6532), 4326)
                )
                LIMIT 1
                """
            )
            toronto_sample = cur.fetchone()

        conn.commit()
        print(f"Inserted rows: {total}")
        if toronto_sample:
            print(f"Sample Toronto point lookup: {toronto_sample}")
    finally:
        conn.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001
        print(f"Import failed: {error}", file=sys.stderr)
        raise
