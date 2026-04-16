// prototype-backend — Mock API client
//
// Contract mirrors the Supabase/PostgREST adapter we'll swap in later. Every
// exported function is async and returns Promises; failures throw `ApiError`
// with PostgREST-style codes.
//
// NOTE FOR REAL ADAPTER: The production adapter MUST invoke
//   NOTIFY pgrst, 'reload schema'
// at the end of every DDL RPC (`create_layer`, `add_column`, etc.) so
// PostgREST reloads its schema cache. The mock is a no-op here, but the
// contract is the same: each DDL operation is an atomic "RPC", not a
// series of table inserts.

import { rowsToCsv } from './utils.js';
import {
  LAYER_NAME_RE, COLUMN_NAME_RE, COLUMN_TYPES,
  GEOMETRY_TYPES, GEOMETRY_COMPAT, SUPPORTED_SRIDS
} from './constants.js';

/**
 * Default empty metadata envelope, applied to any layer missing one.
 *
 * Field grouping follows a lightweight subset of ISO 19115 (geographic info
 * metadata) and DCAT (dataset catalog vocabulary) — we don't ship the full
 * standards, just their "core" fields that make sense for a small GIS admin.
 *   - Identification: tags, topic_category (ISO 19115 MD_TopicCategoryCode)
 *   - Distribution & rights: license, attribution, access_rights (DCAT)
 *   - Responsibility: contact, owner (ISO 19115 CI_ResponsibleParty)
 *   - Currency & lineage: update_frequency (MD_MaintenanceFrequencyCode),
 *     lineage, temporal_extent (EX_TemporalExtent)
 *   - Spatial reference: spatial_extent_note
 */
function emptyMetadata() {
  return {
    // Identification (ISO 19115 core)
    tags: [],
    topic_category: null,
    // Distribution & rights (DCAT)
    license: null,
    attribution: null,
    access_rights: null,
    // Responsibility (ISO 19115)
    contact: null,
    owner: null,
    // Currency & quality (ISO 19115 lineage + maintenance)
    update_frequency: null,
    lineage: null,
    temporal_extent: null, // { start, end }
    // Spatial reference note (ISO 19115)
    spatial_extent_note: null,
    thumbnail_url: null
  };
}

/** Merge a metadata patch into an existing metadata record (shallow). */
function mergeMetadata(current, patch) {
  const base = { ...emptyMetadata(), ...(current || {}) };
  if (!patch || typeof patch !== 'object') return base;
  const next = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'tags') {
      next.tags = Array.isArray(v) ? v.map((t) => String(t).trim()).filter(Boolean) : [];
    } else if (k === 'temporal_extent') {
      // { start, end } — ISO date strings, either may be null.
      if (v == null) next.temporal_extent = null;
      else if (typeof v === 'object') {
        const s = v.start || null;
        const e = v.end || null;
        next.temporal_extent = (s || e) ? { start: s, end: e } : null;
      }
    } else if (k in base) {
      next[k] = v == null || v === '' ? null : v;
    }
  }
  return next;
}

const MOCK_LATENCY_MS = 120;
const KEY_LAYERS = 'pb:layers';
const KEY_PRODUCTS = 'pb:products';
const KEY_USERS = 'pb:users';
const FEATURES_KEY = (name) => `pb:features:${name}`;
const DESCRIPTIONS_KEY = (name) => `pb:descriptions:${name}`;
const COLUMN_ORDER_KEY = (name) => `pb:column_order:${name}`;
// Seed-flag versioning: bump the `:vN` suffix whenever the shape of the
// seed data in data/mock-*.json changes meaningfully. Existing users will
// pick up the new data on next load without needing a manual localStorage
// wipe.
//   v2 — swapped in real property-inventory + green-inventory data
//   v3 — added `metadata.bbox` per layer and `bbox` per product for the
//        catalogue Map view
// Bump when the seed files change (rename, new records, schema change) so
// existing users re-seed on next load instead of serving stale localStorage.
const SEED_FLAG = 'pb:seeded:v4';
const SEED_PRODUCTS_FLAG = 'pb:seeded_products:v4';
const SEED_USERS_FLAG = 'pb:seeded_users';

