# Third-party components

Everything in this prototype that was not written for it: the vendored libraries, the bundled assets and
the external services the running app talks to. Every local copy has its licence file next to it. The
app itself needs no CDN: with the vendored files and the fictional data it starts offline; only the
basemaps, the swisstopo services and the placeholder photos come from the internet at runtime.

## Vendored libraries (`vendor/`)

| Component | Version | Licence | Files | Used for |
|---|---|---|---|---|
| [MapLibre GL JS](https://maplibre.org/) | 5.19.0 | BSD-3-Clause | `vendor/maplibre-gl/` (`maplibre-gl.js`, `maplibre-gl.css`, `LICENSE.txt`) | Map, mini map, markers, popups |
| [Swagger UI](https://github.com/swagger-api/swagger-ui) | 5.32.15 | Apache-2.0 | `vendor/swagger-ui/` (`swagger-ui-bundle.js`, `swagger-ui.css`, `LICENSE`, `NOTICE`) | API documentation page, loaded on first open |
| [jsPDF](https://github.com/parallax/jsPDF) | 2.5.1 | MIT | `vendor/jspdf/` (`jspdf.umd.min.js`, `LICENSE`) | PDF export of the print view |

## Bundled assets (`assets/`)

| Asset | Source | Licence | Files | Used for |
|---|---|---|---|---|
| Material Symbols Outlined | [Google Fonts](https://fonts.google.com/icons); static build (opsz 24, wght 400, FILL 0, GRAD 0) of the complete icon set, v372 | Apache-2.0 | `assets/icons/` (`material-symbols-outlined.woff2`, `material-symbols-outlined.css`, `LICENSE`) | All UI icons (`.material-symbols-outlined`) |
| Topic images and names | [geoadmin/web-mapviewer](https://github.com/geoadmin/web-mapviewer): the `topics.png` sprite and the topic names of its locale files (the `topic.*` keys in `data/i18n.json`) | BSD-3-Clause, © 2022 swisstopo | `assets/topics.png`, `assets/LICENSE-web-mapviewer.md` | "Thema wechseln" topic grid |

## Loaded from the internet at runtime

| Service | Used for | Notes |
|---|---|---|
| CARTO basemaps (`basemaps.cartocdn.com`, `tiles.basemaps.cartocdn.com`) | Positron, Voyager and Dark Matter styles, vector tiles and glyphs; thumbnails of the style switcher | © CARTO, © OpenStreetMap contributors; free tier, no key |
| swisstopo WMTS (`wmts.geo.admin.ch`) | SWISSIMAGE aerial basemap and its thumbnail | © swisstopo |
| swisstopo WMS (`wms.geo.admin.ch`) | Rendering of the Geokatalog layers added to the map | © swisstopo |
| geoadmin API (`api3.geo.admin.ch`) | Location and layer search (SearchServer), topics and catalog trees (CatalogServer), layer legends (MapServer legend), feature identification (identify) | No key required |
| Unsplash (`images.unsplash.com`) | Placeholder photos of the detail carousel (`js/config.js`) and sample values in `data/swagger.json` | [Unsplash License](https://unsplash.com/license); placeholders only |
| Google Photorealistic 3D Tiles (`tile.googleapis.com`) with three.js 0.183.0 and 3d-tiles-renderer 0.4.21 from jsDelivr and the Draco decoder from unpkg | Optional 3D view (`js/tiles3d.js`, import map in `index.html`) | Dormant: the module is not imported and no API key is shipped, so nothing is downloaded unless the feature is switched on |

## Outbound links only (nothing is loaded)

- Google Maps, Street View and map.geo.admin.ch: the "show on external map" links of the detail view.
- Generated KML files reference the standard Google Earth paddle icons (`maps.google.com/mapfiles/kml/paddle/`); the KML viewer fetches them, not this app.

## Not third-party

All data (`data/*.geojson`, `data/*.json`) is fictional and was created for this prototype. The body
font is the system font stack; the icon font above is the only web font.
