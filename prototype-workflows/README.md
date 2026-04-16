# BBL GIS IMMO — Workflows Prototype

> **Unofficial mockup.** Fictional data, not for production use. Part of the [`property-inventory`](../README.md) repo.

This prototype explores **write operations** — create, mutate, delete — on top of the BBL Liegenschaften Inventar. The parent [`/`](../) prototype is read-only; this one asks: *how should data enter and change inside the inventory, given the organisational reality of multiple roles, the four-eyes principle, and unreliable manual data entry?*

## Focus

- **Entities:** Buildings and Parcels — **Switzerland only**.
- **Operations:** Create, Mutate, Delete (soft + hard).
- **Core constraints:**
  1. **Four-eyes principle.** Every change is reviewed and approved by a second person before it is applied.
  2. **Data quality by default.** Instead of asking users to type EGID / EGRID / official addresses, the prototype derives these from the open [swisstopo APIs](https://docs.geo.admin.ch/access-data/search.html) — see the [search API](https://docs.geo.admin.ch/access-data/search.html) and [layer metadata](https://docs.geo.admin.ch/explore-data/get-layer-metadata.html).

## Design

The workflow design lives in [`docs/WORKFLOWS.md`](docs/WORKFLOWS.md). It covers:

- Roles (Requester, Data Steward, Portfolio Owner, Approver, Auditor) and the four-eyes matrix per operation
- Change-Request state machine (`DRAFT → SUBMITTED → IN_REVIEW → APPROVED → APPLIED`, plus `REJECTED` / `WITHDRAWN`)
- Data-quality strategy: swisstopo-assisted form filling, field-level verification badges, cross-validation rules
- Concrete swisstopo API recipes for: address geocoding, EGID resolution (GWR), parcel + EGRID + official area, cultural-property lookup
- Audit trail and diff model

The data model itself is unchanged from the parent — see [`../docs/DATAMODEL.md`](../docs/DATAMODEL.md).

## What's here today

This directory is currently a **fork of the read-only prototype** — same map, same list, same detail views — that the workflow features will be layered onto. Nothing in the write path is implemented yet; see [`docs/WORKFLOWS.md`](docs/WORKFLOWS.md) §10 for the build order.

```
prototype-workflows/
├── index.html                 # Entry point (fork of parent)
├── css/
│   ├── tokens.css             # Design tokens
│   └── styles.css             # Application styles
├── js/                        # ES modules — see parent README for the module map
│   ├── app.js                 # Bootstrap
│   ├── map.js · list.js · detail.js · filters.js · search.js · …
│   └── (planned) workflows.js · swisstopo-enrich.js
├── data/
│   ├── buildings.geojson
│   ├── parcels.geojson
│   ├── landcovers.geojson
│   ├── i18n.json
│   └── (planned) change-requests.json · quality.json
├── assets/images/
└── docs/
    └── WORKFLOWS.md           # ← the design doc for this prototype
```

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

Then open <http://localhost:8000/prototype-workflows/>.

## Tech

| What | Why |
|---|---|
| MapLibre GL JS 5.19 | Map, drawing, identify |
| Vanilla ES modules | No build, easy to read |
| swisstopo `api3.geo.admin.ch` | Address / parcel / EGID / EGRID resolution (no key required) |
| Material Symbols | Icons |

## Status

🚧 Design phase. The workflow logic is specified in [`docs/WORKFLOWS.md`](docs/WORKFLOWS.md). UI wireframes and implementation follow.

## See also

- Parent repo: [`../README.md`](../README.md)
- Data model: [`../docs/DATAMODEL.md`](../docs/DATAMODEL.md)
- Design system: [`../docs/DESIGNGUIDE.md`](../docs/DESIGNGUIDE.md)
- Sibling prototypes: [`../prototype-tabs`](../prototype-tabs), [`../prototype-backend`](../prototype-backend), [`../osm-height`](../osm-height)
