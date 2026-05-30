#!/usr/bin/env python3
"""
Download Mexico postal-code polygons (open-mexico/mexico-geojson) + GeoNames city lookup,
then load into geo_zips on the geo PostgreSQL database.

Only replaces rows with country_code = 'MX'; other countries are untouched.

Usage:
  GEO_DATABASE_URL="postgresql://...?sslmode=require" python scripts/import-mexico-geo-zips.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
import zipfile
from collections import Counter, defaultdict
from io import BytesIO

import psycopg2
from psycopg2.extras import execute_batch

COUNTRY_CODE = "MX"
GEONAMES_MX_ZIP = "https://download.geonames.org/export/zip/MX.zip"
MEXICO_GEOJSON_API = (
    "https://api.github.com/repos/open-mexico/mexico-geojson/contents/"
)

# GeoNames admin_code1 (01-32) -> official 2-letter state abbreviations
ADMIN_CODE_TO_STATE_CODE: dict[str, str] = {
    "01": "AG",
    "02": "BC",
    "03": "BS",
    "04": "CM",
    "05": "CS",
    "06": "CH",
    "07": "CO",
    "08": "CL",
    "09": "DF",
    "10": "DG",
    "11": "GT",
    "12": "GR",
    "13": "HG",
    "14": "JA",
    "15": "EM",
    "16": "MI",
    "17": "MO",
    "18": "NA",
    "19": "NL",
    "20": "OA",
    "21": "PU",
    "22": "QT",
    "23": "QR",
    "24": "SL",
    "25": "SI",
    "26": "SO",
    "27": "TB",
    "28": "TM",
    "29": "TL",
    "30": "VE",
    "31": "YU",
    "32": "ZA",
}


def fetch_json(url: str) -> dict | list:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "odyssea-geo-import/1.0"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def truncate(value: str | None, max_len: int) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    return trimmed[:max_len]


def load_geonames_postal_lookup() -> dict[str, tuple[str, str, str]]:
    print("Downloading GeoNames MX.zip...")
    with urllib.request.urlopen(GEONAMES_MX_ZIP, timeout=120) as response:
        payload = response.read()

    city_counts: dict[str, Counter[str]] = defaultdict(Counter)
    state_names: dict[str, str] = {}
    state_codes: dict[str, str] = {}

    with zipfile.ZipFile(BytesIO(payload)) as archive:
        with archive.open("MX.txt") as handle:
            for raw_line in handle:
                line = raw_line.decode("utf-8").strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split("\t")
                if len(parts) < 6:
                    continue

                postal = parts[1].strip()
                municipality = parts[5].strip()
                state = parts[3].strip()
                admin_code = parts[4].strip()

                if not postal:
                    continue

                if municipality:
                    city_counts[postal][municipality] += 1
                if state:
                    state_names[postal] = state
                if admin_code:
                    state_codes[postal] = ADMIN_CODE_TO_STATE_CODE.get(
                        admin_code.zfill(2),
                        admin_code,
                    )

    lookup: dict[str, tuple[str, str, str]] = {}
    for postal, counter in city_counts.items():
        city = counter.most_common(1)[0][0]
        lookup[postal] = (
            city,
            state_names.get(postal, ""),
            state_codes.get(postal, ""),
        )

    return lookup


def list_mexico_geojson_files() -> list[dict]:
    entries = fetch_json(MEXICO_GEOJSON_API)
    if not isinstance(entries, list):
        raise RuntimeError("Unexpected GitHub API response for mexico-geojson")
    return sorted(
        [entry for entry in entries if entry.get("name", "").endswith(".geojson")],
        key=lambda item: item["name"],
    )


def geometry_to_geojson(geometry: dict) -> str | None:
    geom_type = geometry.get("type")
    coords = geometry.get("coordinates")
    if not geom_type or coords is None:
        return None
    return json.dumps({"type": geom_type, "coordinates": coords})


def main() -> None:
    database_url = os.environ.get("GEO_DATABASE_URL", "").strip()
    if not database_url:
        raise SystemExit("GEO_DATABASE_URL is not set")

    postal_lookup = load_geonames_postal_lookup()
    print(f"GeoNames postal lookup entries: {len(postal_lookup)}")

    files = list_mexico_geojson_files()
    print(f"Mexico GeoJSON state files: {len(files)}")

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM geo_zips WHERE country_code = %s",
                (COUNTRY_CODE,),
            )
            print(f"Cleared geo_zips for country_code={COUNTRY_CODE}")

        total_inserted = 0
        total_skipped = 0

        for entry in files:
            name = entry["name"]
            print(f"Processing {name}...")
            data = fetch_json(entry["download_url"])
            features = data.get("features") or []
            rows: list[tuple] = []

            for feature in features:
                props = feature.get("properties") or {}
                geometry = feature.get("geometry")
                raw_code = props.get("d_codigo")
                if raw_code is None or not geometry:
                    total_skipped += 1
                    continue

                postal = str(raw_code).strip().zfill(5)
                geom_json = geometry_to_geojson(geometry)
                if not geom_json:
                    total_skipped += 1
                    continue

                city, state, state_code = postal_lookup.get(postal, ("", "", ""))
                rows.append(
                    (
                        truncate(postal, 20),
                        truncate(city, 100),
                        truncate(state, 100),
                        truncate(state_code, 10),
                        COUNTRY_CODE,
                        geom_json,
                    )
                )

            if not rows:
                print(f"  No rows prepared for {name}")
                continue

            with conn.cursor() as cur:
                execute_batch(
                    cur,
                    """
                    INSERT INTO geo_zips (
                        zip, city, state, state_code, country_code, geom
                    )
                    VALUES (
                        %s,
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
            conn.commit()
            total_inserted += len(rows)
            print(f"  Inserted {len(rows)} rows from {name}")

        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM geo_zips WHERE country_code = %s",
                (COUNTRY_CODE,),
            )
            total = cur.fetchone()[0]

            cur.execute(
                """
                SELECT city, state, state_code, zip, country_code
                FROM geo_zips
                WHERE country_code = %s
                  AND ST_Contains(
                    geom,
                    ST_SetSRID(ST_Point(-99.1332, 19.4326), 4326)
                )
                LIMIT 1
                """,
                (COUNTRY_CODE,),
            )
            cdmx_sample = cur.fetchone()

            cur.execute("SELECT COUNT(*) FROM geo_zips")
            all_countries_total = cur.fetchone()[0]

        conn.commit()
        print(f"Mexico rows in geo_zips: {total}")
        print(f"Total rows all countries: {all_countries_total}")
        print(f"Prepared rows: {total_inserted} (skipped {total_skipped})")
        if cdmx_sample:
            print(f"Sample Mexico City point lookup: {cdmx_sample}")
    finally:
        conn.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001
        print(f"Import failed: {error}", file=sys.stderr)
        raise
