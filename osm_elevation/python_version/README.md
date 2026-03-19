# OSM Building Height Enrichment — Python Version

Full pipeline for enriching OSM buildings with height data and uploading to OpenStreetMap.
This is the Python version with server-side processing and OSM upload support.

For the browser-only version (no server required), see the parent directory's `index.html`.

## Setup

```bash
pip install -r requirements.txt
pip install osmapi  # only needed for upload step
```

Requirements: Python 3.10+, geopandas, rasterio, shapely, pyproj, requests.

## Usage

### All-in-one

```bash
# Full pipeline (dry run — no upload)
python main.py --bbox "7.443,46.945,7.455,46.950"

# With upload (asks for OSM credentials interactively)
python main.py --bbox "7.443,46.945,7.455,46.950" --upload

# Limit buildings for testing
python main.py --bbox "7.443,46.945,7.455,46.950" --limit 50
```

### Step by step

```bash
# Step 1: Extract OSM buildings
python 01_extract_osm_buildings.py --bbox "7.443,46.945,7.455,46.950" -o data/osm_buildings.geojson

# Step 2: Compute heights (auto-downloads elevation tiles ~15 MB each)
python 02_compute_heights.py \
    -i data/osm_buildings.geojson \
    -o data/osm_buildings_enriched.geojson \
    --alti3d data/swissalti3d \
    --surface3d data/swisssurface3d \
    --auto-fetch

# Step 3: Validate
python 03_validate.py -i data/osm_buildings_enriched.geojson

# Step 4: Upload (dry run first)
python 04_upload.py -i data/osm_buildings_enriched.geojson
python 04_upload.py -i data/osm_buildings_enriched.geojson --upload
```

### Web interface

```bash
pip install flask
python app.py
# Open http://localhost:5000
```

## Scripts

| Script | Purpose |
|--------|---------|
| `main.py` | Runs all steps in sequence |
| `01_extract_osm_buildings.py` | Extract OSM buildings via Overpass API |
| `02_compute_heights.py` | Compute heights from swissALTI3D + swissSURFACE3D |
| `03_validate.py` | Validate and report on enriched buildings |
| `04_upload.py` | Upload `height` + `source:height` tags to OSM |
| `app.py` | Flask web interface with real-time progress |

## OSM tags added

Only two tags per building, nothing else modified:

| Tag | Example |
|-----|---------|
| `height` | `19.2` |
| `source:height` | `swisstopo/swissALTI3D;swissSURFACE3D` |

## Safety

- Never overwrites existing `height` tags
- Skips buildings with `roof:*` tags
- Skips complex footprints (holes, >30 vertices)
- Filters heights < 2m and > 60m
- Upload re-checks each building at upload time
- Rate-limited (100ms between API calls)
- Aborts on 10 consecutive errors
- Requires manual `yes` confirmation before upload
