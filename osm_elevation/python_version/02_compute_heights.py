#!/usr/bin/env python3
"""
Step 2 — Compute building heights from swissALTI3D and swissSURFACE3D.

Reads OSM building footprints (GeoJSON, WGS84), reprojects to LV95,
samples DTM/DSM elevations, computes heights, and outputs enriched GeoJSON.

Reuses the elevation sampling approach from area-estimator.

Usage:
    python 02_compute_heights.py \
        -i data/osm_buildings.geojson \
        -o data/osm_buildings_enriched.geojson \
        --alti3d ../../../area-estimator/data/swissalti3d \
        --surface3d ../../../area-estimator/data/swisssurface3d \
        [--auto-fetch]
"""

import argparse
import json
import logging
import sys
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from shapely.geometry import shape, Polygon as ShapelyPolygon
from shapely import contains_xy

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)

# Coordinate transformer
WGS84_TO_LV95 = Transformer.from_crs("EPSG:4326", "EPSG:2056", always_xy=True)

MAX_CACHED_TILES = 100


# ---- Tile Index (simplified from area-estimator) ----

class TileIndex:
    """Indexes and caches swisstopo GeoTIFF tiles."""

    def __init__(self, alti3d_dir, surface3d_dir):
        self.alti3d_dir = Path(alti3d_dir) if alti3d_dir else None
        self.surface3d_dir = Path(surface3d_dir) if surface3d_dir else None
        self.tile_cache = {}
        self._cache_order = []

        self.alti3d_tiles = self._index_tiles(self.alti3d_dir) if self.alti3d_dir else {}
        self.surface3d_tiles = self._index_tiles(self.surface3d_dir) if self.surface3d_dir else {}
        log.info(f"Indexed {len(self.alti3d_tiles)} DTM + {len(self.surface3d_tiles)} DSM tiles")

    def _index_tiles(self, directory):
        if not directory or not directory.exists():
            return {}
        tiles = {}
        for f in directory.rglob("*.tif"):
            name = f.stem
            # Extract tile ID from filename like swissalti3d_2020_2600-1199_0.5_2056_5728
            parts = name.split("_")
            for p in parts:
                if "-" in p and len(p.split("-")) == 2:
                    try:
                        x, y = p.split("-")
                        int(x)
                        int(y)
                        tiles[p] = f
                        break
                    except ValueError:
                        continue
        return tiles

    def _get_raster(self, path):
        key = str(path)
        if key in self.tile_cache:
            return self.tile_cache[key]
        if len(self.tile_cache) >= MAX_CACHED_TILES:
            oldest = self._cache_order.pop(0)
            ds = self.tile_cache.pop(oldest, None)
            if ds:
                ds.close()
        ds = rasterio.open(path)
        self.tile_cache[key] = ds
        self._cache_order.append(key)
        return ds

    def sample_point(self, x_lv95, y_lv95, tile_set):
        """Sample elevation at a single LV95 point. Returns float or None."""
        tile_x = int(x_lv95 / 1000)
        tile_y = int(y_lv95 / 1000)
        tile_id = f"{tile_x}-{tile_y}"

        tile_path = tile_set.get(tile_id)
        if not tile_path:
            return None

        ds = self._get_raster(tile_path)
        try:
            row, col = ds.index(x_lv95, y_lv95)
            if 0 <= row < ds.height and 0 <= col < ds.width:
                val = ds.read(1, window=rasterio.windows.Window(col, row, 1, 1))[0, 0]
                if val != ds.nodata and not np.isnan(val):
                    return float(val)
        except Exception as e:
            log.debug(f"Raster sample error at ({x_lv95:.0f}, {y_lv95:.0f}): {e}")
        return None

    def sample_points(self, points_lv95, tile_set):
        """Sample elevations at multiple LV95 points. Returns list of floats/None."""
        return [self.sample_point(x, y, tile_set) for x, y in points_lv95]

    def close(self):
        for ds in self.tile_cache.values():
            ds.close()
        self.tile_cache.clear()


# ---- Grid creation (simplified from area-estimator) ----

def create_grid_points(polygon_lv95, spacing=2.0):
    """Create a grid of points inside a polygon in LV95 coordinates."""
    minx, miny, maxx, maxy = polygon_lv95.bounds
    xs = np.arange(minx + spacing / 2, maxx, spacing)
    ys = np.arange(miny + spacing / 2, maxy, spacing)
    if len(xs) == 0 or len(ys) == 0:
        # Very small building — use centroid
        c = polygon_lv95.centroid
        return [(c.x, c.y)]
    grid_x, grid_y = np.meshgrid(xs, ys)
    points = np.column_stack([grid_x.ravel(), grid_y.ravel()])
    # Filter to inside polygon
    mask = contains_xy(polygon_lv95, points[:, 0], points[:, 1])
    inside = points[mask]
    if len(inside) == 0:
        c = polygon_lv95.centroid
        return [(c.x, c.y)]
    return [(p[0], p[1]) for p in inside]


