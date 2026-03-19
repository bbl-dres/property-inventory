# OSM Building Elevation Enrichment — Research

## Goal

Improve OSM building footprints with accurate height attributes using Swiss OGD data sources, to create better 3D fill-extrusion buildings in MapLibre.

## Problem

OSM building data in Switzerland has very sparse height information:
- ~2M+ buildings total
- Only ~27K have `height` tag (~1%)
- ~158K have `building:levels` tag (~8%)
- The CARTO/OpenFreeMap basemap vector tiles use `render_height` which falls back to ~5m for most buildings

## Data Sources

### 1. Building Footprints — Amtliche Vermessung (Official Survey)

**Source:** https://www.geodienste.ch/services/av
**Type:** Vector (2D polygons)
**Coverage:** All of Switzerland
**CRS:** LV95 (EPSG:2056)
**License:** OGD (Open Government Data)
**Format:** WFS, available per canton

- High-precision cadastral building footprints from the Bodenbedeckung (land cover) layer
- No height attributes — purely 2D geometry
- Each canton provides its own WFS endpoint via geodienste.ch
- Building footprints are classified by type (Gebaeude, etc.)

### 2. Building Footprints + 3D Geometry — swissTLM3D

**Source:** https://www.swisstopo.admin.ch/de/landschaftsmodell-swisstlm3d
**Type:** Vector (3D)
**Coverage:** All of Switzerland
**CRS:** LV95 (EPSG:2056)
**License:** OGD
**Format:** GeoPackage, Shapefile, File Geodatabase

- Topographic landscape model with 3D geometry
- Contains building footprints with **height information** derived from the elevation models
- Part of the swisstopo free geodata offering
- Updated regularly
- Download: https://ogd.swisstopo.admin.ch

### 3. 3D Building Models — swissBUILDINGS3D 3.0 Beta

**Source:** https://www.swisstopo.admin.ch/en/landscape-model-swissbuildings3d-3-0-beta
**Type:** 3D mesh / vector
**Coverage:** All of Switzerland
**CRS:** LV95/LN02
**License:** OGD
**Format:** GeoPackage, DWG, File Geodatabase, CityGML 2.0

- Full 3D building models with photogrammetric roof shapes
- "Separated Elements" model provides: roofs, facades, and **footprints** as separate layers
- **Computed building height** attribute (where EGID is available)
- EGID integrated in 16 cantons + City of Zurich
- Two model variants: Solid (closed volumes) and Separated Elements (faces)
- Tiled by 1:25,000 map sheets — requires merging
- Download: https://ogd.swisstopo.admin.ch

### 4. Terrain Elevation — swissALTI3D

**Source:** https://www.swisstopo.admin.ch/de/hoehenmodell-swissalti3d
**Type:** Raster DEM (Digital Terrain Model)
**Coverage:** All of Switzerland
**CRS:** LV95 (EPSG:2056)
**Resolution:** 0.5m
**License:** OGD

- Precise digital **terrain** model (DTM) — surface without vegetation and buildings
- Represents the bare earth elevation
- Can be used to compute ground-level elevation at each building footprint
- Useful for: `building base elevation = swissALTI3D value at footprint centroid`

### 5. Surface Elevation — swissSURFACE3D Raster

**Source:** https://www.swisstopo.admin.ch/de/hoehenmodell-swisssurface3d-raster
**Type:** Raster DSM (Digital Surface Model)
**Coverage:** All of Switzerland
**CRS:** LV95 (EPSG:2056)
**Resolution:** 0.5m / 2m
**License:** OGD

- Digital **surface** model (DSM) — includes vegetation, buildings, and other structures
- Represents the "top of everything" elevation
- Combined with swissALTI3D: `building height = swissSURFACE3D - swissALTI3D` at each footprint

### 6. Federal Register of Buildings (GWR/RegBL)

**Source:** https://www.bfs.admin.ch/bfs/en/home/registers/federal-register-buildings-dwellings.html
**Type:** Point data (no geometry)
**License:** Partially open (Level A)

- Contains: EGID, address, coordinates, construction year, **number of storeys**, heating, etc.
- No footprint geometry, no explicit height
- `number of storeys × ~3m` provides a rough height estimate
- EGID links to swissBUILDINGS3D and cadastral data

