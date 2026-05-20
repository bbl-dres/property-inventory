# Tabs Views — Property Detail Prototype

> **Unofficial mockup.** Fictional data, not for production use. Part of the [`property-inventory`](../README.md) repo.

Tabbed property-detail view with structured sections and an embedded AI assistant for portfolio queries. A fork of the [main app](../prototype-main) that swaps the side info panel for a full-page detail view with seven tabs.

## Live app

https://bbl-dres.github.io/property-inventory/prototype-tabs/

## Focus

- **Full-page detail view.** When a building is selected, the map collapses and a structured detail page takes over.
- **Seven tabs** per property: Übersicht, Bemessungen, Kosten, Verträge, Ausstattung, Dokumente, Kontakte.
- **AI assistant drawer.** A side drawer hosts an embedded chat ([stack-ai.com](https://www.stack-ai.com/)) for natural-language queries over the portfolio.

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
| Mapbox GL JS 3.4 | Map preview (note: differs from main app, which uses MapLibre) |
| stack-ai.com iframe | AI assistant |
| Material Symbols | Icons |

## Layout

```
prototype-tabs/
├── index.html
├── css/
│   └── main.css
├── js/
│   └── app.js            # All logic (~5k lines)
├── data/                 # buildings.geojson, parcels, landcovers, i18n
├── assets/
└── docs/
    ├── DATAMODEL.md      # Same model as main app
    └── DESIGNGUIDE.md    # Same design system
```

## See also

- [Data model](docs/DATAMODEL.md) · [Design system](docs/DESIGNGUIDE.md)
- Parent prototype: [`../prototype-main`](../prototype-main) (read-only inventory)
- Sibling prototypes: [`../prototype-workflows`](../prototype-workflows) · [`../prototype-backend`](../prototype-backend) · [`../osm-height`](../osm-height)
