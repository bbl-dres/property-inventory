# Code Review — prototype-main

**Date:** 2026-09-11
**Scope:** all files under `prototype-main/` (16 ES modules, `index.html`, `styles.css`, `data/i18n.json`)
**Focus:** bugs and performance, plus loading/error feedback, footer links, and the prototype notice
**Reviewer:** Claude (senior-developer review requested by the maintainer)
**Follow-up:** [CODE-REVIEW-2.md](CODE-REVIEW-2.md) (2026-09-15) resolves R3, R4, R5, R7, R8, R9 and R10 of section 5 and aligns the module layout with prototype-tabs.

Every finding below was verified against the code and, where possible, exercised in a test.
Findings marked **Fixed** were implemented in the same change set as this document.

## Summary

| Area | Findings | Fixed | Open |
|---|---|---|---|
| Bugs | 19 | 19 | 0 |
| Performance | 6 | 6 | 0 |
| Loading / error feedback | 7 | 7 | 0 |
| Security | 2 | 2 | 0 (key rotation is a manual follow-up) |
| Recommendations | 10 | — | 10 |

## 1. Bugs

| ID | Severity | Where | Finding | Status |
|---|---|---|---|---|
| B1 | High | `map.js` | Map interaction handlers were registered inside `addMapLayers()`, which runs again after every basemap switch. MapLibre keeps layer listeners across `setStyle()`, so every switch added another copy of each `click`/`mouseenter` handler: a building click then selected N+1 times, cluster clicks triggered N+1 fly-tos, and the empty-map click fired N+1 swisstopo identify requests. | Fixed: `bindMapInteractions()` runs once. |
| B2 | High | `map.js` | The URL selection restore (`?id=`, `?parcelId=`, `?landCoverId=`) also lived in `addMapLayers()`, so each basemap switch flew the map back to the object in the URL. | Fixed: `restoreSelectionFromUrl()` runs on first load only. |
| B3 | High | `app.js` | "Retry" after a failed data load re-ran the whole UI initialisation, registering every event listener a second time (the filter drawer then toggled open and closed on one click, exports fired twice, …). | Fixed: `initDataDependentUI()` is guarded; retry only re-fetches and re-applies data. |
| B4 | High | `app.js` | The boot chain `initI18n().then(...)` had no `.catch`. Any exception before the data load (MapLibre missing, a module throwing, storage blocked) left the spinner on screen forever with the only clue in the console. | Fixed: `fatalBootError()` hides the overlay and shows a persistent error with a reload action; a watchdog in `index.html` replaces the spinner after 20 s if the app never signals readiness (covers module parse failures). |
| B5 | Medium | `ui.js` | Browser Back/Forward only handled the detail case. Switching map ↔ gallery pushed history entries, but Back changed the URL without changing the view; the popstate handler also pushed new entries while handling popstate, breaking further navigation. | Fixed: popstate derives the view from the URL (`view`, `id`, `tab`) and uses `replaceState` while handling. Identical URLs are no longer pushed twice. |
| B6 | Medium | `filters.js` | Every filter checkbox pushed a history entry, and `applyFilters()` also runs on load and after each basemap switch, so history filled with duplicates and Back desynchronised URL and filters. | Fixed: filter state is written with `replaceState`. Filters stay deep-linkable through the share URL. |
| B7 | Medium | `map.js` | The context-menu share link used `?center=lon,lat&zoom=`, parameters the app never reads back; shared links opened at the default position. | Fixed: uses `lng`/`lat`/`zoom` (what `initMap()` restores) on top of the current URL. |
| B8 | Medium | `map.js` | While the measure tool was active, each map click also ran the selection handlers: it deselected the current object, selected clicked buildings instead of adding a point, and triggered identify requests. | Fixed: all selection handlers return early while measuring; the hover cursor keeps the crosshair. |
| B9 | Medium | `app.js` | `?table=open` displayed the table but left `state.tableOpen` false, so the first click on the table toggle did nothing. | Fixed. |
| B10 | Medium | `app.js` | Any `?id=` opened the detail view, but a map selection writes `id` to the URL too. Reloading (or sharing) a map with a selected building jumped to the detail page. | Fixed: only `view=detail` opens the detail page; a plain `id` restores the map selection. **Behaviour change.** |
| B11 | Medium | `state.js`, `search.js`, `filters.js`, `map.js` | `localStorage` was accessed without guards. In private windows or with storage blocked by policy it throws; in `state.js` this happened at module evaluation and took the whole module graph down, in `search.js` it broke every result click. | Fixed: `storageGet()`/`storageSet()` in `utils.js` never throw. |
| B12 | Medium | `print.js` | The offscreen print map used `once('error')` and rejected on the first error event, so a single failed tile (raster tiles outside coverage, one flaky WMS response) aborted the whole PDF. | Fixed: only style-level errors abort; tile/source errors are ignored. |
| B13 | Low | `ui.js`, `print.js` | The print-orientation `change` listener was registered in both modules; the preview was recomputed twice per change. | Fixed: one registration (in `print.js`). |
| B14 | Low | `export.js` | Share URLs dropped a selected land cover (`landCoverId`). | Fixed. |
| B15 | Low | `list.js`, `detail.js` | Table cells (buildings, land covers, the status badge) and the detail status were inserted into `innerHTML` unescaped, although other places escape. Data is internal mock data today; escaping is now consistent. | Fixed. |
| B16 | Low | `swisstopo.js` | Identify requests were not cancelled; two quick clicks could show the result of the first click last. | Fixed: `AbortController` cancels the pending request. |
| B17 | Low | `swisstopo.js` | Placeholder links in the internal layer info were `<a href="#">` and navigated (hash entry in history, popstate). | Fixed: rendered as text placeholders. |
| B18 | Low | `swisstopo.js` | After a failed Geokatalog load, reopening the accordion retried silently behind the stale error message; there was no retry control and no in-flight guard. | Fixed: loading state with spinner, retry button, in-flight guard. |
| B19 | Low | `map.js`, `export.js` | Clipboard writes had no `.catch`; a denied clipboard produced an unhandled rejection and no feedback. | Fixed: error toast. |

