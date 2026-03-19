#!/usr/bin/env python3
"""
OSM Building Height Enrichment — Main Pipeline

Extracts OSM buildings, computes heights from swisstopo elevation data,
validates results, and optionally uploads to OpenStreetMap.

Usage:
    # Full pipeline for a small area (dry run — no upload)
    python main.py --bbox "7.443,46.945,7.455,46.950"

    # With upload (requires OSM credentials)
    python main.py --bbox "7.443,46.945,7.455,46.950" --upload

    # Custom directories for elevation tiles
    python main.py --bbox "7.443,46.945,7.455,46.950" \
        --alti3d /path/to/swissalti3d \
        --surface3d /path/to/swisssurface3d

    # Limit number of buildings (for testing)
    python main.py --bbox "7.443,46.945,7.455,46.950" --limit 50

Examples:
    # Bern Bundeshaus area (~700 buildings)
    python main.py --bbox "7.443,46.945,7.455,46.950"

    # Zurich old town (~1500 buildings)
    python main.py --bbox "8.535,47.370,8.548,47.378"

    # Small village for testing (~100 buildings)
    python main.py --bbox "7.455,46.935,7.465,46.942" --limit 100
"""

import argparse
import logging
import sys
import time
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent / "data"


def run_extract(bbox, timeout, output):
    """Step 1: Extract OSM buildings from Overpass API."""
    log.info("=" * 60)
    log.info("STEP 1: Extract OSM buildings")
    log.info("=" * 60)

    from importlib import import_module
    extract = import_module("01_extract_osm_buildings")

    # Parse bbox
    bbox_list = [float(x) for x in bbox.split(",")]
    if len(bbox_list) != 4:
        log.error("Bounding box must have 4 values: lon_min,lat_min,lon_max,lat_max")
        sys.exit(1)

    raw = None
    import requests
    for attempt in range(3):
        try:
            raw = extract.query_overpass(bbox_list, timeout=timeout)
            break
        except requests.exceptions.RequestException as e:
            log.warning(f"Attempt {attempt + 1}/3 failed: {e}")
            if attempt < 2:
                time.sleep(5 * (attempt + 1))
    if raw is None:
        log.error("All Overpass API attempts failed")
        sys.exit(1)

    geojson = extract.overpass_to_geojson(raw)
    count = len(geojson["features"])
    with_height = sum(1 for f in geojson["features"] if "height" in f["properties"])

    import json
    output.parent.mkdir(parents=True, exist_ok=True)
    with open(output, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False)

    log.info(f"Extracted {count} buildings ({with_height} already have height)")
    log.info(f"Output: {output}")
    return count


def run_compute(input_path, output_path, alti3d_dir, surface3d_dir, auto_fetch, limit):
    """Step 2: Compute building heights from DSM - DTM."""
    log.info("")
    log.info("=" * 60)
    log.info("STEP 2: Compute building heights")
    log.info("=" * 60)

    import json
    from importlib import import_module
    compute = import_module("02_compute_heights")

    with open(input_path, "r", encoding="utf-8") as f:
        geojson = json.load(f)

    features = geojson["features"]
    if limit > 0:
        features = features[:limit]
        geojson["features"] = features

    log.info(f"Processing {len(features)} buildings")

    # Initialize tiles
    alti3d = Path(alti3d_dir)
    surface3d = Path(surface3d_dir)
    alti3d.mkdir(parents=True, exist_ok=True)
    surface3d.mkdir(parents=True, exist_ok=True)
    tile_index = compute.TileIndex(alti3d, surface3d)

    # Compute bbox for tile fetching
    all_coords = []
    for f in features:
        for ring in f["geometry"]["coordinates"]:
            all_coords.extend(ring)
    lons = [c[0] for c in all_coords]
    lats = [c[1] for c in all_coords]
    sw = compute.WGS84_TO_LV95.transform(min(lons), min(lats))
    ne = compute.WGS84_TO_LV95.transform(max(lons), max(lats))
    compute.ensure_tiles((sw[0], sw[1], ne[0], ne[1]), tile_index, auto_fetch, str(alti3d), str(surface3d))

    # Process
    from shapely.geometry import shape
    enriched = 0
    skipped = 0
    already_had = 0
    validation_records = []

    for i, feature in enumerate(features):
        if (i + 1) % 100 == 0:
            log.info(f"  Progress: {i + 1}/{len(features)}")

        props = feature["properties"]

        if "height" in props:
            already_had += 1
            continue

        if any(k.startswith("roof:") for k in props.keys()):
            skipped += 1
            continue

        coords = feature["geometry"].get("coordinates", [])
        num_rings = len(coords)
        num_vertices = len(coords[0]) if coords else 0
        geom = shape(feature["geometry"])
        if (feature["geometry"]["type"] != "Polygon" or
                num_rings > 1 or num_vertices > 30 or not geom.is_valid):
            skipped += 1
            continue

        result = compute.compute_building_height(geom, tile_index)
        if result:
            props["height"] = str(result["height_max"])
            props["source:height"] = "swisstopo/swissALTI3D;swissSURFACE3D"
            validation_records.append({
                "osm_id": props.get("osm_id"),
                "height_max": result["height_max"],
                "height_mean": result["height_mean"],
                "elevation_ground": result["elevation_ground"],
                "elevation_roof": result["elevation_roof"],
                "area_m2": result["area_m2"],
                "sample_points": result["sample_points"],
            })
            enriched += 1
        else:
            skipped += 1

    # Write output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False)

    # Write validation CSV
    if validation_records:
        import csv
        val_path = output_path.with_name(output_path.stem + "_validation.csv")
        with open(val_path, "w", newline="", encoding="utf-8") as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=validation_records[0].keys())
            writer.writeheader()
            writer.writerows(validation_records)

    tile_index.close()

    log.info(f"Enriched: {enriched}, Already had: {already_had}, Skipped: {skipped}")
    log.info(f"Output: {output_path}")
    return enriched


