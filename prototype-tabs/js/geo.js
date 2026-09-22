// Geodesy helpers (shared): distances, areas, centroids, Web Mercator scale.

export const EARTH_RADIUS_M = 6371000;
// MapLibre's world is 512 CSS pixels at zoom 0, regardless of source tile size.
export const WEB_MERCATOR_MPP = 2 * Math.PI * 6378137 / 512;

export function metersPerPixel(lat, zoom) {
  return WEB_MERCATOR_MPP * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
}

// Haversine distance between two WGS84 points, in metres
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

// Polygon area (shoelace) in square metres for a ring of [lng, lat] points, approximated at the centroid latitude
export function calculatePolygonArea(points) {
  if (points.length < 3) return 0;
  const n = points.length;
  const avgLat = points.reduce(function(sum, p) { return sum + p[1]; }, 0) / n;
  const latScale = 111320;
  const lonScale = 111320 * Math.cos(avgLat * Math.PI / 180);
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = points[i][0] * lonScale;
    const yi = points[i][1] * latScale;
    const xj = points[j][0] * lonScale;
    const yj = points[j][1] * latScale;
    area += xi * yj;
    area -= xj * yi;
  }
  return Math.abs(area / 2);
}

// Centroid of the outer ring of a GeoJSON polygon (average of the vertices, closing point excluded)
export function getPolygonCentroid(coordinates) {
  const ring = coordinates[0];
  let x = 0, y = 0;
  const n = ring.length - 1;
  for (let i = 0; i < n; i++) {
    x += ring[i][0];
    y += ring[i][1];
  }
  return [x / n, y / n];
}

export function formatDistance(meters) {
  if (meters >= 1000) return (meters / 1000).toFixed(2) + ' km';
  return Math.round(meters) + ' m';
}

export function formatMeasureArea(sqMeters) {
  if (sqMeters >= 1000000) return (sqMeters / 1000000).toFixed(2) + ' km²';
  if (sqMeters >= 10000) return (sqMeters / 10000).toFixed(2) + ' ha';
  return Math.round(sqMeters) + ' m²';
}

// swisstopo "BOX(minLng minLat,maxLng maxLat)" -> [[minLng, minLat], [maxLng, maxLat]] or null
export function parseBox2d(bbox) {
  if (!bbox) return null;
  const match = String(bbox).match(/BOX\(([^ ]+) ([^,]+),([^ ]+) ([^)]+)\)/);
  if (!match) return null;
  return [[parseFloat(match[1]), parseFloat(match[2])], [parseFloat(match[3]), parseFloat(match[4])]];
}