const VALID_ROLES = ['viewer', 'editor', 'admin'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ===== Errors =====

export class ApiError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

const ERR = {
  DUPLICATE_TABLE: '42P07',
  INVALID_NAME: '22023',
  NOT_FOUND: 'PGRST116'
};

// ===== Helpers =====

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function readLayers() {
  return loadJson(KEY_LAYERS, []);
}

function writeLayers(list) {
  saveJson(KEY_LAYERS, list);
}

function findLayerOrThrow(name) {
  const layers = readLayers();
  const layer = layers.find((l) => l.name === name);
  if (!layer) throw new ApiError(ERR.NOT_FOUND, `Layer "${name}" not found`);
  return layer;
}

function mergeDescriptions(layer) {
  const descs = loadJson(DESCRIPTIONS_KEY(layer.name), {});
  const merged = layer.columns.map((c) => ({
    ...c,
    description: descs[c.name] ?? c.description ?? ''
  }));
  // Apply stored column order (non-locked only). Locked columns stay first in original order.
  const order = loadJson(COLUMN_ORDER_KEY(layer.name), null);
  if (!Array.isArray(order) || !order.length) return merged;
  const byName = new Map(merged.map((c) => [c.name, c]));
  const locked = merged.filter((c) => c.locked);
  const user = [];
  // First, push in the saved order (skipping locked/unknown).
  for (const n of order) {
    const c = byName.get(n);
    if (c && !c.locked) user.push(c);
  }
  // Then append any user cols not listed (new additions).
  for (const c of merged) {
    if (!c.locked && !order.includes(c.name)) user.push(c);
  }
  return [...locked, ...user];
}

// ===== Seeding =====

let seedPromise = null;

async function ensureProductsSeeded() {
  if (localStorage.getItem(SEED_PRODUCTS_FLAG)) return;
  try {
    const pres = await fetch('./data/maps.json');
    if (pres.ok) {
      const pdata = await pres.json();
      saveJson(KEY_PRODUCTS, Array.isArray(pdata.products) ? pdata.products : []);
    } else if (!localStorage.getItem(KEY_PRODUCTS)) {
      saveJson(KEY_PRODUCTS, []);
    }
    localStorage.setItem(SEED_PRODUCTS_FLAG, nowIso());
  } catch (err) {
    console.warn('[api] product seed failed', err);
    if (!localStorage.getItem(KEY_PRODUCTS)) saveJson(KEY_PRODUCTS, []);
  }
}

async function ensureUsersSeeded() {
  if (localStorage.getItem(SEED_USERS_FLAG)) return;
  try {
    const res = await fetch('./data/mock-users.json');
    if (res.ok) {
      const data = await res.json();
      saveJson(KEY_USERS, Array.isArray(data.users) ? data.users : []);
    } else if (!localStorage.getItem(KEY_USERS)) {
      saveJson(KEY_USERS, []);
    }
    localStorage.setItem(SEED_USERS_FLAG, nowIso());
  } catch (err) {
    console.warn('[api] user seed failed', err);
    if (!localStorage.getItem(KEY_USERS)) saveJson(KEY_USERS, []);
  }
}

async function ensureSeeded() {
  await ensureProductsSeeded();
  await ensureUsersSeeded();
  if (localStorage.getItem(SEED_FLAG)) return;
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    try {
      const res = await fetch('./data/layers.json');
      if (!res.ok) throw new Error('Seed fetch failed');
      const data = await res.json();
      const layers = [];
      for (const l of data.layers || []) {
        const { features, ...meta } = l;
        layers.push(meta);
        saveJson(FEATURES_KEY(l.name), features || []);
        // Seed descriptions map from column descriptions.
        const descs = {};
        for (const c of l.columns || []) if (c.description) descs[c.name] = c.description;
        saveJson(DESCRIPTIONS_KEY(l.name), descs);
      }
      writeLayers(layers);
      localStorage.setItem(SEED_FLAG, nowIso());
    } catch (err) {
      console.warn('[api] seed failed', err);
      if (!localStorage.getItem(KEY_LAYERS)) writeLayers([]);
      // Do NOT set SEED_FLAG on error — next load should retry the fetch
      // rather than permanently believing seeding succeeded.
      throw err;
    }
  })().catch((err) => {
    // Clear the in-flight promise so a subsequent caller can retry.
    seedPromise = null;
    // Swallow here: callers above `await ensureSeeded()` unconditionally,
    // and a hard throw would block the whole app. The warn above is enough.
    void err;
  });
  return seedPromise;
}

// ===== Layers =====

