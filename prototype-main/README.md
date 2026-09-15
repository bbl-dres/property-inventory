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
- **Mobile** — phones (portrait and landscape) get a compact header with a hamburger menu, a full-screen filter sheet with a result-count button, and a swipe-to-dismiss bottom sheet for object details; tablets keep the desktop layout with 44 px touch targets and the tools panel collapsed by default. See [docs/RESPONSIVE-REVIEW.md](docs/RESPONSIVE-REVIEW.md).

### Search & filtering
- Multi-source search: local buildings + swisstopo location API + Geokatalog layers.
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
- The spec is generated from the data model: `python docs/generate_swagger.py`.

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

## Tech

| What | Why |
|---|---|
| Vanilla ES modules | No build, easy to read |
| MapLibre GL JS 5.19 | Map, layers, 3D tiles — vendored in `vendor/maplibre-gl/` so the app does not depend on a CDN |
| Swagger UI 5 | API documentation from `data/swagger.json` — vendored in `vendor/swagger-ui/`, loaded only when the API page opens |
| swisstopo `api3.geo.admin.ch` | Location search & Geokatalog (no key required) |
| Material Symbols | Icons |

## Layout

```
prototype-main/
├── index.html
├── css/
│   ├── tokens.css        # Design tokens
│   └── styles.css        # Application styles
├── js/                   # ES modules
│   ├── app.js            # Bootstrap
│   ├── config.js · state.js · utils.js
│   ├── map.js            # MapLibre setup + layers
│   ├── list.js           # Table view
│   ├── detail.js         # Info panel
│   ├── filters.js · search.js · swisstopo.js
│   ├── export.js · print.js · measure.js
│   ├── tiles3d.js · ui.js · i18n.js
├── data/
│   ├── buildings.geojson
│   ├── parcels.geojson
│   ├── landcovers.geojson
│   ├── i18n.json
│   └── swagger.json      # OpenAPI 3.0 mock API (generated)
├── vendor/
│   ├── maplibre-gl/      # MapLibre GL JS 5.19.0 (js, css, licence)
│   └── swagger-ui/       # Swagger UI 5 (js, css, licence)
└── docs/
    ├── DATAMODEL.md      # Attribute reference
    ├── DESIGNGUIDE.md    # Design system
    ├── CODE-REVIEW.md    # Review findings (bugs, performance)
    ├── RESPONSIVE-REVIEW.md  # Responsive / mobile design review
    └── generate_swagger.py  # DATAMODEL.json -> data/swagger.json
```

## See also

- [Data model](docs/DATAMODEL.md) · [Design system](docs/DESIGNGUIDE.md) · [Code review](docs/CODE-REVIEW.md) · [Responsive review](docs/RESPONSIVE-REVIEW.md)
- Sibling prototypes: [`../prototype-tabs`](../prototype-tabs) · [`../prototype-workflows`](../prototype-workflows) · [`../prototype-backend`](../prototype-backend) · [`../osm-height`](../osm-height)
