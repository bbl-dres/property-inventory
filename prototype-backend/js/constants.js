// prototype-backend — shared constants
// Extracted so validators and whitelists don't drift between modules.

/** Layer and column name pattern: starts with a letter, then a-z, 0-9, or _; max 63 chars. */
export const LAYER_NAME_RE = /^[a-z][a-z0-9_]{0,62}$/;

/** Column names share the same rule as layer names in the MVP. */
export const COLUMN_NAME_RE = LAYER_NAME_RE;

/**
 * Allowed user-column types (maps 1:1 to PostgreSQL / PostGIS column types).
 * Expanded in Phase 4 to cover the common Supabase/PostGIS set:
 *   - bounded text (`varchar`) and exact decimals (`numeric`) for imported data
 *   - `bigint` for 8-byte ids/counts that exceed 2^31
 *   - `uuid` for FK/reference columns
 *   - `jsonb` for flexible attribute bags
 *
 * Note: `varchar(n)` is accepted by the API (the `(n)` suffix is kept verbatim)
 * but the schema-editor picker exposes only the bare `varchar` token.
 */
export const COLUMN_TYPES = [
  'text',
  'varchar',
  'integer',
  'bigint',
  'double precision',
  'numeric',
  'boolean',
  'date',
  'timestamptz',
  'uuid',
  'jsonb'
];

/**
 * Geometry types accepted by the prototype.
 * Phase 3: expanded from the original {Point, Polygon, Table} whitelist to
 * include all OGC simple-feature core types plus their Multi* variants.
 * GeometryCollection is still deferred.
 */
export const GEOMETRY_TYPES = [
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
  'Table'
];

/**
 * For each "base" geometry type, the set of GeoJSON geometry type strings
 * that the layer will accept. Matches real-world GIS tooling convention of
 * treating a Multi* geometry as a valid payload for a Polygon/Point/Line
 * layer (PostGIS will happily store it if the column type is unconstrained,
 * and downstream tools normalise transparently).
 *
 * The mapping is symmetric: a MultiPolygon layer also accepts single Polygon
 * (again mirroring PostGIS behavior when the column is declared
 * `geometry(MultiPolygon, …)` and a Polygon is inserted — it's upcast).
 */
export const GEOMETRY_COMPAT = {
  Point: ['Point', 'MultiPoint'],
  MultiPoint: ['Point', 'MultiPoint'],
  LineString: ['LineString', 'MultiLineString'],
  MultiLineString: ['LineString', 'MultiLineString'],
  Polygon: ['Polygon', 'MultiPolygon'],
  MultiPolygon: ['Polygon', 'MultiPolygon'],
  Table: []
};

/** Human-readable labels for SRIDs we surface in the UI. */
export const SUPPORTED_SRIDS = [
  { code: 4326, name: 'WGS 84 (global lat/lon)' },
  { code: 2056, name: 'CH1903+ / LV95 (Swiss)' },
  { code: 3857, name: 'Web Mercator' },
  { code: 21781, name: 'CH1903 / LV03 (Swiss legacy)' }
];

/** Lookup helper — returns the human name for an SRID code, or null. */
export function sridName(code) {
  const hit = SUPPORTED_SRIDS.find((s) => s.code === Number(code));
  return hit ? hit.name : null;
}