export async function listLayers() {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  const layers = readLayers();
  return layers.map((l) => {
    const features = loadJson(FEATURES_KEY(l.name), []);
    return {
      name: l.name,
      title: l.title || l.name,
      geometry_type: l.geometry_type,
      feature_count: features.length,
      updated_at: l.updated_at
    };
  });
}

export async function getLayer(name) {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  const layer = findLayerOrThrow(name);
  const features = loadJson(FEATURES_KEY(name), []);
  return {
    ...layer,
    srid: layer.srid === undefined ? (layer.geometry_type === 'Table' ? null : 4326) : layer.srid,
    metadata: layer.metadata ? { ...emptyMetadata(), ...layer.metadata } : emptyMetadata(),
    columns: mergeDescriptions(layer),
    feature_count: features.length
  };
}

export async function createLayer({ name, geometry_type, title, description, columns, seedFeatures, srid, metadata }) {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);

  if (!LAYER_NAME_RE.test(name || '')) {
    throw new ApiError(ERR.INVALID_NAME, `Invalid layer name "${name}"`);
  }
  if (!GEOMETRY_TYPES.includes(geometry_type)) {
    throw new ApiError(ERR.INVALID_NAME, `Invalid geometry_type "${geometry_type}"`);
  }

  // SRID validation: must be one of the supported codes. Table layers ignore srid.
  let effectiveSrid = null;
  if (geometry_type !== 'Table') {
    const code = Number(srid ?? 4326);
    if (!SUPPORTED_SRIDS.some((s) => s.code === code)) {
      throw new ApiError(ERR.INVALID_NAME, `Unsupported SRID "${srid}"`);
    }
    effectiveSrid = code;
  }

  const layers = readLayers();
  if (layers.some((l) => l.name === name)) {
    throw new ApiError(ERR.DUPLICATE_TABLE, `Layer "${name}" already exists`);
  }

  // Simulate RPC create_layer: always emits id + (spatial) geom as locked cols.
  const lockedCols = [
    { name: 'id', type: 'uuid', description: 'Primary key', locked: true, nullable: false }
  ];
  if (geometry_type !== 'Table') {
    lockedCols.push({
      name: 'geom',
      // SRID is no longer hardcoded — passed through from createLayer args.
      type: `geometry(${geometry_type}, ${effectiveSrid})`,
      description: 'Geometry',
      locked: true,
      nullable: false
    });
  }

  const userCols = (columns || []).filter((c) => c.name !== 'id' && c.name !== 'geom').map((c) => ({
    name: c.name,
    type: c.type,
    description: c.description || '',
    nullable: true
  }));

  const now = nowIso();
  const layer = {
    name,
    title: title || name,
    description: description || '',
    geometry_type,
    srid: effectiveSrid,
    created_at: now,
    updated_at: now,
    columns: [...lockedCols, ...userCols],
    metadata: mergeMetadata(emptyMetadata(), metadata)
  };

  layers.push(layer);
  writeLayers(layers);
  saveJson(FEATURES_KEY(name), Array.isArray(seedFeatures) ? seedFeatures : []);
  const descs = {};
  for (const c of layer.columns) if (c.description) descs[c.name] = c.description;
  saveJson(DESCRIPTIONS_KEY(name), descs);

  // Real adapter: NOTIFY pgrst, 'reload schema'
  return { ...layer, columns: mergeDescriptions(layer), feature_count: (seedFeatures || []).length };
}

export async function deleteLayer(name) {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  const layers = readLayers();
  const idx = layers.findIndex((l) => l.name === name);
  if (idx === -1) throw new ApiError(ERR.NOT_FOUND, `Layer "${name}" not found`);
  layers.splice(idx, 1);
  writeLayers(layers);
  localStorage.removeItem(FEATURES_KEY(name));
  localStorage.removeItem(DESCRIPTIONS_KEY(name));
  localStorage.removeItem(COLUMN_ORDER_KEY(name));
  // Real adapter: NOTIFY pgrst, 'reload schema'
  return { ok: true };
}

// ===== Schema: column order =====
// Persists a metadata array of user-column names (locked columns are always
// kept first in their natural order; reorder only affects non-locked columns).
// Real adapter: the Postgres-side equivalent is a `pb_column_order` metadata
// table or a JSON array in a layer-meta row. PostgREST doesn't care about
// physical column order, so this is purely display metadata.
export async function reorderColumns(layerName, columnNames) {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  const layer = findLayerOrThrow(layerName);
  if (!Array.isArray(columnNames)) {
    throw new ApiError(ERR.INVALID_NAME, 'columnNames must be an array');
  }
  // Filter to known, non-locked names.
  const known = new Set(layer.columns.filter((c) => !c.locked).map((c) => c.name));
  const filtered = columnNames.filter((n) => known.has(n));
  saveJson(COLUMN_ORDER_KEY(layerName), filtered);
  const layers = readLayers();
  const l = layers.find((x) => x.name === layerName);
  if (l) { l.updated_at = nowIso(); writeLayers(layers); }
  return mergeDescriptions(layer);
}

