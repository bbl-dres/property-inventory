# Code Review 2 — prototype-simple (with the alignment to prototype-tabs)

**Date:** 2026-09-15
**Scope:** all files under `prototype-simple/` (ES modules, `index.html`, `css/`, `data/i18n.json`), reviewed together with `prototype-tabs/` because both prototypes are variants of the same application
**Focus:** bugs, dead and redundant code, duplication inside and across the two prototypes, architecture alignment
**Reviewer:** Claude (senior-developer review requested by the maintainer)
**Previous review:** [CODE-REVIEW.md](CODE-REVIEW.md) (2026-09-11). Its open recommendations R3, R4, R5, R7, R8, R9 and R10 are resolved by this change set; R6 stays open.

Every finding was verified against the code. Findings marked **Fixed** were implemented in the same change set as this document, and the result was checked with the new regression harness in [`../../test/`](../../test/) (5 scenarios, 112 checks for this prototype) and in headless Edge.

## Summary

| Area | Findings | Fixed | Open |
|---|---|---|---|
| Bugs | 12 | 12 | 0 |
| Dead and redundant code | 9 | 9 | 0 |
| Complexity / duplication | 6 | 6 | 0 |
| Architecture alignment with prototype-tabs | implemented | — | see section 6 |
| Recommendations | 8 | — | 8 |

Size of the prototype: 17,072 lines of JS, CSS and HTML before, 13,591 after (dead code removed, common modules added). Of the 6,606 JavaScript lines, 3,584 are in the 17 modules that are byte-identical with prototype-tabs.

## 1. Bugs

| ID | Severity | Where | Finding | Status |
|---|---|---|---|---|
| M1 | Medium | `map.js` | Hidden internal layers reappeared after a basemap switch: `addMapLayers()` re-created the layers as visible while the "Interne Karten" checkbox stayed unchecked. | Fixed: `applyInternalLayerVisibility()` re-applies the checkbox state whenever the layers are (re)built. |
| M2 | Medium | `map.js` | A basemap switch with active filters flew the map back to the filtered points: `addMapLayers()` called `updateMapFilter()` before `restoreLayers()` set `skipFilterZoom`. | Fixed: the flag is set before the layers are rebuilt. |
| M3 | Medium | `ui.js`, `map.js` | Switching to the gallery dropped the selected `id` from the URL (R10 of the previous review), and a link such as `?view=gallery&id=…` lost its selection because the view restore rewrote the URL before the map had loaded. | Fixed: view switches keep the map selection in the URL; the URL selection is captured at module load. |
| M4 | Low | `ui.js`, `index.html` | The "Externe Karten" section of the mobile menu was never populated: the container existed, no code rendered into it. | Fixed: `swisstopo.js` renders the active external layers into both lists. |
| M5 | Low | `print.js` | The print preview label showed "A4" for every format except A3 (A0–A2 were labelled A4). | Fixed: the size comes from the format value. |
| M6 | Low | `list.js` | Syncing the table to a map selection computed the target page on the unsearched data, so with an active toolbar search the highlighted row could be on another page. | Fixed: the table factory pages over the rows it actually shows. |
| M7 | Low | `list.js` | The land-cover empty row spanned 13 columns for a 15-column table. | Fixed: derived from the column list. |
| M8 | Low | `list.js`, `index.html` | The "Excel (.xlsx)" export produced a semicolon CSV (R3). | Fixed: labelled "CSV für Excel (.csv)" in all four languages; the file format is unchanged. |
| M9 | Low | `filters.js`, `swisstopo.js`, `search.js` | Filter pill labels were German-only (R4); Geokatalog, layer info, identify and search requests always used `lang=de` (R5). | Fixed: pills use the `col.*` translations of the filtered property; every geoadmin request passes the UI language. |
| M10 | Low | `ui.js`, `search.js`, `swisstopo.js`, `detail.js`, `filters.js`, `map.js` | Eight independent `keydown` listeners handled Escape and relied on registration order plus `stopImmediatePropagation()` to decide who wins (the layer info modal had to be registered before the search, the lightbox before everything). Adding a modal meant reasoning about module load order. | Fixed: one registry (`keys.js`) with explicit priorities. |
| M11 | Low | `detail.js` | Carousel dots were `<div>` elements with `onclick` — not focusable, not announced. | Fixed: buttons with `role="tab"` (common carousel module). |
| M12 | Low | `map.js` | The context-menu "Drucken" entry called `window.print()` (a browser page print of the app) and was hidden by an inline style. | Fixed: the entry opens the print panel (PDF export) and is visible again. |

