// map.js — Background map, data layers, context-menu DOM refs.
// Provides: bgMap, WF_COLORS, BLDG_STATUS_COLORS, CR_STATE_COLORS, mapView, ctx, pin, coordsEl
// Requires: (none at load time)
// Runtime refs to: enterCRDetail (workflows.js)

// ===== MapLibre: Carto Positron (light grey) — same default as the parent prototype =====
const bgMap = new maplibregl.Map({
  container: 'mapCanvas',
  style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  center: [8.23, 46.8],
  zoom: 7.3,
  minZoom: 6,
  maxZoom: 19,
  canvasContextAttributes: { antialias: true, preserveDrawingBuffer: true }
});

bgMap.on('error', (e) => console.warn('MapLibre:', e && e.error ? e.error.message : e));
bgMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
window.addEventListener('resize', () => bgMap.resize());

// ===== Data layers: portfolio buildings + parcels + workflow CRs =====
// Color palettes (match tokens.css status colors)
const WF_COLORS = {
  draft:     '#9ca3af',  // grey
  review:    '#ef6c00',  // orange
  approval:  '#1976d2',  // blue
  applied:   '#2e7d32',  // green
  rejected:  '#d32f2f'   // red
};
const BLDG_STATUS_COLORS = [
  'match', ['get', 'bbl_stat'],
  'Aktiv',         '#2e7d32',
  'In Renovation', '#ef6c00',
  'In Planung',    '#1976d2',
  'Verkauft',      '#6C757D',
  '#6C757D'
];
const CR_STATE_COLORS = [
  'match', ['get', 'state'],
  'draft',    WF_COLORS.draft,
  'review',   WF_COLORS.review,
  'approval', WF_COLORS.approval,
  'applied',  WF_COLORS.applied,
  'rejected', WF_COLORS.rejected,
  '#9ca3af'
];

bgMap.on('load', async () => {
  // Parcels (polygons) — muted fill behind buildings
  try {
    const parcels = await fetch('data/parcels.geojson').then(r => r.json());
    bgMap.addSource('parcels', { type: 'geojson', data: parcels });
    bgMap.addLayer({
      id: 'parcels-fill', type: 'fill', source: 'parcels',
      paint: { 'fill-color': '#6C757D', 'fill-opacity': 0.08 }
    });
    bgMap.addLayer({
      id: 'parcels-outline', type: 'line', source: 'parcels',
      paint: { 'line-color': '#6C757D', 'line-width': 1, 'line-opacity': 0.4 }
    });
  } catch (err) { console.warn('parcels failed:', err); }

  // Buildings (points) — colored by bbl_stat
  try {
    const buildings = await fetch('data/buildings.geojson').then(r => r.json());
    bgMap.addSource('buildings', { type: 'geojson', data: buildings });
    bgMap.addLayer({
      id: 'buildings-circles', type: 'circle', source: 'buildings',
      paint: {
        'circle-radius': 6,
        'circle-color': BLDG_STATUS_COLORS,
        'circle-stroke-color': '#fff',
        'circle-stroke-width': 1.5,
        'circle-opacity': 0.9
      }
    });
  } catch (err) { console.warn('buildings failed:', err); }

  // Workflows (CR points) — colored by state, larger + pulsing ring
  try {
    const workflows = await fetch('data/workflows.geojson').then(r => r.json());
    bgMap.addSource('workflows', { type: 'geojson', data: workflows });
    bgMap.addLayer({
      id: 'workflows-ring', type: 'circle', source: 'workflows',
      paint: {
        'circle-radius': 14,
        'circle-color': CR_STATE_COLORS,
        'circle-opacity': 0.18
      }
    });
    bgMap.addLayer({
      id: 'workflows-dots', type: 'circle', source: 'workflows',
      paint: {
        'circle-radius': 7,
        'circle-color': CR_STATE_COLORS,
        'circle-stroke-color': '#fff',
        'circle-stroke-width': 2
      }
    });

    // Click on a workflow point → open its detail pane (enterCRDetail defined in workflows.js)
    bgMap.on('click', 'workflows-dots', (e) => {
      const f = e.features && e.features[0];
      if (!f) return;
      if (!window.WORKFLOWS) { console.warn('Workflows data not yet loaded'); return; }
      const p = f.properties;
      enterCRDetail(p.title, p.cr_id);
    });
    bgMap.on('mouseenter', 'workflows-dots', () => { bgMap.getCanvas().style.cursor = 'pointer'; });
    bgMap.on('mouseleave', 'workflows-dots', () => { bgMap.getCanvas().style.cursor = ''; });
  } catch (err) { console.warn('workflows failed:', err); }
});

// ===== Map context menu (DOM refs + shared close logic) =====
// The right-click handler itself lives in wizard.js alongside showCtx and swisstopo enrichment.
const mapView = document.getElementById('map-view');
const ctx = document.getElementById('mapCtx');
const pin = document.getElementById('pin');
const coordsEl = document.getElementById('ctxCoords');

// Close context menu on outside click + on map drag + Escape
document.addEventListener('click', (e) => {
  if (!ctx.contains(e.target)) {
    ctx.classList.remove('open'); pin.classList.remove('shown');
  }
});
bgMap.on('movestart', () => {
  ctx.classList.remove('open'); pin.classList.remove('shown');
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (ctx.classList.contains('open')) {
    ctx.classList.remove('open'); pin.classList.remove('shown');
    return;
  }
  var nwp = document.getElementById('newWfPop');
  if (nwp && nwp.classList.contains('open')) {
    nwp.classList.remove('open');
    return;
  }
  var apiLog = document.getElementById('apiLog');
  if (apiLog && apiLog.dataset.open === '1') {
    apiLog.dataset.open = '0';
    var tab = document.getElementById('apiLogTab');
    if (tab) tab.setAttribute('aria-expanded', 'false');
  }
});
