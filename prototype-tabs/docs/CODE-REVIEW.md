# Code Review — prototype-tabs (with the alignment to prototype-simple)

**Date:** 2026-09-15

**Update 2026-09-22:** The German-only limitation and recommendation R2 below have
been addressed. See [I18N.md](I18N.md) for the DE/FR/IT/EN implementation.
**Scope:** all files under `prototype-tabs/` (`js/app.js`, `index.html`, `css/main.css`, `data/`), reviewed together with `prototype-simple/` because both prototypes are variants of the same application
**Focus:** bugs, dead and redundant code, security of the rendered HTML, duplication with prototype-simple, architecture alignment
**Reviewer:** Claude (senior-developer review requested by the maintainer)
**Companion document:** [prototype-simple/docs/CODE-REVIEW-2.md](../../prototype-simple/docs/CODE-REVIEW-2.md) (module map, shared conventions)

Every finding was verified against the code. Findings marked **Fixed** were implemented in the same change set as this document and checked with the regression harness in [`../../test/`](../../test/) (4 scenarios, 102 checks for this prototype) and in headless Edge.

## Summary

| Area | Findings | Fixed | Open |
|---|---|---|---|
| Bugs | 20 | 20 | 0 |
| Security (rendered HTML) | 4 | 4 | 0 |
| Dead and redundant code | 8 | 8 | 0 |
| Architecture alignment with prototype-simple | implemented | — | see section 6 |
| Recommendations | 7 | — | 7 |

The single 5,973-line `js/app.js` was replaced by 29 ES modules with the layout of prototype-simple. 3,584 of the 6,903 JavaScript lines are the 17 common modules that are byte-identical in both prototypes; the prototype-specific code shrank from 5,973 to 3,319 lines while gaining the PDF export, the lightbox, the search history, the boot watchdog and the error reporting of prototype-simple.

## 1. Bugs

| ID | Severity | Where (before) | Finding | Status |
|---|---|---|---|---|
| T1 | High | `exportGeoJSON`, `updateExportCount`, `getExportData`, `performExport` | The export panel did not work: `parcelsData` (undefined variable, `ReferenceError` with "Parzellen einschliessen"), and the feature collections were treated as arrays (`filteredData.length`, `portfolioData.find`, `data.map`) so the count was always 0 and every export threw. `handleExport('excel')` selected a format without an implementation and still showed "Export erfolgreich". The CSV column list referenced attributes that do not exist in the data (`ownershipType`, `buildingType`, `flaeche`, `constructedYear`, …), producing empty columns. | Fixed: `export.js` works on `.features`, the CSV columns are accessors on the real schema, unknown formats fall back to GeoJSON. |
| T2 | High | `generatePrintPDF` | The "PDF" print copied the WebGL canvas with `drawImage()`; the map was created without `preserveDrawingBuffer`, so the copy is blank in most browsers. The result was a browser print dialog, not a PDF. | Fixed: the offscreen high-resolution renderer and jsPDF composition of prototype-simple (`print.js`, jsPDF vendored). |
| T3 | High | `addMapLayers` | Map click and hover handlers, the pulse animation and the URL selection restore lived inside `addMapLayers()`, which runs again after every basemap switch (`style.load`): handlers were duplicated per switch, a second animation loop started while the first kept running, the map flew back to the URL object and re-zoomed to the filters on every switch, and the selection highlight was lost. | Fixed: handlers bound once, selection and visibility restored explicitly, no re-fly (same structure as prototype-simple after its review). |
| T4 | High | top-level `localStorage.getItem('mapStyle')` | Storage access at module evaluation without a guard: in a private window or with storage blocked by policy the whole script stopped before the map was created. | Fixed: safe storage helpers; the basemap is owned by the URL (`?basemap=`) like in prototype-simple. |
| T5 | Medium | `loadAllData` | "Retry" after a failed load re-ran `initFilterPane`, `initDrawerResize`, `initExportPanel`, `initListToolbar`, `initListPagination`: every listener was registered again (the drawer opened and closed on one click, exports fired twice). | Fixed: one-time UI initialisation, retry only re-fetches. |
| T6 | Medium | `handleColumnToggle` | Column visibility toggled the inline `display` of the cells present at that moment. Newly rendered rows (next page, filter, search) came back with the hidden columns visible while the header stayed hidden, misaligning the table. | Fixed: one generated stylesheet (`table.js`). |
| T7 | Medium | `setFiltersInURL`, `setViewInURL` | Every filter checkbox pushed a history entry, and view switches pushed entries while a popstate was being handled, so Back/Forward desynchronised URL and state. | Fixed: filters and selection use `replaceState`; views push once and use `replaceState` during popstate. |
| T8 | Medium | `parcels-highlight` | Hover highlight and selection shared one layer: hovering another parcel replaced the selection highlight, and leaving the parcel cleared it. | Fixed: separate `parcels-selected` and `parcels-selected-outline` layers. |
| T9 | Medium | `navigateWithLandFilter`, `navigateWithRegionFilter` | The breadcrumb filters looked for `#filter-pane …` checkboxes; the drawer is `#smart-drawer`, so the checkbox was never ticked. | Fixed: the drawer uses the ids of prototype-simple (`#filter-panel`) and the filter helpers tick the checkbox. |
| T10 | Medium | map click handlers | While the measure tool was active, each click also selected or deselected objects and fired identify requests. | Fixed: selection handlers return early while measuring. |
| T11 | Medium | `#info-close` | Closing the info panel cleared only the building selection; a selected parcel kept its highlight and its `parcelId` in the URL. | Fixed. |
| T12 | Medium | `renderListView`, `renderGalleryView`, entity tables | One click and one keydown listener per row and card on every render; the mini map was destroyed and re-created (style and tiles re-downloaded) on every detail view; the lower-cased search text of every feature was rebuilt on every keystroke. | Fixed: delegated listeners, mini map reused, cached search text. |
| T13 | Low | context-menu share | The share link used `?center=lon,lat` which nothing reads back; shared links opened at the default position. | Fixed: `lng`/`lat`/`zoom`. |
| T14 | Low | `identifySwisstopoFeatures`, `fetchWithErrorHandling` | Identify requests were not cancelled (two quick clicks could show the first result last); data fetches had no timeout. | Fixed: `AbortController`, 30 s timeout with retry. |
| T15 | Low | Escape handling | Five `keydown` listeners: the filter drawer closed on any Escape (also while a modal was open), the context menu and the measure tool reacted at the same time. | Fixed: one registry with priorities (`keys.js`). |
| T16 | Low | `alert()` in the entity tables | "Hinzufügen" opened a blocking browser alert. | Fixed: toast. |
| T17 | Low | `addSwisstopoLayer` | The "removed while fetching" check after the metadata fetch was inverted (`!hasOwnProperty` after `delete` is always true) and therefore only returned for already active layers; the WMTS `maxZoom` formula (`18 - log2(maxScale / 500)`) was a guess. | Replaced by the WMS-only integration of prototype-simple (no metadata round trip). **Behaviour change:** Geokatalog layers render through `wms.geo.admin.ch` instead of WMTS. |
| T18 | Low | `updateMapFilter` | `portfolio-labels` was filtered but never created. | Removed. |
| T19 | Low | `#export-crs`, `#login-btn`, `.btn-edit`, measure accordion | The coordinate-system select was never read (an LV95 choice silently produced WGS84); login and edit buttons had no handler; the "Zeichnen & Messen" accordion was static text. | The select is removed; login and edit show a "not available in the prototype" toast; the accordion has a button that starts the measure tool. |
| T20 | Low | README, `docs/DATAMODEL.md` | The README states "DATAMODEL.md — Same model as simple app". The data uses the camelCase BuildingMinds model (`buildingId`, `status`, `extensionData`), prototype-simple the flat SAP/GIS model (`bbl_id`, `bbl_stat`). | Documented; unification recommended (R1). |