export async function updateLayerMeta(name, patch = {}) {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  const layers = readLayers();
  const layer = layers.find((l) => l.name === name);
  if (!layer) throw new ApiError(ERR.NOT_FOUND, `Layer "${name}" not found`);
  const { title, description, metadata } = patch || {};
  if (title !== undefined) layer.title = title;
  if (description !== undefined) layer.description = description;
  if (metadata !== undefined) {
    layer.metadata = mergeMetadata(layer.metadata, metadata);
  }
  layer.updated_at = nowIso();
  writeLayers(layers);
  return { ...layer, metadata: layer.metadata || emptyMetadata(), columns: mergeDescriptions(layer) };
}

// ===== Schema (simulates RPCs) =====

export async function listColumns(layerName) {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  const layer = findLayerOrThrow(layerName);
  return mergeDescriptions(layer);
}

export async function addColumn(layerName, { name, type, description }) {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  const layers = readLayers();
  const layer = layers.find((l) => l.name === layerName);
  if (!layer) throw new ApiError(ERR.NOT_FOUND, `Layer "${layerName}" not found`);
  if (!COLUMN_NAME_RE.test(name || '')) {
    throw new ApiError(ERR.INVALID_NAME, `Invalid column name "${name}"`);
  }
  if (layer.columns.some((c) => c.name === name)) {
    throw new ApiError(ERR.DUPLICATE_TABLE, `Column "${name}" already exists`);
  }
  // Accept the whitelisted types, plus `varchar(n)` bounded form (real PG
  // convention). Anything else is rejected.
  const isVarcharN = /^varchar\(\s*\d+\s*\)$/i.test(type || '');
  if (!COLUMN_TYPES.includes(type) && !isVarcharN) {
    throw new ApiError(ERR.INVALID_NAME, `Invalid column type "${type}"`);
  }

  layer.columns.push({ name, type, description: description || '', nullable: true });
  layer.updated_at = nowIso();
  writeLayers(layers);

  if (description) {
    const descs = loadJson(DESCRIPTIONS_KEY(layerName), {});
    descs[name] = description;
    saveJson(DESCRIPTIONS_KEY(layerName), descs);
  }
  // Real adapter: NOTIFY pgrst, 'reload schema'
  return mergeDescriptions(layer);
}

export async function setColumnDescription(layerName, columnName, description) {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  const layers = readLayers();
  const layer = layers.find((l) => l.name === layerName);
  if (!layer) throw new ApiError(ERR.NOT_FOUND, `Layer "${layerName}" not found`);
  if (!layer.columns.some((c) => c.name === columnName)) {
    throw new ApiError(ERR.NOT_FOUND, `Column "${columnName}" not found`);
  }
  const descs = loadJson(DESCRIPTIONS_KEY(layerName), {});
  descs[columnName] = description || '';
  saveJson(DESCRIPTIONS_KEY(layerName), descs);
  layer.updated_at = nowIso();
  writeLayers(layers);
  return mergeDescriptions(layer);
}

/**
 * Drop (delete) an attribute column from a layer. Destructive — wipes the
 * column from every feature's `properties` bag too, so the grid doesn't
 * show stale cells after refresh. Locked columns (id, geom) are refused.
 *
 * Real adapter: `ALTER TABLE <layer> DROP COLUMN <name>` followed by
 * `NOTIFY pgrst, 'reload schema'`.
 */
