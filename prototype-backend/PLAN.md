# Implementation Plan — `prototype-backend/`

Static JS GIS admin frontend. MVP scope is locked by `README.md`. No build step, no framework, mock API only.

## 0. Guiding decisions

- **ES modules**, served by any static HTTP server. Match the `js/` style of the main app (ES modules with explicit imports, shared `state` object, delegated click handlers via `data-action`).
- **Views render into one `#app` root.** Each view module exports `mount(container, params)` and `unmount()`. The router owns lifecycle.
- **State is mostly local per-view.** A tiny pub/sub (`js/state.js`) is only used for cross-view concerns.
- **API contract is the only rigid boundary.** Every view talks to `api.*` exclusively — no direct `localStorage` calls elsewhere. This is what makes the supabase-js swap a one-file change.
- **Async everywhere.** Every mock function returns a `Promise` (with `MOCK_LATENCY_MS = 120`).
- **Errors are thrown as `ApiError`** with `{ code, message, details }` mirroring PostgREST codes.
- **No inline event handlers.** Delegated `data-action` dispatch.

---

## 1. Milestones

| M | Name | Effort | Deliverables |
|---|------|--------|--------------|
| **M1** | Shell, router, design tokens, mock seed | 1.5 |  `index.html` with sidebar + topbar + `#app`; hash router; CSS imported; views mount/unmount cleanly; seed JSON loads |
| **M2** | Mock API + Layers list + Create layer | 2.0 | Full `api.js` contract against localStorage; `#/features` list with search + delete; "New layer" drawer with name regex + geom type (legacy `#/layers*` URLs redirect to `#/features*`; the tab label says "Layers" but the route stays `#/features`) |
| **M3** | Layer detail shell + Overview + Schema tab | 2.0 | Tab host, Overview inline-edit + REST card, Schema with Add-column modal + description edit |
| **M4** | Data grid (CRUD) | 2.5 | Paginated 50 rows, sort, inline-edit, side-panel form with GeoJSON textarea, add/delete |
| **M5** | Import flow + Export | 1.5 | GeoJSON/CSV parse, column mapping, append with skip-and-report, GeoJSON + CSV download |
| **M6** | Map preview | 1.0 | MapLibre read-only, click feature → focus row |
| **M7** | New-layer schema inference + polish | 1.5 | Infer columns from upload, toasts, a11y |

Total: ~12 half-days.

---

## 2. File-by-file responsibility

See full plan in project history. Short summary:

- `index.html` — static shell, CDN imports (MapLibre v5, Material Symbols), `#app`, `#toast-host`, `#modal-host`.
- `css/styles.css` + `css/tokens.css` — copied from main app, extend only as needed.
- `js/app.js` — router + boot, owns current mounted view.
- `js/state.js` — tiny pub/sub + shared state.
- `js/api.js` — mock client, load-bearing contract (see §3).
- `js/sidebar-features.js`, `js/new-feature-drawer.js`, `js/feature-detail.js`, `js/schema-editor.js`, `js/data-grid.js`, `js/map-preview.js` — one view/tab each. `mount(root, params)` + `unmount()`. (Renamed from `sidebar-layers.js` / `new-layer-drawer.js` / `layer-detail.js` in Phase 4.)
- `js/utils.js` — DOM helpers, CSV parser, modal/toast, validators, type inference.
- `data/mock-features.json` — seed (3 example features, ~5 records each). Was `mock-layers.json`; api.js falls back to the old filename for local dev caches.

---

## 3. Mock API contract (`js/api.js`)

```js
/** @typedef {'text'|'varchar'|'integer'|'bigint'|'double precision'|'numeric'|'boolean'|'date'|'timestamptz'|'uuid'|'jsonb'} ColumnType */
// Also accepted by addColumn: `varchar(n)` bounded form (n positive integer).
/** @typedef {'Point'|'Polygon'|'Table'} GeometryType */

// Layers
api.listLayers()                              // => Promise<LayerSummary[]>
api.getLayer(name)                            // => Promise<Layer>, throws 'PGRST116'
api.createLayer({ name, geometry_type, title?, description?, columns?, seedFeatures? })
api.deleteLayer(name)
api.updateLayerMeta(name, { title?, description? })

// Schema (simulates RPCs)
api.listColumns(layerName)
api.addColumn(layerName, { name, type, description })
api.setColumnDescription(layerName, columnName, description)

// Features
api.listFeatures(layerName, { limit?, offset?, sort? })   // limit:-1 = all
api.createFeature(layerName, feature)
api.updateFeature(layerName, id, patch)
api.deleteFeature(layerName, id)

// Import / Export
api.importFeatures(layerName, features)       // => ImportResult { inserted, skipped, skippedDetails }
api.exportFeatures(layerName, 'geojson'|'csv') // => Blob

class ApiError extends Error { constructor(code, message, details) {} }
```

