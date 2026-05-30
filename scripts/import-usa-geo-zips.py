#!/usr/bin/env python3
"""
Download USA ZCTA boundaries (aha1994/ZCTA2020 simplified Census 2020) + GeoNames
city lookup, then load into geo_zips on the geo PostgreSQL database.

Only replaces rows with country_code = 'US'; other countries are untouched.

Usage:
  GEO_DATABASE_URL="postgresql://...?sslmode=require" python scripts/import-usa-geo-zips.py
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

COUNTRY_CODE = "US"
GEONAMES_US_ZIP = "https://download.geonames.org/export/zip/US.zip"
ZCTA_GITHUB_API = (
    "https://api.github.com/repos/aha1994/ZCTA2020/contents/"
    "2020%20Census%20Simplified"
)

US_STATE_NAME_TO_CODE: dict[str, str] = {
    "Alabama": "AL",
    "Alaska": "AK",
    "Arizona": "AZ",
    "Arkansas": "AR",
    "California": "CA",
    "Colorado": "CO",
    "Connecticut": "CT",
    "Delaware": "DE",
    "District of Columbia": "DC",
    "Florida": "FL",
    "Georgia": "GA",
    "Guam": "GU",
    "Hawaii": "HI",
    "Idaho": "ID",
    "Illinois": "IL",
    "Indiana": "IN",
    "Iowa": "IA",
    "Kansas": "KS",
    "Kentucky": "KY",
    "Louisiana": "LA",
    "Maine": "ME",
    "Maryland": "MD",
    "Massachusetts": "MA",
    "Michigan": "MI",
    "Minnesota": "MN",
    "Mississippi": "MS",
    "Missouri": "MO",
    "Montana": "MT",
    "Nebraska": "NE",
    "Nevada": "NV",
    "New Hampshire": "NH",
    "New Jersey": "NJ",
    "New Mexico": "NM",
    "New York": "NY",
    "North Carolina": "NC",
    "North Dakota": "ND",
    "Ohio": "OH",
    "Oklahoma": "OK",
    "Oregon": "OR",
    "Pennsylvania": "PA",
    "Puerto Rico": "PR",
    "Rhode Island": "RI",
    "South Carolina": "SC",
    "South Dakota": "SD",
    "Tennessee": "TN",
    "Texas": "TX",
    "Utah": "UT",
    "Vermont": "VT",
    "Virgin Islands": "VI",
    "Virginia": "VA",
    "Washington": "WA",
    "West Virginia": "WV",
    "Wisconsin": "WI",
    "Wyoming": "WY",
}


TERRITORY_STATE_CODES = frozenset({"GU", "PR", "VI", "DC"})


def fetch_json(url: str) -> dict | list:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "odyssea-geo-import/1.0"},
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.loads(response.read().decode("utf-8"))


def truncate(value: str | None, max_len: int) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    return trimmed[:max_len]


def load_geonames_postal_lookup() -> dict[str, tuple[str, str, str]]:
    print("Downloading GeoNames US.zip...")
    with urllib.request.urlopen(GEONAMES_US_ZIP, timeout=180) as response:
        payload = response.read()

    city_counts: dict[str, Counter[str]] = defaultdict(Counter)
    county_counts: dict[str, Counter[str]] = defaultdict(Counter)
    state_names: dict[str, str] = {}
    state_codes: dict[str, str] = {}

    with zipfile.ZipFile(BytesIO(payload)) as archive:
        with archive.open("US.txt") as handle:
            for raw_line in handle:
                line = raw_line.decode("utf-8").strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split("\t")
                if len(parts) < 5:
                    continue

                postal = parts[1].strip().zfill(5)
                place = parts[2].strip()
                state = parts[3].strip()
                state_code = parts[4].strip()
                county = parts[5].strip() if len(parts) > 5 else ""

                if not postal:
                    continue

                if place:
                    city_counts[postal][place] += 1
                if county:
                    county_counts[postal][county] += 1
                if state:
                    state_names[postal] = state
                if state_code:
                    state_codes[postal] = state_code

    all_postals = set(state_codes) | set(city_counts) | set(county_counts)
    lookup: dict[str, tuple[str, str, str]] = {}
    county_only = 0
    for postal in all_postals:
        city = ""
        if city_counts[postal]:
            city = city_counts[postal].most_common(1)[0][0]
        elif county_counts[postal]:
            city = county_counts[postal].most_common(1)[0][0]
            county_only += 1
        lookup[postal] = (
            city,
            state_names.get(postal, ""),
            state_codes.get(postal, ""),
        )

    print(
        f"GeoNames entries with county-only city fallback: {county_only}",
    )
    return lookup


def build_prefix_city_lookup(
    postal_lookup: dict[str, tuple[str, str, str]],
) -> dict[tuple[str, str], Counter[str]]:
    prefix_lookup: dict[tuple[str, str], Counter[str]] = defaultdict(Counter)
    for postal, values in postal_lookup.items():
        city, _, state_code = values
        if not city or not state_code or not postal:
            continue
        for prefix_len in (3, 2, 1):
            prefix_lookup[(state_code, postal[:prefix_len])][city] += 1
    return prefix_lookup


def resolve_postal_fields(
    postal: str,
    postal_lookup: dict[str, tuple[str, str, str]],
    prefix_city_lookup: dict[tuple[str, str], Counter[str]],
    file_state: str,
    file_state_code: str,
) -> tuple[str, str, str]:
    city, state, state_code = postal_lookup.get(postal, ("", "", ""))
    if not state:
        state = file_state
    if not state_code:
        state_code = file_state_code
    if not city and postal and state_code:
        for prefix_len in (3, 2, 1):
            counter = prefix_city_lookup.get((state_code, postal[:prefix_len]))
            if counter:
                city = counter.most_common(1)[0][0]
                break
    if not city and file_state_code in TERRITORY_STATE_CODES and file_state:
        city = file_state
    return city, state, state_code


def enrich_rows_from_batch(rows: list[tuple]) -> list[tuple]:
    batch_prefix: dict[tuple[str, str], Counter[str]] = defaultdict(Counter)
    for row in rows:
        postal, city, _, state_code, _, _ = row
        if not city or not state_code or not postal:
            continue
        for prefix_len in (3, 2, 1):
            batch_prefix[(state_code, postal[:prefix_len])][city] += 1

    enriched: list[tuple] = []
    for row in rows:
        postal, city, state, state_code, country_code, geom_json = row
        if city or not postal or not state_code:
            enriched.append(row)
            continue
        for prefix_len in (3, 2, 1):
            counter = batch_prefix.get((state_code, postal[:prefix_len]))
            if counter:
                city = counter.most_common(1)[0][0]
                break
        if not city and state_code in TERRITORY_STATE_CODES and state:
            city = state
        enriched.append(
            (
                postal,
                truncate(city, 100),
                state,
                state_code,
                country_code,
                geom_json,
            )
        )
    return enriched


def list_zcta_geojson_files() -> list[dict]:
    entries = fetch_json(ZCTA_GITHUB_API)
    if not isinstance(entries, list):
        raise RuntimeError("Unexpected GitHub API response for ZCTA2020")
    return sorted(
        [entry for entry in entries if entry.get("name", "").endswith(".json")],
        key=lambda item: item["name"],
    )


def parse_state_from_filename(filename: str) -> tuple[str, str]:
    state_name = filename.replace("_ZCTAs_simplified_2020.json", "")
    state_code = US_STATE_NAME_TO_CODE.get(state_name, "")
    return state_name, state_code


def extract_zip_code(properties: dict) -> str:
    for key in ("ZCTA5CE20", "GEOID20", "ZCTA5CE10", "GEOID10", "zip"):
        raw = properties.get(key)
        if raw is None:
            continue
        postal = str(raw).strip()
        if postal:
            return postal.zfill(5)
    return ""


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
    prefix_city_lookup = build_prefix_city_lookup(postal_lookup)
    print(f"GeoNames postal lookup entries: {len(postal_lookup)}")
    print(f"Postal-prefix city buckets: {len(prefix_city_lookup)}")

    files = list_zcta_geojson_files()
    print(f"USA ZCTA state files: {len(files)}")

    print("Connecting to geo database...")
    conn = psycopg2.connect(database_url, connect_timeout=60)
    conn.autocommit = False
    print("Connected.")

    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM geo_zips WHERE country_code = %s",
                (COUNTRY_CODE,),
            )
            print(
                f"Cleared geo_zips for country_code={COUNTRY_CODE} "
                f"({cur.rowcount} rows)"
            )

        total_inserted = 0
        total_skipped = 0

        for entry in files:
            name = entry["name"]
            file_state, file_state_code = parse_state_from_filename(name)
            print(f"Processing {name}...")
            data = fetch_json(entry["download_url"])
            features = data.get("features") or []
            rows: list[tuple] = []

            for feature in features:
                props = feature.get("properties") or {}
                geometry = feature.get("geometry")
                postal = extract_zip_code(props)
                if not postal or not geometry:
                    total_skipped += 1
                    continue

                geom_json = geometry_to_geojson(geometry)
                if not geom_json:
                    total_skipped += 1
                    continue

                city, state, state_code = resolve_postal_fields(
                    postal,
                    postal_lookup,
                    prefix_city_lookup,
                    file_state,
                    file_state_code,
                )
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

            rows = enrich_rows_from_batch(rows)

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
                    ST_SetSRID(ST_Point(-88.1692, 41.9985), 4326)
                )
                LIMIT 1
                """,
                (COUNTRY_CODE,),
            )
            il_sample = cur.fetchone()

            cur.execute("SELECT COUNT(*) FROM geo_zips")
            all_countries_total = cur.fetchone()[0]

            cur.execute(
                """
                SELECT COUNT(*) FROM geo_zips
                WHERE country_code = %s
                  AND (city IS NULL OR city = '')
                """,
                (COUNTRY_CODE,),
            )
            null_city = cur.fetchone()[0]

            cur.execute(
                """
                SELECT COUNT(*) FROM geo_zips
                WHERE country_code = %s
                  AND (state IS NULL OR state = '')
                """,
                (COUNTRY_CODE,),
            )
            null_state = cur.fetchone()[0]

            cur.execute(
                """
                SELECT pg_size_pretty(pg_total_relation_size('geo_zips')) AS total,
                       pg_size_pretty(pg_database_size(current_database())) AS db
                """
            )
            sizes = cur.fetchone()

        conn.commit()
        print(f"USA rows in geo_zips: {total}")
        print(f"Total rows all countries: {all_countries_total}")
        print(f"Prepared rows: {total_inserted} (skipped {total_skipped})")
        print(f"Rows missing city after fallback: {null_city}")
        print(f"Rows missing state: {null_state}")
        if sizes:
            print(f"geo_zips size: {sizes[0]}, database size: {sizes[1]}")
        if il_sample:
            print(f"Sample Hanover Park IL point lookup: {il_sample}")
    finally:
        conn.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001
        print(f"Import failed: {error}", file=sys.stderr)
        raise
