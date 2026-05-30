#!/usr/bin/env python3
"""
Download Mexico postal-code polygons (open-mexico/mexico-geojson) + SEPOMEX/GeoNames
city lookup, then load into geo_zips on the geo PostgreSQL database.

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
SEPOMEX_CP_URL = (
    "https://www.correosdemexico.gob.mx/datosabiertos/cp/cpdescarga.txt"
)
MEXICO_GEOJSON_API = (
    "https://api.github.com/repos/open-mexico/mexico-geojson/contents/"
)

# GeoNames admin_code1 (01-32) -> official 2-letter state abbreviations
GEONAMES_ADMIN_CODE_TO_STATE_CODE: dict[str, str] = {
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

# SEPOMEX c_estado uses a different numbering than GeoNames admin_code1
SEPOMEX_STATE_CODE_TO_ABBR: dict[str, str] = {
    "01": "AG",
    "02": "BC",
    "03": "BS",
    "04": "CM",
    "05": "CO",
    "06": "CL",
    "07": "CS",
    "08": "CH",
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

# open-mexico filenames do not match GeoNames admin codes — map file -> state metadata
FILE_STATE_INFO: dict[str, tuple[str, str]] = {
    "01-Ags.geojson": ("Aguascalientes", "AG"),
    "02-Bc.geojson": ("Baja California", "BC"),
    "03-Bcs.geojson": ("Baja California Sur", "BS"),
    "04-Camp.geojson": ("Campeche", "CM"),
    "05-Coah.geojson": ("Coahuila de Zaragoza", "CO"),
    "06-Col.geojson": ("Colima", "CL"),
    "07-Chis.geojson": ("Chiapas", "CS"),
    "08-Chih.geojson": ("Chihuahua", "CH"),
    "09-Cdmx.geojson": ("Ciudad de México", "DF"),
    "10-Dgo.geojson": ("Durango", "DG"),
    "11-Gto.geojson": ("Guanajuato", "GT"),
    "12-Gro.geojson": ("Guerrero", "GR"),
    "13-Hgo.geojson": ("Hidalgo", "HG"),
    "14-Jal.geojson": ("Jalisco", "JA"),
    "15-Mex.geojson": ("México", "EM"),
    "16-Mich.geojson": ("Michoacán de Ocampo", "MI"),
    "17-Mor.geojson": ("Morelos", "MO"),
    "18-Nay.geojson": ("Nayarit", "NA"),
    "19-NL.geojson": ("Nuevo León", "NL"),
    "20-Oax.geojson": ("Oaxaca", "OA"),
    "21-Pue.geojson": ("Puebla", "PU"),
    "22-Qro.geojson": ("Querétaro", "QT"),
    "23-Qroo.geojson": ("Quintana Roo", "QR"),
    "24-SLP.geojson": ("San Luis Potosí", "SL"),
    "25-Sin.geojson": ("Sinaloa", "SI"),
    "26-Son.geojson": ("Sonora", "SO"),
    "27-Tab.geojson": ("Tabasco", "TB"),
    "28-Tmps.geojson": ("Tamaulipas", "TM"),
    "29-Tlax.geojson": ("Tlaxcala", "TL"),
    "30-Ver.geojson": ("Veracruz de Ignacio de la Llave", "VE"),
    "31-Yuc.geojson": ("Yucatán", "YU"),
    "32-Zac.geojson": ("Zacatecas", "ZA"),
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


def load_sepomex_postal_lookup() -> dict[str, tuple[str, str, str]]:
    print("Downloading SEPOMEX CPdescarga.txt...")
    request = urllib.request.Request(
        SEPOMEX_CP_URL,
        headers={"User-Agent": "odyssea-geo-import/1.0"},
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        raw_text = response.read().decode("latin-1", errors="replace")

    city_counts: dict[str, Counter[str]] = defaultdict(Counter)
    state_names: dict[str, str] = {}
    state_codes: dict[str, str] = {}

    for index, line in enumerate(raw_text.splitlines()):
        if index == 0 or not line.strip():
            continue
        parts = line.split("|")
        if len(parts) < 8:
            continue

        postal = parts[0].strip().zfill(5)
        municipality = parts[3].strip()
        state = parts[4].strip()
        admin_code = parts[7].strip()

        if not postal:
            continue

        if municipality:
            city_counts[postal][municipality] += 1
        if state:
            state_names[postal] = state
        if admin_code:
            state_codes[postal] = SEPOMEX_STATE_CODE_TO_ABBR.get(
                admin_code.zfill(2),
                admin_code,
            )

    lookup: dict[str, tuple[str, str, str]] = {}
    for postal, counter in city_counts.items():
        lookup[postal] = (
            counter.most_common(1)[0][0],
            state_names.get(postal, ""),
            state_codes.get(postal, ""),
        )

    return lookup


def load_geonames_postal_lookup() -> dict[str, tuple[str, str, str]]:
    print("Downloading GeoNames MX.zip (fallback)...")
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

                postal = parts[1].strip().zfill(5)
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
                    state_codes[postal] = GEONAMES_ADMIN_CODE_TO_STATE_CODE.get(
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


def merge_postal_lookups(
    *lookups: dict[str, tuple[str, str, str]],
) -> dict[str, tuple[str, str, str]]:
    merged: dict[str, tuple[str, str, str]] = {}
    for lookup in lookups:
        for postal, values in lookup.items():
            city, state, state_code = values
            existing = merged.get(postal, ("", "", ""))
            merged[postal] = (
                city or existing[0],
                state or existing[1],
                state_code or existing[2],
            )
    return merged


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

    postal_lookup = merge_postal_lookups(
        load_sepomex_postal_lookup(),
        load_geonames_postal_lookup(),
    )
    prefix_city_lookup = build_prefix_city_lookup(postal_lookup)
    print(f"Combined postal lookup entries: {len(postal_lookup)}")
    print(f"Postal-prefix city buckets: {len(prefix_city_lookup)}")

    files = list_mexico_geojson_files()
    print(f"Mexico GeoJSON state files: {len(files)}")

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
            print(f"Cleared geo_zips for country_code={COUNTRY_CODE} ({cur.rowcount} rows)")

        total_inserted = 0
        total_skipped = 0

        for entry in files:
            name = entry["name"]
            file_state, file_state_code = FILE_STATE_INFO.get(name, ("", ""))
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
                    ST_SetSRID(ST_Point(-99.1332, 19.4326), 4326)
                )
                LIMIT 1
                """,
                (COUNTRY_CODE,),
            )
            cdmx_sample = cur.fetchone()

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

        conn.commit()
        print(f"Mexico rows in geo_zips: {total}")
        print(f"Total rows all countries: {all_countries_total}")
        print(f"Prepared rows: {total_inserted} (skipped {total_skipped})")
        print(f"Rows missing city after fallback: {null_city}")
        print(f"Rows missing state: {null_state}")
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