## 2. Performance

| ID | Where | Finding | Status |
|---|---|---|---|
| P1 | `map.js` | The selection pulse (`setInterval` at 20 fps, two `setPaintProperty` calls per tick, each a full map re-render) kept running while the map was hidden: in the gallery, in the detail view, and in background tabs. | Fixed: ticks are skipped when `document.hidden` or the map view is not active. |
| P2 | `list.js` | Column visibility toggled `style.display` on every matching cell via `document.querySelectorAll('.col-…')`, once per hidden column, after every render of every table (≈70 columns × rows × 3 tables). | Fixed: one generated `<style>` element (`#column-visibility-style`); toggling a column is O(1) and new rows need no re-application. |
| P3 | `list.js`, `search.js` | The lower-cased searchable string of every feature was rebuilt on every keystroke and every table render. | Fixed: cached per feature in a `WeakMap` (no property pollution, exports unchanged). |
| P4 | `swisstopo.js` | The Geokatalog tree attached one click listener per node (several hundred nodes). | Fixed: a single delegated listener on the tree container. |
| P5 | `detail.js` | The mini map was destroyed and re-created on every detail view, re-downloading the basemap style and tiles each time. | Fixed: the instance is reused (`jumpTo` + marker move). |
| P6 | `utils.js` | Data fetches had no timeout; a hanging request kept the spinner up indefinitely. | Fixed: 30 s timeout via `AbortController`, surfaced as a normal error with retry. |

Not changed but measured as acceptable for the current data volume (11 buildings): full-table re-render on filter changes, deep-clone via `JSON.parse(JSON.stringify())` in exports, `queryRenderedFeatures` up to four times per map click.

## 3. Loading and error feedback

| ID | What the user sees now | Where |
|---|---|---|
| U1 | **Prototype banner** above the header in every view and language: "PROTOTYP – Alle Daten sind fiktiv …". The PDF export carries the same note in header and footer. | `index.html`, `styles.css`, `print.js`, `i18n.json` |
| U2 | **Map busy indicator** ("Karte wird geladen…") while the basemap style or tiles load for more than 400 ms. | `map.js` (`dataloading`/`idle`) |
| U3 | **Toasts are visible everywhere.** The toast container was inside `#map`, so every message shown in the gallery or detail view was invisible. It is now fixed to the viewport, above modals and the loading overlay. | `index.html`, `styles.css` |
| U4 | **Errors are reported, not swallowed:** data load failure (with cause and retry), optional datasets missing (warning, app continues with buildings), boot failure (reload action), uncaught runtime errors and rejected promises (global handler, throttled), basemap style errors, identify failures, external search unavailable (inline in the results), Geokatalog failure (retry), PDF errors including a missing jsPDF library, translation file failure. | `app.js`, `map.js`, `search.js`, `swisstopo.js`, `print.js`, `i18n.js` |
| U5 | **Spinners** on the export and PDF buttons, in the Geokatalog and layer-info panels, and a busy cursor during identify. | `export.js`, `print.js`, `swisstopo.js` |
| U6 | `alert()` dialogs replaced by toasts (PDF errors, "coming soon" buttons). | `print.js`, `detail.js` |
| U7 | Footer and mobile menu no longer link to Legal, Help, Contact (translation keys removed). | `index.html`, `i18n.json` |

