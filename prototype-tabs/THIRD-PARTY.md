# Third-party components

Everything in this prototype that was not written for it: the vendored libraries, the bundled assets and
the external services the running app talks to. Every local copy has its licence file next to it. The
app itself needs no CDN: with the vendored files and the fictional data it starts offline; only the
basemaps, the swisstopo services and the placeholder photos come from the internet at runtime.

## Vendored libraries (`vendor/`)

| Component | Version | Licence | Files | Used for |
|---|---|---|---|---|
| [MapLibre GL JS](https://maplibre.org/) | 5.19.0 | BSD-3-Clause | `vendor/maplibre-gl/` (`maplibre-gl.js`, `maplibre-gl.css`, `LICENSE.txt`) | Map, mini map, markers, popups |
| [jsPDF](https://github.com/parallax/jsPDF) | 2.5.1 | MIT | `vendor/jspdf/` (`jspdf.umd.min.js`, `LICENSE`) | PDF export of the print panel |
| [Swagger UI](https://github.com/swagger-api/swagger-ui) | 5.32.15 | Apache-2.0 | `vendor/swagger-ui/` (`swagger-ui-bundle.js`, `swagger-ui.css`, `LICENSE`, `NOTICE`) | API documentation page, loaded on first open (identical copy of the main prototype's files) |

## Bundled assets (`assets/`)

The document preview adapts the MIT-licensed service-portal viewer and styles,
copyright © 2026 Digital Real Estate and Support. Its licence is retained in
[`vendor/service-portal/LICENSE`](vendor/service-portal/LICENSE). See the
[implementation notes](../docs/DOCUMENT-PREVIEW.md).

| Asset | Source | Licence | Files | Used for |
|---|---|---|---|---|
| Material Symbols Outlined | [Google Fonts](https://fonts.google.com/icons); static build (opsz 24, wght 400, FILL 0, GRAD 0) of the complete icon set, v372 | Apache-2.0 | `assets/icons/` (`material-symbols-outlined.woff2`, `material-symbols-outlined.css`, `LICENSE`) | All UI icons (`.material-symbols-outlined`) |
| Topic images and names | [geoadmin/web-mapviewer](https://github.com/geoadmin/web-mapviewer): the `topics.png` sprite and the topic names of its locale files (the `topic.*` keys in `data/i18n.json`) | BSD-3-Clause, © 2022 swisstopo | `assets/topics.png`, `assets/LICENSE-web-mapviewer.md` | "Thema wechseln" topic grid |
| Country outlines | [Natural Earth](https://www.naturalearthdata.com/) 1:10m Admin 0 Countries, one simplified file per country (at most ~6,000 vertices, tolerance from 50 m up; islands under 0.2 km² dropped) plus `index.json` with names and bounding boxes; `prototype-simple/docs/generate_countries.py` | Public domain | `assets/countries/<ISO>.geojson`, `assets/countries/index.json` | Outline and zoom of a country chosen in the "Standorte" tree, loaded on demand |
| Canton outlines | [swissBOUNDARIES3D](https://www.swisstopo.admin.ch/de/landschaftsmodell-swissboundaries3d) (Bundesamt für Landestopografie swisstopo), the 26 cantons fetched once by `generate_countries.py` through the geo.admin.ch API and stored locally, simplified to 10–15 m (at most ~8,000 vertices); codes and German names from Natural Earth Admin 1 | [swisstopo open government data](https://www.swisstopo.admin.ch/de/geodata/terms-of-use), free with source citation ("Quelle: swisstopo"; shown in the map attribution) | `assets/regions/CH-<code>.geojson` | Outline and zoom of a canton chosen in the "Standorte" tree, loaded on demand; the app never queries the service |
| Basemap thumbnails | Rendered for this prototype from the CARTO styles and the swisstopo SWISSIMAGE layer | Derived from © CARTO / © OpenStreetMap contributors and © swisstopo data | `assets/basemaps/` (`positron.png`, `voyager.png`, `dark-matter.png`, `swissimage.png`) | Style switcher |
| Preview images | Not referenced by the app; origin not documented | Unknown | `assets/images/` (`Capture.JPG`, `preview-1.jpg` to `preview-4.jpg`) | Nothing at the moment; document or remove before publishing |

## Loaded from the internet at runtime

| Service | Used for | Notes |
|---|---|---|
| CARTO basemaps (`basemaps.cartocdn.com`, `tiles.basemaps.cartocdn.com`) | Positron, Voyager and Dark Matter styles, vector tiles and glyphs; the aerial styles reference the same vector tiles as an undrawn source so the 3D view can extrude building footprints over imagery | © CARTO, © OpenStreetMap contributors; free tier, no key |
| swisstopo WMTS (`wmts.geo.admin.ch`) | SWISSIMAGE aerial basemap within Switzerland (drawn above the world imagery) | © swisstopo |
| Esri World Imagery (`server.arcgisonline.com`) | Global aerial imagery for both aerial basemaps | Esri, Maxar, Earthstar Geographics, and the GIS User Community — free with this attribution under the [Esri terms of use](https://www.esri.com/en-us/legal/terms/full-master-agreement); the tile service is rate-limited and meant for interactive maps, not for bulk download |
| Esri Hybrid Reference (`www.arcgis.com`, `cdn.arcgis.com`, `basemaps.arcgis.com`) | Roads, boundaries and place labels above the imagery in "Hybrid" | [Hybrid Reference Layer](https://www.arcgis.com/home/item.html?id=30d6b8271e1849cd9c3042060001f425); Esri, TomTom, Garmin, FAO, NOAA, USGS, © OpenStreetMap contributors, and the GIS User Community. Public style, sprite and vector tiles; attribution is shown on the map. Arial labels are adapted to the existing CARTO Open Sans/Noto glyph service. |
| swisstopo WMS (`wms.geo.admin.ch`) | Rendering of the Geokatalog layers added to the map | © swisstopo |
| geoadmin API (`api3.geo.admin.ch`) | Location and layer search (SearchServer), topics and catalog trees (CatalogServer), layer legends (MapServer legend), feature identification (identify) | No key required |
| Unsplash (`images.unsplash.com`) | Example URLs in `data/swagger.json` only | [Unsplash License](https://unsplash.com/license); portfolio photos are local BBL source images |

The labeled aerial option uses Esri’s current vector Hybrid Reference Layer, the reference component of [Imagery Hybrid](https://www.arcgis.com/home/item.html?id=86265e5a4bbb4187a59719cf134e0018). It avoids the legacy raster World Hybrid Overlay and World Boundaries and Places services, which Esri has [scheduled for retirement](https://www.esri.com/arcgis-blog/products/arcgis-living-atlas/announcements/sunsetting-legacy-basemaps). The source is fetched when this basemap is selected; no API key is configured in the prototypes.

## Outbound links only (nothing is loaded)

- Share links to X (Twitter), Facebook and LinkedIn in the "Teilen" section open the respective site with the current URL.
- Generated KML files reference the standard Google Earth paddle icons (`maps.google.com/mapfiles/kml/paddle/`); the KML viewer fetches them, not this app.

## Portfolio source data and photographs

The portfolio combines public BBL/EDA facts, swisstopo/BFS/cantonal register and parcel
data, OpenStreetMap geocodes (ODbL), and fictional operational records. See the
[source and methodology guide](../scripts/portfolio/README.md).

The 42 local photographs in `../assets/portfolio/` retain the credited photographers'
copyright and are excluded from the repository MIT licence. Each image has
[attribution and an original source link](../assets/portfolio/ATTRIBUTION.md);
public availability does not assert an open licence.

The body font is the system font stack; the icon font above is the only web font.

## Parcel label positioning

[polylabel 2.0.1](https://github.com/mapbox/polylabel/tree/v2.0.1) and
[tinyqueue 3.0.0](https://github.com/mourner/tinyqueue/tree/v3.0.0), ISC-licensed,
are bundled in `vendor/polylabel/` and `vendor/tinyqueue/`, including licences.
Only polylabel's import path is changed for offline browser modules.
Reproduce the downloads with `python scripts/vendor-parcel-labels.py` at the repository root.
