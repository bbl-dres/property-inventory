# Tabs Views — Property Detail Prototype

> **Unofficial mockup.** Fictional data, not for production use. Part of the [`property-inventory`](../README.md) repo.

Tabbed property-detail view with structured sections and KI answers inside the search suggestions. A fork of the [main app](../prototype-main) that swaps the side info panel for a full-page detail view with seven tabs.

## Live app

https://bbl-dres.github.io/property-inventory/prototype-tabs/

## Focus

- **Full-page detail view.** When a building is selected, the map collapses and a structured detail page takes over.
- **Seven tabs** per property: Übersicht, Bemessungen, Kosten, Verträge, Ausstattung, Dokumente, Kontakte.
- **KI in the search box.** The search suggestions start with a "Frage stellen" section: one suggested question for the typed term, answered inline (Enter or tap) — mock answers computed from the loaded data, no model. A scope select ("Alle / Objekte / Orte / Karten / Fragen") narrows the sources. This replaced the former AI side panel.
- **Mobile.** Phones (portrait and landscape) get a two-row header, a hamburger menu for the map tools (share, print, export, Geokatalog, external layers), a full-screen filter sheet with a live result count, a swipe-to-dismiss info sheet and a sticky tab strip on the detail page; tablets keep the desktop layout with 44 px touch targets and the tools panel collapsed by default. See [docs/RESPONSIVE-REVIEW.md](docs/RESPONSIVE-REVIEW.md).

## Running

Static files only — no build step. From the repo root:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000/prototype-tabs/>.

## Tech

| What | Why |
|---|---|
| Vanilla JS (single `app.js`) | No build, all logic in one file |
| MapLibre GL JS 5.19 (vendored in `vendor/`) | Map, mini map, markers, popups — same build and basemaps (CARTO Positron/Voyager/Dark Matter, swisstopo SWISSIMAGE) as the main app; no API key |
| Material Symbols | Icons |

## Layout

```
prototype-tabs/
├── index.html
├── css/
│   └── main.css
├── js/
│   └── app.js            # All logic (~5k lines)
├── data/                 # buildings.geojson, parcels, entity tables
├── assets/               # images, local basemap thumbnails
├── vendor/maplibre-gl/   # MapLibre GL JS (BSD-3)
└── docs/
    ├── DATAMODEL.md          # Same model as main app
    ├── DESIGNGUIDE.md        # Same design system
    └── RESPONSIVE-REVIEW.md  # Responsive / mobile design review
```

## See also

- [Data model](docs/DATAMODEL.md) · [Design system](docs/DESIGNGUIDE.md) · [Responsive review](docs/RESPONSIVE-REVIEW.md)
- Parent prototype: [`../prototype-main`](../prototype-main) (read-only inventory)
- Sibling prototypes: [`../prototype-workflows`](../prototype-workflows) · [`../prototype-backend`](../prototype-backend) · [`../osm-height`](../osm-height)