# ---- Height computation ----

def compute_building_height(polygon_wgs84, tile_index):
    """Compute building height from DSM - DTM for a single building footprint."""
    # Reproject to LV95 (batch transform for performance)
    coords = list(polygon_wgs84.exterior.coords)
    xs, ys = zip(*coords)
    lv95_xs, lv95_ys = WGS84_TO_LV95.transform(list(xs), list(ys))
    polygon_lv95 = ShapelyPolygon(zip(lv95_xs, lv95_ys))

    if polygon_lv95.area < 1.0:
        return None

    # Create sample grid (2m spacing for speed)
    grid_points = create_grid_points(polygon_lv95, spacing=2.0)

    # Sample DTM and DSM
    dtm_vals = tile_index.sample_points(grid_points, tile_index.alti3d_tiles)
    dsm_vals = tile_index.sample_points(grid_points, tile_index.surface3d_tiles)

    # Compute heights = DSM - DTM at each point
    heights = []
    dtm_valid = []
    dsm_valid = []
    for dtm, dsm in zip(dtm_vals, dsm_vals):
        if dtm is not None and dsm is not None:
            h = dsm - dtm
            if h > 0:
                heights.append(h)
                dtm_valid.append(dtm)
                dsm_valid.append(dsm)

    if not heights:
        return None

    return {
        "height_mean": round(np.mean(heights), 1),
        "height_max": round(np.max(heights), 1),
        "height_min": round(np.min(heights), 1),
        "elevation_ground": round(np.min(dtm_valid), 1),
        "elevation_roof": round(np.max(dsm_valid), 1),
        "sample_points": len(heights),
        "area_m2": round(polygon_lv95.area, 1),
    }


# ---- Auto-fetch tiles ----

def auto_fetch_tile(tile_id, tile_type, output_dir):
    """Download a missing tile from swisstopo."""
    import requests
    from datetime import datetime

    if tile_type == "dtm":
        url_tpl = (
            "https://data.geo.admin.ch/ch.swisstopo.swissalti3d/"
            "swissalti3d_{year}_{tile}/swissalti3d_{year}_{tile}_0.5_2056_5728.tif"
        )
        prefix = "swissalti3d"
    else:
        url_tpl = (
            "https://data.geo.admin.ch/ch.swisstopo.swisssurface3d-raster/"
            "swisssurface3d-raster_{year}_{tile}/swisssurface3d-raster_{year}_{tile}_0.5_2056_5728.tif"
        )
        prefix = "swisssurface3d-raster"

    for year in range(datetime.now().year, 2016, -1):
        url = url_tpl.format(year=year, tile=tile_id)
        try:
            resp = requests.head(url, timeout=10)
            if resp.status_code == 200:
                log.info(f"  Downloading {prefix} tile {tile_id} ({year})...")
                resp = requests.get(url, timeout=300)
                resp.raise_for_status()
                out_path = Path(output_dir) / f"{prefix}_{year}_{tile_id}_0.5_2056_5728.tif"
                out_path.parent.mkdir(parents=True, exist_ok=True)
                with open(out_path, "wb") as f:
                    f.write(resp.content)
                log.info(f"  Saved {out_path.name} ({len(resp.content) / 1024 / 1024:.1f} MB)")
                return out_path
        except Exception:
            continue
    return None


def ensure_tiles(bbox_lv95, tile_index, auto_fetch, alti3d_dir, surface3d_dir):
    """Check and optionally download missing tiles for a bounding box."""
    minx, miny, maxx, maxy = bbox_lv95
    needed = set()
    for tx in range(int(minx / 1000), int(maxx / 1000) + 1):
        for ty in range(int(miny / 1000), int(maxy / 1000) + 1):
            needed.add(f"{tx}-{ty}")

    missing_dtm = needed - set(tile_index.alti3d_tiles.keys())
    missing_dsm = needed - set(tile_index.surface3d_tiles.keys())

    if missing_dtm or missing_dsm:
        log.info(f"Missing tiles: {len(missing_dtm)} DTM, {len(missing_dsm)} DSM")
        if auto_fetch:
            for tid in missing_dtm:
                path = auto_fetch_tile(tid, "dtm", alti3d_dir)
                if path:
                    tile_index.alti3d_tiles[tid] = path
            for tid in missing_dsm:
                path = auto_fetch_tile(tid, "dsm", surface3d_dir)
                if path:
                    tile_index.surface3d_tiles[tid] = path
        else:
            log.warning("Use --auto-fetch to download missing tiles automatically")


