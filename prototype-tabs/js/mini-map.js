// Mini map of the detail view (shared): a small 3D map centred on the building, created once
// and reused (re-creating a MapLibre instance re-downloads the style and tiles every time).

import { t, onLangChange } from './i18n.js';
import { getMapStyleUrl } from './basemaps.js';
import { findVectorSourceId } from './map-controls.js';

let miniMap = null;
let miniMapMarker = null;
let pendingCoords = null;

function translateAddressLink() {
  const address = document.getElementById('mini-map-address');
  if (!address?.hasAttribute('href')) return;
  address.title = t('miniMap.openGoogle');
  address.setAttribute('aria-label', address.textContent + ' – ' + address.title);
}
onLangChange(translateAddressLink);

// Building footprints of the CARTO basemap as extrusions, fading in around zoom 15
const MINI_MAP_3D_LAYER = {
  'id': '3d-buildings',
  'source-layer': 'building',
  'type': 'fill-extrusion',
  'minzoom': 15,
  'filter': ['!=', ['get', 'hide_3d'], true],
  'paint': {
    'fill-extrusion-color': '#A8B0B7',
    'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['coalesce', ['get', 'render_height'], 5]],
    'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['coalesce', ['get', 'render_min_height'], 0]],
    'fill-extrusion-opacity': 1
  }
};

function add3DBuildings() {
  const style = miniMap.getStyle();
  const vectorSourceId = findVectorSourceId(style);
  if (!vectorSourceId) return;
  const layers = style.layers || [];
  // CARTO has an early waterway label BEFORE its roads. Insert above all ground
  // geometry, below the final label block, so roads cannot paint over roofs.
  let lastGeometryIndex = -1;
  layers.forEach(function(layer, index) {
    if (layer.type !== 'symbol') lastGeometryIndex = index;
    // Hide the basemap's flat buildings to avoid drawing the footprints twice.
    if (layer['source-layer'] === 'building' && layer.id !== '3d-buildings') {
      miniMap.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  });
  const firstOverlay = layers[lastGeometryIndex + 1];
  miniMap.addLayer(Object.assign({}, MINI_MAP_3D_LAYER, { source: vectorSourceId }), firstOverlay && firstOverlay.id);
}

export function showMiniMap(coords) {
  const address = document.getElementById('mini-map-address');
  if (address) {
    address.removeAttribute('href');
    if (Array.isArray(coords) && coords.length >= 2 && coords.every(Number.isFinite)) {
      address.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(coords[1] + ',' + coords[0]);
      translateAddressLink();
    }
  }
  pendingCoords = coords;
  if (!document.getElementById('mini-map')) return;

  if (miniMap) {
    miniMap.jumpTo({ center: coords, zoom: 17, pitch: 50, bearing: -17 });
    if (miniMapMarker) miniMapMarker.setLngLat(coords);
    miniMap.resize();
    setTimeout(function() { if (miniMap) miniMap.resize(); }, 300);
    return;
  }

  miniMap = new maplibregl.Map({
    container: 'mini-map',
    style: getMapStyleUrl('positron'),
    center: coords,
    zoom: 17,
    pitch: 50,
    bearing: -17,
    // The mini map sits inside a scrolling page: a one-finger drag or a plain scroll wheel keeps
    // scrolling the page; two fingers / Ctrl+wheel operate the map.
    cooperativeGestures: true,
    locale: {
      'CooperativeGesturesHandler.WindowsHelpText': t('minimap.gesture.desktop'),
      'CooperativeGesturesHandler.MacHelpText': t('minimap.gesture.mac'),
      'CooperativeGesturesHandler.MobileHelpText': t('minimap.gesture.mobile')
    }
  });

  miniMap.on('load', function() {
    add3DBuildings();
    // Marker at the most recently requested position
    miniMapMarker = new maplibregl.Marker({ color: '#c00' })
      .setLngLat(pendingCoords || coords)
      .addTo(miniMap);
    miniMap.resize();
  });

  miniMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  setTimeout(function() { if (miniMap) miniMap.resize(); }, 300);
}
