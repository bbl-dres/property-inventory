#!/usr/bin/env python3
"""
Step 4 — Upload enriched height tags to OSM.

Reads the enriched GeoJSON and adds ONLY `height` and `source:height` tags
to existing OSM ways. Never modifies geometry or other tags.

Usage:
    # Dry run (default) — shows what would be changed
    python 04_upload.py -i data/osm_buildings_enriched.geojson

    # Actual upload
    python 04_upload.py -i data/osm_buildings_enriched.geojson --upload

Requires: pip install osmapi
"""

import argparse
import getpass
import json
import logging
import os
import sys
import time
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)

CHANGESET_TAGS = {
    "comment": "Add building heights computed from swisstopo DSM/DTM elevation models",
    "source": "swisstopo/swissALTI3D;swissSURFACE3D",
    "created_by": "osm-height (bbl-dres/property-inventory)",
    "import": "yes",
    "import:page": "https://wiki.openstreetmap.org/wiki/Switzerland/swisstopo_height_import",
}

MAX_CHANGESET_SIZE = 500  # OSM recommends <=10,000 but smaller is polite


def load_enriched(path):
    """Load enriched GeoJSON and extract buildings that need uploading."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    to_upload = []
    skipped = {"no_source": 0, "not_way": 0, "too_low": 0, "too_high": 0}
    for feature in data["features"]:
        props = feature["properties"]
        # Only upload buildings that we enriched (have source:height)
        if not props.get("source:height"):
            skipped["no_source"] += 1
            continue
        if props.get("osm_type") != "way":
            skipped["not_way"] += 1
            continue
        try:
            h = float(props["height"])
        except (ValueError, TypeError):
            skipped["too_low"] += 1
            continue
        if h < 2.0:
            skipped["too_low"] += 1
            continue
        if h > 60.0:
            skipped["too_high"] += 1
            continue
        to_upload.append({
            "osm_id": props["osm_id"],
            "height": props["height"],
            "source:height": props["source:height"],
        })
    if any(skipped.values()):
        log.info(f"Filtered out: {skipped}")

    return to_upload


def main():
    parser = argparse.ArgumentParser(description="Upload height tags to OSM")
    parser.add_argument("-i", "--input", required=True, help="Enriched GeoJSON")
    parser.add_argument("--upload", action="store_true", help="Actually upload (default: dry run)")
    parser.add_argument("--username", type=str, help="OSM username")
    parser.add_argument("--password", type=str, help="OSM password")
    parser.add_argument("--batch-size", type=int, default=MAX_CHANGESET_SIZE)
    args = parser.parse_args()

    buildings = load_enriched(args.input)
    log.info(f"Buildings to update: {len(buildings)}")

    if not buildings:
        log.info("Nothing to upload.")
        return

    # Show summary
    heights = [float(b["height"]) for b in buildings]
    log.info(f"Height range: {min(heights):.1f}m - {max(heights):.1f}m")
    log.info(f"Mean height: {sum(heights)/len(heights):.1f}m")

    # Show sample
    log.info(f"\nSample (first 10):")
    for b in buildings[:10]:
        log.info(f"  way/{b['osm_id']} → height={b['height']}m")

    # Tags that will be added
    log.info(f"\nTags to add per building:")
    log.info(f"  height = <computed value>")
    log.info(f"  source:height = swisstopo/swissALTI3D;swissSURFACE3D")
    log.info(f"\nChangeset tags:")
    for k, v in CHANGESET_TAGS.items():
        log.info(f"  {k} = {v}")

    if not args.upload:
        log.info(f"\n{'='*60}")
        log.info(f"DRY RUN — no changes made. Use --upload to actually upload.")
        log.info(f"{'='*60}")
        return

    # Resolve credentials: args > env vars > interactive prompt
    username = args.username or os.environ.get("OSM_USERNAME")
    password = args.password or os.environ.get("OSM_PASSWORD")
    if not username:
        username = input("OSM username: ").strip()
    if not password:
        password = getpass.getpass("OSM password: ")
    if not username or not password:
        log.error("Username and password are required for upload")
        sys.exit(1)

    # Confirm
    print(f"\n⚠ About to modify {len(buildings)} OSM ways.")
    print(f"  Adding ONLY: height + source:height tags")
    print(f"  Changeset: {CHANGESET_TAGS['comment']}")
    confirm = input(f"\n  Type 'yes' to proceed: ")
    if confirm.strip().lower() != "yes":
        log.info("Aborted.")
        return

    # Import osmapi
    try:
        import osmapi
    except ImportError:
        log.error("Install osmapi: pip install osmapi")
        sys.exit(1)

    api = osmapi.OsmApi(username=username, password=password)

    # Process in batches
    total_updated = 0
    total_errors = 0
    batches = [buildings[i:i + args.batch_size] for i in range(0, len(buildings), args.batch_size)]

    for batch_num, batch in enumerate(batches, 1):
        log.info(f"\nBatch {batch_num}/{len(batches)} ({len(batch)} buildings)")

        try:
            api.ChangesetCreate(CHANGESET_TAGS)
        except Exception as e:
            log.error(f"Failed to create changeset: {e}")
            break

        for building in batch:
            try:
                # Fetch current way from OSM
                way = api.WayGet(building["osm_id"])

                # Safety checks: don't overwrite existing height or roof tags
                if "height" in way["tag"]:
                    log.warning(f"  way/{building['osm_id']}: already has height={way['tag']['height']}, skipping")
                    continue
                if any(k.startswith("roof:") for k in way["tag"]):
                    log.warning(f"  way/{building['osm_id']}: has roof tags, skipping")
                    continue

                # Add ONLY height tags — never touch anything else
                way["tag"]["height"] = building["height"]
                way["tag"]["source:height"] = building["source:height"]

                # Update
                api.WayUpdate(way)
                total_updated += 1

                # Rate limit: 100ms between updates to be polite
                time.sleep(0.1)

            except Exception as e:
                log.error(f"  way/{building['osm_id']}: {e}")
                total_errors += 1
                if total_errors >= 10:
                    log.error("Too many errors, aborting batch")
                    break

        try:
            api.ChangesetClose()
            log.info(f"  Changeset closed. Updated {total_updated} ways so far.")
        except Exception as e:
            log.error(f"Failed to close changeset: {e}")

    log.info(f"\nDone.")
    log.info(f"  Updated: {total_updated}")
    log.info(f"  Errors: {total_errors}")
    log.info(f"  Skipped (already had height): checked at upload time")


if __name__ == "__main__":
    main()
