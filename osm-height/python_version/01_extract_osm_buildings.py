#!/usr/bin/env python3
"""
Step 1 — Extract OSM buildings for a small region via Overpass API.

Usage:
    python 01_extract_osm_buildings.py --bbox 7.42,46.93,7.48,46.96 -o data/osm_buildings.geojson

The bounding box is in WGS84 (lon_min, lat_min, lon_max, lat_max).
Default: small area around Bundeshaus Bern.
"""

import argparse
import json
import logging
import sys
from pathlib import Path

import requests

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)

OVERPASS_URL = "https://overpass.osm.ch/api/interpreter"


def query_overpass(bbox, timeout=120):
    """Query Overpass API for buildings within a WGS84 bounding box."""
    south, west, north, east = bbox[1], bbox[0], bbox[3], bbox[2]

    query = f"""
    [out:json][timeout:{timeout}];
    (
      way["building"]({south},{west},{north},{east});
      relation["building"]({south},{west},{north},{east});
    );
    out body;
    >;
    out skel qt;
    """

    log.info(f"Querying Overpass API for bbox: {west},{south},{east},{north}")
    resp = requests.post(OVERPASS_URL, data={"data": query}, timeout=timeout + 30)
    resp.raise_for_status()
    return resp.json()


def overpass_to_geojson(data):
    """Convert Overpass JSON to GeoJSON FeatureCollection."""
    nodes = {}
    ways_by_id = {}
    features = []

    # Index nodes and ways for fast lookup
    for el in data["elements"]:
        if el["type"] == "node":
            nodes[el["id"]] = (el["lon"], el["lat"])
        elif el["type"] == "way":
            ways_by_id[el["id"]] = el

    # Process ways (buildings)
    for el in data["elements"]:
        if el["type"] == "way" and "tags" in el:
            coords = [nodes[nid] for nid in el.get("nodes", []) if nid in nodes]
            if len(coords) < 4:
                continue
            # Close ring if not closed
            if coords[0] != coords[-1]:
                coords.append(coords[0])

            tags = el.get("tags", {})
            properties = {
                "osm_id": el["id"],
                "osm_type": "way",
                "building": tags.get("building", "yes"),
            }

            # Preserve existing height tags
            for key in ["height", "building:levels", "building:min_level",
                        "min_height", "roof:height", "roof:shape"]:
                if key in tags:
                    properties[key] = tags[key]

            # Preserve name and addr tags
            for key in ["name", "addr:street", "addr:housenumber",
                        "addr:postcode", "addr:city"]:
                if key in tags:
                    properties[key] = tags[key]

            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [coords]
                },
                "properties": properties
            })

    # Process multipolygon relations (first outer ring only, skip multi-outer)
    seen_relations = set()
    for el in data["elements"]:
        if el["type"] == "relation" and "tags" in el:
            tags = el.get("tags", {})
            if "building" not in tags:
                continue
            if el["id"] in seen_relations:
                continue

            # Find outer way members
            outer_members = [m for m in el.get("members", [])
                            if m["type"] == "way" and m.get("role") == "outer"]

            # Skip complex multi-outer relations
            if len(outer_members) != 1:
                continue

            way_id = outer_members[0]["ref"]
            way_el = ways_by_id.get(way_id)
            if not way_el:
                continue

            coords = [nodes[nid] for nid in way_el.get("nodes", []) if nid in nodes]
            if len(coords) < 4:
                continue
            if coords[0] != coords[-1]:
                coords.append(coords[0])

            seen_relations.add(el["id"])

            properties = {
                "osm_id": el["id"],
                "osm_type": "relation",
                "building": tags.get("building", "yes"),
            }
            # Preserve same tags as ways
            for key in ["height", "building:levels", "building:min_level",
                        "min_height", "roof:height", "roof:shape"]:
                if key in tags:
                    properties[key] = tags[key]
            for key in ["name", "addr:street", "addr:housenumber",
                        "addr:postcode", "addr:city"]:
                if key in tags:
                    properties[key] = tags[key]

            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [coords]
                },
                "properties": properties
            })

    return {"type": "FeatureCollection", "features": features}


def main():
    parser = argparse.ArgumentParser(description="Extract OSM buildings for a region")
    parser.add_argument(
        "--bbox", type=str, default="7.42,46.93,7.48,46.97",
        help="Bounding box: lon_min,lat_min,lon_max,lat_max (WGS84). Default: Bern center"
    )
    parser.add_argument("-o", "--output", type=str, default="data/osm_buildings.geojson")
    parser.add_argument("--timeout", type=int, default=120)
    args = parser.parse_args()

    bbox = [float(x) for x in args.bbox.split(",")]
    if len(bbox) != 4:
        log.error("Bounding box must have 4 values: lon_min,lat_min,lon_max,lat_max")
        sys.exit(1)
    if bbox[0] >= bbox[2] or bbox[1] >= bbox[3]:
        log.error("Invalid bbox: lon_min must be < lon_max, lat_min must be < lat_max")
        sys.exit(1)
    if not (-180 <= bbox[0] <= 180 and -90 <= bbox[1] <= 90):
        log.error("Bounding box values out of range")
        sys.exit(1)

    # Query Overpass with retry
    raw = None
    for attempt in range(3):
        try:
            raw = query_overpass(bbox, timeout=args.timeout)
            break
        except requests.exceptions.RequestException as e:
            log.warning(f"Overpass attempt {attempt + 1}/3 failed: {e}")
            if attempt < 2:
                import time
                time.sleep(5 * (attempt + 1))
    if raw is None:
        log.error("All Overpass API attempts failed")
        sys.exit(1)
    total_elements = len(raw.get("elements", []))
    log.info(f"Received {total_elements} elements from Overpass")

    # Convert to GeoJSON
    geojson = overpass_to_geojson(raw)
    count = len(geojson["features"])

    # Count existing height data
    with_height = sum(1 for f in geojson["features"] if "height" in f["properties"])
    with_levels = sum(1 for f in geojson["features"] if "building:levels" in f["properties"])
    log.info(f"Extracted {count} buildings ({with_height} with height, {with_levels} with levels)")

    # Write output
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False)

    log.info(f"Written to {out_path} ({out_path.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
