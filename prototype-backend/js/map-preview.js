// prototype-backend — Map tab (M6)
// Read-only MapLibre preview of a spatial layer. Point or Polygon only.
// Guards against large layers (>5000 features) with a placeholder.

import * as api from './api.js';
import { el, toast, escHtml } from './utils.js';
import { bus } from './state.js';
import { sridName, BRAND_COLOR as BRAND } from './constants.js';

// sridName may be undefined for codes we don't track; wrap to a safe label.
function sridLabel(code) {
  try { return sridName(code) || ''; } catch { return ''; }
}
const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const MAX_FEATURES = 5000;
const SOURCE_ID = 'pb-layer-src';

// Cached "zoom to filter" request from data-grid. We cache it at module scope
// (rather than per-mount) so a user can set a filter on the Data tab, switch
// to Map, and have the pending fit applied on mount. Cleared after apply.
let pendingFilterIds = null;

let root = null;
let layer = null;
let map = null;
let busUnsub = [];
let destroyed = false;
let isSetup = false;
let currentFc = { type: 'FeatureCollection', features: [] };

// Subscribe at module load time so the pending filter is captured even if the
// Map tab isn't currently mounted. Lives for the whole app session.
bus.on('map:zoomToFilter', (ids) => {
  pendingFilterIds = Array.isArray(ids) ? ids.slice() : null;
  // If the map is currently mounted, apply immediately.
  if (map && isSetup) applyPendingFilterFit();
});

function applyPendingFilterFit() {
  if (!map || !pendingFilterIds || !pendingFilterIds.length) return;
  const idSet = new Set(pendingFilterIds.map((x) => String(x)));
  const subset = {
    type: 'FeatureCollection',
    features: (currentFc.features || []).filter((f) => idSet.has(String(f.id ?? f.properties?.__id)))
  };
  if (!subset.features.length) return;
  fitToData(subset);
  pendingFilterIds = null;
}

