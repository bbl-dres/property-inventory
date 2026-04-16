# Prototype Backend — GIS Server Frontend

A lightweight, static JS frontend for managing layers in a PostGIS-backed REST API (Supabase in the real build; this prototype will use a mock client). Conceptually: a stripped-down ArcGIS Portal Hosted Feature Layers experience — focused on data and schema, not cartography.

> **Status:** design document. No code yet. MVP scope locked below.

---

## Goal

Let a single trusted user **create layers, manage their schema, and CRUD their data** from the browser, with a read-only map preview. Power users who know what a column type is — not GIS analysts making pretty maps.

## Non-goals

- Cartography / symbology editor
- Print layouts, dashboards, story maps
- Multi-user collaboration UI, auth flows
- Destructive schema ops (drop/rename/retype columns) — deferred, they need careful UX

---

## MVP scope

Ruthlessly small. If it isn't listed here, it isn't in v1.

### In (Phases 1–4)

1. **Sidebar IA** — Maps & Apps, Layers (default landing), Settings as first-class navigation. Default route is `#/features` (the Layers landing).
2. **Layers list** — sidebar list of layers, **create**, **delete**. No rename/duplicate.
3. **Create layer** — name, geometry type (all OGC core types + Multi* variants), **SRID** (4326/2056/3857/21781), optional GeoJSON/CSV upload that infers columns.
4. **Layer overview** — inline-editable title/description, record count + updated-at in the hero, geometry type, SRID + human name, REST endpoint + curl copy, "Used by" Maps & Apps, and a **Metadata card** (tags, license, attribution, contact, update frequency, lineage — all inline-editable).
5. **Schema view** — list columns. **Add column** (now with the expanded PostGIS-aligned type set: `text`, `varchar`, `integer`, `bigint`, `double precision`, `numeric`, `boolean`, `date`, `timestamptz`, `uuid`, `jsonb`) and **edit description** only. Column reorder via drag/keyboard.
6. **Data grid** — paginated, sort, attribute **filter bar** (case-insensitive, client-side in MVP) with "Showing N of M" counts, inline-edit, delete, side-panel form. `jsonb` renders as inline code; the record form edits jsonb via textarea (validated JSON) and uuid via text input (regex-validated).
7. **Geometry input** — side-panel textarea accepts **GeoJSON or WKT**. "Copy as WKT" button for existing geometries.
8. **Zoom-to-filter** — Data tab button emits an event that tells the Map tab to `fitBounds` to the filtered feature set on its next open.
9. **Import** — append-only GeoJSON or CSV with column mapping; skip-and-report validation. CSV supports Point/MultiPoint via lat/lon columns; line and polygon variants require GeoJSON.
10. **Export** — full-layer GeoJSON + CSV download.
11. **Map preview** — read-only MapLibre render with paint layers for point / line / polygon (Multi-variants render identically).
12. **Maps & Apps** — first-class concept: list, detail, reverse-link from layers.
13. **Single-user** — no auth UI. Supabase anon key in the frontend for the prototype.

### Out (deferred to backlog)

Drop/rename/retype columns · domains/units/aliases/required · upsert & replace imports · dry-run preview · attachments · API tokens · audit history · soft delete · geometry editing on the map · saved views · relationships · field calculator · Shapefile/Excel export · symbology · quotas UI · webhooks · public sharing · filter pushed to API (client-side only for MVP) · tags autocomplete · thumbnail upload · multi-SRID reprojection on import · `GeometryCollection`.

### Locked MVP decisions

- **Attribute types (whitelist, Phase 4):** `text`, `varchar` (also accepts `varchar(n)`), `integer`, `bigint`, `double precision`, `numeric`, `boolean`, `date`, `timestamptz`, `uuid`, `jsonb`. All names are literal PostgreSQL / PostGIS types so the Supabase swap is mechanical.
- **Geometry types (Phase 3):** `Point`, `MultiPoint`, `LineString`, `MultiLineString`, `Polygon`, `MultiPolygon`, `Table` (non-spatial). Layers accept both the declared base type and its Multi-variant (mirrors PostGIS). `GeometryCollection` deferred.
- **SRID (Phase 3):** first-class field on every spatial layer. Supported: `4326`, `2056` (CH1903+ / LV95), `3857`, `21781` (legacy CH1903). Default `4326`. Read-only in MVP; no automatic reprojection on import.
- **Layer name:** `^[a-z][a-z0-9_]{0,62}$`, unique, cannot change after create.
- **Geometry editing:** form-only in MVP — accepts GeoJSON **or** WKT paste. "Copy as WKT" button converts the stored GeoJSON back to WKT on demand. Map drawing is the #1 v1.1 feature.
- **Import validation:** skip-and-report. No fix-up UI.
- **Auth:** none. Assumes a single trusted user.

---

## Screens

Four screens, reachable by URL hash. Static site, no build step.

### 1. Layers list — `#/features`

Sidebar list of all layers. This is the default landing screen. The URL route stays `#/features` (and legacy `#/layers*` URLs redirect to `#/features*`) — only the user-facing label says "Layers".