## 2. Dead and redundant code

| ID | Where | Finding | Status |
|---|---|---|---|
| D1 | `export.js` | The export panel (`initExportPanel`, `performExport`, GeoJSON/CSV/KML/Shapefile writers, `copyShareLink`) had no UI: `index.html` contains no export accordion and no share panel. Only `getShareUrl()` was live. Roughly 300 lines. | Removed; the live quick export of the table toolbar moved here from `list.js`. |
| D2 | `detail.js`, `state.js`, `utils.js` | The entity-table factory and its six table definitions (measurements, documents, contacts, costs, contracts, assets), the `state.all*` arrays and the currency/contract formatters had no markup in `index.html` and no data loader (R7). Roughly 480 lines. | Removed. The same code lives on in prototype-tabs, which has the markup and the data. |
| D3 | `tiles3d.js`, `index.html` | Google 3D Tiles module and the three.js import map were never imported (R8). | Removed. |
| D4 | `ui.js` | `populateMobileAccordion()` was defined and never called; `showInfo()`/`showSuccess()` were never used. | Removed. |
| D5 | `filters.js`, `list.js`, `print.js`, `swisstopo.js` | `navigateWithRegionFilter()`, `resetGalleryPage()`, `createCoordinateGrid()` and the `label` property of every column definition were unused. | Removed. |
| D6 | `css/styles.css`, `css/tokens.css` | Sections without markup or code: share panel, export panel, detail table, category badge, injected print container; scattered rules (`.address-marker`, `.dropdown-menu-divider`). Roughly 520 lines. The skeleton and `.icon-btn` primitives in `tokens.css` are also unreferenced. | Sections and rules removed from `styles.css`; the `tokens.css` primitives were left as documented design-system primitives (see [DESIGNGUIDE.md](DESIGNGUIDE.md)). |
| D7 | `data/i18n.json` | Seven keys had no reference (`accordion.share`, `accordion.draw*`, `print.scale`, `swisstopo.loading*`, `swisstopo.layer.loadFailed`). | Removed; 12 keys added for the aligned modules. |
| D8 | `index.html` | `#context-menu-print` was hidden by an inline style but still wired; `#mobile-external-layers-list` was never filled. | Both are live now (see M4, M12). |
| D9 | `ui.js` | `state.menuOpen`, `state.stylePanelOpen`, `state.selectedExportFormat`, `state.currentCarouselIndex`, `state.printPreviewOverlay`, `state.measureState`, `state.activeSwisstopoLayers` and similar entries in `state.js` were owned by one module each. | Moved into the owning module; `state.js` keeps application state only (data, indexes, selection, views, filters). |

## 3. Complexity and duplication

| ID | Finding | Status |
|---|---|---|
| C1 | Three near-identical table implementations (buildings, parcels, land covers: render, pagination, search, row selection, sync to selection, roughly 400 lines) plus a fourth in prototype-tabs. | One factory `table.js` (`createFeatureTable`) used for all four tables, plus the column-visibility stylesheet and dropdown helpers. |
| C2 | View switching was implemented three times (`switchView`, `showDetailView`, `showApiDocsView`) with the same show/hide, toggle-button and style-switcher code. | One `setActiveView()`; the three entry points only differ in what they render. |
| C3 | `initFilterOptions()` hard-coded the twelve filter keys and their properties a second time next to `filterConfig`. | Driven by `filterConfig`; the option lists now show the number of objects per value (as prototype-tabs did). |
| C4 | The three internal layer toggles were copy-pasted with their layer id lists. | `config.internalLayerIds` plus one `setInternalLayerVisibility()`. |
| C5 | `restoreLayers()` re-implemented the three selection filters instead of calling `updateSelected*()`; `handleSearchClick` decoded its parameters in `app.js` instead of the search module. | Simplified; the search module exports its own actions. |
| C6 | Duplicated between the two prototypes: toast system, i18n runtime, loading/boot helpers, measure tool, context menu, swisstopo/Geokatalog integration, print, style switcher and basemaps, map controls, mini map, carousel, sheet gestures, accordion, utilities — about 3,500 lines written twice (and diverging: the tabs copies still had the bugs fixed here on 2026-09-11). | Extracted into 17 common modules that are byte-identical in both prototypes (section 5). |