## 2. Security of the rendered HTML

| ID | Finding | Status |
|---|---|---|
| S1 | `escapeHtml()` used `div.textContent` / `innerHTML`, which does not escape quotes. Every use inside an attribute (`data-building="…"`, `data-topic="…"`, titles) allowed attribute injection. | Fixed: regex escaping of `& < > "` (common `utils.js`). |
| S2 | `escapeForJs()` produced `\"` inside `onclick="…"` attributes: a `"` in a layer title (external data from the swisstopo search) terminated the attribute. | Fixed: no inline handlers; `data-action` delegation with escaped data attributes. |
| S3 | Labels of the swisstopo search (`r.attrs.label`, which the API returns with `<b>` markup) were inserted as raw HTML; the layer legend HTML of `api3.geo.admin.ch` was inserted unsanitised. | Fixed: labels are stripped of tags and escaped, then highlighted; the legend HTML is parsed in a detached document and stripped of scripts, frames, forms and event handlers. |
| S4 | Building attributes were inserted unescaped in the list, the gallery, the info panel and the KI answers. The data is internal mock data today; escaping is now consistent. | Fixed. |

## 3. Dead and redundant code

| ID | Where (before) | Finding | Status |
|---|---|---|---|
| D1 | `TOPIC_LABELS` | German topic names duplicated the `topic.*` translations of prototype-simple. | Removed; `data/i18n.json` is the same file in both prototypes. |
| D2 | `handleExport`, `escapeForJs`, `pendingLayerFetches`, `shareViaEmail` subject strings, `getPrintDimensions` table, `createCoordinateGrid`, print container styles | Legacy paths and helpers of the previous implementations. | Removed. |
| D3 | `css/main.css` | `#filter-pane*` rules (element renamed long ago), `.icon-btn*`, `.skeleton*`, `.table-skeleton*`, `.img-container`, the skeleton keyframes. | Removed. |
| D4 | `#login-btn`, `.btn-edit` | Buttons without behaviour (mock-ups). | Kept as mock-ups, now with a "not available" toast. |
| D5 | `assets/images/` | `Capture.JPG` and `preview-1.jpg` to `preview-4.jpg` (2.4 MB) are referenced by nothing (already noted in THIRD-PARTY.md). | Open: document their origin or remove them. |
| D6 | `window.*` globals | 8 functions were attached to `window` for inline handlers. | Removed; ES modules. |
| D7 | duplicated code | Toast system, filters, view switching, search, swisstopo integration, measure tool, context menu, style switcher, entity-table factory, formatters — roughly 3,500 lines also present in prototype-simple, with the bugs of section 1 that prototype-simple had already fixed. | Replaced by the common modules (section 5). |
| D8 | `docs/RESPONSIVE-REVIEW.md`, `docs/DESIGNGUIDE.md` | References to functions "in `js/app.js`". | Design guide updated; the responsive review is a dated document and keeps its historical references (note added). |

