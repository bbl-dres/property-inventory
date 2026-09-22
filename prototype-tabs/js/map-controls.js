// Map creation, standard controls, URL sync, status indicators and view helpers (shared).
// Everything here is independent of the application's data schema.

import { isMobileLayout } from './utils.js';
import { showToast } from './toast.js';
import { t } from './i18n.js';

export const DEFAULT_CENTER = [8.2275, 46.8182]; // Switzerland
export const DEFAULT_ZOOM = 2;

// Initial extent (Home control, logo click)
export function flyHome(map) {
  map.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, duration: 1000 });
}

// ===== URL -> INITIAL VIEW =====

export function readMapViewFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const lat = parseFloat(params.get('lat'));
  const lng = parseFloat(params.get('lng'));
  const zoom = parseFloat(params.get('zoom'));
  const pitch = parseFloat(params.get('pitch'));
  const bearing = parseFloat(params.get('bearing'));
  const view = { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, pitch: 0, bearing: 0, is3D: params.get('3d') === '1' };
  if (!isNaN(lat) && !isNaN(lng) && !isNaN(zoom)) {
    view.center = [lng, lat];
    view.zoom = zoom;
  }
  if (!isNaN(pitch)) view.pitch = pitch;
  if (!isNaN(bearing)) view.bearing = bearing;
  return view;
}

// MapLibre map with the view from the URL. preserveDrawingBuffer keeps the canvas readable
// (needed by the print module); antialias smooths the fill-extrusion 3D buildings.
export function createMap(containerId, styleUrl, styleOptions = {}) {
  const view = readMapViewFromUrl();
  const map = new maplibregl.Map({
    container: containerId,
    crossSourceCollisions: true, // Parcel and building labels share collision detection.
    style: styleOptions.transformStyle ? null : styleUrl,
    center: view.center,
    zoom: view.zoom,
    pitch: view.pitch,
    bearing: view.bearing,
    canvasContextAttributes: { antialias: true, preserveDrawingBuffer: true }
  });
  // Style transforms are setStyle options, not constructor options.
  if (styleOptions.transformStyle) map.setStyle(styleUrl, styleOptions);
  return map;
}

// ===== STANDARD CONTROLS =====

function HomeControl() {}
HomeControl.prototype.onAdd = function(map) {
  this._map = map;
  this._container = document.createElement('div');
  this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
  const button = document.createElement('button');
  button.className = 'map-home-btn';
  button.type = 'button';
  button.title = t('map.home');
  button.innerHTML = '<span class="material-symbols-outlined">home</span>';
  button.onclick = function() { flyHome(map); };
  this._container.appendChild(button);
  return this._container;
};
HomeControl.prototype.onRemove = function() {
  this._container.parentNode.removeChild(this._container);
  this._map = undefined;
};

let is3D = false;

export function is3DActive() {
  return is3D;
}

function Toggle3DControl() {}
Toggle3DControl.prototype.onAdd = function(map) {
  this._map = map;
  this._container = document.createElement('div');
  this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
  const button = document.createElement('button');
  button.className = 'map-3d-btn';
  button.type = 'button';
  button.title = t('map.toggle3d');
  button.textContent = '3D';
  button.onclick = function() {
    is3D = !is3D;
    if (is3D) {
      map.flyTo({ pitch: 60, bearing: -20, duration: 800, center: map.getCenter(), zoom: map.getZoom() });
      show3DBuildings(map);
    } else {
      map.flyTo({ pitch: 0, bearing: 0, duration: 800, center: map.getCenter(), zoom: map.getZoom() });
      hide3DBuildings(map);
    }
    render3DButton(button);
    const url = new URL(window.location);
    if (is3D) url.searchParams.set('3d', '1'); else url.searchParams.delete('3d');
    window.history.replaceState({}, '', url);
  };
  this._container.appendChild(button);
  return this._container;
};
Toggle3DControl.prototype.onRemove = function() {
  this._container.parentNode.removeChild(this._container);
  this._map = undefined;
};

function render3DButton(button) {
  button.textContent = is3D ? '2D' : '3D';
  button.classList.toggle('active', is3D);
}

// Navigation, scale, home and (optionally) the 2D/3D toggle; restores ?3d=1 from the URL.
export function addStandardControls(map, options) {
  options = options || {};
  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 200 }), 'bottom-left');
  map.addControl(new HomeControl(), 'top-right');
  if (options.toggle3D !== false) {
    map.addControl(new Toggle3DControl(), 'top-right');
    if (readMapViewFromUrl().is3D) {
      is3D = true;
      const btn3d = document.querySelector('.map-3d-btn');
      if (btn3d) render3DButton(btn3d);
      map.once('idle', function() { show3DBuildings(map); });
    }
  }
}

