// Label anchors use the polygon's pole of inaccessibility in map coordinates.
import polylabel from '../vendor/polylabel/polylabel.js';

const R = 6378137;
import { MAP_LABEL_MIN_ZOOM } from './portfolio-map-layers.js';
export { MAP_LABEL_MIN_ZOOM, buildingMapLabel } from './portfolio-map-layers.js';
const RAD = Math.PI / 180;
const cache = new WeakMap();
const normalLongitude = lon => ((lon + 180) % 360 + 360) % 360 - 180;
const mercatorY = lat => R * Math.log(Math.tan(Math.PI / 4 + lat * RAD / 2));

/** One interior anchor per parcel, including holes and disconnected components.
 * For MultiPolygon choose the component with the greatest boundary clearance.
 * Target precision is 0.25 ground metres; degenerate/invalid geometry is omitted.
 */
export function parcelLabelPoint(geometry) {
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) return null;
  if (cache.has(geometry)) return cache.get(geometry);
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let best = null;
  for (const polygon of polygons || []) {
    if (!polygon?.length || !polygon.every(ring => Array.isArray(ring) && ring.length >= 4 &&
      ring.every(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[1]) <= 85.05112878))) continue;
    const [lon, lat] = polygon[0][0];
    const originY = mercatorY(lat);
    // Local origin improves numerical stability; unwrap across the date line.
    const projected = polygon.map(ring => ring.map(p => [R * normalLongitude(p[0] - lon) * RAD, mercatorY(p[1]) - originY]));
    const outer = projected[0];
    const area = outer.reduce((sum, p, i) => { const q = outer[(i + 1) % outer.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0);
    if (Math.abs(area) < 1e-8) continue;
    const xs = outer.map(p => p[0]), ys = outer.map(p => p[1]);
    const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
    const precision = Math.min(0.25 / Math.cos(lat * RAD), width / 100, height / 100);
    if (!(precision > 0)) continue;
    const point = polylabel(projected, precision);
    if (!(point.distance > 0) || (best && point.distance <= best.distance)) continue;
    best = {
      coordinates: [normalLongitude(lon + point[0] / R / RAD), (2 * Math.atan(Math.exp((point[1] + originY) / R)) - Math.PI / 2) / RAD],
      distance: point.distance
    };
  }
  const result = best?.coordinates || null;
  cache.set(geometry, result);
  return result;
}

export function parcelLabelFeatures(collection, idProperty) {
  return { type: 'FeatureCollection', features: (collection?.features || []).flatMap(feature => {
    const point = parcelLabelPoint(feature.geometry);
    const label = feature.properties?.[idProperty];
    return point && label != null && label !== '' ? [{ type: 'Feature', properties: {
      parcelId: String(label), parcelLabel: String(label).split('/').at(-1)
    },
      geometry: { type: 'Point', coordinates: point } }] : [];
  }) };
}

export function addParcelLabels(map, collection, idProperty) {
  map.addSource('parcel-labels', { type: 'geojson', data: parcelLabelFeatures(collection, idProperty) });
  map.addLayer({
    id: 'parcels-labels', type: 'symbol', source: 'parcel-labels', minzoom: MAP_LABEL_MIN_ZOOM,
    layout: {
      'text-field': ['get', 'parcelLabel'], 'text-font': ['Open Sans Bold', 'Noto Sans Bold'],
      'text-size': 16, 'text-max-width': 1000, 'text-justify': 'auto',
      'text-variable-anchor-offset': ['center', [0, 0], 'top', [0, 1.75], 'left', [1.75, 0], 'right', [-1.75, 0], 'bottom', [0, -1.75]],
      'text-allow-overlap': false, 'text-ignore-placement': false, 'text-padding': 4
    },
    paint: { 'text-color': '#185b8c', 'text-halo-color': '#ffffff', 'text-halo-width': 2 }
  });
}

// Circle layers are not part of symbol collision detection. A transparent icon
// reserves their screen space without changing the visible marker or its events.
// Add this last: higher symbol layers have first placement priority.
export function addBuildingLabelObstacles(map) {
  const image = 'building-label-obstacle';
  if (!map.hasImage(image)) map.addImage(image, { width: 28, height: 28, data: new Uint8Array(28 * 28 * 4) });
  map.addLayer({
    id: 'buildings-label-obstacles', type: 'symbol', source: 'buildings', minzoom: MAP_LABEL_MIN_ZOOM,
    filter: ['!', ['has', 'point_count']],
    layout: { 'icon-image': image, 'icon-size': 1, 'icon-allow-overlap': true, 'icon-ignore-placement': false,
      'icon-padding': 2, 'icon-pitch-alignment': 'viewport', 'icon-rotation-alignment': 'viewport' }
  });
}

export function updateBuildingLabelObstacles(map, idProperty, selectedId) {
  if (!map?.getLayer('buildings-label-obstacles')) return;
  const selected = ['==', ['get', idProperty], selectedId || ''];
  map.setLayoutProperty('buildings-label-obstacles', 'icon-size', ['case', selected, 44 / 28, 1]);
}
