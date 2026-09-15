# Main App — Liegenschaften Inventar

> **Unofficial mockup.** Fictional data, not for production use. Part of the [`property-inventory`](../README.md) repo.

Read-only property inventory with **map**, **list**, and **gallery** views. This is the flagship prototype — the others either extend it (tabs, workflows) or explore adjacent problems (backend, osm-height).

## Live app

https://bbl-dres.github.io/property-inventory/prototype-main/

The repository root [`/`](https://bbl-dres.github.io/property-inventory/) redirects here.

## Features

### Core views
- **Map** — MapLibre WebGL map with colour-coded property markers, 4 basemap styles (Light, Standard, Aerial, Dark), measure tool, print-to-PDF, and a sidebar accordion for layers/Geokatalog.
- **List** — sortable, searchable, paginated table with configurable columns. Three tabs: buildings, parcels, land covers.
- **Gallery** — responsive 3-column grid with property cards and status badges.
- **Detail panel** — building dashboard with images, basic info, mini-map, and area data (SIA 416 compliant).
- **Mobile** — phones (portrait and landscape) get a two-row header, the tools panel as a hamburger menu (print, Geokatalog, layers, share, language), a full-screen filter sheet with a result-count button, and a swipe-to-dismiss bottom sheet for object details; tablets keep the desktop layout with 44 px touch targets and the tools panel collapsed by default. See [docs/RESPONSIVE-REVIEW.md](docs/RESPONSIVE-REVIEW.md).

### Search & filtering
- Multi-source search: local buildings + swisstopo location API + Geokatalog layers. Rows show an icon, the highlighted term and a meta line; Geokatalog rows carry a "+ Als Ebene" button and an info button that opens the layer info modal. A scope menu ("Alle ▾") with checkboxes narrows the sources (several can be combined).
- "Thema wechseln": the Geokatalog accordion switches between the ~30 topics of map.geo.admin.ch (federal offices and themes) in a topic grid borrowed from [geoadmin/web-mapviewer](https://github.com/geoadmin/web-mapviewer) (names in `data/i18n.json` as `topic.*`, images in `assets/topics.png`); the catalog tree reloads for the chosen topic, the header shows its name and the choice is kept in the URL (`topic=`).
- 6 filter categories: status, ownership type, portfolio, building type, country, region.
- Deep linking with URL-based navigation and filter persistence.

### Basemap links
- `?basemap=light` selects Light (the default).
- `?basemap=standard`, `?basemap=aerial`, and `?basemap=dark` select the other backgrounds.
- Missing or invalid values use Light and are normalized to `basemap=light` in the URL.
- Changing the background updates the URL; reloading, sharing, and Back/Forward restore that choice. Previously saved `localStorage` basemap preferences are ignored.
- Aerial imagery covers Switzerland and starts at zoom 8; for example, `?basemap=aerial&lng=8.2275&lat=46.8182&zoom=10`.

### Data export
- CSV, Excel (`.xlsx`), GeoJSON.
- Custom column selection before export. Filtered-vs-all scope.

### Internationalisation
- German (DE) is the default, regardless of browser language or previously saved preferences.
- `?lang=de`, `?lang=fr`, `?lang=it`, and `?lang=en` select an explicit language. Missing or invalid values use German.
- Switching language updates the `lang` URL parameter, so reloads and shared links retain the choice.

### API documentation
- Mock REST API documented as OpenAPI 3.0 in `data/swagger.json`, rendered with Swagger UI
  (footer link “API” or `?view=api-docs`). The endpoints are placeholders and not reachable.
- The spec is generated from the data model: `python docs/generate_swagger.py`. The tabs prototype carries an
  identical copy of `data/swagger.json` and `vendor/swagger-ui/` (checked by `test/check-alignment.js`).

## Running

Static files only — no build step. From the repo root:

```bash
# Python
python -m http.server 8000

# Node
npx http-server

# PHP
php -S localhost:8000
```

Then open <http://localhost:8000/prototype-main/> (or the repo root, which redirects).

## Tests

A jsdom harness with a fake MapLibre lives in [`../test/`](../test/). It is development tooling only: nothing is shared between the prototypes at runtime.

```bash
cd test && npm install
npm test            # all scenarios of both prototypes
npm run test:main     # this prototype only
npm run align       # verifies that the common modules, stylesheets and the design guide are identical in both prototypes
npm run visual      # headless-Edge screenshots and computed metrics of both prototypes at six viewports (needs a static server on :8123)
```

## Tech

| What | Why |
|---|---|
| Vanilla ES modules | No build, easy to read. 18 of the 28 modules and the stylesheets `tokens.css` / `components.css` are byte-identical with the tabs prototype (see [docs/CODE-REVIEW-2.md](docs/CODE-REVIEW-2.md), [docs/DESIGN-REVIEW.md](docs/DESIGN-REVIEW.md)) |
| MapLibre GL JS 5.19 | Map, layers, clustered points, 3D buildings — vendored in `vendor/maplibre-gl/` so the app does not depend on a CDN |
| Swagger UI 5 | API documentation from `data/swagger.json` — vendored in `vendor/swagger-ui/`, loaded only when the API page opens |
| jsPDF 2.5.1 | PDF export of the print view — vendored in `vendor/jspdf/` |
| swisstopo `api3.geo.admin.ch` | Location search & Geokatalog (no key required) |
| Material Symbols Outlined (self-hosted in `assets/icons/`) | Icons: static font of the complete icon set (322 KB), no request to Google Fonts |

## Layout

```
prototype-main/
├── index.html
├── css/
│   ├── tokens.css        # Design tokens, base, primitives (identical with ../prototype-tabs)
│   ├── components.css    # Shared components incl. responsive rules (identical with ../prototype-tabs)
│   └── app.css           # Main-only: language selector, table panel, detail cards, API docs
├── js/                   # ES modules
│   ├── app.js            # Bootstrap, data loading, action delegation
│   ├── config.js · state.js
│   ├── ui.js             # Views, tabs, phone-menu extras, language, history
│   ├── map.js            # Data layers, selection, restore after a basemap change
│   ├── list.js           # Table panel (three tables), gallery
│   ├── detail.js · filters.js · search.js · export.js
│   └── common modules, identical with ../prototype-tabs/js:
│       utils.js · i18n.js · toast.js · geo.js · keys.js · boot.js · basemaps.js ·
│       map-controls.js · measure.js · context-menu.js · swisstopo.js · print.js ·
│       table.js · carousel.js · mini-map.js · gestures.js · accordion.js · tools-panel.js · location-tree.js
├── data/
│   ├── buildings.geojson
│   ├── parcels.geojson
│   ├── landcovers.geojson
│   ├── i18n.json
│   └── swagger.json      # OpenAPI 3.0 mock API (generated)
├── vendor/
│   ├── maplibre-gl/      # MapLibre GL JS 5.19.0 (js, css, licence)
│   ├── swagger-ui/       # Swagger UI 5 (js, css, licence)
│   └── jspdf/            # jsPDF 2.5.1 (js, licence)
├── assets/
│   ├── basemaps/         # Local thumbnails of the style switcher
│   ├── icons/            # Material Symbols (self-hosted)
│   └── topics.png        # Topic sprite of the Geokatalog
└── docs/
    ├── DATAMODEL.md      # Attribute reference
    ├── DESIGNGUIDE.md    # Design system (identical with ../prototype-tabs)
    ├── DESIGN-REVIEW.md  # Design review (2026-09-15): alignment of both prototypes
    ├── CODE-REVIEW.md    # Review 1 (2026-09-11): bugs, performance
    ├── CODE-REVIEW-2.md  # Review 2 (2026-09-15): dead code, duplication, alignment with prototype-tabs
    ├── RESPONSIVE-REVIEW.md  # Responsive / mobile design review
    └── generate_swagger.py  # DATAMODEL.json -> data/swagger.json
```

## See also

- [Data model](docs/DATAMODEL.md) · [Design system](docs/DESIGNGUIDE.md) · [Design review](docs/DESIGN-REVIEW.md) · [Code review 1](docs/CODE-REVIEW.md) · [Code review 2](docs/CODE-REVIEW-2.md) · [Responsive review](docs/RESPONSIVE-REVIEW.md) · [Third-party components](THIRD-PARTY.md)
- Sibling prototypes: [`../prototype-tabs`](../prototype-tabs) · [`../prototype-workflows`](../prototype-workflows) · [`../prototype-backend`](../prototype-backend) · [`../osm-height`](../osm-height)