## 4. Behaviour changes to be aware of

1. Switching to the gallery or the API page keeps the selected building in the URL (M3).
2. Filter pills, the Geokatalog and the swisstopo search follow the UI language (M9).
3. "Drucken" in the map context menu opens the print panel instead of the browser print dialog (M12).
4. The "Excel" export entry is labelled "CSV für Excel (.csv)" (M8).
5. The basemap thumbnails are local PNGs (`assets/basemaps/`, taken from prototype-tabs) instead of tiles fetched from the basemap providers.
6. Carousel dots are keyboard-accessible buttons.

## 5. Architecture alignment with prototype-tabs

Both prototypes stay independent: nothing is loaded across folders, each has its own copy of every file. The alignment is structural: the same module layout, the same function names, and for the schema-independent parts the same code.

### 5.1 Module map

| Module | prototype-simple | prototype-tabs | Relation |
|---|---|---|---|
| `app.js` | boot, data loading, table panel, action delegation | boot, data loading, action delegation | aligned (same structure, different datasets) |
| `config.js` | status colours, `filterConfig`, internal layer ids and metadata | same, for the tabs schema | aligned |
| `state.js` | data, indexes, selection, views, filters | same | aligned |
| `ui.js` | views, tabs, tools panel, mobile menu, language, info panel, history, API docs | views, tabs, tools panel / phone menu, info panel, history | aligned |
| `filters.js` | URL state, drawer, options, pills, map filter | same, plus the header object count | aligned |
| `list.js` | three tables, table tabs, toolbar, gallery | one table, toolbar, gallery | aligned |
| `detail.js` | detail fields, tooltips, collapsible sections | detail fields, entity-table loading | aligned |
| `map.js` | layers (clusters, parcels, land covers), selection, restore | layers (points, parcels), selection, restore | aligned |
| `search.js` | objects, places, layers, history, scope menu | same, plus parcels and the KI section | aligned |
| `export.js` | share URL, quick export | share URL, share panel, export panel, quick export | aligned |
| `entity-tables.js`, `assistant.js` | — | entity tables of the detail tabs, KI mock answers | tabs only |
| `utils.js`, `i18n.js`, `toast.js`, `geo.js`, `keys.js`, `boot.js`, `basemaps.js`, `map-controls.js`, `measure.js`, `context-menu.js`, `swisstopo.js`, `print.js`, `table.js`, `carousel.js`, `mini-map.js`, `gestures.js`, `accordion.js` | common | common | **identical** (3,584 lines) |
| `data/i18n.json` | all UI strings, 4 languages | identical copy (the tabs UI is German; the JS-rendered strings come from this file) | **identical** |

### 5.2 Conventions shared by both prototypes

- Markup hooks: `data-action="…"` on clickable elements with one delegated listener in `app.js` (no inline `onclick`), `data-accordion="print|catalog|layers|…"` on accordion items, `data-dropdown="<menu id>"` on toolbar dropdown buttons.
- The same element ids for the map tools, context menu, measure display, style switcher, layer info and topic modals, filter drawer (`#filter-panel`, `#filter-panel-btn`, `#drawer-*`), info panel, toast container and lightbox.
- The same map layer ids (`buildings-*`, `parcels-*`) and source ids, so the common modules (print, swisstopo, 3D buildings) anchor their layers the same way.
- The URL owns basemap, position, selection, filters, view, tab, external layers and topic; filters and selection use `replaceState`, views use `pushState`.
- Escape handling through `keys.js` with fixed priorities (lightbox 100, modals 90, context menu 80, measure 70, search scope 60, search 50, phone menu 40, filter drawer 30).