export async function mount(container, { layer: l }) {
  // Always refetch for fresh schema/feature_count (tab-switch stale-cache fix).
  try { l = await api.getLayer(l.name); } catch {}
  root = container;
  layer = l;
  destroyed = false;
  map = null;
  busUnsub = [];
  isSetup = false;

  if (!layer || layer.geometry_type === 'Table') {
    root.appendChild(el('div', { class: 'pb-card pb-card--padded' }, [
      el('div', { class: 'empty-state-title' }, 'No map preview'),
      el('div', { class: 'empty-state-description' }, 'Map preview is only available for spatial layers.')
    ]));
    return;
  }

  if ((layer.feature_count || 0) > MAX_FEATURES) {
    root.appendChild(el('div', { class: 'pb-card pb-card--padded pb-map-placeholder' }, [
      el('span', { class: 'material-symbols-outlined', style: { fontSize: '36px', color: 'var(--grey-500)' } }, 'map'),
      el('div', { class: 'empty-state-title' }, 'Map preview disabled'),
      el('div', { class: 'empty-state-description' },
        `Map preview disabled for large layers (>${MAX_FEATURES.toLocaleString()} records) in MVP.`)
    ]));
    return;
  }

  if (typeof maplibregl === 'undefined') {
    root.appendChild(el('div', { class: 'pb-card pb-card--padded' }, [
      el('div', { class: 'empty-state-title' }, 'Map library not loaded'),
      el('div', { class: 'empty-state-description' }, 'MapLibre GL JS is unavailable.')
    ]));
    return;
  }

  // SRID sanity banner. MapLibre renders in EPSG:3857 under the hood and
  // requires source coordinates in EPSG:4326. If the layer's declared SRID is
  // anything else we warn — the map still renders (MapLibre doesn't refuse
  // bad coords; it just centres on the Atlantic / nothing) but the user
  // understands why the geometry may look wrong. Dismissible per-mount.
  const srid = layer.srid;
  if (srid != null && srid !== 4326) {
    const bannerMsg = srid === 3857
      ? 'SRID 3857 preview: coordinates interpreted as-is. Reprojection to 4326 for MapLibre is not implemented in MVP.'
      : `Layer SRID is ${srid}${sridLabel(srid) ? ` (${sridLabel(srid)})` : ''}. Preview assumes client-side reprojection (not implemented in MVP). Coordinates will display incorrectly until v1.1.`;
    const dismissBtn = el('button', {
      type: 'button',
      class: 'pb-srid-banner-close',
      'aria-label': 'Dismiss'
    }, [el('span', { class: 'material-symbols-outlined pb-icon-sm' }, 'close')]);
    const banner = el('div', { class: 'pb-srid-banner', role: 'status' }, [
      el('span', { class: 'material-symbols-outlined pb-srid-banner-icon' }, 'warning'),
      el('span', { class: 'pb-srid-banner-text' }, ['⚠️ ', bannerMsg]),
      dismissBtn
    ]);
    dismissBtn.addEventListener('click', () => { banner.remove(); });
    root.appendChild(banner);
  }

  const mapEl = el('div', { class: 'pb-map' });
  root.appendChild(mapEl);

  const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, offset: 8 });

  try {
    map = new maplibregl.Map({
      container: mapEl,
      style: BASEMAP_STYLE,
      center: [8.54, 47.37],
      zoom: 10,
      attributionControl: true
    });
  } catch (err) {
    console.error('[map-preview] init failed', err);
    toast('Failed to initialize map', 'error');
    return;
  }

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  // Load features and wait for style before adding our source/layer.
  let fc = { type: 'FeatureCollection', features: [] };
  try {
    const res = await api.listFeatures(layer.name, { limit: -1 });
    if (destroyed) return;
    fc = toFeatureCollection(res.features || []);
  } catch (err) {
    console.error(err);
    toast(err?.message || 'Failed to load records', 'error');
  }

  const setup = () => {
    if (destroyed || !map) return;
    // Single guard covers both source creation AND listener attachment below.
    // Without this, registering both `load` and `idle` once-listeners caused
    // duplicate click handlers (idle fires at least once even after load).
    if (isSetup) return;
    isSetup = true;

    map.addSource(SOURCE_ID, { type: 'geojson', data: fc });
    currentFc = fc;

    // Always add all three paint layers — MapLibre's type filtering means a
    // circle layer renders only Point/MultiPoint, a line layer only Line/
    // MultiLine/Polygon rings (via dedicated line layer for polygons), etc.
    // Cheap, and lets the same map render mixed-geometry sources.
    const gt = layer.geometry_type;
    const isPointish = gt === 'Point' || gt === 'MultiPoint';
    const isLineish = gt === 'LineString' || gt === 'MultiLineString';
    const isPolyish = gt === 'Polygon' || gt === 'MultiPolygon';

    if (isPointish) {
      map.addLayer({
        id: 'pb-points',
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': 6,
          'circle-color': BRAND,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5
        }
      });
    }
    if (isLineish) {
      // MapLibre renders both LineString and MultiLineString in a line layer.
      map.addLayer({
        id: 'pb-lines',
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': BRAND,
          'line-width': 2
        }
      });
    }
    if (isPolyish) {
      // Both Polygon and MultiPolygon render from the same fill/line layers.
      map.addLayer({
        id: 'pb-polygons-fill',
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': BRAND,
          'fill-opacity': 0.3
        }
      });
      map.addLayer({
        id: 'pb-polygons-line',
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': BRAND,
          'line-width': 1.5
        }
      });
    }

    fitToData(fc);
    attachInteractions(popup);
    // If the user clicked "Zoom to filter" on the Data tab before this mount,
    // honour it now that the map is live.
    applyPendingFilterFit();
  };

  // MapLibre v4/v5: `load` is the happy path here (fresh map, no setStyle()).
  // The repo memory note about needing `idle` applies specifically to
  // post-`setStyle()` callbacks — not relevant to this one-shot init. The
  // `isSetup` flag above still idempotizes `setup()` defensively.
  if (map.isStyleLoaded()) setup();
  else map.once('load', setup);

  // Live-refresh on data changes.
  busUnsub.push(bus.on('data:changed', async () => {
    if (destroyed || !map) return;
    try {
      const res = await api.listFeatures(layer.name, { limit: -1 });
      if (destroyed || !map) return;
      const next = toFeatureCollection(res.features || []);
      currentFc = next;
      const src = map.getSource(SOURCE_ID);
      if (src && src.setData) src.setData(next);
    } catch (err) {
      console.error('[map-preview] refresh failed', err);
    }
  }));
}

