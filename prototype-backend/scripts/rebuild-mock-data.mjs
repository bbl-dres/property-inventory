#!/usr/bin/env node
// prototype-backend/scripts/rebuild-mock-data.js
//
// One-shot ingest: takes the REAL property-inventory and green-inventory
// GeoJSON files from the sibling repos and stamps them into the prototype's
// mock-features.json + mock-products.json.
//
// Keeps the existing `inspections` (Point) and `contracts` (Table) layers
// intact so the Field Inspection App staging product continues to work.
//
// Re-run whenever the real data source changes. Safe to commit.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = join(HERE, '..');
const ROOT_DATA = join(BACKEND_DIR, '..', 'data');
const GREEN_DATA = join(BACKEND_DIR, '..', '..', 'green-inventory', 'data');

const GREEN_FILE = '[838147959] 1602.GR_Mühlestrasse 2+4+6+8Grünflächenpflege.geojson';

const loadGeo = (path) => JSON.parse(readFileSync(path, 'utf8'));
const loadMock = (name) => JSON.parse(readFileSync(join(BACKEND_DIR, 'data', name), 'utf8'));

// ---- Helpers ----

function det(layerSlug, idx) {
  // Deterministic-looking UUIDs so reruns don't churn localStorage.
  // Format keeps the UUID shape but embeds layer+index for easy debugging.
  const hex = Buffer.from(layerSlug).toString('hex').slice(0, 8).padEnd(8, '0');
  const i = String(idx).padStart(12, '0');
  return `${hex}-${i.slice(0, 4)}-4${i.slice(4, 7)}-8${i.slice(7, 10)}-${i.slice(10).padEnd(12, '0')}`;
}

// Split a feature's properties into (schema-declared, extra jsonb).
function splitProps(props, schemaKeys) {
  const kept = {};
  const extra = {};
  for (const [k, v] of Object.entries(props || {})) {
    if (schemaKeys.includes(k)) kept[k] = v;
    else extra[k] = v;
  }
  return { ...kept, extra: Object.keys(extra).length ? extra : {} };
}

// Materialize a feature record in the prototype's expected shape.
function makeFeature(slug, idx, srcFeature, schemaKeys) {
  return {
    id: det(slug, idx + 1),
    geometry: srcFeature.geometry || null,
    properties: splitProps(srcFeature.properties || {}, schemaKeys)
  };
}

/** Compute an [west, south, east, north] bbox from a list of features.
 *  Returns null if no finite coordinates are found (non-spatial layer,
 *  empty features, malformed geometry). */
function computeBbox(features) {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  const walk = (c) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number' && typeof c[1] === 'number') {
      const [lon, lat] = c;
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    } else {
      for (const next of c) walk(next);
    }
  };
  for (const f of features || []) {
    if (f?.geometry?.coordinates) walk(f.geometry.coordinates);
  }
  if (!Number.isFinite(minLon)) return null;
  return [minLon, minLat, maxLon, maxLat];
}

/** Union a list of bboxes into a single bbox; ignores nulls. */
function unionBboxes(bboxes) {
  let b = null;
  for (const bb of bboxes) {
    if (!bb) continue;
    if (!b) { b = bb.slice(); continue; }
    b[0] = Math.min(b[0], bb[0]);
    b[1] = Math.min(b[1], bb[1]);
    b[2] = Math.max(b[2], bb[2]);
    b[3] = Math.max(b[3], bb[3]);
  }
  return b;
}

// Layer builder — keeps common metadata shape consistent. bbox is computed
// from features and stored under metadata.bbox so the catalogue's Map view
// can paint extents without a server round-trip.
function buildLayer({ name, title, description, geometry_type, srid, tags, license, attribution, contact, update_frequency, lineage, columns, features }) {
  const bbox = computeBbox(features);
  return {
    name,
    title,
    description,
    geometry_type,
    srid,
    created_at: '2026-01-10T08:00:00Z',
    updated_at: '2026-04-15T12:00:00Z',
    metadata: {
      tags: tags || [],
      license: license || null,
      attribution: attribution || null,
      contact: contact || null,
      update_frequency: update_frequency || null,
      lineage: lineage || null,
      thumbnail_url: null,
      bbox
    },
    columns,
    features
  };
}

