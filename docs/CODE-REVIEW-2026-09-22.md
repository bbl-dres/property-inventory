# Code and performance review — Simple and Tabs

Scope: the two inventory prototypes, concentrating on boot/data loading, URL
state, map interactions and layer restoration, external requests, tables,
document/image preview lifecycle, export/printing, and the recent UI changes.
Vendor implementations were consulted for API compatibility, not audited in full.

Both prototypes remain independent. Every new runtime module is local to its
prototype. No shared runtime directory, cross-prototype imports, framework or
build step was introduced. Existing datasets, photos and schema differences are
preserved. The repository-level test harness may exercise both applications.

## Confirmed findings and fixes

| Priority | Finding | Fix / evidence |
|---|---|---|
| High | Clicking a cluster used MapLibre's old callback form. The bundled 5.19.0 API returns a promise, so the callback never ran. The fake renderer also implemented the outdated contract and masked this bug. | Await the result, reject stale requests after subsequent clicks, movement or source replacement, and handle worker rejection. Update the fake to the actual promise contract. Regression tests cover expansion and out-of-order responses. |
| High | Print scale used a 256-pixel world at zoom zero. MapLibre uses 512: requested scale and map framing disagreed by a factor of two. Approximate latitude offsets also misaligned adjacent print tiles. | Use the renderer's world size, exact Mercator offsets and the same calculations for tile centres and corner coordinates. Check scale and shared edges at equatorial, Swiss, southern and high latitudes. |
| High | Large-format printing tiled WebGL rendering but then assembled all tiles into a single full-resolution canvas. A0 at 600 dpi could require roughly 2 GB just for that canvas's RGBA pixels. | Encode and place each bounded tile directly into the PDF, releasing its canvas after encoding. No full-page intermediate canvas. Real browser tests verify two-tile A3 output placement and canvas release. The PDF still retains compressed images; large high-DPI documents are not free of memory costs. |
| Medium | Unselected building labels collided with their own transparent marker collision boxes and disappeared; selecting a dot changed the text offset and made its label appear. | Fixed text offset above the dot in both states, priority over parcel labels, and zoom 15 for both label types. Only parcel labels have alternate anchors. Reproduced with the browser before the fix; checked selected/unselected labels at zoom 15, 16 and 18.25 afterwards. |
| Medium | A pending external identify request could recreate a popup after the user cleared it, selected a portfolio object, changed styles or hid/removed a layer. | Cancellation belongs to the clear operation. Responses check the captured signal even if a transport ignores cancellation; superseded requests cannot reset another request's cursor. |
| Medium | A filter URL containing a literal `%` caused `decodeURIComponent` to throw during boot. | Tolerant parsing that preserves the existing encoded-comma format and Simple's legacy `Aktiv` status links. Round-trip and malformed-input tests. |
| Medium | Non-finite or out-of-range camera URL parameters could reach the renderer. | Validate finite values, normalize longitude and clamp zoom/pitch to the configured renderer limits. Invalid positions fall back to the initial view. |
| Medium | MultiPolygon parcels were passed to an outer-ring-only centroid helper, producing invalid camera coordinates. | Selection and zoom reuse the cached interior point already computed for parcel labels. Invalid/empty geometry is skipped safely. |
| Medium | Clearing a table search did not cancel its debounce timer, so the old term returned after the field was empty. | Cancel pending work when clearing. A regression reproduces the input/clear/timer sequence. |
| Medium | Column-hiding CSS was scoped to feature tables, but width calculations applied the hidden set to every table, including detail tables with the same column class. | Apply the same scope to layout calculations and CSS. Detail column definitions now remain intact. |
| Medium | Select-all ignored the configurable row-ID attribute. Selection actions could remain enabled after selected records disappeared. | Resolve row keys through the configured attribute and prune unavailable selected keys during rendering. |
| Medium | The print label checkbox never hid labels, and the cloned style included a collision icon that was registered only on the live map. | Apply label visibility explicitly and omit runtime collision, selection and highlight layers from print styles. Preserve hidden layers. |
| Medium | Print source replacement used the full building dataset even when the live map was filtered. | Print the current filtered feature collection. The browser print test verifies only the filtered feature reaches each offscreen map. |