| Name | Title | Type | Records | Updated |
|------|-------|------|----------|---------|
| parcels_2026 | Parcels 2026 | Polygon | 1,284 | 2d ago |
| inspections | Field inspections | Point | 42 | 1h ago |
| contracts | Contracts | Table | 318 | — |

- Top bar: search, "+ New layer".
- Row click → layer detail.
- Row action: delete (confirm modal, type name to confirm).

### 2. New layer — drawer on the Layers section (legacy `#/layers/new` → drawer)

One screen, three fields + optional file:

- **Name** (validated regex above), **title**, **description**.
- **Geometry type:** Point / Polygon / Table.
- **Optional:** upload a GeoJSON or CSV → infer columns + preview first 5 rows. Click Create → DDL runs → redirect to the new layer.

### 3. Layer detail — `#/features/:name`

Tabs:

#### a. Overview
- Title, description (inline-editable).
- Geometry type, SRID (4326), record count.
- Created / updated timestamps.
- REST endpoint card: URL + copy button + one `curl` example.

#### b. Schema

Read-mostly list of columns.

| # | Name | Type | Description | Actions |
|---|------|------|-------------|---------|
| 1 | id | uuid | Primary key | (locked) |
| 2 | geom | geometry(Polygon, 4326) | Geometry | (locked) |
| 3 | parcel_no | text | Cantonal parcel number | edit description |
| 4 | area_m2 | double precision | Area in m² | edit description |

- **+ Add column:** modal → name, type (whitelist dropdown), description. Nullable = always true in MVP. No default value.
- **Edit description:** inline.
- **No drop, rename, or type change** in MVP.

#### c. Data

Spreadsheet-style grid.

- Pagination (50 rows/page), sort by column.
- Click row → side panel with full form (including a textarea for geometry as GeoJSON).
- Inline edit for simple cells.
- **+ New record:** form with all columns. Geometry pasted as GeoJSON.
- Delete row: confirm.
- Buttons: **Import** (opens import flow), **Export GeoJSON**, **Export CSV**.

#### d. Map preview (spatial layers only)

- MapLibre GL JS, one basemap (Light).
- Renders layer as GeoJSON (MVP assumes small layers; MVT later).
- Click a feature → highlights its row in the Data tab.
- **Read-only.** No draw tools.

### 4. Import flow — modal on the Data tab

1. Pick file (GeoJSON or CSV).
2. **Column mapping:** for each source column, pick the target layer column (or "skip"). Geometry is auto-detected for GeoJSON; for CSV, optionally pick lat/lon columns (Point layers only in MVP).
3. Click Import → runs → summary: "Inserted 1,204 · Skipped 3 (reasons listed)".

---

## Layout

- Left sidebar: **Layers** only in MVP (Users/Settings are later).
- Top bar: app title, a hint of which project/DB is connected.
- Content area: whichever screen is active.
- Uses the existing design system in [../docs/DESIGNGUIDE.md](../docs/DESIGNGUIDE.md).

## Tech stack

- **Vanilla JS + ES modules**, no build step.
- **MapLibre GL JS v5** for the read-only preview.
- **Mock API client** (reads/writes `localStorage` and seeded JSON) in the prototype. Swapped for **supabase-js** in the real build by replacing a single file.
- Tiny pub/sub in `js/state.js` if state needs coordination.

## Planned files

```
prototype-backend/
├── README.md                ← this file
├── index.html
├── css/
│   └── main.css
├── js/
│   ├── app.js               ← router + boot
│   ├── api.js               ← mock client (swap for supabase-js later)
│   ├── layers-list.js
│   ├── new-layer.js
│   ├── feature-detail.js    ← Overview + tab host (was layer-detail.js)
│   ├── schema-editor.js     ← Schema tab
│   ├── data-grid.js         ← Data tab + import/export
│   ├── map-preview.js       ← Map tab
│   └── utils.js
└── data/
    └── mock-features.json   ← seed for the mock API (was mock-layers.json)
```

## Open questions (resolve before coding)

1. **Does the mock simulate RPCs** (`create_layer`, `add_column`) or just expose tables? → Leaning: simulate RPCs, so swapping to Supabase is a one-file change.
2. **Descriptions storage in the mock:** a `descriptions` map per layer; real build uses `COMMENT ON COLUMN`.
3. **Post-DDL cache reload:** in the real build, RPCs must end with `NOTIFY pgrst, 'reload schema'`. Document this in `api.js`.

---

## Backlog (post-MVP, in rough priority order)

Map draw tools (v1.1) · drop/rename/retype columns · attribute metadata (units, aliases, domains, required) · import upsert & replace modes · dry-run preview · attachments · API tokens · audit history · soft delete + trash · saved views · relationships (FK) · field calculator · Shapefile/Excel export · quotas UI · webhooks · scheduled imports · public share toggle · bulk edit · symbology.

## Next step

Build the static shell: `index.html` + router + layers list + new-layer screen, backed by the mock client. Click-through the flow end-to-end before touching Supabase.
