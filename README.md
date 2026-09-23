# Property Inventory / Liegenschaften Inventar

![Painterly architectural collage of office facades, an embassy portico and a courtyard](assets/images/hero-collage.jpg)

[![Demo](https://img.shields.io/badge/demo-GitHub%20Pages-2ea44f?logo=github&logoColor=white)](https://bbl-dres.github.io/property-inventory/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> [!CAUTION]
> **Unofficial prototypes for demonstration purposes only.** Portfolio records and
> workflows include demonstration assumptions. Simple and Tabs use researched public
> building facts and photos alongside clearly identified fictional operational data.
> The height-enrichment tool queries public
> OpenStreetMap and Swiss elevation services, so its results depend on upstream data.
> The tools are incomplete and are not intended for production use.

Five browser prototypes for exploring real-estate portfolio search, detail views,
approval workflows, GIS data management, and building-height enrichment.

## Demo

**Live app:** https://bbl-dres.github.io/property-inventory/

<p align="center">
  <img src="assets/images/preview-6.jpg" alt="Property Inventory worldwide map with building table" width="49%" align="top"/>
  <img src="assets/images/preview-7.jpg" alt="Property Inventory 3D map with selected parcel and property information" width="49%" align="top"/>
</p>

The repository root opens the read-only property inventory.

## Prototypes

| Prototype | Purpose | Demo | Details |
|---|---|---|---|
| Simple App | Read-only portfolio with map, list, and gallery views | [Open app](https://bbl-dres.github.io/property-inventory/prototype-simple/) | [README](prototype-simple/README.md) |
| Tabs Views | Structured property details and portfolio-query assistant | [Open app](https://bbl-dres.github.io/property-inventory/prototype-tabs/) | [README](prototype-tabs/README.md) |
| CR Workflows | Create, change, and delete flows with four-eyes approval | [Open app](https://bbl-dres.github.io/property-inventory/prototype-workflows/) | [README](prototype-workflows/README.md) |
| GIS Server | Layer, schema, and feature management frontend | [Open app](https://bbl-dres.github.io/property-inventory/prototype-backend/) | [README](prototype-backend/README.md) |
| OSM Height Enrichment | Adds Swiss elevation-derived heights to OSM buildings | [Open app](https://bbl-dres.github.io/property-inventory/osm-height/) | [README](osm-height/README.md) |

## Run locally

Serve the repository root with any static web server:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000/>. The root redirects to the simple app; each other
prototype is available at the path shown above.

## Documentation

The two inventory prototypes use a [shared modular table component](docs/TABLE-COMPONENT.md)
with consistent column-width presets, compact dates, and internal row IDs.

See the [code and performance review](docs/CODE-REVIEW-2026-09-22.md),
[responsive design review](docs/DESIGN-REVIEW-2026-09-22.md),
[laptop and display-scaling improvements](docs/LAPTOP-RESPONSIVE-REVIEW-2026-09-22.md),
[shared image/document preview](docs/DOCUMENT-PREVIEW.md),
[reference-data findings](docs/REFERENCE-DATA.md),
[parcel label positioning](docs/PARCEL-LABELS.md), the
[print and preview model](docs/PRINT.md), the
[table panel split](docs/TABLE-PANEL.md), and the
[3D view review](docs/3D-VIEW.md) for the latest implementation notes.

The Simple and Tabs datasets cover 14 real sites in nine countries, with 42 actual
interior/exterior photos and verified EGID/EGRID/parcel polygons for five Swiss
sites. See the [research, sources, assumptions and rebuild scripts](scripts/portfolio/README.md).
Measurements distinguish published values, calculated cadastral areas and plausible
SIA 416 / RICS scenarios. Contacts are fictional; document types follow KBOB 2016.

Detailed features, setup, technology, and file layouts are documented in the
prototype READMEs linked in the table. Each prototype owns its runtime modules and
remains independent: there are no cross-prototype or shared-directory code imports.
Similar modules and design tokens are maintained as local copies; an alignment
check reports drift, and `node test/check-independence.js` checks the import boundary.
`test/` holds a jsdom regression harness for both, a headless-browser probe
(`visual.js`) and a check that reports drift between the copies (`cd test && npm install && npm test && npm run align`). The height-enrichment utility also has a
[Python implementation guide](osm-height/python_version/README.md).

## License

[MIT](LICENSE) for code. Third-party photographs and source data retain their own
rights and are excluded from this licence; see [photo attribution](assets/portfolio/ATTRIBUTION.md)
and the [data source notes](scripts/portfolio/README.md).
