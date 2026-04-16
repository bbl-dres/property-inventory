# BBL GIS IMMO — Create / Mutate / Delete Workflows

> **Status:** Design draft for the `prototype-workflows` prototype.
> **Scope:** Buildings and Parcels in Switzerland only.
> **Companion docs:** [`../../docs/DATAMODEL.md`](../../docs/DATAMODEL.md) · [`../../docs/DESIGNGUIDE.md`](../../docs/DESIGNGUIDE.md)

---

## 1. Goals

The current inventory is a *read-only* view of data that is curated elsewhere. This prototype explores how **write operations** (create, mutate, delete) could work inside the application, with two hard requirements that come from the business:

1. **Four-eyes principle.** No Building or Parcel record changes on the basis of a single user's input. Every write goes through a second, independent actor before it is applied.
2. **Automated data quality.** Today, addresses and foreign keys (EGID, EGRID, BFS number, KGS ID…) are often entered by hand and frequently wrong. The prototype uses the open [swisstopo APIs](https://docs.geo.admin.ch/access-data/search.html) to *derive* these keys from authoritative sources instead of asking the user to type them.

Out of scope for this prototype: Land Cover, Construction Projects, Building Envelopes, non-Swiss properties, bulk import, and reverse-sync into SAP RE-FX.

---

## 2. Entities & Operations

| Entity | Create | Mutate | Delete |
|---|---|---|---|
| **Building** | Yes — new `bbl_id` allocated after approval | Yes — any non-key field | Soft delete (`bbl_stat → "Verkauft"` or `"Stillgelegt"`); hard delete only for duplicates |
| **Parcel** | Yes | Yes — any non-key field | Soft delete (`bbl_stat → "Verkauft"`); hard delete only for duplicates |

**Immutable keys** (cannot be mutated, only set on create or via a linked *replace* operation):
- `bbl_id` — internal primary key
- `av_egid`, `av_egrid` — federal survey IDs
- `bfs_gemnr` — municipality number
- `objectid` — ESRI ID

Mutating an immutable key requires a *Delete + Create* paired change, reviewed together.

---

## 3. Roles

| Role | Description | Typical org |
|---|---|---|
| **Requester** | Initiates a change request. Can draft, submit, withdraw. | Object manager (`bbl_ovtw`), portfolio analyst |
| **Data Steward** | Reviews technical correctness: survey IDs, geometry, address, foreign-key validity. Owns data quality. | GIS / MDM team |
| **Portfolio Owner** | Reviews business correctness: strategy, rental model, sub-portfolio assignment. | Portfolio management (`bbl_pvtw`) |
| **Approver** | Final sign-off that commits the change to the live dataset. Must be distinct from the Requester. | Head of portfolio / designated delegate |
| **Auditor** (read-only) | Can see all change requests, diffs, decisions, and timestamps. Cannot act. | Internal audit, compliance |

A single user can hold several roles, **but never both Requester and Approver on the same request**.

### 3.1 Four-Eyes Matrix

Who must be involved in each operation, minimum:

| Operation | Requester | Data Steward | Portfolio Owner | Approver | Min distinct people |
|---|:---:|:---:|:---:|:---:|:---:|
| Create Building | ● | ● | ● | ● | **2** (Requester + Approver distinct; Steward & PO may coincide with either) |
| Create Parcel | ● | ● | ○ | ● | **2** |
| Mutate — address, geometry, survey IDs | ● | ● | ○ | ● | **2** |
| Mutate — strategy, portfolio, rental model | ● | ○ | ● | ● | **2** |
| Mutate — financial values (`bbl_awrt`, `bbl_bwrt`) | ● | ○ | ● | ● | **2** (elevated: Approver must be Head of Portfolio) |
| Soft delete (status change to `Verkauft` / `Stillgelegt`) | ● | ○ | ● | ● | **2** |
| Hard delete (duplicate removal) | ● | ● | ● | ● | **3** (Requester, one reviewer, Approver — all distinct) |

● = required · ○ = optional / notified

---

## 4. Change Request State Machine

Every write operation is wrapped in a **Change Request (CR)** with a stable ID (`cr_<yyyy><nnnn>`). The CR — not the record — is what moves through the workflow.

```
          ┌──────────┐   submit    ┌───────────┐  technical OK  ┌──────────┐
          │  DRAFT   │────────────►│ SUBMITTED │───────────────►│ IN_REVIEW│
          └────┬─────┘             └─────┬─────┘                └─────┬────┘
               │ withdraw                │ reject (reason)            │
               ▼                         ▼                            │
          ┌──────────┐             ┌───────────┐                      │
          │WITHDRAWN │             │ REJECTED  │◄─────────────────────┤ reject
          └──────────┘             └───────────┘                      │
                                                                      │ approve
                                                                      ▼
                                                                ┌──────────┐
                                                                │ APPROVED │
                                                                └─────┬────┘
                                                                      │ apply (auto on merge)
                                                                      ▼
                                                                ┌──────────┐
                                                                │  APPLIED │
                                                                └──────────┘
```

**State transitions:**

| From → To | Who | Preconditions |
|---|---|---|
| `DRAFT → SUBMITTED` | Requester | All required fields set; swisstopo enrichment resolved or explicitly overridden |
| `SUBMITTED → IN_REVIEW` | Data Steward (claim) | Reviewer opens the CR |
| `IN_REVIEW → APPROVED` | Approver | At least one successful technical review; Approver ≠ Requester |
| `IN_REVIEW → REJECTED` | Data Steward or Approver | Rejection reason required |
| `APPROVED → APPLIED` | System | Geometry & foreign keys re-validated; writes to `data/*.geojson` |
| `DRAFT → WITHDRAWN` | Requester | — |

**Optimistic locking.** On `APPROVED → APPLIED`, the CR's `base_version` of the target record is compared with the current version. If a conflicting change has been applied since the CR was drafted, the CR is bounced back to `IN_REVIEW` with a merge prompt.

---

## 5. Data-Quality Strategy (swisstopo-assisted entry)

The core insight: **the user should never type an EGID, an EGRID, a BFS number, or an official address.** They should *point at a place* and let authoritative sources fill these in.

### 5.1 Canonical sources

| Target field(s) | Authority | API |
|---|---|---|
| `adr_str`, `adr_hsnr`, `adr_plz`, `adr_ort`, `adr_conct` | swisstopo SearchServer (address origin) | `SearchServer?type=locations&origins=address` |
| `wgs84_lat`, `wgs84_lon`, `lv95_e`, `lv95_n` | swisstopo SearchServer result geometry | same as above |
| `av_egid` | Federal Register of Buildings and Dwellings (GWR) via the `ch.bfs.gebaeude_wohnungs_register` layer | `MapServer/identify` or `MapServer/find` on that layer |
| `av_egrid`, official parcel number, parcel area | swisstopo SearchServer (parcel origin) + cadastral layer | `SearchServer?origins=parcel` then `MapServer/find` on `ch.kantone.cadastralwebmap-farbe` |
| `bfs_gem`, `bfs_gemnr` | swisstopo SearchServer (`origins=gg25`) or reverse-lookup from parcel/municipality layer | `SearchServer?origins=gg25` |
| `kgs_nr`, `kgs_kat` | KGS inventory layer | `MapServer/identify` on `ch.babs.kulturgueter` |

### 5.2 Create-a-Building flow (happy path)

```
  User types an address           ─┐
                                   │  1. SearchServer?origins=address
  Autocomplete results             │◄──── list of candidates
  User picks one                   │
                                   │  2. Result carries lat/lon + featureId
  Pin dropped on the map           │
                                   │
  Behind the scenes:               │  3. identify on ch.bfs.gebaeude_wohnungs_register
  ─ resolve EGID                   │◄──── egid, official address, year, category
  ─ resolve parcel(s) under pin    │  4. identify on ch.kantone.cadastralwebmap-farbe
                                   │◄──── egrid, parcel nr, area (m²), municipality
  ─ resolve KGS (if any)           │  5. identify on ch.babs.kulturgueter
                                   │◄──── kgs_nr, kgs_kat (or none)
  Form pre-filled                  │
  User fills business fields       │     (portfolio, strategy, rental model, …)
  Submit                           ┘
```

Every auto-filled field is marked with its source and can be **overridden**, but overrides are flagged for the Data Steward and require a justification comment.

### 5.3 Field-quality badges

On both the form and the detail view, every foreign-key / address field carries a badge:

| Badge | Meaning |
|---|---|
| 🟢 **Verified** | Value came from the authoritative API within the last 30 days and still matches on re-check |
| 🟡 **Stale** | Value came from the API but hasn't been re-verified in > 30 days |
| 🔴 **Manual** | Value was typed or pasted; no authoritative match (requires justification) |
| ⚪ **Unchecked** | Legacy value, never verified against an API |

Badges are computed from a small companion store (`data/quality.json`, proposed) and are recomputed on submit.

### 5.4 Cross-validation rules

Applied on `submit` and again on `apply`:

1. **Address consistency.** The address returned by `origins=address` for the chosen EGID must string-match `adr_conct` (normalised: lowercase, strip diacritics, collapse whitespace). Mismatch → blocker.
2. **EGID-in-parcel.** The EGID's footprint centroid must fall inside the EGRID polygon. Mismatch → blocker.
3. **Municipality coherence.** `bfs_gemnr` returned by the address lookup must equal the one returned by the parcel lookup. Mismatch → warning.
4. **Coordinate round-trip.** WGS84 → LV95 derivation must be within 0.5 m of the LV95 returned by swisstopo. Off → warning.
5. **Parcel area sanity.** Entered `grs_flae` (if any) must be within ±1 % of the area returned by the cadastral layer. Off → warning.

Blockers prevent `DRAFT → SUBMITTED`. Warnings surface but can be bypassed by the Data Steward with a comment.

---

## 6. Swisstopo API Recipes

All endpoints are CORS-enabled and key-less. Base URL: `https://api3.geo.admin.ch`.

### 6.1 Geocode an address → candidates

```http
GET /rest/services/api/SearchServer
    ?type=locations
    &origins=address
    &limit=10
    &sr=4326
    &searchText=Bundesgasse+3+3003+Bern
```

Each `result.attrs` contains `label`, `lat`, `lon`, `featureId`, `detail`, `geom_st_box2d`. The address origin already carries the normalised official address in `label`.

### 6.2 Resolve EGID from a point

```http
GET /rest/services/api/MapServer/identify
    ?geometry=2600950,1199800
    &geometryType=esriGeometryPoint
    &geometryFormat=geojson
    &imageDisplay=1,1,96
    &mapExtent=2600000,1199000,2601000,1200000
    &tolerance=5
    &layers=all:ch.bfs.gebaeude_wohnungs_register
    &sr=2056
```

Returns GWR attributes including `egid`, `strname_deinr`, `dplz4`, `ggdename`, `ggdenr`, `gkat`, `gbauj`.

### 6.3 Geocode a parcel → EGRID

```http
GET /rest/services/api/SearchServer
    ?type=locations
    &origins=parcel
    &limit=10
    &sr=2056
    &searchText=Bern+Grundbuch+123
```

The `featureId` of a parcel result is the **EGRID**. Pair with the next call to get area.

### 6.4 Official parcel attributes (incl. area)

```http
GET /rest/services/api/MapServer/find
    ?layer=ch.kantone.cadastralwebmap-farbe
    &searchField=egris_egrid
    &searchText=CH123456789012
    &returnGeometry=true
    &sr=2056
```

Returns the parcel polygon; `flaechenmass` (m²) is the authoritative area.

### 6.5 Reverse: which parcel(s) contain this pin?

Same as 6.2 but swap the layer to `ch.kantone.cadastralwebmap-farbe`.

### 6.6 Cultural property (KGS)

```http
GET /rest/services/api/MapServer/identify
    ?geometry=<lv95_e>,<lv95_n>
    &geometryType=esriGeometryPoint
    &layers=all:ch.babs.kulturgueter
    &sr=2056
    &tolerance=0
```

> **Note.** The prototype's existing search in [`js/search.js`](../js/search.js) already hits `SearchServer?type=locations`. The workflow module extends this to the **identify** and **find** endpoints, and restricts `origins` per use case.

---

## 7. Audit Trail & Diff Model

Each CR stores:

```jsonc
{
  "cr_id": "cr_20260416_0007",
  "target": { "entity": "building", "bbl_id": "BBL-01234" },
  "operation": "mutate",                      // create | mutate | delete
  "base_version": 17,                         // optimistic-lock token
  "diff": [
    { "field": "adr_str", "from": "Bundegasse", "to": "Bundesgasse",
      "source": "swisstopo:address", "source_ref": "egid:150404927" },
    { "field": "av_egid", "from": null, "to": "150404927",
      "source": "swisstopo:gwr" }
  ],
  "quality_checks": [
    { "rule": "address_consistency", "status": "pass" },
    { "rule": "egid_in_parcel",      "status": "pass" },
    { "rule": "municipality_coherence", "status": "warn",
      "message": "Address muni = 351, parcel muni = 352" }
  ],
  "actors": {
    "requester":   { "user": "u.meier",    "at": "2026-04-16T09:14:22Z" },
    "steward":     { "user": "a.dubois",   "at": "2026-04-16T10:02:10Z", "decision": "approve", "comment": "muni mismatch expected, boundary case" },
    "approver":    { "user": "s.rossi",    "at": "2026-04-16T14:30:01Z", "decision": "approve" }
  },
  "state": "APPLIED",
  "applied_at": "2026-04-16T14:30:05Z"
}
```

For the prototype, CRs live in a local `data/change-requests.json` (proposed). In a real deployment this would be a backend table with row-level security per role.

---

## 8. UI Surfaces (prototype)

Planned additions to the existing UI:

| Surface | Purpose |
|---|---|
| **“Neuer Eintrag” button** in the header action area | Entry point for Create; opens a modal wizard |
| **Map-click “Create here…”** in the right-click context menu | Spatial entry point for Create; pre-runs swisstopo enrichment |
| **Edit pen** on detail view sections | Entry point for Mutate; scoped to the section (address, survey, strategy, …) |
| **“Change Requests” panel** (new table tab) | List of all CRs with state, target, actors, last activity |
| **CR detail view** | Shows diff, quality checks, comments, decision buttons — role-aware |
| **Field badges** (see §5.3) | Inline on form and detail view |

Wireframes to follow in a separate iteration; this doc locks the *logic*.

---

## 9. Open Questions

1. **Identity.** The prototype has no auth. For role-based four-eyes, do we mock users via a role switcher (like a "View as…" dropdown), or do we stub `Authorization: Bearer` against a fake IdP?
2. **Persistence.** Write back to the same `data/*.geojson` files in-memory only (lost on reload), or use `localStorage` / IndexedDB to persist CRs and mutations across sessions?
3. **Conflict handling.** On `APPROVED → APPLIED` with a detected conflict, do we auto-rebase non-overlapping field changes, or always send back to `IN_REVIEW`?
4. **Scope of the delete.** Is a "hard delete" ever allowed in the real system, or is soft-delete the only mode? Affects §3.1.
5. **SAP linkage.** Does a CR need a round-trip to SAP RE-FX (creates a new `bbl_we` there first), or is the inventory the system-of-record for new entries and SAP a downstream consumer?

---

## 10. Next Steps

1. ✅ Workflow design (this doc)
2. ⏳ UI wireframes for the Create-Building wizard and the CR panel
3. ⏳ `js/workflows.js` — CR state machine + persistence
4. ⏳ `js/swisstopo-enrich.js` — thin client over SearchServer / MapServer for the recipes in §6
5. ⏳ Role-switcher stub (see §9.1)
6. ⏳ `data/change-requests.json` sample CRs covering all states
