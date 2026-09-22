# Parcel labels

Map labels show only the SAP object number for parcels (`01`) and economic
unit/object for buildings (`9005/AA`). Full IDs (`9900/9005/01`, `9900/9005/AA`)
remain in the datasets, tables, detail views and selection state. SAP components
are strings, preserving leading zeros: Simple uses `bbl_buch`, `bbl_we`, `bbl_obj`;
Tabs uses `extensionData.sapId.companyCode`, `.economicUnit`, `.objectNumber`
on buildings and parcels. Cadastral plot numbers and EGRID remain separate
attributes. Both label types start at zoom 15.5 and use
16 px blue text with a white halo, compared with the buildings' 13 px text.

## Placement

The shared `js/parcel-labels.js` uses [Mapbox polylabel 2.0.1](https://github.com/mapbox/polylabel/tree/v2.0.1)
to find the point with the greatest distance from the polygon boundary. This
avoids centroids or bounding-box centres that can fall outside concave parcels
or inside holes. Its input includes every ring, so holes remain excluded.

Coordinates are projected into Web Mercator, using a local origin for numerical
stability. The target tolerance corresponds to approximately 0.25 ground metres
at the parcel's latitude. Very narrow shapes use a smaller tolerance. Longitudes
are unwrapped around the first vertex for parcels crossing the date line.
The result is converted back to WGS84 for MapLibre.

MultiPolygons receive one label, on the component with the greatest boundary
clearance. Empty, invalid and zero-area geometry is skipped. This is for valid
GeoJSON polygons; it does not repair self-intersections. Points are cached by
geometry object, so basemap changes reuse the calculation. Original GeoJSON and
building positions are unchanged.

## Rendering and lifecycle

A separate GeoJSON point source (`parcel-labels`) feeds the `parcels-labels`
symbol layer. This keeps the anchor independent of tile clipping and prevents
multiple labels on disconnected parts. Text is centred on the anchor and stays
on one line. A generous `text-max-width` prevents soft wrapping at ID slashes
(zero is not used as a no-wrap setting). Both layers share collision detection,
reserve space for each other and disallow overlap. Building labels try bottom,
top, left and right anchors with a gap from their marker. Parcel anchors stay at
the visual centre; the text first tries that centre, then small screen offsets
below, right, left or above it. Crowded labels may be suppressed until the user
zooms further in. See [MapLibre's symbol layout options](https://maplibre.org/maplibre-style-spec/layers/#symbol).

Building dots are circle layers, which do not participate in symbol collision
detection. A transparent 28 px icon in `buildings-label-obstacles` reserves space
around each visible dot. It grows to 44 px for the selected dot. This layer is
placed above the text layers for collision priority and follows the building
visibility toggle and source filters. The visible dots, hit targets and source
coordinates stay unchanged. Real-browser checks cover coincident building/parcel
centres, including Abidjan, with both selected and unselected dots.

The layer belongs to the existing parcel visibility toggle, is recreated after
basemap changes and preserves that toggle's state. It has the same visibility
scope as the parcel polygons; the portfolio's building filters continue to
filter buildings. No new API request or npm/runtime dependency is required.

`vendor/polylabel` and its dependency `vendor/tinyqueue` contain pinned local
modules and ISC licences. `scripts/vendor-parcel-labels.py` reproduces the
downloads; only polylabel's import path is adjusted. The cross-prototype
alignment check includes all these files.

## Validation

- `node test/parcel-labels.js`: rectangle centre, concavity, holes, MultiPolygon,
  degenerate/invalid input, narrow parcels, date-line crossing, every supplied
  parcel's interior anchor and source-data immutability.
- `node test/parcel-labels-layout.js`: actual MapLibre labels in both prototypes,
  zoom threshold, visibility toggle, basemap restoration and info-card spacing.
- `node test/all.js`: both schema adapters, layer lifecycle and related UI changes.

Browser checks require the repository served at `http://127.0.0.1:8123/`.
Screenshots are written to the ignored `visual-out/parcel-labels/` directory.