// ---- Source data ----

const buildingsGeo  = loadGeo(join(ROOT_DATA, 'buildings.geojson'));
const parcelsGeo    = loadGeo(join(ROOT_DATA, 'parcels.geojson'));
const landcoversGeo = loadGeo(join(ROOT_DATA, 'landcovers.geojson'));
const greenGeo      = loadGeo(join(GREEN_DATA, GREEN_FILE));
const currentFeats  = loadMock('mock-features.json');
const currentProds  = loadMock('mock-products.json');

// ---- Layer: buildings (Point) -----------------------------------------

const BUILDING_COLS = [
  { name: 'id',         type: 'uuid',                    description: 'Primary key',           locked: true, nullable: false },
  { name: 'geom',       type: 'geometry(Point, 4326)',   description: 'Geometry',              locked: true, nullable: false },
  { name: 'bbl_id',     type: 'varchar',                 description: 'Portfolio ID (Gebäude/Werk/Objekt)' },
  { name: 'bbl_bez',    type: 'text',                    description: 'Building name' },
  { name: 'adr_conct',  type: 'text',                    description: 'Full address' },
  { name: 'bbl_port',   type: 'varchar',                 description: 'Portfolio category' },
  { name: 'bbl_eigen',  type: 'varchar',                 description: 'Ownership type' },
  { name: 'bbl_bjahr',  type: 'integer',                 description: 'Construction year' },
  { name: 'garea_ebf',  type: 'numeric',                 description: 'Energy reference area (m²), SIA 380/1' },
  { name: 'gvol_gv',    type: 'numeric',                 description: 'Gross volume (m³)' },
  { name: 'gastw',      type: 'integer',                 description: 'Total number of stories' },
  { name: 'egm_elev',   type: 'numeric',                 description: 'Ground elevation (m)' },
  { name: 'av_egid',    type: 'varchar',                 description: 'Swiss Federal Building ID (EGID)' },
  { name: 'img_url',    type: 'text',                    description: 'Thumbnail URL' },
  { name: 'extra',      type: 'jsonb',                   description: 'Remaining source attributes (flexible bag)' }
];
const BUILDING_KEYS = BUILDING_COLS.filter(c => c.name !== 'id' && c.name !== 'geom' && c.name !== 'extra').map(c => c.name);

const buildingsLayer = buildLayer({
  name: 'buildings',
  title: 'Buildings',
  description: 'BBL federal property portfolio — building centroids with SIA 416/380 measurements, portfolio classification, and Swiss Federal IDs (EGID).',
  geometry_type: 'Point',
  srid: 4326,
  tags: ['buildings', 'bbl', 'sia-416', 'egid'],
  license: 'Internal BBL data — not for redistribution',
  attribution: '© BBL — Bundesamt für Bauten und Logistik',
  contact: 'geodata@bbl.admin.ch',
  update_frequency: 'monthly',
  lineage: 'Extracted from the BBL property register; coordinates in WGS 84, Swiss grid available via LV95 columns in `extra`. Merged with SIA 416 area measurements and EGID lookups.',
  columns: BUILDING_COLS,
  features: buildingsGeo.features.map((f, i) => makeFeature('buildings', i, f, BUILDING_KEYS))
});

// ---- Layer: parcels (Polygon) -----------------------------------------