## 4. Behaviour changes to be aware of

1. The basemap comes from the URL (`?basemap=light|standard|aerial|dark`) and is no longer remembered in `localStorage`.
2. Filter changes no longer create history entries; the selection is kept in the URL across views.
3. Geokatalog layers render via WMS (T17).
4. "Drucken" produces a PDF through the print panel (also from the map context menu); the print form has the A0–A4 formats, DPI and label options of prototype-simple.
5. The list export dropdown exports the filtered or all buildings directly ("Alle exportieren" / "Gefiltert exportieren"), like prototype-simple; the export panel keeps the format cards and options.
6. The search box gained a history, the gallery follows the search box, the detail carousel opens a lightbox, and the map shows a busy indicator while tiles load.
7. The UI stays German; the JS-rendered strings come from `data/i18n.json` (German default, no language switch).

## 5. Architecture alignment with prototype-simple

Both prototypes stay independent (no file is loaded across folders). The module map, the shared markup conventions and the alignment check are described in [prototype-simple/docs/CODE-REVIEW-2.md, section 5](../../prototype-simple/docs/CODE-REVIEW-2.md). In short:

- `js/` has the same modules as prototype-simple (`app`, `config`, `state`, `ui`, `filters`, `list`, `detail`, `map`, `search`, `export`) plus `entity-tables.js` (the six tables of the detail tabs) and `assistant.js` (KI mock answers).
- 17 modules and `data/i18n.json` are byte-identical with prototype-simple; `node test/check-alignment.js` reports any drift.
- The markup uses the same hooks (`data-action`, `data-accordion`, `data-dropdown`), the same ids for the map tools, filter drawer, info panel and modals, and the same map layer ids (`buildings-*`, `parcels-*`).
- What stays different is the data schema (see T20) and the features that only exist here: list view, seven detail tabs with entity tables, share and export panels, KI answers in the search.

## 6. Recommendations (not implemented)

| ID | Recommendation |
|---|---|
| R1 | **Adopt the data model of prototype-simple.** Converting `data/*.geojson` and the entity JSON files to the SAP/GIS attribute model would make five more modules common and remove the second `DATAMODEL.md`. Until then the README should not claim the models are the same. |
| R2 | **Make the markup translatable.** The i18n runtime is loaded; adding `data-i18n` attributes and the language selector of prototype-simple is mechanical. |
| R3 | **Common stylesheet.** `css/main.css` (5,800 lines) and prototype-simple's `styles.css` implement the same components with different token names; a shared token file and component stylesheet, copied like the JS modules, would remove the largest remaining duplication. |
| R4 | **Social share buttons** (Facebook, LinkedIn, X) are unusual for an internal property inventory; keep e-mail and copy link. |
| R5 | **Unreferenced images** in `assets/images/` (2.4 MB): document or remove. |
| R6 | **Real-browser check** of the PDF export, the measure tool and the 3D toggle (no WebGL in the jsdom harness). |
| R7 | **KI mock.** `assistant.js` answers a handful of question templates from the loaded data; a real assistant would replace `suggestAiQuestion()` and `showAiAnswer()` and keep the search-box interaction. |

## 7. Verification

- **Syntax and imports:** every module passes `node --check`; every named import resolves to an export; no unused imports.
- **jsdom harness** (`test/`), prototype-tabs: *normal* (73 checks: boot without a `lang` parameter, object count, list rows, filter options with counts, map sources and layers, handler counts, map selection of a building and a parcel with separate highlights, info panel close, filters via `replaceState`, list view row to detail, address parsing, breadcrumb, carousel, mini map reuse, entity tables with filter and empty state, back, gallery, basemap switch without duplicate handlers or re-fly, internal layer toggle across a style change, measure guard, search with KI suggestion and answer chips, parcels in the results, escaped external labels, external layer add/remove, share link, export count and a real download through the panel, measure button), *URL states* (15), *no data + retry* (7), *partial data* (7). All pass.
- **Headless Edge** (`--headless=new`, real MapLibre): the prototype boots, hides the overlay, renders the list; no console errors.
- **Static scans:** unreferenced CSS classes 13 → 0; ids referenced from JS but missing in the markup: only the optional hooks of prototype-simple's markup (`#filter-pills`, `#filter-search-*`, `#mobile-external-layers-list`), which the common modules guard with null checks.