## Approach

### Strategy A: swissBUILDINGS3D Footprints + Computed Heights (Best Quality)

```
swissBUILDINGS3D 3.0 Beta (Separated Elements → footprint layer)
  + computed building height attribute
  → Convert LV95 → WGS84 (ogr2ogr)
  → Export to GeoJSON / vector tiles (tippecanoe)
  → Use as fill-extrusion source in MapLibre
```

**Pros:** Best accuracy, official photogrammetric heights
**Cons:** Large dataset (~55 GB GeoPackage), tiled by map sheet, requires merging

### Strategy B: Cadastral Footprints + DSM/DTM Height Computation (Most Flexible)

```
Amtliche Vermessung footprints (geodienste.ch WFS)
  + swissSURFACE3D raster (DSM)
  + swissALTI3D raster (DTM)
  → building_height = DSM_max_within_footprint - DTM_mean_within_footprint
  → Convert LV95 → WGS84
  → Export to GeoJSON / vector tiles
```

**Pros:** Independent computation, works everywhere, no EGID dependency
**Cons:** Requires raster zonal statistics (GDAL/Python), large raster files

### Strategy C: GWR Storeys Estimate (Quick & Dirty)

```
OSM building footprints (existing)
  + GWR register (EGID → storeys)
  → height = storeys × 3m
  → Enrich OSM footprints via spatial join (nearest EGID point to footprint centroid)
```

**Pros:** Simple, small data, covers most residential buildings
**Cons:** Rough estimates only, no EGID in OSM (requires spatial matching)

### Strategy D: Hybrid (Recommended)

```
1. Start with swissBUILDINGS3D footprints + heights (Strategy A) for buildings with EGID
2. Fill gaps with DSM-DTM computation (Strategy B) for remaining buildings
3. Fall back to GWR storeys estimate (Strategy C) for anything still missing
4. Convert final dataset to Mapbox Vector Tiles (MVT) using tippecanoe
5. Self-host or use PMTiles for serverless hosting
```

## Tools Required

| Tool | Purpose |
|------|---------|
| **GDAL/ogr2ogr** | CRS conversion (LV95 → WGS84), format conversion |
| **Python + rasterio** | Zonal statistics (DSM/DTM within footprints) |
| **tippecanoe** | Generate Mapbox Vector Tiles from GeoJSON |
| **PMTiles** | Serverless vector tile hosting |
| **QGIS** | Visual inspection and validation |

## Output Format

The final output should be a vector tile set with:
- Building footprint polygons (WGS84)
- `height` attribute (meters, float)
- `base_height` attribute (meters, for buildings on slopes)
- `egid` attribute (where available, for linking to other datasets)
- `source` attribute (`swissBUILDINGS3D` | `dsm_dtm` | `gwr_estimate`)

This can be served as:
- Self-hosted MVT tiles (TileServer GL)
- PMTiles on S3/GitHub Pages (serverless)
- MapLibre `vector` source with `fill-extrusion` layer

## References

- swisstopo OGD Portal: https://ogd.swisstopo.admin.ch
- geodienste.ch (cadastral WFS): https://www.geodienste.ch/services/av
- swissTLM3D: https://www.swisstopo.admin.ch/de/landschaftsmodell-swisstlm3d
- swissBUILDINGS3D 3.0: https://www.swisstopo.admin.ch/en/landscape-model-swissbuildings3d-3-0-beta
- swissALTI3D: https://www.swisstopo.admin.ch/de/hoehenmodell-swissalti3d
- swissSURFACE3D: https://www.swisstopo.admin.ch/de/hoehenmodell-swisssurface3d-raster
- GWR/RegBL: https://www.bfs.admin.ch/bfs/en/home/registers/federal-register-buildings-dwellings.html
- Open Swiss Buildings API: https://github.com/liip/open-swiss-buildings-api
- OSM Switzerland height coverage: https://taginfo.openstreetmap.ch/keys/height
- Esri enhanced 3D layers (proprietary): https://www.esri.com/arcgis-blog/products/arcgis-living-atlas/announcements/enhanced-3d-layers-in-arcgis
- OSM Simple 3D Buildings spec: https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings
- OSM Key:height spec: https://wiki.openstreetmap.org/wiki/Key:height
- Swisstopo data use in OSM: https://wiki.openstreetmap.org/wiki/Swisstopo_data_use
- OSM Import Guidelines: https://wiki.openstreetmap.org/wiki/Import/Guidelines
- SOSM swisstopo data guidance: https://sosm.ch/use-of-swisstopo-data-and-products-with-and-in-openstreetmap/