export async function dropColumn(layerName, columnName) {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  const layers = readLayers();
  const layer = layers.find((l) => l.name === layerName);
  if (!layer) throw new ApiError(ERR.NOT_FOUND, `Layer "${layerName}" not found`);

  const col = layer.columns.find((c) => c.name === columnName);
  if (!col) throw new ApiError(ERR.NOT_FOUND, `Column "${columnName}" not found`);
  if (col.locked) {
    throw new ApiError(ERR.INVALID_NAME, `Column "${columnName}" is locked and cannot be dropped`);
  }

  // Strip the column from the schema.
  layer.columns = layer.columns.filter((c) => c.name !== columnName);
  layer.updated_at = nowIso();
  writeLayers(layers);

  // Strip the description entry if it exists.
  const descs = loadJson(DESCRIPTIONS_KEY(layerName), {});
  if (columnName in descs) {
    delete descs[columnName];
    saveJson(DESCRIPTIONS_KEY(layerName), descs);
  }

  // Strip the property from every feature — otherwise the grid shows
  // stale cells for a column that no longer exists. This is the mock
  // equivalent of what Postgres does automatically on DROP COLUMN.
  const features = loadJson(FEATURES_KEY(layerName), []);
  let touched = false;
  for (const f of features) {
    if (f && f.properties && columnName in f.properties) {
      delete f.properties[columnName];
      touched = true;
    }
  }
  if (touched) saveJson(FEATURES_KEY(layerName), features);

  return mergeDescriptions(layer);
}

// ===== Features =====

/**
 * List features for a layer.
 *
 * @param {string} layerName
 * @param {object} [opts]
 * @param {number} [opts.limit=50]   — -1 for "no limit"
 * @param {number} [opts.offset=0]
 * @param {{column:string, direction:'asc'|'desc'}} [opts.sort]
 * @param {[number,number,number,number]} [opts.bbox] — [west, south, east, north]
 *     Filters features whose geometry intersects the bbox. Point geometries
 *     are tested for point-in-box; lines/polygons accept if any coordinate
 *     lies inside. Mock-simple; real adapter translates to PostGIS
 *     `ST_Intersects(geom, ST_MakeEnvelope($west,$south,$east,$north, 4326))`
 *     or PostgREST `&geom=ov.(...)` with a bounding-box operator.
 * @param {string[]} [opts.select] — whitelist of property columns to return.
 *     `id` is always included; geometry is always included. Real adapter
 *     translates to PostgREST `?select=id,geom,col1,col2`.
 */