// ===== 3D BUILDINGS (OpenMapTiles "building" layer of the CARTO basemaps) =====

export function findVectorSourceId(style) {
  const sources = (style && style.sources) || {};
  // Only OpenMapTiles building sources support these extrusions. The Esri hybrid
  // reference source contains labels and roads with a different schema.
  const buildingLayer = ((style && style.layers) || []).find(function(layer) {
    return layer['source-layer'] === 'building' && sources[layer.source]?.type === 'vector';
  });
  return buildingLayer ? buildingLayer.source : null;
}

// First existing layer id of the candidates (used as the "insert before" anchor)
export function findFirstLayerId(map, candidates) {
  for (let i = 0; i < candidates.length; i++) {
    if (map.getLayer(candidates[i])) return candidates[i];
  }
  return null;
}

// Data layers of the applications; 3D buildings and external layers are inserted below the first one present
export const DATA_LAYER_ANCHORS = ['landcovers-fill', 'parcels-fill', 'buildings-clusters', 'buildings-points'];

export const BUILDINGS_3D_LAYER = {
  'id': '3d-buildings',
  'source-layer': 'building',
  'type': 'fill-extrusion',
  'minzoom': 15,
  'filter': ['!=', ['get', 'hide_3d'], true],
  'paint': {
    'fill-extrusion-color': '#d0d0d0',
    'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 5],
    'fill-extrusion-base': 0,
    'fill-extrusion-opacity': 1
  }
};

function setBasemapBuildingLayersVisible(map, visible) {
  const layers = map.getStyle().layers || [];
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    if (layer['source-layer'] === 'building' && layer.id !== '3d-buildings') {
      map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
    }
  }
}

export function show3DBuildings(map) {
  if (!map) return;
  if (map.getLayer('3d-buildings')) {
    map.setLayoutProperty('3d-buildings', 'visibility', 'visible');
    return;
  }
  const vectorSourceId = findVectorSourceId(map.getStyle());
  if (!vectorSourceId) return; // raster basemap (aerial): nothing to extrude
  // Hide the basemap's own flat building layers to prevent double-rendering
  setBasemapBuildingLayersVisible(map, false);
  map.addLayer(Object.assign({}, BUILDINGS_3D_LAYER, { source: vectorSourceId }), findFirstLayerId(map, DATA_LAYER_ANCHORS));
}

export function hide3DBuildings(map) {
  if (!map) return;
  if (map.getLayer('3d-buildings')) map.setLayoutProperty('3d-buildings', 'visibility', 'none');
  setBasemapBuildingLayersVisible(map, true);
}

// ===== URL SYNC AND COORDINATE DISPLAY =====

// Keeps lng/lat/zoom (and pitch/bearing when tilted) in the URL; skipped while another view is active
export function bindMapUrlSync(map, isMapVisible) {
  map.on('moveend', function() {
    if (isMapVisible && !isMapVisible()) return;
    const center = map.getCenter();
    const url = new URL(window.location);
    url.searchParams.set('lng', center.lng.toFixed(5));
    url.searchParams.set('lat', center.lat.toFixed(5));
    url.searchParams.set('zoom', map.getZoom().toFixed(2));
    const pitch = map.getPitch();
    if (pitch > 0) {
      url.searchParams.set('pitch', pitch.toFixed(1));
      url.searchParams.set('bearing', map.getBearing().toFixed(1));
    } else {
      url.searchParams.delete('pitch');
      url.searchParams.delete('bearing');
    }
    window.history.replaceState({}, '', url);
  });
}

// Footer coordinate readout, throttled to one DOM update per animation frame
export function bindCoordinateDisplay(map, elementId) {
  const coordsEl = document.getElementById(elementId || 'coordinates');
  if (!coordsEl) return;
  let pending = null;
  map.on('mousemove', function(e) {
    if (pending) return;
    const lng = e.lngLat.lng;
    const lat = e.lngLat.lat;
    pending = requestAnimationFrame(function() {
      coordsEl.textContent = t('map.coordinates', { lat: lat.toFixed(5), lon: lng.toFixed(5) });
      pending = null;
    });
  });
}

// ===== MAP STATUS: busy indicator + error reporting =====