The initial targeted regression scenario failed seven checks against the
pre-fix implementation. Follow-up coverage includes new race cases and renderer
limits; each prototype now passes all 16 checks in that scenario.

## Performance and complexity

- **Table sorting:** reuse `Intl.Collator` per locale rather than constructing
  locale comparison options repeatedly inside the sorting loop. On this Windows
  environment, the reproducible 20,000-value benchmark measured medians of
  **2,478.4 ms before / 51.2 ms after**, about **48× faster**, with identical
  ordering. This is a comparator microbenchmark, not an end-to-end UI claim.
- **Cell rendering:** plain text/date hints use their already available text.
  Only custom HTML cells need parsing through a template to derive hover hints.
- **Live WebGL canvas:** removed `preserveDrawingBuffer` from the interactive
  map. Printing uses separate offscreen maps, which still preserve their buffers.
  This avoids paying that rendering cost throughout normal map interaction.
- **Print memory:** canvas size is bounded to 4096 × 4096 per tile. Tiles are
  added to the PDF sequentially and their image buffers released after encoding.
- **Local map modules:** `portfolio-map-layers.js` owns layer definitions and
  label policy; `portfolio-map-interactions.js` owns event precedence and async
  cluster navigation. `map.js` supplies schema keys and application callbacks.
  This makes the renderer policy testable without importing UI state into it.
- **Local pure functions:** `filter-url.js`, `table-sort.js`, and
  `print-geometry.js` separate parsing, sorting and projection/style preparation
  from DOM manipulation. Each prototype has its own copy and can evolve alone.

Duplication **between** the prototypes is intentional per the independence
requirement. Similar local copies remain covered by the existing alignment
check. `check-independence.js` additionally resolves every relative module import
and rejects any path leaving its prototype directory (337 imports checked).

## Verification

Serve the repository on port 8123 for browser checks:

```powershell
python -m http.server 8123
node test/all.js
node test/check-alignment.js
node test/check-independence.js
node test/performance-review.js
node test/print-geometry.js
node test/print-rendering.js
node test/parcel-labels.js
node test/parcel-labels-layout.js
node test/table-layout.js
```

Results: 23 application regression scenarios passed; local copies align; import
boundaries pass; 50 parcel geometry checks pass; print geometry checks cover
eight latitude/prototype combinations. Real Edge/Chromium tests exercise
selected/unselected label placement, layer toggles and style changes, table
layout, and actual offscreen WebGL printing. The print test records PDF image
placements without triggering a download; it is not a visual review of every
paper size, printer, browser or generated PDF.

## Follow-up opportunities

1. The cosmetic selection pulse still changes map paint properties at 20 Hz
   while a selected map is visible. A local CSS marker could avoid these map
   redraws, but must first be checked against clustering, filtering, pitch and
   selection visibility. It is not required for the current 14-site dataset.
2. The UI/map/filter/list modules still contain circular imports. Further
   simplification should move orchestration into each prototype's entry point
   and pass callbacks to controllers, preserving their different detail models.
   Avoid a wholesale migration merely to make the two apps look structurally alike.
3. Large future portfolios will need measured budgets for GeoJSON loading,
   clustering, search and table rendering. Current fixtures do not justify
   worker-based search or row virtualization yet. Entity lookups can be indexed
   by building when profiling shows those scans becoming significant.
4. External legends remain trusted HTML from the configured federal endpoint
   with the existing sanitizer. Supporting arbitrary layer providers would need
   a stricter sanitization policy. This was not a security audit.

API checks used the bundled code and the pinned MapLibre 5.19.0 sources:
[GeoJSONSource](https://github.com/maplibre/maplibre-gl-js/blob/v5.19.0/src/source/geojson_source.ts),
[TransformHelper](https://github.com/maplibre/maplibre-gl-js/blob/v5.19.0/src/geo/transform_helper.ts).
See also [label behavior](PARCEL-LABELS.md) and the
[responsive review](DESIGN-REVIEW-2026-09-22.md).