---

## OSM Tagging Specification

Per OSM wiki ([Key:height](https://wiki.openstreetmap.org/wiki/Key:height), [Simple 3D Buildings](https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings)):

### Tags to ADD (only these)

| Tag | Format | Example | Description |
|-----|--------|---------|-------------|
| `height` | Decimal meters, no unit suffix | `12.4` | Max height: top of roof to lowest ground contact |
| `source:height` | Attribution string | `swisstopo/swissALTI3D;swissSURFACE3D` | Required data source attribution |

### Tags NOT to add/modify

| Tag | Reason |
|-----|--------|
| `building:height` | Deprecated — use `height` |
| `building:levels` | Cannot reliably derive floor count from DSM-DTM |
| `min_height` | Not computed reliably |
| `roof:height` | Cannot distinguish roof from walls in DSM |
| `ele` | For point elevations, not building height |
| `building` | Never modify building type |
| Geometry | Never modify footprint |

### Height definition (OSM spec)

> "Use the maximum height — the distance between the top edge of the building
> (including roof, excluding antennas) and the lowest point at the bottom where
> the building meets the terrain."

Our computation: `height = max(DSM within footprint) - min(DTM within footprint)` matches this definition.

### Changeset attribution

```
source=swisstopo/swissALTI3D;swissSURFACE3D
comment=Add building heights computed from swisstopo DSM/DTM elevation models
```

### Legal basis

Swiss OGD license ("open use, must provide source") is compatible with OSM's ODbL license.
swisstopo confirmed central attribution is sufficient for databases with many sources ([source](https://sosm.ch/use-of-swisstopo-data-and-products-with-and-in-openstreetmap/)).

---

## Proof of Concept Results

### Test area: Bern Bundeshaus (~500m radius)

**Pipeline:**
```
01_extract_osm_buildings.py → 760 buildings from Overpass API
02_compute_heights.py       → 757 enriched (99.6%), 3 already had height
03_validate.py              → validation report
```

**Statistics:**
- Median height: 20.0m
- Mean height: 19.3m
- Most buildings: 15-30m (central Bern, 4-7 storey)
- Only 0.4% had existing OSM height tags

**Sample results:**
| Building | Computed Height | Ground Elev | Roof Elev |
|----------|----------------|-------------|-----------|
| Bundeshaus West | 27.4m | 539.6m | 568.6m |
| Casino | 33.7m | 538.8m | 573.8m |
| Burgerbibliothek | 19.2m | 539.9m | 559.5m |

**Known limitations:**
- DSM includes vegetation — trees near buildings can inflate height
- Very small footprints (<1m²) produce no grid points
- DSM/DTM temporal mismatch (different capture years)

---

## Pipeline

### Scripts

| Script | Purpose |
|--------|---------|
| `01_extract_osm_buildings.py` | Extract OSM buildings via Overpass API |
| `02_compute_heights.py` | Compute heights from swissALTI3D + swissSURFACE3D |
| `03_validate.py` | Validate and report on enriched buildings |

### Usage

```bash
# Step 1: Extract buildings for a small area
python 01_extract_osm_buildings.py --bbox "7.443,46.945,7.455,46.950" -o data/osm_buildings.geojson

# Step 2: Compute heights (auto-downloads elevation tiles)
python 02_compute_heights.py \
    -i data/osm_buildings.geojson \
    -o data/osm_buildings_enriched.geojson \
    --alti3d data/swissalti3d \
    --surface3d data/swisssurface3d \
    --auto-fetch

# Step 3: Validate
python 03_validate.py -i data/osm_buildings_enriched.geojson
```

### Related project

The [area-estimator](https://github.com/DavidRasner/area-estimator) project uses the same DSM/DTM approach for computing building volumes and gross floor areas. This pipeline reuses the same elevation sampling technique with a simplified implementation focused on OSM tag enrichment.