const PARCEL_COLS = [
  { name: 'id',         type: 'uuid',                     description: 'Primary key',          locked: true, nullable: false },
  { name: 'geom',       type: 'geometry(Polygon, 4326)',  description: 'Geometry',             locked: true, nullable: false },
  { name: 'bbl_id',     type: 'varchar',                  description: 'Portfolio ID (Gebäude/Werk/Objekt)' },
  { name: 'bbl_bez',    type: 'text',                     description: 'Parcel name' },
  { name: 'bbl_port',   type: 'varchar',                  description: 'Portfolio category' },
  { name: 'bbl_eigen',  type: 'varchar',                  description: 'Ownership type' },
  { name: 'bbl_awrt',   type: 'numeric',                  description: 'Asset value (CHF)' },
  { name: 'bbl_bwrt',   type: 'numeric',                  description: 'Book value (CHF)' },
  { name: 'larea_ggf',  type: 'numeric',                  description: 'Total land area (m²)' },
  { name: 'adr_conct',  type: 'text',                     description: 'Full address' },
  { name: 'av_egrid',   type: 'varchar',                  description: 'Swiss Federal Property ID (EGRID)' },
  { name: 'extra',      type: 'jsonb',                    description: 'Remaining source attributes (flexible bag)' }
];
const PARCEL_KEYS = PARCEL_COLS.filter(c => c.name !== 'id' && c.name !== 'geom' && c.name !== 'extra').map(c => c.name);

const parcelsLayer = buildLayer({
  name: 'parcels',
  title: 'Parcels',
  description: 'Cadastral parcels for the BBL federal property portfolio with asset/book values and EGRID identifiers.',
  geometry_type: 'Polygon',
  srid: 4326,
  tags: ['parcels', 'cadastre', 'bbl', 'egrid'],
  license: 'Internal BBL data — not for redistribution',
  attribution: '© BBL — Bundesamt für Bauten und Logistik',
  contact: 'geodata@bbl.admin.ch',
  update_frequency: 'yearly',
  lineage: 'Derived from the BBL property register and the official Swiss cadastre (AV93). Reprojected to WGS 84; LV95 source coordinates are preserved in `extra`.',
  columns: PARCEL_COLS,
  features: parcelsGeo.features.map((f, i) => makeFeature('parcels', i, f, PARCEL_KEYS))
});

// ---- Layer: landcovers (Polygon) --------------------------------------

const LANDCOVER_COLS = [
  { name: 'id',        type: 'uuid',                    description: 'Primary key',            locked: true, nullable: false },
  { name: 'geom',      type: 'geometry(Polygon, 4326)', description: 'Geometry',               locked: true, nullable: false },
  { name: 'bbl_id',    type: 'varchar',                 description: 'Land-cover record ID' },
  { name: 'geb_id',    type: 'varchar',                 description: 'Parent building ID (FK to buildings.bbl_id)' },
  { name: 'av_type',   type: 'varchar',                 description: 'Official land-cover class' },
  { name: 'av_egid',   type: 'varchar',                 description: 'Swiss Federal Building ID (EGID)' },
  { name: 'av_egrid',  type: 'varchar',                 description: 'Swiss Federal Property ID (EGRID)' },
  { name: 'lc_area',   type: 'numeric',                 description: 'Land-cover area (m²)' },
  { name: 'extra',     type: 'jsonb',                   description: 'Remaining source attributes (flexible bag)' }
];
const LANDCOVER_KEYS = LANDCOVER_COLS.filter(c => c.name !== 'id' && c.name !== 'geom' && c.name !== 'extra').map(c => c.name);

const landcoversLayer = buildLayer({
  name: 'landcovers',
  title: 'Land cover',
  description: 'Official land-cover classification footprints tied to each building (AV93 schema).',
  geometry_type: 'Polygon',
  srid: 4326,
  tags: ['land-cover', 'av93', 'buildings'],
  license: 'Internal BBL data — not for redistribution',
  attribution: '© Swisstopo · BBL — Bundesamt für Bauten und Logistik',
  contact: 'geodata@bbl.admin.ch',
  update_frequency: 'yearly',
  lineage: 'Swisstopo AV93 land-cover extract, clipped to the BBL property footprints and joined to building records via EGID.',
  columns: LANDCOVER_COLS,
  features: landcoversGeo.features.map((f, i) => makeFeature('landcovers', i, f, LANDCOVER_KEYS))
});

