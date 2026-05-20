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

### Search & filtering
- Multi-source search: local buildings + swisstopo location API + Geokatalog layers.
- 6 filter categories: status, ownership type, portfolio, building type, country, region.
- Deep linking with URL-based navigation and filter persistence.

### Data export
- CSV, Excel (`.xlsx`), GeoJSON.
- Custom column selection before export. Filtered-vs-all scope.

### Internationalisation
- DE / FR / IT / EN — switched in-app, persisted in `localStorage`.

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
| MapLibre GL JS 5.19 | Map, layers, 3D tiles |
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
│   └── i18n.json
└── docs/
    ├── DATAMODEL.md      # Attribute reference
    └── DESIGNGUIDE.md    # Design system
```

## See also

- [Data model](docs/DATAMODEL.md) · [Design system](docs/DESIGNGUIDE.md)
- Sibling prototypes: [`../prototype-tabs`](../prototype-tabs) · [`../prototype-workflows`](../prototype-workflows) · [`../prototype-backend`](../prototype-backend) · [`../osm-height`](../osm-height)
