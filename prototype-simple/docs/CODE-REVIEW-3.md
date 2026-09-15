# Code Review 3 — prototype-simple and prototype-tabs

**Date:** 2026-09-15
**Scope:** all files under `prototype-simple/` and `prototype-tabs/` (ES modules, `index.html`, `css/`, `data/i18n.json`), reviewed together: 19 modules and the two shared stylesheets are byte-identical copies, the ten per-app modules share their structure and differ in the data schema.
**Focus:** bugs and performance (the maintainer's brief), extended to the robustness of the asynchronous flows (map load, searches, layer info), the accessibility of the tables and the regression coverage.
**Reviewer:** Claude (senior-developer review requested by the maintainer)
**Previous reviews:** [CODE-REVIEW.md](CODE-REVIEW.md) (2026-09-11), [CODE-REVIEW-2.md](CODE-REVIEW-2.md) (2026-09-15), [prototype-tabs/docs/CODE-REVIEW.md](../../prototype-tabs/docs/CODE-REVIEW.md) (2026-09-15). Their fixes were checked and are still in place (handlers bound once, retry without duplicate listeners, URL-owned state, escaping, Escape registry); they are not repeated here. The companion for the tabs prototype is [prototype-tabs/docs/CODE-REVIEW-2.md](../../prototype-tabs/docs/CODE-REVIEW-2.md).

Every finding was verified against the code. Findings marked **Fixed** were implemented in the same change set as this document and covered by new checks of the regression harness in [`../../test/`](../../test/); the new checks were run against the previous code first (where they fail, see section 6) and then against the fix.

## Summary

| Area | Findings | Fixed | Open |
|---|---|---|---|
| Bugs | 13 | 13 | 0 |
| Performance | 6 | 5 | 1 (kept, see P6) |
| Recommendations | 7 | — | 7 |

## 1. Bugs

"Both" means the finding was present in both prototypes; "common" means the fix lives in one of the byte-identical modules.

| ID | Severity | Where | Finding | Status |
|---|---|---|---|---|
| B1 | High | `app.js` (both), `map.js` (both) | The data loader used `map.loaded()` to decide whether the data layers could be added at once and otherwise waited for `map.once('load')`. MapLibre fires `load` exactly once, and `loaded()` is false again whenever tiles are streaming: after any pan or zoom, and while the basemap's own tiles are still arriving. When the data arrived in such a moment after the load event, e.g. a slow `buildings.geojson` on a cached basemap, a pan before the data, or "Retry" after a failed load, the `once('load')` never fired: tables and gallery worked, the map stayed empty and selections did nothing. | Fixed: `map.js` registers the one load handler at map creation and remembers it (`hasMapLoaded()`); the loader adds the layers itself only when the map was first. The new *late-data* scenario reproduces the window. |
| B2 | Medium | `ui.js`, `filters.js`, `state.js` (both) | Every switch to the map view called `updateMapFilter()`, which re-sent the source data (a full re-cluster) and, with active filters, flew back to the filtered extent: a reader who filtered, panned, opened the gallery and came back lost the map position. The call had a reason: a filter applied while the map is hidden cannot zoom (`fitBounds` on a map without size is a no-op with a console warning). | Fixed: `updateMapFilter()` defers the zoom while another view is active (`state.pendingFilterZoom`); `switchView('map')` catches up once. Returning to an unchanged filter keeps the position. |
| B3 | Medium | `prototype-tabs/js/map.js` | `selectBuilding()` called `syncTableToBuilding()` four times and `selectParcel()` called `syncTableToParcel()` four times (copy-paste): every selection re-rendered and scrolled the table up to four times. | Fixed: one call each. |
| B4 | Medium | `print.js` (common) | The offscreen map was rendered with the aspect ratio of the paper (A4 landscape: 297 × 210 mm) and then drawn into the map area of the page (277 × 153 mm with title and legend): the printed map was squeezed vertically by up to 20 %, and the corner coordinates and the scale bar, computed for the full canvas, did not match the picture. The preview crop showed the whole sheet, not the printed map area. | Fixed: `getPrintLayout()` computes the map area once for the preview and the PDF; the map is rendered at that aspect ratio; the title and legend checkboxes update the preview. |
| B5 | Medium | `table.js` (common), `list.js` (both) | Every column header carried a sort icon and both READMEs promise sortable tables, but the feature tables (buildings, parcels, land covers) had no sorting: a header click did nothing. (The entity tables of the tabs detail page do sort.) | Fixed: a header click sorts by the column (numbers numerically, text with the UI locale, empty cells last), a second click reverses; `aria-sort`, marker class and icon; `sortField` for the nested `extensionData` columns of prototype-tabs; the marker survives the header re-render of a language change. |
| B6 | Low | `measure.js` (common), `map.js` (both) | A basemap change during a measurement dropped the line (setStyle) and left the point markers and labels on the map; the line only came back with the next click. | Fixed: `restoreMeasurement()` is part of the layer restore after a style change. |
| B7 | Low | `search.js` (both) | A slow external request (swisstopo locations or layers) of an earlier search could paint its results after the field had been cleared or shortened, or over the results of a newer term when the newer search had no external part to abort (scope "Objekte" only, where the local part resolves immediately). | Fixed: a sequence number per search; clearing the field aborts the pending request. |
| B8 | Low | `accordion.js`, `tools-panel.js` (common) | "Drucken" in the map context menu opened the print item inside the tools panel, which starts collapsed on tablets and is the hamburger menu on phones: nothing visible happened. | Fixed: `openAccordion()` unfolds the panel first. |
| B9 | Low | `context-menu.js` (common) | The context menu stayed open while the map was panned or zoomed under it (its coordinates then pointed elsewhere) and after clicks anywhere outside the map. | Fixed: closes on `movestart` and on outside clicks. |
| B10 | Low | `swisstopo.js` (common) | Two quick info-button clicks (search results, catalog) could show the first layer's legend last; a late Geokatalog response could replace the info of an internal layer. | Fixed: request counter, invalidated by hide and by the internal info. |
| B11 | Low | `filters.js` (both) | The checkbox ids of the filter options were derived from the value with non-alphanumerics replaced: "Bern-Ost" and "Bern Ost" got the same id, and the second label toggled the first checkbox. The values were sorted by UTF-16 code units (umlauts after Z). | Fixed: index-based ids; locale collation. |
| B12 | Low | `prototype-simple/index.html`, `data/i18n.json` (common) | The "Bodenabdeckung" layer toggle had a German-only `title`; its two sibling toggles are translated. | Fixed: `accordion.layers.landcovers.toggle` in four languages. |
| B13 | Low | `swisstopo.js` (common) | The legend sanitiser removed scripts, frames, forms and event handlers but kept `<link>`, `<meta>` and `<base>` elements of the API's HTML. | Fixed: removed too (defence in depth; the API is trusted). |

## 2. Performance

| ID | Where | Finding | Status |
|---|---|---|---|
| P1 | `filters.js`, `list.js`, `ui.js` (both) | Every filter change re-rendered every table (three in the simple app), although only the buildings table depends on the filters; the parcel and land cover tables were rebuilt with identical content, also when the table panel opened or the map view returned with a stale table. | Fixed: `renderFilteredTables()` renders the buildings table only; `renderTables()` stays for the initial load. |
| P2 | `location-tree.js` (common) | The tree DOM was rebuilt on every selection and filter change even while its panel was closed (`renderLocationTree()` runs from `setSelection()` and `applyFilters()`). | Fixed: a closed panel is marked stale and built when it opens; the country outline on the map still follows the filters. |
| P3 | `table.js` (common) | "Alle" / "Keine" in the columns menu rebuilt the column stylesheet once per checkbox (70 times for the buildings table). | Fixed: once per click. |
| P4 | `list.js` (both) | Dragging the resize handle of the table panel called `map.resize()` (a full re-layout and render of the map) on every pointer event. | Fixed: one resize per animation frame, a final one on release. |
| P5 | `measure.js` (common) | Every drag event of a measure point removed and re-created all segment label markers (DOM elements). | Fixed: the labels are reused and moved. |
| P6 | `map.js` (both) | The selection pulse sets two paint properties 20 times a second, each a map render, while the map is visible. | Not changed: already paused for hidden maps and background tabs (review 1). A CSS-animated DOM marker would remove the renders entirely (R3). |

Checked and found acceptable: the stylesheets contain no `transition: all` and only three `will-change` rules; the sort added in B5 sorts a copy of the visible features per render (11 rows today, still cheap at thousands); the search caches remain per feature.

## 3. Behaviour changes to be aware of

1. Table columns sort on a header click (the icons now do something); the sort persists across pages, the toolbar search and a language change (B5).
2. Returning to the map view no longer re-zooms to the filtered objects, unless a filter was applied while the map was hidden (B2).
3. The printed map keeps its aspect ratio: the map area of the page is slightly smaller than the sheet, and the preview crop now shows exactly that area; the title and legend checkboxes change the preview (B4).
4. The context menu closes on pan, zoom and outside clicks (B9); "Drucken" from the context menu unfolds a collapsed tools panel (B8).
5. Filter options sort with the locale's collation, umlauts in place (B11).

## 4. Files changed

| Area | Files |
|---|---|
| Common modules (identical in both prototypes) | `table.js`, `measure.js`, `tools-panel.js`, `accordion.js`, `context-menu.js`, `swisstopo.js`, `location-tree.js`, `print.js`, `css/components.css` (sort marker), `data/i18n.json` |
| Per-app modules (both prototypes) | `app.js`, `map.js`, `ui.js`, `filters.js`, `list.js`, `search.js`, `state.js` |
| prototype-simple only | `index.html` (translatable land cover toggle) |
| Tests | `test/lib/harness.js` (a fetch override may return a promise, to hold a response back), `test/lib/late-data-scenario.js` with `scenarios/simple-late-data.js` and `scenarios/tabs-late-data.js` (new), `scenarios/simple-normal.js` and `scenarios/tabs-normal.js` (extended) |

## 5. Recommendations (not implemented)

| ID | Recommendation |
|---|---|
| R1 | **Large formats.** A0 at 300 dpi means a 9,900 × 14,000 px canvas (140 Mpx) and a JPEG data URL of that size; Safari refuses canvases above 16 Mpx and Chrome strains. `print.js` tiles the WebGL rendering but composes one full canvas. Either cap the DPI by paper size or add the tiles to the PDF one by one (`addImage` per tile). |
| R2 | **Table rendering at scale.** The tables render a page with one `innerHTML` (fine for hundreds of rows). With a real backend, page or virtualise on the server side; the `visibleFeatures()` pipeline (search, sort, page) is the place to swap. |
| R3 | **Pulse without renders.** Replace the paint-property pulse (P6) by one DOM marker with a CSS animation at the selected building; MapLibre then renders nothing for the effect. |
| R4 | **Detail tooltips** (`labelDescriptions` in `prototype-simple/js/detail.js`) are keyed by the German label text (R5 of review 2): a detail page first opened in FR, IT or EN gets no tooltips. Key them by field name in `data/i18n.json`. |
| R5 | **Table search term per tab.** `switchTableTab()` clears the toolbar search, also when a map selection of a parcel switches the tab; keeping one term per tab would preserve the reader's input. |
| R6 | **Real-browser print check.** The jsdom harness verifies the layout arithmetic of B4, not the rendered PDF; print an A4 landscape with and without title and legend once before deploying and compare the corner coordinates with the map. |
| R7 | **Cache busting** on GitHub Pages (open since review 1, R6): a version query string on the module and stylesheet links. |

## 6. Verification

- **Syntax:** every module of both prototypes parses as an ES module; `node test/check-alignment.js` reports all common files identical.
- **jsdom harness** (`cd test && npm test`): 13 scenarios, 410 checks, all passing.
  - prototype-simple: *normal* 132 checks (112 before), *late-data* 16 (new), *aerial basemaps* 17, *deep links* 8, *no data + retry* 10, *partial data* 7, *URL states* 14.
  - prototype-tabs: *normal* 142 checks (121 before), *late-data* 16 (new), *aerial basemaps* 17, *no data + retry* 7, *partial data* 8, *URL states* 16.
- **New checks, run against the previous code:** *late-data* fails in both prototypes (layers never added after a late data arrival, the scenario then throws on the missing layers); *normal* fails 14 checks in prototype-simple and 13 in prototype-tabs (deferred filter zoom, sorting, sort marker after a language change, measurement after a basemap change, context menu, tree built while closed, print item from the context menu, column toggles; tabs: four table syncs per selection). With the fixes all pass.
- **Not verified in a browser:** the rendered PDF (R6) and the measure labels during a real drag; both were verified for wiring and arithmetic only.