## 4. Security

| ID | Finding | Status |
|---|---|---|
| S1 | A Google Maps API key was committed in `tiles3d.js` (feature disabled, module not imported). | Removed from the source. The key is still in git history: **restrict or rotate it** in the Google Cloud console. |
| S2 | Unescaped data in `innerHTML` (see B15). | Fixed. |

The swisstopo legend HTML is still sanitised before insertion (scripts, iframes, event handlers stripped); that code was reviewed and kept.

## 5. Recommendations (not implemented)

| ID | Recommendation |
|---|---|
| R1 | **Icon font dependency.** Material Symbols come from Google Fonts. If that host is blocked (corporate proxy), every icon renders as its name ("search", "close"). Self-host a subset (needs a small build step) or add inline SVG fallbacks for the icon-only buttons. **Resolved:** the static build of the complete icon set (322 KB) is self-hosted in `assets/icons/`; no build step, no Google Fonts request. |
| R2 | **jsPDF** is still loaded from cdnjs (only needed for PDF export; a clear error is shown if it is missing). Vendor it like MapLibre if PDF export must work offline. **Resolved:** vendored in `vendor/jspdf/` (2.5.1, MIT); see [THIRD-PARTY.md](../THIRD-PARTY.md). |
| R3 | The "Excel (.xlsx)" export produces a semicolon-separated CSV with BOM. Either rename the menu item or implement a real `.xlsx` export (e.g. SheetJS). |
| R4 | Remaining German-only strings: filter pill labels (`filterConfig`), the shapefile export notice, the mobile layer group label after a language change. |
| R5 | Geokatalog and swisstopo search are always requested with `lang=de`; pass the UI language. |
| R6 | GitHub Pages serves every file with `Cache-Control: max-age=600`. For about ten minutes after a deploy a browser can mix an old `index.html` with new modules (or the reverse); with named ES-module imports that fails hard. A tiny build step adding a version query string to `js/app.js` and the CSS links would remove the window. |
| R7 | The entity tables in the detail view (documents, contacts, costs, contracts, assets, measurements) are stubs: their loaders are exported but never called and the state arrays stay empty. Remove or wire up once a backend exists. |
| R8 | `tiles3d.js` and the three.js import map are dead code until an API key exists. Remove them or put the feature behind a config flag. |
| R9 | The jsdom test harness written for this review (fake MapLibre, three scenarios, ~60 checks) lives outside the repository. Adding it under `prototype-main/test/` with `jsdom` as a dev dependency would give the project a regression suite; it needs a `package.json`, which the "no build step" setup currently avoids. |
| R10 | Switching to the gallery drops the selected `id` from the URL; Back to the map keeps the selection in state but not in the URL. Minor and pre-existing. |

## 6. Behaviour changes to be aware of

1. Filter changes no longer create browser history entries (B6).
2. A URL with `id` but without `view=detail` opens the map with the object selected instead of the detail page (B10). Share links created from the detail page carry `view=detail` and still open the detail page.
3. Switching the basemap no longer flies back to the object in the URL (B2).
4. `alert()` dialogs are gone; messages appear as toasts (U6).

## 7. Verification

- **Syntax:** every module passes `node --input-type=module --check`; `i18n.json` is valid and every statically referenced key exists.
- **jsdom harness (Node, fake MapLibre):** three scenarios, all checks passing.
  - *normal* — boot, overlay hidden, banner, footer, 11 rows, `?table=open`, column stylesheet, `?id=` keeps the map view, sources/layers on load, URL selection restored (state, info panel, row, one fly-to), handlers bound once, column toggle, basemap switch restores layers without duplicating handlers or re-flying, selection filter restored, measure guard, pulse pauses outside the map view, filters use `replaceState`, gallery toggle, popstate to map and to detail, mini map created once and reused, HTML escaping, search failure warning with local results intact, Geokatalog failure → retry → tree → delegated add/remove.
  - *nodata* — error toast with retry, retry loads the data, no duplicated listeners after retry, map layers added once.
  - *partial* — app loads with buildings only, warning toast, parcels tab safe without data.
- **Headless Edge:** six URL states (map, gallery, detail, map selection, missing data, partial data) load without JavaScript errors; screenshots at 1366 px and 400 px confirm banner, error toast, and busy indicator placement.
- **Known limitation:** headless Edge freezes timers and animation frames after the initial load, so MapLibre never reaches its `load` event there. Map-layer behaviour was therefore verified with the fake-map harness, not in a real WebGL context. A manual check in a normal browser is recommended before deploying.