export function initMapStatusIndicators(map) {
  const busyEl = document.getElementById('map-busy');
  let busyTimer = null;
  let watchdog = null;
  const SHOW_DELAY = 400;   // only when loading takes longer than this (no flicker on fast tile loads)
  const MAX_SHOWN = 8000;   // a tile that never answers must not leave "loading" on a finished map

  // "Ready" = style loaded and every tile of the view loaded or failed. map.loaded() would also be
  // false for a dirty style waiting for a frame (hidden tab) — states that never end in an 'idle'.
  function mapReady() {
    if (typeof map.isStyleLoaded === 'function' && typeof map.areTilesLoaded === 'function') {
      return map.isStyleLoaded() && map.areTilesLoaded();
    }
    return map.loaded();
  }

  function showBusy() {
    if (busyTimer || !busyEl) return;
    busyTimer = setTimeout(function() {
      busyTimer = null;
      if (mapReady()) return;
      busyEl.classList.add('show');
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(hideBusy, MAX_SHOWN);
    }, SHOW_DELAY);
  }

  function hideBusy() {
    if (busyTimer) {
      clearTimeout(busyTimer);
      busyTimer = null;
    }
    if (watchdog) {
      clearTimeout(watchdog);
      watchdog = null;
    }
    if (busyEl) busyEl.classList.remove('show');
  }

  // Hide as soon as the map is ready again, not only on 'idle' (which needs a further render frame)
  function hideWhenReady() {
    if (busyEl && busyEl.classList.contains('show') && mapReady()) hideBusy();
  }

  map.on('dataloading', showBusy);
  map.on('idle', hideBusy);
  map.on('sourcedata', hideWhenReady);
  map.on('styledata', hideWhenReady);

  // Style/source failures are reported to the user (throttled). Single tile errors are
  // expected (e.g. raster tiles outside a source's coverage) and stay silent.
  let lastMapErrorAt = 0;
  map.on('error', function(e) {
    const err = e && e.error;
    if (!err) return;
    if (e.tile || e.sourceId || err.name === 'AbortError') return;
    console.error('[map] error:', err);
    const now = Date.now();
    if (now - lastMapErrorAt < 10000) return;
    lastMapErrorAt = now;
    hideBusy();
    showToast({
      type: 'warning',
      title: t('map.error.title'),
      message: t('map.error.style') + ' (' + (err.message || err) + ')',
      duration: 8000
    });
  });
}

// ===== FLY-TO AND MOBILE INFO SHEET =====

// Adapts the duration to the distance: snappy for nearby targets, smooth for far away ones
export function smartFlyTo(map, options) {
  if (!map) return;
  const target = options.center;
  const current = map.getCenter();
  const dx = target[0] - current.lng;
  const dy = target[1] - current.lat;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // ~0.01 deg (1 km) -> 300 ms, ~1 deg (100 km) -> 1000 ms, ~10 deg -> 2000 ms
  const duration = Math.min(2000, Math.max(300, Math.round(dist * 800 + 200)));
  map.flyTo({
    center: target,
    zoom: options.zoom,
    duration: duration,
    essential: true,
    offset: getInfoPanelOffset(map) // keep the target out from under the mobile info sheet
  });
}

// On phones the info panel is a bottom sheet (or a right-hand sheet in landscape) that covers
// part of the map. Returns the MapLibre `offset` (pixels relative to the map centre) that centres
// a target in the uncovered part of the map; [0, 0] on desktop or when the panel is hidden.
export function getInfoPanelOffset(map) {
  const panel = document.getElementById('info-panel');
  if (!map || !panel || !isMobileLayout() || !panel.classList.contains('show')) return [0, 0];
  const m = map.getContainer().getBoundingClientRect();
  const p = panel.getBoundingClientRect();
  if (p.width >= m.width * 0.9) {
    const coveredBottom = Math.max(0, m.bottom - Math.max(p.top, m.top));
    return [0, -coveredBottom / 2];
  }
  if (p.height >= m.height * 0.9) {
    const coveredRight = Math.max(0, m.right - Math.max(p.left, m.left));
    return [-coveredRight / 2, 0];
  }
  return [0, 0];
}

// After a tap selection on a phone: if the selected object ended up under the info sheet,
// pan so it sits in the middle of the visible part of the map.
export function revealSelectionOnMobile(map, lngLat) {
  if (!map || !lngLat) return;
  const offset = getInfoPanelOffset(map);
  if (!offset[0] && !offset[1]) return;
  const m = map.getContainer().getBoundingClientRect();
  const visibleW = m.width + offset[0] * 2;
  const visibleH = m.height + offset[1] * 2;
  const pt = map.project(lngLat);
  const margin = 32;
  if (pt.x < margin || pt.x > visibleW - margin || pt.y < margin || pt.y > visibleH - margin) {
    map.panBy([pt.x - visibleW / 2, pt.y - visibleH / 2], { duration: 300 });
  }
}