Storage keys: `pb:layers`, `pb:features:<name>`, `pb:descriptions:<name>`.

Header comment in `api.js` must document: the real adapter must invoke `NOTIFY pgrst, 'reload schema'` inside DDL RPCs.

---

## 4. Routing

Hash-based:

```
#/features                           → layers landing / empty state (DEFAULT)
#/features/:name                     → layer detail (tab=schema)
#/features/:name?tab=schema|data|map → layer detail
#/products                           → products empty / detail
#/settings                           → settings
```

Legacy `#/layers*` URLs are redirected to the `#/features*` equivalent (preserves bookmarks from phases 1–3).

Parser: split on `?`, split path on `/`, use `URLSearchParams` for query. Optimize: tab changes within the same layer call `onTabChange(tab)` on the detail view instead of full remount (so MapLibre isn't rebuilt).

---

## 5. Data shapes

{% raw %}
```js
/** @typedef {{name, title, geometry_type, feature_count, updated_at}} LayerSummary */
/** @typedef {{name, title, description, geometry_type, srid, created_at, updated_at, feature_count, columns: Column[]}} Layer */
/** @typedef {{name, type, description, locked?, nullable?}} Column */
/** @typedef {{id, geometry, properties}} Feature */
/** @typedef {{inserted, skipped, skippedDetails: Array<{row, reason}>}} ImportResult */
```
{% endraw %}

---

## 6. Locked decisions

1. **Simulate RPCs** (not table inserts) so Supabase swap stays clean.
2. **Descriptions storage:** mock keyed map, real build uses `COMMENT ON COLUMN`. `listColumns` merges them.
3. **Schema reload after DDL:** mock no-op, but documented in `api.js` header.
4. **REST endpoint display:** `const REST_BASE = 'https://<project>.supabase.co/rest/v1'` placeholder.
5. **CSV parsing:** hand-rolled RFC 4180 minimal parser (no CDN lib).
6. **Geometry type validation (Phase 3):** the accepted set is `Point`, `MultiPoint`, `LineString`, `MultiLineString`, `Polygon`, `MultiPolygon`, `Table`. Layers accept their declared base type AND its Multi-variant sibling (e.g. a `Polygon` layer accepts `Polygon` and `MultiPolygon`) — this mirrors PostGIS behaviour when a geometry column is declared without a strict typmod. `GeometryCollection` is still deferred.
6b. **SRID (Phase 3):** first-class `srid` field on every spatial layer. Supported set: 4326, 2056, 3857, 21781. Chosen at create time, surfaced read-only in the hero. No automatic reprojection on import — the file's coordinates are passed through as-is.
6c. **Attribute types whitelist (Phase 4):** `text`, `varchar` (also accepts `varchar(n)`), `integer`, `bigint`, `double precision`, `numeric`, `boolean`, `date`, `timestamptz`, `uuid`, `jsonb` — all literal PostgreSQL / PostGIS names. `jsonb` renders in the grid as inline code; edits via a validated-JSON textarea. `uuid` edits via a regex-validated text input. Inferrer promotes integers to `bigint` when outside int32 range; stays `double precision` for non-integer numbers (users can manually select `numeric` for exact decimals). Objects / arrays in sample data infer as `jsonb`.
7. **Inline-edit widgets:** checkbox / `<input type="date">` / `datetime-local` (UTC label).
8. **Feature IDs:** `crypto.randomUUID()` in mock.
9. **Map preview guard:** if `feature_count > 5000`, show placeholder.
10. **Delete-layer confirm:** case-sensitive type-name-to-confirm, disabled button until match.
11. **URL:** defensively `decodeURIComponent` layer name.