export function unmount() {
  destroyed = true;
  isSetup = false;
  for (const off of busUnsub) { try { off(); } catch {} }
  busUnsub = [];
  if (map) {
    try { map.remove(); } catch (e) { console.error('[map-preview] remove failed', e); }
    map = null;
  }
  if (root) root.innerHTML = '';
  root = null;
  layer = null;
}

// ===== helpers =====

function toFeatureCollection(features) {
  return {
    type: 'FeatureCollection',
    features: (features || [])
      .filter((f) => f && f.geometry)
      .map((f) => ({
        type: 'Feature',
        id: f.id,
        geometry: f.geometry,
        properties: { __id: f.id, ...(f.properties || {}) }
      }))
  };
}

function computeBbox(fc) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  let any = false;
  const visit = (coords) => {
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const [x, y] = coords;
      if (Number.isFinite(x) && Number.isFinite(y)) {
        any = true;
        if (x < minLon) minLon = x;
        if (x > maxLon) maxLon = x;
        if (y < minLat) minLat = y;
        if (y > maxLat) maxLat = y;
      }
      return;
    }
    for (const c of coords) if (Array.isArray(c)) visit(c);
  };
  for (const f of fc.features) {
    if (f.geometry && Array.isArray(f.geometry.coordinates)) visit(f.geometry.coordinates);
  }
  return any ? [minLon, minLat, maxLon, maxLat] : null;
}

function fitToData(fc) {
  if (!map) return;
  const bbox = computeBbox(fc);
  if (!bbox) {
    map.jumpTo({ center: [8.54, 47.37], zoom: 10 });
    return;
  }
  const [minLon, minLat, maxLon, maxLat] = bbox;
  if (minLon === maxLon && minLat === maxLat) {
    map.jumpTo({ center: [minLon, minLat], zoom: 14 });
    return;
  }
  try {
    map.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 40, maxZoom: 16, duration: 0 });
  } catch (e) {
    console.warn('[map-preview] fitBounds failed', e);
  }
}

function attachInteractions(popup) {
  if (!map) return;
  // Hit-test all paint layers that the current layer's geometry type uses.
  const gt = layer.geometry_type;
  const hitLayers = [];
  if (gt === 'Point' || gt === 'MultiPoint') hitLayers.push('pb-points');
  else if (gt === 'LineString' || gt === 'MultiLineString') hitLayers.push('pb-lines');
  else if (gt === 'Polygon' || gt === 'MultiPolygon') hitLayers.push('pb-polygons-fill');

  for (const id of hitLayers) {
    map.on('mouseenter', id, () => { if (map) map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', id, () => { if (map) map.getCanvas().style.cursor = ''; });
  }

  map.on('click', (e) => {
    if (!map) return;
    const hits = map.queryRenderedFeatures(e.point, { layers: hitLayers });
    if (!hits || !hits.length) return;
    const f = hits[0];
    const id = f.id ?? f.properties?.__id;
    if (id != null) {
      bus.emit('map:featureFocus', id);
      popup.setLngLat(e.lngLat)
        .setHTML(`<div style="font-family: var(--font-mono, monospace); font-size: 12px;">id: ${escHtml(String(id))}</div>`)
        .addTo(map);
    }
  });
}
