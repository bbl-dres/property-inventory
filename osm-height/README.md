# OSM Building Height Enrichment

Add accurate building heights to OpenStreetMap using Swiss open government elevation data. Runs entirely in the browser — no server, no build step, no dependencies.

## Quick start

```bash
# Option A: Open directly
open index.html

# Option B: Local server (if browser blocks fetch from file://)
python -m http.server 8080
# Open http://localhost:8080
```

1. Draw a rectangle on the map to select an area
2. Click **Run Pipeline**
3. Wait for height computation (progress shown in real-time)
4. Click **Show 3D on Map** to visualize results
5. Click **Download GeoJSON** to save the enriched data

## How it works

```mermaid
flowchart TB
    subgraph "Browser — no server required"
        A["1. User draws rectangle on map"] --> B["fetch() → Overpass API"]
        B --> C["OSM buildings (ways + relations)"]
        C --> D{For each building}
        D -->|has height?| SKIP1["Skip (blue)"]
        D -->|has roof:height?| SKIP2["Skip (orange)"]
        D -->|multipolygon?| SKIP3["Skip (grey)"]
        D -->|processable| E["Create 2m sample grid inside footprint"]
        E --> F["geotiff.js → swissALTI3D COG"]
        E --> G["geotiff.js → swissSURFACE3D COG"]
        F --> H["height = P95(DSM_i − DTM_i)"]
        G --> H
        H -->|< 2m or > 60m| SKIP4["Skip (out of range)"]
        H -->|small footprint + tall| SKIP5["Skip (likely trees, brown)"]
        H -->|2m–60m| I["Add height + source:height"]
        I --> J["2. Enriched GeoJSON"]
        J --> K["3. Review: 3D visualization + stats"]
        J --> L["Download GeoJSON"]
        K --> M["4. OAuth2 login → OSM API"]
        M --> N["Batch upload via OsmChange XML"]
    end

    style SKIP1 fill:#e3f2fd,stroke:#90caf9
    style SKIP2 fill:#fff3e0,stroke:#ffcc80
    style SKIP3 fill:#f5f5f5,stroke:#ccc
    style SKIP4 fill:#f5f5f5,stroke:#ccc
    style SKIP5 fill:#efebe9,stroke:#8d6e63
```

For each building, a grid of sample points (2m spacing) is created inside the footprint.
At each point, terrain (DTM) and surface (DSM) elevations are read directly from
swisstopo Cloud Optimized GeoTIFF (COG) files via HTTP range requests — no download needed.
The building height is computed as:

```
height_i = DSM_i − DTM_i         (per-point height above ground)
height   = P95(height_i)          (95th percentile of all sample points)
```

The per-point difference accounts for sloped terrain correctly — each sample
measures roof height relative to the ground directly beneath it.
The 95th percentile filters outliers from chimneys, antennas, and overhanging trees.
`max()` would overestimate due to these point features in the DSM.

