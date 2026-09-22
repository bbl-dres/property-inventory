# Tabs Views — Property Detail Prototype

> **Unofficial prototype.** Public building facts and photographs with fictional operational data; not for production use. Part of the [`property-inventory`](../README.md) repo.

Tabbed property-detail view with structured sections and KI answers inside the search suggestions. A fork of the [simple app](../prototype-simple) that swaps the side info panel for a full-page detail view with seven tabs.

## Live app

https://bbl-dres.github.io/property-inventory/prototype-tabs/

## Focus

All data tables use the [shared table component](../docs/TABLE-COMPONENT.md), with
consistent width roles, compact dates, and technical IDs kept out of display columns.

- **Full-page detail view.** When a building is selected, the map collapses and a structured detail page takes over.
- **Seven tabs** per property: Übersicht, Bemessungen, Kosten, Verträge, Ausstattung, Dokumente, Kontakte.
- **KI in the search box.** The search suggestions start with a "Frage stellen" section: one suggested question for the typed term, answered inline (Enter or tap) — mock answers computed from the loaded data, no model. A scope menu in the search box ("Alle ▾") opens checkboxes for Fragen, Objekte, Orte and Karten; several can be combined. Geokatalog rows carry a "+ Als Ebene" button and an info button that opens the layer info modal. This replaced the former AI side panel.
- **Thema wechseln.** The Geokatalog accordion can switch between the ~30 topics of map.geo.admin.ch (federal offices and themes, e.g. swisstopo, MeteoSchweiz, Energie): a modal with a topic grid, borrowed from [geoadmin/web-mapviewer](https://github.com/geoadmin/web-mapviewer) (names and `assets/topics.png`), reloads the catalog tree for the chosen topic; the header shows the topic name and the choice is kept in the URL (`topic=`).
- **Mobile.** Phones (portrait and landscape) get a two-row header, a hamburger menu for the map tools (share, print, export, Geokatalog, external layers), a full-screen filter sheet with a live result count, a swipe-to-dismiss info sheet and a sticky tab strip on the detail page; tablets keep the desktop layout with 44 px touch targets and the tools panel collapsed by default. See [docs/RESPONSIVE-REVIEW.md](docs/RESPONSIVE-REVIEW.md).

- **Aligned with the simple app.** Same module layout, markup hooks and behaviour for the map tools: PDF export of the print panel, Geokatalog with "Thema wechseln", measure tool, search history, lightbox, URL-owned basemap and selection. The data model still differs (camelCase BuildingMinds schema with `extensionData`, see [docs/CODE-REVIEW.md](docs/CODE-REVIEW.md)).

## Running

The same 14 researched buildings/sites as the simple app are exported into this
prototype's camelCase schema and related-entity JSON files. Measurements distinguish
published SIA values, calculated Swiss parcel areas and SIA/RICS demo scenarios.
Documents use KBOB codes, contacts are fictional, and photographs carry credits.
See the [research and generation guide](../scripts/portfolio/README.md) for sources,
verified Swiss register IDs, geometry, assumptions and reproduction commands.

### Basemap links

The selector offers Light, Standard, Aerial, Hybrid and Dark. Use
`?basemap=aerial` for imagery without labels or `?basemap=aerial-labels` for imagery
with Esri's Hybrid Reference Layer (roads, boundaries and place labels). Both use
Esri World Imagery worldwide and swisstopo SWISSIMAGE over Switzerland from zoom 8.
The choice is preserved in shared URLs and restored on reload and Back/Forward.
See [THIRD-PARTY.md](THIRD-PARTY.md) for sources and attribution.

### Local server

Static files only — no build step. From the repo root:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000/prototype-tabs/>.

## Tests

A jsdom harness with a fake MapLibre lives in [`../test/`](../test/). It is development tooling only: nothing is shared between the prototypes at runtime.

```bash
cd test && npm install
npm test            # all scenarios of both prototypes
npm run test:tabs     # this prototype only
npm run align       # verifies that the common modules, stylesheets and the design guide are identical in both prototypes
npm run visual      # headless-Edge screenshots and computed metrics of both prototypes at six viewports (needs a static server on :8123)
```

## Tech

| What | Why |
|---|---|
| Vanilla ES modules | No build. Same module layout as the simple app; 18 of the 30 modules and the stylesheets `tokens.css` / `components.css` are byte-identical with it (see [docs/CODE-REVIEW.md](docs/CODE-REVIEW.md), [docs/DESIGN-REVIEW.md](docs/DESIGN-REVIEW.md)) |
| MapLibre GL JS 5.19 (vendored in `vendor/`) | Map, mini map, markers, popups — same build and basemaps (CARTO Positron/Voyager/Dark Matter, swisstopo SWISSIMAGE) as the simple app; no API key |
| jsPDF 2.5.1 (vendored in `vendor/jspdf/`) | PDF export of the print panel, same renderer as the simple app |
| Swagger UI 5 (vendored in `vendor/swagger-ui/`) | API documentation from `data/swagger.json` (footer link "API" or `?view=api-docs`), loaded only when the API page opens. Spec and viewer are identical copies of the simple app's; the spec is generated there (`prototype-simple/docs/generate_swagger.py`) and documents the target API, not this prototype's mock property names |
| `data/i18n.json` | Identical copy of the simple app's translation file; the UI stays German (the language selector only warns), the JS-rendered texts come from this file |
| Material Symbols Outlined (self-hosted in `assets/icons/`) | Icons: static font of the complete icon set (322 KB), no request to Google Fonts |

## Layout

```
prototype-tabs/
├── index.html
├── css/
│   ├── tokens.css        # Design tokens, base, primitives (identical with ../prototype-simple)
│   ├── components.css    # Shared components incl. responsive rules (identical with ../prototype-simple)
│   └── app.css           # Tabs-only: header tab strip, sections, entity tables, share/export panels
├── js/                   # ES modules (same layout as ../prototype-simple/js)
│   ├── app.js            # Bootstrap, data loading, action delegation
│   ├── config.js · state.js
│   ├── ui.js             # Views (map, gallery, detail), detail tabs, home, info panel, history
│   ├── map.js · list.js · detail.js · filters.js · search.js · export.js
│   ├── entity-tables.js  # Tables of the detail tabs (tabs only)
│   ├── assistant.js      # KI mock answers in the search (tabs only)
│   └── common modules, identical with ../prototype-simple/js:
│       utils.js · i18n.js · toast.js · geo.js · keys.js · boot.js · basemaps.js ·
│       map-controls.js · measure.js · context-menu.js · swisstopo.js · print.js ·
│       table.js · carousel.js · mini-map.js · gestures.js · accordion.js · tools-panel.js · location-tree.js
├── data/                 # buildings.geojson, parcels, entity tables, i18n.json, swagger.json (identical with ../prototype-simple)
├── assets/               # local basemap thumbnails, icons, topic sprite, countries/ and regions/ (identical with ../prototype-simple)
├── vendor/               # MapLibre GL JS (BSD-3), jsPDF (MIT), Swagger UI (Apache-2.0)
└── docs/
    ├── CODE-REVIEW.md        # Review (2026-09-15): bugs, dead code, alignment with the simple app
    ├── CODE-REVIEW-2.md      # Review 2 (2026-09-15): bugs, performance, async robustness (with the simple app)
    ├── DATAMODEL.md          # BuildingMinds-style model with extensionData (differs from the simple app, see CODE-REVIEW.md)
    ├── DESIGNGUIDE.md        # Design system (identical with ../prototype-simple)
    ├── DESIGN-REVIEW.md      # Design review (2026-09-15): alignment of both prototypes
    ├── DESIGN-REVIEW-2.md    # Polish review: tokens, icon button, state styles (identical with ../prototype-simple)
    └── RESPONSIVE-REVIEW.md  # Responsive / mobile design review
```

## See also

- [Code review](docs/CODE-REVIEW.md) · [Code review 2](docs/CODE-REVIEW-2.md) · [Data model](docs/DATAMODEL.md) · [Design system](docs/DESIGNGUIDE.md) · [Design review](docs/DESIGN-REVIEW.md) · [Polish review](docs/DESIGN-REVIEW-2.md) · [Responsive review](docs/RESPONSIVE-REVIEW.md) · [Third-party components](THIRD-PARTY.md)
- Parent prototype: [`../prototype-simple`](../prototype-simple) (read-only inventory)
- Sibling prototypes: [`../prototype-workflows`](../prototype-workflows) · [`../prototype-backend`](../prototype-backend) · [`../osm-height`](../osm-height)