export async function listFeatures(layerName, { limit = 50, offset = 0, sort, bbox, select } = {}) {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  findLayerOrThrow(layerName);
  let features = loadJson(FEATURES_KEY(layerName), []).slice();

  // bbox filter (mock-only, simple coord-inside check).
  if (Array.isArray(bbox) && bbox.length === 4 && bbox.every((n) => Number.isFinite(n))) {
    const [w, s, e, n] = bbox;
    features = features.filter((f) => geometryIntersectsBbox(f.geometry, w, s, e, n));
  }

  if (sort && sort.column) {
    const dir = sort.direction === 'desc' ? -1 : 1;
    features.sort((a, b) => {
      const av = a.properties?.[sort.column];
      const bv = b.properties?.[sort.column];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  const total = features.length;
  if (limit !== -1) features = features.slice(offset, offset + limit);

  // Column projection. Geometry and id always retained; properties filtered.
  if (Array.isArray(select) && select.length) {
    const keep = new Set(select.filter((n) => n !== 'id' && n !== 'geom'));
    features = features.map((f) => {
      const props = f.properties || {};
      const filtered = {};
      for (const k of Object.keys(props)) if (keep.has(k)) filtered[k] = props[k];
      return { id: f.id, geometry: f.geometry, properties: filtered };
    });
  }

  return { features, total };
}

// ---- bbox / coord helpers (mock only; real adapter delegates to PostGIS) ----

function anyCoordInBbox(coords, w, s, e, n) {
  if (!Array.isArray(coords)) return false;
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    const [x, y] = coords;
    return x >= w && x <= e && y >= s && y <= n;
  }
  for (const c of coords) if (anyCoordInBbox(c, w, s, e, n)) return true;
  return false;
}

function geometryIntersectsBbox(geom, w, s, e, n) {
  if (!geom || !geom.coordinates) return false;
  return anyCoordInBbox(geom.coordinates, w, s, e, n);
}

/**
 * Round every coordinate in a GeoJSON geometry to `precision` decimals.
 * Pure — returns a new geometry, does not mutate the input. Handles nested
 * arrays of any depth (Point / LineString / Polygon / Multi*).
 */
export function roundCoords(geom, precision) {
  if (!geom || !('coordinates' in geom)) return geom;
  const p = Math.max(0, Math.min(15, Number(precision) | 0));
  const factor = Math.pow(10, p);
  const walk = (c) => {
    if (Array.isArray(c)) {
      if (typeof c[0] === 'number') {
        return c.map((n) => (Number.isFinite(n) ? Math.round(n * factor) / factor : n));
      }
      return c.map(walk);
    }
    return c;
  };
  return { ...geom, coordinates: walk(geom.coordinates) };
}

export async function createFeature(layerName, feature) {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  const layers = readLayers();
  const layer = layers.find((l) => l.name === layerName);
  if (!layer) throw new ApiError(ERR.NOT_FOUND, `Layer "${layerName}" not found`);
  const features = loadJson(FEATURES_KEY(layerName), []);
  const newFeature = {
    id: feature?.id || crypto.randomUUID(),
    geometry: feature?.geometry ?? null,
    properties: feature?.properties ?? {}
  };
  features.push(newFeature);
  saveJson(FEATURES_KEY(layerName), features);
  layer.updated_at = nowIso();
  writeLayers(layers);
  return newFeature;
}

/**
 * Update a feature by id.
 *
 * ============================================================================
 * IMPORTANT — JSONB patch semantics (mock vs real Supabase/PostgREST adapter)
 * ============================================================================
 *
 * MOCK BEHAVIOR (this function):
 *   Performs a SHALLOW MERGE of `patch.properties` into the existing
 *   properties object. Example:
 *       existing = { a: 1, b: 2 }
 *       patch.properties = { b: 3 }
 *       result = { a: 1, b: 3 }   // `a` is preserved
 *
 * REAL SUPABASE/PostgREST BEHAVIOR (will DIFFER):
 *   PATCH against a JSONB column REPLACES the entire column value by
 *   default — there is no built-in merge. Naively swapping this mock for
 *   a PostgREST call will SILENTLY LOSE any property not present in the
 *   patch payload.
 *
 * MIGRATION REQUIREMENTS — the Supabase adapter MUST do ONE of:
 *   (a) Read-modify-write: GET the current row, merge client-side, then
 *       PATCH the full `properties` object back. (Simple; susceptible to
 *       last-write-wins races.)
 *   (b) Always send the full `properties` object from the caller (i.e.
 *       change the contract so callers never send partial patches).
 *   (c) Use a Postgres RPC that performs the merge in SQL, e.g.
 *       `UPDATE ... SET properties = properties || $1::jsonb WHERE id = $2`
 *       or `jsonb_merge_patch` (pg 16+). Preferred for correctness.
 *
 * CALLERS THAT RELY ON THE CURRENT SHALLOW-MERGE SHAPE:
 *   - js/data-grid.js — the side-panel save handler in `openSidePanel()`
 *     constructs a `properties` map from only the user columns it renders;
 *     system/unseen columns would be lost if this were a full replace.
 *     (Currently the side panel renders every non-locked column, so it
 *     happens to be safe today — but the contract is partial-patch.)
 *   - Any future caller that constructs a patch from a subset of fields
 *     (inline-edit cells, bulk scripts, etc.) WILL break on the real
 *     adapter unless one of (a)/(b)/(c) above is in place.
 *
 * `geometry` is always replaced wholesale in both the mock and the real
 * adapter, so it does not have this problem.
 * ============================================================================
 */
export async function updateFeature(layerName, id, patch) {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  const layers = readLayers();
  const layer = layers.find((l) => l.name === layerName);
  if (!layer) throw new ApiError(ERR.NOT_FOUND, `Layer "${layerName}" not found`);
  const features = loadJson(FEATURES_KEY(layerName), []);
  const idx = features.findIndex((f) => f.id === id);
  if (idx === -1) throw new ApiError(ERR.NOT_FOUND, `Record "${id}" not found`);
  const cur = features[idx];
  const next = {
    ...cur,
    geometry: patch && 'geometry' in patch ? patch.geometry : cur.geometry,
    properties: { ...cur.properties, ...(patch?.properties || {}) }
  };
  features[idx] = next;
  saveJson(FEATURES_KEY(layerName), features);
  layer.updated_at = nowIso();
  writeLayers(layers);
  return next;
}

export async function deleteFeature(layerName, id) {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  const layers = readLayers();
  const layer = layers.find((l) => l.name === layerName);
  if (!layer) throw new ApiError(ERR.NOT_FOUND, `Layer "${layerName}" not found`);
  const features = loadJson(FEATURES_KEY(layerName), []);
  const idx = features.findIndex((f) => f.id === id);
  if (idx === -1) throw new ApiError(ERR.NOT_FOUND, `Record "${id}" not found`);
  features.splice(idx, 1);
  saveJson(FEATURES_KEY(layerName), features);
  layer.updated_at = nowIso();
  writeLayers(layers);
  return { ok: true };
}

// ===== Import / Export =====

export async function importFeatures(layerName, features) {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  const layers = readLayers();
  const layer = layers.find((l) => l.name === layerName);
  if (!layer) throw new ApiError(ERR.NOT_FOUND, `Layer "${layerName}" not found`);
  const existing = loadJson(FEATURES_KEY(layerName), []);
  const inserted = [];
  const skippedDetails = [];
  (features || []).forEach((f, i) => {
    try {
      if (!f || typeof f !== 'object') throw new Error('not an object');
      // Geometry-type sanity check for spatial layers. We accept the layer's
      // declared type AND its Multi*/single-geometry sibling (see
      // GEOMETRY_COMPAT in constants.js). This matches PostGIS behaviour when
      // a geometry column is declared without a strict typmod.
      if (layer.geometry_type !== 'Table' && f.geometry) {
        const accepted = GEOMETRY_COMPAT[layer.geometry_type] || [layer.geometry_type];
        if (!accepted.includes(f.geometry.type)) {
          throw new Error(`geometry type mismatch (expected ${accepted.join(' or ')}, got ${f.geometry.type})`);
        }
      }
      inserted.push({
        id: f.id || crypto.randomUUID(),
        geometry: f.geometry ?? null,
        properties: f.properties ?? {}
      });
    } catch (e) {
      skippedDetails.push({ row: i, reason: e.message });
    }
  });
  existing.push(...inserted);
  saveJson(FEATURES_KEY(layerName), existing);
  layer.updated_at = nowIso();
  writeLayers(layers);
  return { inserted: inserted.length, skipped: skippedDetails.length, skippedDetails };
}

export async function exportFeatures(layerName, format) {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  const layer = findLayerOrThrow(layerName);
  const features = loadJson(FEATURES_KEY(layerName), []);
  if (format === 'geojson') {
    // Coordinate precision: 7 dp for geographic (EPSG:4326), 3 dp for projected
    // CRSs where units are metres (CH1903+/LV95 2056, Web Mercator 3857, CH1903
    // 21781). Avoids the "17-digit floating-point noise" look in exported files.
    const srid = layer.srid;
    const precision = srid === 4326 ? 7
      : (srid === 2056 || srid === 3857 || srid === 21781) ? 3
      : 7;
    const fc = {
      type: 'FeatureCollection',
      features: features.map((f) => ({
        type: 'Feature',
        id: f.id,
        geometry: f.geometry ? roundCoords(f.geometry, precision) : f.geometry,
        properties: f.properties || {}
      }))
    };
    return new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
  }
  if (format === 'csv') {
    const cols = ['id', ...layer.columns.filter((c) => c.name !== 'id' && c.name !== 'geom').map((c) => c.name)];
    const rows = features.map((f) => {
      const r = { id: f.id };
      for (const c of cols) if (c !== 'id') r[c] = f.properties?.[c] ?? '';
      return r;
    });
    return new Blob([rowsToCsv(rows, cols)], { type: 'text/csv' });
  }
  throw new ApiError(ERR.INVALID_NAME, `Unsupported export format "${format}"`);
}

// ===== Maps & Apps =====
//
// A Maps & Apps item is a downstream app/dashboard/viewer that consumes
// one or more layers. In the real adapter these live in a `products`
// table; here we keep them in localStorage under `pb:products`.

export async function listProducts() {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  return loadJson(KEY_PRODUCTS, []).slice();
}

export async function getProduct(slug) {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  const list = loadJson(KEY_PRODUCTS, []);
  const p = list.find((x) => x.slug === slug);
  if (!p) throw new ApiError(ERR.NOT_FOUND, `Product "${slug}" not found`);
  return p;
}

export async function createProduct(product) {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  const list = loadJson(KEY_PRODUCTS, []);
  if (!product?.slug || !/^[a-z0-9-_]+$/i.test(product.slug)) {
    throw new ApiError(ERR.INVALID_NAME, 'Invalid slug');
  }
  if (list.some((p) => p.slug === product.slug)) {
    throw new ApiError(ERR.DUPLICATE_TABLE, `Product "${product.slug}" already exists`);
  }
  const now = nowIso();
  const p = {
    slug: product.slug,
    name: product.name || product.slug,
    description: product.description || '',
    url: product.url || '',
    thumbnail: product.thumbnail || null,
    consumed_layers: Array.isArray(product.consumed_layers) ? product.consumed_layers : [],
    owner: product.owner || '',
    status: product.status || 'staging',
    last_deployed_at: product.last_deployed_at || now,
    tags: Array.isArray(product.tags) ? product.tags : [],
    kind: product.kind === 'map' ? 'map' : 'app',
    basemap: product.basemap || null,
    view_mode: product.view_mode === '3d' ? '3d' : (product.view_mode === '2d' ? '2d' : null)
  };
  list.push(p);
  saveJson(KEY_PRODUCTS, list);
  return p;
}

export async function deleteProduct(slug) {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  const list = loadJson(KEY_PRODUCTS, []);
  const idx = list.findIndex((p) => p.slug === slug);
  if (idx === -1) throw new ApiError(ERR.NOT_FOUND, `Product "${slug}" not found`);
  list.splice(idx, 1);
  saveJson(KEY_PRODUCTS, list);
  return { ok: true };
}

/** Reverse lookup: which products consume a given layer. */
export async function listProductsUsingLayer(layerName) {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  const list = loadJson(KEY_PRODUCTS, []);
  return list.filter((p) => Array.isArray(p.consumed_layers) && p.consumed_layers.includes(layerName));
}

// ===== Users (IAM) =====
//
// Prototype-only IAM: the roles (`viewer` | `editor` | `admin`) are stored
// and exposed here purely for UI demonstration. No actual auth enforcement
// is performed anywhere in the app — all API calls succeed regardless of
// which user is "signed in". In production this would be backed by
// Supabase Auth + RLS policies.

export async function listUsers() {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  return loadJson(KEY_USERS, []).slice();
}

export async function getUser(id) {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  const list = loadJson(KEY_USERS, []);
  const u = list.find((x) => x.id === id);
  if (!u) throw new ApiError(ERR.NOT_FOUND, `User "${id}" not found`);
  return u;
}

export async function createUser({ email, name, role } = {}) {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  if (!email || !EMAIL_RE.test(String(email).trim())) {
    throw new ApiError(ERR.INVALID_NAME, 'Invalid email');
  }
  if (!VALID_ROLES.includes(role)) {
    throw new ApiError(ERR.INVALID_NAME, `Role must be one of ${VALID_ROLES.join(', ')}`);
  }
  const list = loadJson(KEY_USERS, []);
  const normEmail = String(email).trim().toLowerCase();
  if (list.some((u) => (u.email || '').toLowerCase() === normEmail)) {
    throw new ApiError(ERR.DUPLICATE_TABLE, `User "${email}" already exists`);
  }
  const now = nowIso();
  const u = {
    id: crypto.randomUUID(),
    email: normEmail,
    name: (name || '').trim(),
    role,
    created_at: now,
    last_sign_in_at: null
  };
  list.push(u);
  saveJson(KEY_USERS, list);
  return u;
}

export async function updateUser(id, patch = {}) {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  const list = loadJson(KEY_USERS, []);
  const u = list.find((x) => x.id === id);
  if (!u) throw new ApiError(ERR.NOT_FOUND, `User "${id}" not found`);
  if (patch.role !== undefined) {
    if (!VALID_ROLES.includes(patch.role)) {
      throw new ApiError(ERR.INVALID_NAME, `Role must be one of ${VALID_ROLES.join(', ')}`);
    }
    u.role = patch.role;
  }
  if (patch.name !== undefined) u.name = String(patch.name || '').trim();
  if (patch.email !== undefined) {
    const e = String(patch.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(e)) throw new ApiError(ERR.INVALID_NAME, 'Invalid email');
    if (list.some((x) => x.id !== id && (x.email || '').toLowerCase() === e)) {
      throw new ApiError(ERR.DUPLICATE_TABLE, `User "${e}" already exists`);
    }
    u.email = e;
  }
  saveJson(KEY_USERS, list);
  return u;
}

export async function deleteUser(id) {
  await ensureSeeded();
  await sleep(MOCK_LATENCY_MS);
  const list = loadJson(KEY_USERS, []);
  const idx = list.findIndex((x) => x.id === id);
  if (idx === -1) throw new ApiError(ERR.NOT_FOUND, `User "${id}" not found`);
  list.splice(idx, 1);
  saveJson(KEY_USERS, list);
  return { ok: true };
}


