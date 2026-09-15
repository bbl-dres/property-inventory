# Code Review 2 — prototype-tabs (bugs and performance, with prototype-simple)

**Date:** 2026-09-15
**Scope:** all files under `prototype-tabs/`, reviewed together with `prototype-simple/`: the 19 common modules and the two shared stylesheets are byte-identical, the ten per-app modules share their structure.
**Focus:** bugs and performance, plus the robustness of the asynchronous flows and the regression coverage.
**Reviewer:** Claude (senior-developer review requested by the maintainer)
**Main document:** [prototype-simple/docs/CODE-REVIEW-3.md](../../prototype-simple/docs/CODE-REVIEW-3.md) holds the full finding tables (B1–B13, P1–P6), the behaviour changes and the recommendations. This page lists what applies to this prototype and what was specific to it.
**Previous review:** [CODE-REVIEW.md](CODE-REVIEW.md) (2026-09-15). Its fixes were checked and are still in place.

## Specific to prototype-tabs

| ID | Severity | Where | Finding | Status |
|---|---|---|---|---|
| B3 | Medium | `js/map.js` | `selectBuilding()` called `syncTableToBuilding()` four times and `selectParcel()` called `syncTableToParcel()` four times (copy-paste): every selection re-rendered and scrolled the table up to four times. | Fixed: one call each; the *normal* scenario counts the calls. |
| B5 | Medium | `js/list.js` | The two building columns backed by `extensionData` (Teilportfolio, Fläche NGF) hold an object in `field`; with the new column sorting they carry `sortField: 'extensionData.portfolio'` and `'extensionData.netFloorArea'`. The entity tables of the detail page already sorted and are unchanged. | Fixed. |

## Shared findings that apply here

Fixed in this prototype through its per-app modules or the common copies (details in the main document):

- **B1** map data layers could stay missing when the data arrived after the map's single `load` event (`app.js`, `map.js`).
- **B2** every return to the map view re-zoomed to the filtered objects and re-clustered the source (`ui.js`, `filters.js`, `state.js`).
- **B4** the printed map was squeezed into the map area of the page (`print.js`, common).
- **B6** a basemap change dropped the line of a measurement in progress (`measure.js`, `map.js`).
- **B7** stale results of a slow external search could appear over a cleared field (`search.js`).
- **B8, B9, B10, B13** context menu, print item from the context menu, layer-info ordering, legend sanitiser (common modules).
- **B11** filter option ids could collide; options now sort with the locale (`filters.js`).
- **P1** a filter change re-rendered the parcels table too (`filters.js`, `list.js`, `ui.js`); **P2** the location tree was rebuilt while closed; **P3** column toggles rebuilt the stylesheet per checkbox; **P4** the table resize drag resized the map on every pointer event (`list.js`); **P5** measure labels were re-created per drag event.

Behaviour changes: header clicks sort the tables; returning to the map keeps the position unless a filter was applied while the map was hidden; the print preview shows the map area of the page; the context menu closes on pan and outside clicks; "Drucken" from the context menu unfolds a collapsed tools panel.

## Verification

- `node test/check-alignment.js`: all common files identical; every module parses as an ES module.
- jsdom harness, prototype-tabs (`cd test && npm run test:tabs`): 6 scenarios, 206 checks, all passing: *normal* 142 (121 before), *late-data* 16 (new: data arriving after the map loaded, stale search results, print layout), *aerial basemaps* 17, *no data + retry* 7, *partial data* 8, *URL states* 16.
- Run against the previous code, the new checks fail: *late-data* on the missing map layers, *normal* on 13 checks (four table syncs per selection, sorting, deferred filter zoom, measurement after a basemap change, context menu, tree built while closed, print item from the context menu, column toggles).
- Not verified in a browser: the rendered PDF and the measure labels during a real drag (see R6 of the main document).