# ---- Main ----

def main():
    parser = argparse.ArgumentParser(description="Compute building heights from DSM-DTM")
    parser.add_argument("-i", "--input", required=True, help="Input GeoJSON (WGS84)")
    parser.add_argument("-o", "--output", required=True, help="Output enriched GeoJSON")
    parser.add_argument("--alti3d", required=True, help="swissALTI3D tiles directory")
    parser.add_argument("--surface3d", required=True, help="swissSURFACE3D tiles directory")
    parser.add_argument("--auto-fetch", action="store_true", help="Download missing tiles")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of buildings (0=all)")
    args = parser.parse_args()

    # Load input
    with open(args.input, "r", encoding="utf-8") as f:
        geojson = json.load(f)

    features = geojson["features"]
    if args.limit > 0:
        features = features[:args.limit]
    log.info(f"Processing {len(features)} buildings")

    # Initialize tile index
    alti3d_dir = Path(args.alti3d)
    surface3d_dir = Path(args.surface3d)
    alti3d_dir.mkdir(parents=True, exist_ok=True)
    surface3d_dir.mkdir(parents=True, exist_ok=True)
    tile_index = TileIndex(alti3d_dir, surface3d_dir)

    # Compute bounding box in LV95 for tile fetching
    all_coords = []
    for f in features:
        for ring in f["geometry"]["coordinates"]:
            all_coords.extend(ring)
    lons = [c[0] for c in all_coords]
    lats = [c[1] for c in all_coords]
    sw = WGS84_TO_LV95.transform(min(lons), min(lats))
    ne = WGS84_TO_LV95.transform(max(lons), max(lats))
    bbox_lv95 = (sw[0], sw[1], ne[0], ne[1])

    ensure_tiles(bbox_lv95, tile_index, args.auto_fetch, args.alti3d, args.surface3d)

    # Process each building
    enriched = 0
    skipped_roof = 0
    skipped_complex = 0
    skipped_nodata = 0
    already_had = 0
    enriched_features = []
    validation_records = []

    for i, feature in enumerate(features):
        if (i + 1) % 100 == 0:
            log.info(f"  Progress: {i + 1}/{len(features)}")

        props = feature["properties"]

        # Skip buildings that already have a height tag in OSM
        if "height" in props:
            already_had += 1
            enriched_features.append(feature)
            continue

        # Skip buildings with roof definitions (already detailed in OSM)
        has_roof_tags = any(k.startswith("roof:") for k in props.keys())
        if has_roof_tags:
            skipped_roof += 1
            enriched_features.append(feature)
            continue

        # Skip complex footprints (multipolygons, many vertices, holes)
        geom = shape(feature["geometry"])
        coords = feature["geometry"].get("coordinates", [])
        num_rings = len(coords)
        num_vertices = len(coords[0]) if coords else 0
        is_complex = (
            feature["geometry"]["type"] != "Polygon" or
            num_rings > 1 or          # has holes
            num_vertices > 30 or       # very complex shape
            not geom.is_valid
        )
        if is_complex:
            skipped_complex += 1
            enriched_features.append(feature)
            continue

        # Compute height
        result = compute_building_height(geom, tile_index)

        if result:
            # OSM-compatible tags (ONLY these will be in the output)
            props["height"] = str(result["height_max"])
            props["source:height"] = "swisstopo/swissALTI3D;swissSURFACE3D"

            # Store metadata separately for validation report
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
            skipped_nodata += 1

        enriched_features.append(feature)

    # Write output
    output = {"type": "FeatureCollection", "features": enriched_features}
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False)

    # Write validation metadata as separate CSV
    if validation_records:
        import csv
        val_path = out_path.with_name(out_path.stem + "_validation.csv")
        with open(val_path, "w", newline="", encoding="utf-8") as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=validation_records[0].keys())
            writer.writeheader()
            writer.writerows(validation_records)
        log.info(f"Validation metadata: {val_path}")

    tile_index.close()

    log.info(f"\nResults:")
    log.info(f"  Total buildings: {len(features)}")
    log.info(f"  Enriched with height: {enriched}")
    log.info(f"  Already had height: {already_had}")
    log.info(f"  Skipped (roof tags): {skipped_roof}")
    log.info(f"  Skipped (complex):   {skipped_complex}")
    log.info(f"  Skipped (no data):   {skipped_nodata}")
    log.info(f"  Output: {out_path}")


if __name__ == "__main__":
    main()