This matches the [OSM height definition](https://wiki.openstreetmap.org/wiki/Key:height):
*"the distance between the top edge of the building (including roof, excluding antennas)
and the lowest point at the bottom where the building meets the terrain."*

## Data sources

| Data | Source | License | Access |
|------|--------|---------|--------|
| Building footprints | [OpenStreetMap](https://www.openstreetmap.org) | ODbL | Overpass API |
| Terrain elevation (DTM) | [swissALTI3D](https://www.swisstopo.admin.ch/de/hoehenmodell-swissalti3d) | OGD | COG via HTTP range |
| Surface elevation (DSM) | [swissSURFACE3D](https://www.swisstopo.admin.ch/de/hoehenmodell-swisssurface3d-raster) | OGD | COG via HTTP range |

No data downloads required — elevation tiles are read on-the-fly from swisstopo's CDN
using Cloud Optimized GeoTIFF range requests.

## OSM tags

Only two tags are added per building. No geometry or other tags are modified.

| Tag | Example | Description |
|-----|---------|-------------|
| `height` | `19.2` | 95th percentile height in meters (decimal, no unit suffix) |
| `source:height` | `swisstopo/swissALTI3D;swissSURFACE3D` | Data source attribution |

## Safety filters

The pipeline is designed to be **non-destructive** — it only adds missing data, never
modifies existing tags or geometry. Buildings are skipped for the following reasons:

### Already has height (blue on map)

Buildings with an existing `height` tag are never modified. The original value is
preserved regardless of whether it matches our computation.

### Measured roof height (orange on map)

Buildings with a `roof:height` tag are skipped. This tag means someone already
measured the building precisely — our DSM-based estimate could be less accurate.

Tags that are **not** skipped:
- `roof:shape` — defines shape (gabled, hipped, etc.) but not total height. Adding
  `height` actually helps: the renderer calculates `wall = height - roof:height`.
- `roof:levels` — informational (floor count in roof), safe to enrich
- `roof:colour`, `roof:material` — cosmetic, no geometric conflict

### Complex footprint (grey on map)

Buildings with multipolygon geometry (holes in the footprint) are skipped.
The grid sampling could hit the open courtyard, producing incorrect heights.

Single-ring polygons of any vertex count are processed — even detailed
footprints like the Bundeshaus (106 vertices) work fine.

### Small footprint + tall height (brown on map)

Buildings with a footprint area under 50 m² and a computed height above 15 m are
skipped. These are almost always small sheds or outbuildings where the DSM reads
tree canopy instead of the actual roof. The P95 filter cannot help here because
the entire footprint is under the canopy.

### Height out of range (grey on map)

Computed heights outside a plausible range are discarded:
- **< 2m** — likely noise, sheds, or measurement error
- **\> 60m** — likely spires, antennas, cranes, or vegetation artifacts in the DSM

### No elevation data

Buildings in areas without swisstopo coverage (outside Switzerland) or where
elevation tiles are unavailable are skipped silently.

### Upload re-checks

At upload time, each building is re-fetched from OSM and checked again:
- If `height` was added since extraction → skip
- If `roof:shape` or `roof:height` was added since extraction → skip
- This prevents conflicts with concurrent OSM edits

## Upload to OSM

The tool supports uploading enriched heights directly to OpenStreetMap via OAuth2.

### Setup

1. Register an OAuth2 app at https://www.openstreetmap.org/oauth2/applications
   - **Name**: `OSM Building Height Enrichment`
   - **Redirect URI**: your deployment URL (e.g. `https://yourname.github.io/...`)
   - **Confidential**: No (uncheck)
   - **Permissions**: `Modify the map` + `Read user preferences`
2. Copy the Client ID into the tool's Step 4
3. Click "Login with OpenStreetMap" to authorize

### Rate limits

OSM enforces rate limits on edits ([source](https://github.com/openstreetmap/openstreetmap-website/pull/4319)):

| Account age | Limit |
|------------|-------|
| New (< 1 day) | ~1,000 changes/hour |
| 1 week | ~100,000 changes/hour |
| With `importer` role | Higher (granted by moderators) |

The limit ramps up quadratically over the first week. Each modified way counts as
1 change. A **rate limit slider** in Step 4 lets you control the upload speed
(default: 1,000 edits/hour, range: 100–5,000). The tool handles rate limits automatically:

- Uploads in batches of 50 elements, paced by the slider setting
- On 429 (rate limited): retries with progressive backoff (30s → 60s → 90s → ...)
- After each rate limit hit, future batch delays increase
- Up to 10 retries before giving up on a batch

**For large uploads (>1,000 buildings):** wait until your account is at least 1 week old,
or request the `importer` role from OSM moderators.

### Upload batching

- OsmChange XML is used for efficient batch uploads (1 HTTP request per batch)
- Ways are batch-fetched (`GET /api/0.6/ways?ways=id1,id2,...`) before upload
- Changesets are automatically split at 9,000 elements (below OSM's 10K limit)

### Import guidelines

For large-scale imports, follow the [OSM Import Guidelines](https://wiki.openstreetmap.org/wiki/Import/Guidelines):
1. Document the import on the OSM wiki
2. Use a dedicated account (e.g. `swisstopo_height_import`)
3. Announce on the Swiss OSM mailing list
4. Wait 2 weeks for community feedback

## Technology

Single HTML file using:
- [MapLibre GL JS](https://maplibre.org/) — map + 3D visualization
- [geotiff.js](https://geotiffjs.github.io/) — read Cloud Optimized GeoTIFF in browser
- [proj4js](http://proj4js.org/) — WGS84 ↔ LV95 coordinate transform
- [Overpass API](https://overpass.osm.ch/) — OSM data extraction

No npm, no webpack, no build step, no server-side code.

## Known limitations

- **Vegetation**: DSM includes tree canopy — buildings under/near trees may have inflated heights (mitigated by P95)
- **Temporal mismatch**: DTM and DSM tiles may be from different years (2017–2025)
- **Small footprints**: Very small buildings may use a single sample point (centroid), less accurate
- **Spires/antennas**: filtered by P95 + 60m max threshold, but short spires on small buildings may still inflate values
- **Area size limit**: hard limit at 25 km² per run; recommended < 2 km² for best performance
- **Swiss coverage only**: swisstopo elevation data covers Switzerland; buildings outside are skipped
- **Relations**: multipolygon buildings are extracted and computed but **not uploaded** (upload not yet supported)
- **Rate limits**: new OSM accounts are limited to ~1,000 edits/hour; the tool retries automatically but large uploads may take time

## Python version

A full Python pipeline with OSM upload support is available in `python_version/`:

```bash
cd python_version
pip install -r requirements.txt
python main.py --bbox "7.443,46.945,7.455,46.950"
python main.py --bbox "7.443,46.945,7.455,46.950" --upload
```

## Related

- [area-estimator](https://github.com/DavidRasner/area-estimator) — building volume and floor area estimation using the same DSM/DTM approach
- [RESEARCH.md](RESEARCH.md) — detailed research notes on data sources, OSM tagging spec, and import guidelines