def run_validate(input_path):
    """Step 3: Validate and report."""
    log.info("")
    log.info("=" * 60)
    log.info("STEP 3: Validate results")
    log.info("=" * 60)

    import subprocess
    result = subprocess.run(
        [sys.executable, "03_validate.py", "-i", str(input_path)],
        cwd=str(Path(__file__).parent),
    )
    return result.returncode == 0


def run_upload(input_path, batch_size):
    """Step 4: Upload to OSM (requires manual confirmation)."""
    log.info("")
    log.info("=" * 60)
    log.info("STEP 4: Upload to OpenStreetMap")
    log.info("=" * 60)

    import subprocess
    result = subprocess.run(
        [sys.executable, "04_upload.py", "-i", str(input_path),
         "--upload", "--batch-size", str(batch_size)],
        cwd=str(Path(__file__).parent),
    )
    return result.returncode == 0


def main():
    parser = argparse.ArgumentParser(
        description="OSM Building Height Enrichment Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python main.py --bbox "7.443,46.945,7.455,46.950"          # Bern (dry run)
  python main.py --bbox "7.443,46.945,7.455,46.950" --upload  # Bern (with upload)
  python main.py --bbox "8.535,47.370,8.548,47.378"           # Zurich old town
  python main.py --bbox "7.443,46.945,7.455,46.950" --limit 50  # Test with 50 buildings
        """,
    )
    parser.add_argument(
        "--bbox", required=True,
        help="Bounding box: lon_min,lat_min,lon_max,lat_max (WGS84)"
    )
    parser.add_argument(
        "--alti3d", default=str(DATA_DIR / "swissalti3d"),
        help="swissALTI3D tiles directory (default: data/swissalti3d)"
    )
    parser.add_argument(
        "--surface3d", default=str(DATA_DIR / "swisssurface3d"),
        help="swissSURFACE3D tiles directory (default: data/swisssurface3d)"
    )
    parser.add_argument(
        "--auto-fetch", action="store_true", default=True,
        help="Auto-download missing elevation tiles (default: True)"
    )
    parser.add_argument(
        "--no-auto-fetch", action="store_false", dest="auto_fetch",
        help="Don't auto-download tiles"
    )
    parser.add_argument(
        "--limit", type=int, default=0,
        help="Limit number of buildings to process (0 = all)"
    )
    parser.add_argument(
        "--upload", action="store_true",
        help="Run upload step (requires OSM credentials, asks for confirmation)"
    )
    parser.add_argument(
        "--batch-size", type=int, default=500,
        help="Upload batch size per changeset (default: 500)"
    )
    parser.add_argument(
        "--timeout", type=int, default=180,
        help="Overpass API timeout in seconds (default: 180)"
    )
    args = parser.parse_args()

    raw_path = DATA_DIR / "osm_buildings.geojson"
    enriched_path = DATA_DIR / "osm_buildings_enriched.geojson"

    start = time.time()

    # Step 1: Extract
    count = run_extract(args.bbox, args.timeout, raw_path)
    if count == 0:
        log.error("No buildings found. Check your bounding box.")
        sys.exit(1)

    # Step 2: Compute heights
    enriched = run_compute(
        raw_path, enriched_path,
        args.alti3d, args.surface3d,
        args.auto_fetch, args.limit,
    )
    if enriched == 0:
        log.warning("No buildings were enriched. Nothing to upload.")
        sys.exit(0)

    # Step 3: Validate
    run_validate(enriched_path)

    elapsed = time.time() - start
    log.info("")
    log.info(f"Pipeline complete in {elapsed:.0f}s")
    log.info(f"Enriched GeoJSON: {enriched_path}")

    # Step 4: Upload (optional, requires --upload flag)
    if args.upload:
        log.info("")
        log.info("The upload step will modify live OSM data.")
        log.info("Tags added per building: height, source:height")
        log.info("Buildings with existing height or roof tags are skipped.")
        confirm = input("\nProceed with upload? Type 'yes' to continue: ")
        if confirm.strip().lower() == "yes":
            run_upload(enriched_path, args.batch_size)
        else:
            log.info("Upload skipped.")
    else:
        log.info("")
        log.info("To upload to OSM, re-run with --upload flag:")
        log.info(f"  python main.py --bbox \"{args.bbox}\" --upload")


if __name__ == "__main__":
    main()