// ---- Layer: green_areas (Polygon) — from green-inventory ---------------

// The green-inventory source has RGB fill colours as [r,g,b] arrays in [0,1].
// Flatten those to hex strings so they fit a single `fill_color` varchar column.
function rgbToHex(rgb) {
  if (!Array.isArray(rgb) || rgb.length < 3) return null;
  const [r, g, b] = rgb.map(v => Math.max(0, Math.min(255, Math.round(v * 255))));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

const GREEN_COLS = [
  { name: 'id',           type: 'uuid',                    description: 'Primary key',        locked: true, nullable: false },
  { name: 'geom',         type: 'geometry(Polygon, 4326)', description: 'Geometry',           locked: true, nullable: false },
  { name: 'feature_type', type: 'varchar',                 description: 'Top-level feature class (Belag, Rasen, Baum, …)' },
  { name: 'subtype',      type: 'varchar',                 description: 'Sub-classification within the feature type' },
  { name: 'category',     type: 'varchar',                 description: 'High-level category (surface, vegetation, structure)' },
  { name: 'area_m2',      type: 'numeric',                 description: 'Feature area (m²)' },
  { name: 'fill_color',   type: 'varchar',                 description: 'Rendering colour as sampled from the source plan (hex)' },
  { name: 'source',       type: 'varchar',                 description: 'How the feature was extracted from the source PDF' },
  { name: 'extra',        type: 'jsonb',                   description: 'Remaining source attributes (flexible bag)' }
];
const GREEN_KEYS = GREEN_COLS.filter(c => c.name !== 'id' && c.name !== 'geom' && c.name !== 'extra').map(c => c.name);

// Pre-process green-inventory features: rgb → hex, then split.
const greenFeatures = greenGeo.features.map((f, i) => {
  const props = { ...(f.properties || {}) };
  if (Array.isArray(props.fill_rgb)) {
    props.fill_color = rgbToHex(props.fill_rgb);
    delete props.fill_rgb; // fold into extra via the split
  }
  return makeFeature('green_areas', i, { ...f, properties: props }, GREEN_KEYS);
});

const greenLayer = buildLayer({
  name: 'green_areas',
  title: 'Green areas — Mühlestrasse 2/4/6/8',
  description: 'Urban green-space inventory for BBL property Mühlestrasse 2-8 (Bern). Extracted from the 1:650 landscape maintenance plan (Grünflächenpflege).',
  geometry_type: 'Polygon',
  srid: 4326,
  tags: ['green-areas', 'landscape', 'maintenance', 'muehlestrasse'],
  license: 'Internal BBL data — not for redistribution',
  attribution: '© BBL — Bundesamt für Bauten und Logistik',
  contact: 'geodata@bbl.admin.ch',
  update_frequency: 'irregular',
  lineage: 'Extracted from PDF plan "[838147959] 1602.GR_Mühlestrasse 2+4+6+8 Grünflächenpflege" via the `extract_features.py` script in green-inventory. Colours sampled directly from the vector fills.',
  columns: GREEN_COLS,
  features: greenFeatures
});

// ---- Assemble new mock-features.json ------------------------------------

// Preserve existing inspections + contracts layers so the Field Inspection
// App (staging product) still has something to point at. Patch their
// metadata.bbox in case the existing seed didn't carry one.
const kept = currentFeats.layers
  .filter(l => l.name === 'inspections' || l.name === 'contracts')
  .map(l => ({
    ...l,
    metadata: {
      ...(l.metadata || {}),
      bbox: (l.metadata && l.metadata.bbox !== undefined) ? l.metadata.bbox : computeBbox(l.features)
    }
  }));

const nextFeatures = {
  layers: [
    parcelsLayer,
    buildingsLayer,
    landcoversLayer,
    greenLayer,
    ...kept
  ]
};

// ---- Assemble new mock-products.json ------------------------------------

// Replace "property-viewer" with "property-inventory" pointing at the real
// deployed app URL and consuming the three new real layers. Keep
// field-inspection-app unchanged. Add green-inventory.

const propertyInventory = {
  slug: 'property-inventory',
  name: 'Property Inventory',
  description: 'Real-estate portfolio viewer — map, list, and gallery views with tabbed property detail (measurements, documents, costs, contracts, contacts, facilities). SIA 416/380 compliant.',
  url: 'https://bbl-dres.github.io/property-inventory/',
  thumbnail: './assets/images/property-inventory.jpg',
  consumed_layers: ['parcels', 'buildings', 'landcovers'],
  owner: 'BBL GIS team',
  status: 'live',
  last_deployed_at: '2026-04-12T14:00:00Z',
  tags: ['public', 'app'],
  kind: 'app',
  basemap: null,
  view_mode: null
};

const greenInventory = {
  slug: 'green-inventory',
  name: 'Green Inventory',
  description: 'Urban green-space inventory with care profiles, maintenance planning, and field-survey workflows. Built around interactive maps and task management for landscape teams.',
  url: 'https://bbl-dres.github.io/green-inventory/',
  thumbnail: './assets/images/green-inventory.jpg',
  consumed_layers: ['green_areas'],
  owner: 'BBL Facilities',
  status: 'staging',
  last_deployed_at: '2026-04-08T10:00:00Z',
  tags: ['internal', 'app'],
  kind: 'app',
  basemap: null,
  view_mode: null
};

// Retain field-inspection-app but refresh its consumed_layers: the old
// `parcels_2026` layer was renamed to `parcels` in this rebuild, so the
// reverse link would break unless we patch it here.
const fieldAppSrc = currentProds.products.find(p => p.slug === 'field-inspection-app');
if (!fieldAppSrc) throw new Error('field-inspection-app missing from current mock-products.json');
const fieldApp = {
  ...fieldAppSrc,
  consumed_layers: (fieldAppSrc.consumed_layers || [])
    .map((n) => (n === 'parcels_2026' ? 'parcels' : n))
};

// Compute each product's bbox as the union of its consumed layers' bboxes.
// Null if the product has no spatial layers (pure table consumers) —
// catalogue Map view hides those items per the "empty metadata → skip" rule.
const layerBboxByName = new Map();
for (const l of nextFeatures.layers) {
  if (l?.metadata?.bbox) layerBboxByName.set(l.name, l.metadata.bbox);
}
function productBbox(p) {
  const bboxes = (p.consumed_layers || []).map((n) => layerBboxByName.get(n)).filter(Boolean);
  return unionBboxes(bboxes);
}

const nextProducts = {
  products: [
    { ...propertyInventory, bbox: productBbox(propertyInventory) },
    { ...greenInventory,    bbox: productBbox(greenInventory) },
    { ...fieldApp,          bbox: productBbox(fieldApp) }
  ]
};

// ---- Write -------------------------------------------------------------

writeFileSync(
  join(BACKEND_DIR, 'data', 'mock-features.json'),
  JSON.stringify(nextFeatures, null, 2) + '\n'
);
writeFileSync(
  join(BACKEND_DIR, 'data', 'mock-products.json'),
  JSON.stringify(nextProducts, null, 2) + '\n'
);

// ---- Summary -----------------------------------------------------------

const fmtBbox = (b) => b
  ? `[${b[0].toFixed(2)}, ${b[1].toFixed(2)}, ${b[2].toFixed(2)}, ${b[3].toFixed(2)}]`
  : '—';

console.log('--- mock-features.json ---');
for (const l of nextFeatures.layers) {
  console.log(`  ${l.name.padEnd(18)} ${l.geometry_type.padEnd(10)} ${String(l.features.length).padStart(3)} features  bbox: ${fmtBbox(l.metadata?.bbox)}`);
}
console.log('--- mock-products.json ---');
for (const p of nextProducts.products) {
  console.log(`  ${p.slug.padEnd(22)} ${String(p.status).padEnd(8)} layers=[${(p.consumed_layers || []).join(', ')}]  bbox: ${fmtBbox(p.bbox)}`);
}