### 5.3 Keeping the copies in sync

`node test/check-alignment.js` (or `npm run align` in `test/`) compares the 17 common modules and `data/i18n.json` between the two prototypes and fails when they differ. Edit a common module in one prototype, copy it to the other, and run the check.

The remaining, intended difference is the data schema: prototype-simple uses the flat SAP/GIS attribute model of [DATAMODEL.md](DATAMODEL.md) (`bbl_id`, `bbl_stat`, …), prototype-tabs the camelCase BuildingMinds model with `extensionData` (see its own data model document). The per-app modules of section 5.1 differ only where they touch these attributes.

## 6. Recommendations (not implemented)

| ID | Recommendation |
|---|---|
| R1 | **One data model.** The two prototypes describe the same portfolio with two schemas and two `DATAMODEL.md` documents. Converting the prototype-tabs data to the SAP/GIS model of this prototype (or generating both from one source) would let `config.js`, `map.js`, `list.js`, `search.js` and `detail.js` become common modules too and would make the tabs README claim "same model as simple app" true. |
| R2 | **Common stylesheet.** The two stylesheets (5,300 and 5,800 lines) still implement the same components twice with slightly different token names. A common `tokens.css` plus component stylesheet, copied like the JS modules, would remove the largest remaining duplication. |
| R3 | **Cache busting (R6 of the previous review).** GitHub Pages serves every file with `Cache-Control: max-age=600`; a version query string on the module and stylesheet links would close the ten-minute window in which an old `index.html` can load new modules. |
| R4 | **Real-browser check of the PDF export and the 3D view.** The jsdom harness has no WebGL; `print.js` and the 3D buildings were verified for syntax and wiring only. A manual check in a normal browser is recommended before deploying. |
| R5 | **Tooltips of the detail labels** (`labelDescriptions` in `detail.js`) are German-only and keyed by the German label text; move them into `data/i18n.json` keyed by field name. |
| R6 | **`tokens.css` primitives** (`.skeleton*`, `.icon-btn*`) are unreferenced; keep them only if the design guide wants them as building blocks. |
| R7 | **Translation of dynamic KI and API texts** is out of scope for a German-only feature set, but the runtime is ready: the tabs prototype could add `data-i18n` attributes and a language selector at any time. |
| R8 | **Harness coverage.** The scenarios cover boot, data errors, URL restore, selection, filters, views, basemap switch, measure guard, search, external layers and language switch. Not covered: PDF generation, identify popups (needs geometry), touch gestures, drawer resize. |

## 7. Verification

- **Syntax:** every module passes `node --check`; an import checker verifies that every named import exists in the target module and that no import is unused.
- **jsdom harness** (`test/`, fake MapLibre, one Node process per scenario), prototype-simple: *normal* (73 checks: boot, banner, indexes, tables, filter options with counts, column stylesheet, map sources/layers/handler counts, table row selection, filters via `replaceState`, pills, gallery, detail with carousel and mini map reuse, tabs, back, popstate, basemap switch without duplicate handlers or re-fly, internal layer toggle across a style change, measure guard, map click deselect, search with escaped external results, external layer add/remove, language switch), *URL states* (14), *deep links* (8), *no data + retry* (10), *partial data* (7). All pass.
- **Headless Edge** (`--headless=new`, real MapLibre): both prototypes boot, hide the overlay, render the tables; no console errors.
- **Static scans** (scratch scripts, not committed): unreferenced CSS classes 16 → 0 in `styles.css`; unreferenced i18n keys 8 → 0 (11 keys are used by prototype-tabs only and kept for the identical file); unused functions 8 → 0; ids referenced from JS but missing in the markup 11 → 0 (except the dynamically created `#print-crop-rect`).
