#!/usr/bin/env python3
"""
Step 3 — Validate and report on enriched buildings.

Reads the enriched GeoJSON and the validation CSV (produced by step 2),
compares computed heights with existing OSM height tags where available,
and produces a summary report.

Usage:
    python 03_validate.py -i data/osm_buildings_enriched.geojson
"""

import argparse
import csv
import json
import logging
from pathlib import Path

import numpy as np

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)


def parse_height(val):
    """Parse OSM height value (may have 'm' suffix, feet notation)."""
    if val is None:
        return None
    s = str(val).strip().lower().replace("m", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def load_validation_csv(geojson_path):
    """Load the validation CSV that sits alongside the enriched GeoJSON."""
    csv_path = Path(geojson_path).with_name(
        Path(geojson_path).stem + "_validation.csv"
    )
    if not csv_path.exists():
        log.warning(f"Validation CSV not found: {csv_path}")
        return {}

    records = {}
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            osm_id = int(row["osm_id"])
            records[osm_id] = {
                "height_max": float(row["height_max"]),
                "height_mean": float(row["height_mean"]),
                "elevation_ground": float(row["elevation_ground"]),
                "elevation_roof": float(row["elevation_roof"]),
                "area_m2": float(row["area_m2"]),
                "sample_points": int(row["sample_points"]),
            }
    log.info(f"Loaded {len(records)} validation records from {csv_path.name}")
    return records


def main():
    parser = argparse.ArgumentParser(description="Validate enriched building heights")
    parser.add_argument("-i", "--input", required=True, help="Enriched GeoJSON")
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8") as f:
        geojson = json.load(f)

    features = geojson["features"]
    total = len(features)
    validation = load_validation_csv(args.input)

    # Categorize
    enriched = [f for f in features if "source:height" in f["properties"]]
    original_height = [f for f in features
                       if "height" in f["properties"]
                       and "source:height" not in f["properties"]]
    no_height = [f for f in features if "height" not in f["properties"]]

    log.info(f"\nTotal buildings: {total}")
    log.info(f"  Enriched with computed height: {len(enriched)} ({100*len(enriched)/total:.1f}%)")
    log.info(f"  Had OSM height (untouched):    {len(original_height)} ({100*len(original_height)/total:.1f}%)")
    log.info(f"  No height (skipped):           {len(no_height)} ({100*len(no_height)/total:.1f}%)")

    # Height statistics for enriched buildings
    if enriched:
        heights = [parse_height(f["properties"]["height"]) for f in enriched]
        heights = [h for h in heights if h is not None]

        if heights:
            log.info(f"\nComputed height statistics ({len(heights)} buildings):")
            log.info(f"  Min:    {np.min(heights):.1f} m")
            log.info(f"  Max:    {np.max(heights):.1f} m")
            log.info(f"  Mean:   {np.mean(heights):.1f} m")
            log.info(f"  Median: {np.median(heights):.1f} m")
            log.info(f"  Std:    {np.std(heights):.1f} m")

            log.info(f"\nHeight distribution:")
            bins = [0, 5, 10, 15, 20, 30, 50, 100, 500]
            for i in range(len(bins) - 1):
                count = sum(1 for h in heights if bins[i] <= h < bins[i + 1])
                pct = 100 * count / len(heights) if heights else 0
                bar = "#" * int(pct / 2)
                log.info(f"  {bins[i]:3d}-{bins[i+1]:3d}m: {count:5d} ({pct:5.1f}%) {bar}")

    # Validation: compare original OSM heights vs our computation
    if original_height and validation:
        log.info(f"\nValidation (OSM height vs DSM-DTM computation):")
        diffs = []
        for f in original_height:
            osm_id = f["properties"].get("osm_id")
            osm_h = parse_height(f["properties"]["height"])
            val = validation.get(osm_id)
            if osm_h is not None and val:
                comp_h = val["height_max"]
                diff = comp_h - osm_h
                diffs.append({
                    "osm_id": osm_id,
                    "osm_height": osm_h,
                    "computed_height": comp_h,
                    "diff": round(diff, 1),
                    "name": f["properties"].get("name", ""),
                })

        if diffs:
            diff_vals = np.array([d["diff"] for d in diffs])
            log.info(f"  Compared: {len(diffs)} buildings")
            log.info(f"  Mean diff:   {np.mean(diff_vals):+.1f} m (computed - OSM)")
            log.info(f"  Median diff: {np.median(diff_vals):+.1f} m")
            log.info(f"  Std diff:    {np.std(diff_vals):.1f} m")
            log.info(f"  MAE:         {np.mean(np.abs(diff_vals)):.1f} m")
            log.info(f"  Within ±2m:  {100*np.mean(np.abs(diff_vals) <= 2):.0f}%")
            log.info(f"  Within ±5m:  {100*np.mean(np.abs(diff_vals) <= 5):.0f}%")

            log.info(f"\n  Per-building comparison:")
            for d in diffs:
                flag = "✓" if abs(d["diff"]) <= 5 else "⚠"
                log.info(f"    {flag} way/{d['osm_id']} {d['name']}: "
                         f"OSM={d['osm_height']}m, computed={d['computed_height']}m, "
                         f"diff={d['diff']:+.1f}m")
        else:
            log.info("  No buildings with both OSM height and computed height for comparison")

    # Sample enrichments (from validation CSV)
    if enriched and validation:
        log.info(f"\nSample enrichments (first 10):")
        shown = 0
        for f in enriched:
            if shown >= 10:
                break
            osm_id = f["properties"].get("osm_id")
            val = validation.get(osm_id)
            if val:
                name = f["properties"].get("name", f["properties"].get("addr:street", "unnamed"))
                log.info(f"  way/{osm_id}: {name} → height={val['height_max']}m "
                         f"(ground={val['elevation_ground']}m, "
                         f"roof={val['elevation_roof']}m, "
                         f"{val['sample_points']} samples)")
                shown += 1


if __name__ == "__main__":
    main()
