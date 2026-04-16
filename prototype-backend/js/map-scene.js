// prototype-backend — Map scene authoring view.
//
// Mounted by product-detail.js when product.kind === 'map'. Owns the full
// main container: renders a view header, a 3-zone layout (left layer
// manager, centre canvas with floating toolbar + status strip, right
// inspector drawer), and mounts sub-modules into those hosts.
//
// Scope: visual mockup. Most interactions toast "coming soon". See the
// brief at docs/ for the wired-vs-mocked matrix.

import * as api from './api.js';
import { el, toast, openModal, closeModal, confirmModal, inlineEditable, wireMenu } from './utils.js';
import { renderViewHeader } from './app.js';
import { sridName, geomTypeIcon, BRAND_COLOR as BRAND } from './constants.js';
import * as layerManager from './scene-layer-manager.js';
import * as editToolbar from './scene-edit-toolbar.js';
import * as featureInspector from './scene-feature-inspector.js';

// Match map-preview.js' basemap choice — a free, attribution-clean Carto
// style that works without a token. Used as the fallback for basemap
// options that aren't reachable in the mock environment.
const CARTO_POSITRON = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

// Basemap catalogue. Keys are used internally; `style` is the MapLibre
// style URL (or null to flag "cosmetic only — fall back to Carto"). The
// `label` is what we show in the subtitle and the radio.
const BASEMAPS = {
  'swisstopo-pixelkarte': {
    label: 'Swisstopo Pixelkarte',
    style: null, // requires swisstopo WMTS; unreachable in prototype → Carto fallback
    cosmetic: true
  },
  'swisstopo-orthofoto': {
    label: 'Swisstopo Orthofoto',
    style: null,
    cosmetic: true
  },
  'osm': {
    label: 'OpenStreetMap',
    style: CARTO_POSITRON, // Carto Positron is OSM-flavoured; reachable
    cosmetic: false
  },
  'none': {
    label: 'None',
    style: null,
    cosmetic: true
  }
};

// `BRAND` is the feature-collection paint colour per geometry type. Mirrors
// map-preview. Imported above from constants.js so a rebrand is a one-liner.

// ---- Module state ------------------------------------------------------

let root = null;
let product = null;

let map = null;
let mapHost = null;

// Hosts for sub-modules
let sidebarHost = null;
let toolbarHost = null;
let inspectorHost = null;
let emptyStateHost = null;
let footerStrip = null;
let subtitleNode = null;
let titleHost = null;

// Sub-module refs (non-null once mounted).
let layerManagerMod = null;
let editToolbarMod = null;
let featureInspectorMod = null;

let keydownHandler = null;
let destroyed = false;

// Scene state — module-local, not persisted.
let scene = null;

function resetScene(p) {
  scene = {
    layers: [],           // [{ name, title, visible, geometry_type, sourceId, layerIds:[], featureCount, bounds, columns? }]
    basemap: 'swisstopo-pixelkarte',
    viewMode: '2d',
    dirty: false,
    selectedFeature: null,
    editMode: false,
    productSlug: p?.slug || null
  };
}

// ---- Public API --------------------------------------------------------

export async function mount(container, { product: p }) {
  root = container;
  product = p;
  destroyed = false;
  resetScene(p);

  root.innerHTML = '';
  root.classList.add('pb-scene-root');
  // The scene viewer wants a fullscreen map canvas — opt into the
  // fixed-viewport body mode so the map + its sub-modules stay pinned
  // while the user edits. Every other route lets the document scroll.
  document.body.classList.add('pb-body--fixed-viewport');

  renderShell();

  // Initial map
  try {
    initMap();
  } catch (err) {
    console.error('[map-scene] map init failed', err);
    toast('Failed to initialize map', 'error');
  }

  // Load any layers the product already references. For a brand-new map
  // (created via the "New map" modal) this will be empty → empty-state.
  const initialLayerNames = Array.isArray(product.consumed_layers) ? product.consumed_layers.slice() : [];
  if (initialLayerNames.length) {
    await loadLayersByName(initialLayerNames);
  }

  updateEmptyState();
  refreshSubtitle();

  // Esc closes the inspector drawer.
  keydownHandler = (e) => {
    if (e.key === 'Escape' && scene?.selectedFeature) {
      closeInspector();
    }
  };
  document.addEventListener('keydown', keydownHandler);
}

export function unmount() {
  destroyed = true;
  if (keydownHandler) {
    document.removeEventListener('keydown', keydownHandler);
    keydownHandler = null;
  }
  try { layerManagerMod?.unmount?.(); } catch {}
  try { editToolbarMod?.unmount?.(); } catch {}
  try { featureInspectorMod?.unmount?.(); } catch {}
  layerManagerMod = null;
  editToolbarMod = null;
  featureInspectorMod = null;

  if (map) {
    try { map.remove(); } catch (err) { console.error('[map-scene] map.remove', err); }
    map = null;
  }

  if (root) {
    root.classList.remove('pb-scene-root');
    root.innerHTML = '';
  }
  document.body.classList.remove('pb-body--fixed-viewport');
  root = null;
  product = null;
  scene = null;
  mapHost = null;
  sidebarHost = null;
  toolbarHost = null;
  inspectorHost = null;
  emptyStateHost = null;
  footerStrip = null;
  subtitleNode = null;
  titleHost = null;
}

// ---- Shell -------------------------------------------------------------

function renderShell() {
  // View header. Title is inline-editable (product name). Subtitle is
  // rebuilt on every state change via refreshSubtitle().
  const titleEditor = inlineEditable({
    value: product.name || product.slug,
    placeholder: 'Map name',
    className: 'pb-scene-title',
    onSave: async (next) => {
      // Persist via updateProduct? There's no such API; mutate in-place
      // on the mock and re-render. The real adapter would PATCH /products.
      // For the prototype we just toast and update the local copy.
      if (!next) return;
      product.name = next;
      toast('Name updated (local only — save not implemented)', 'info');
    }
  });
  titleHost = el('div', { class: 'pb-title-row' }, [titleEditor]);

  subtitleNode = el('div', { class: 'pb-view-subtitle' }, '');

  const saveBtn = el('button', { type: 'button', class: 'btn-primary' }, [
    el('span', { class: 'material-symbols-outlined pb-icon-sm' }, 'save'),
    ' Save'
  ]);
  saveBtn.addEventListener('click', () => toast('Save scene — coming soon', 'info'));

  // Overflow menu on the header.
  const overflowBtn = el('button', {
    type: 'button',
    class: 'btn-secondary',
    'aria-label': 'More actions',
    'aria-haspopup': 'menu'
  }, [el('span', { class: 'material-symbols-outlined' }, 'more_horiz')]);
  const overflowMenu = el('div', { class: 'pb-menu', role: 'menu', hidden: true });
  const overflowWrap = el('div', { class: 'pb-menu-wrap' }, [overflowBtn, overflowMenu]);
  const overflowCtl = wireMenu(overflowBtn, overflowMenu, overflowWrap);
  overflowMenu.append(
    menuItem('share', 'Share…', () => { overflowCtl.close(); toast('Share — coming soon', 'info'); }),
    menuItem('file_download', 'Export…', () => { overflowCtl.close(); toast('Export — coming soon', 'info'); })
  );

  const header = renderViewHeader({
    breadcrumb: [
      { label: 'Maps & Apps', href: '#/products' },
      { label: product.name || product.slug }
    ],
    title: titleHost,
    subtitle: subtitleNode,
    actions: [saveBtn, overflowWrap]
  });
  root.appendChild(header);

  // Layout: 280px sidebar | flex canvas
  sidebarHost = el('aside', { class: 'pb-scene-sidebar', 'aria-label': 'Layer manager' });

  toolbarHost = el('div', { class: 'pb-scene-edit-toolbar', hidden: true });
  inspectorHost = el('aside', { class: 'pb-scene-inspector', 'aria-label': 'Feature inspector' });
  emptyStateHost = el('div', { class: 'pb-scene-empty', hidden: true });
  mapHost = el('div', { class: 'pb-scene-canvas-map' });
  footerStrip = el('div', { class: 'pb-scene-footer-strip' });

  const canvas = el('section', { class: 'pb-scene-canvas' }, [
    mapHost,
    toolbarHost,
    emptyStateHost,
    inspectorHost,
    footerStrip
  ]);

  const layout = el('div', { class: 'pb-scene-layout' }, [sidebarHost, canvas]);
  root.appendChild(layout);

  renderFooter();
  renderEmptyState();

  // Mount sub-modules.
  layerManagerMod = layerManager;
  layerManager.mount(sidebarHost, {
    scene,
    getAllLayers: async () => {
      try { return await api.listLayers(); }
      catch { return []; }
    },
    onLayerToggle: handleLayerToggle,
    onLayerReorder: handleLayerReorder,
    onLayerRemove: handleLayerRemove,
    onLayerZoom: handleLayerZoom,
    onBasemapChange: handleBasemapChange,
    onEditModeToggle: handleEditModeToggle,
    onAddLayer: handleAddLayer
  });

  editToolbarMod = editToolbar;
  editToolbar.mount(toolbarHost, {
    onTool: (toolId) => {
      // Select is the implicit default; other tools are stubbed.
      if (toolId === 'select') return;
      toast(`${toolLabel(toolId)} — coming soon`, 'info');
    }
  });
}

function menuItem(icon, label, handler) {
  const b = el('button', { type: 'button', class: 'pb-menu-item', role: 'menuitem' }, [
    el('span', { class: 'material-symbols-outlined' }, icon),
    el('span', {}, label)
  ]);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    handler();
  });
  return b;
}

/** `wireMenu()` moved to utils.js — imported at the top of this module. */

function toolLabel(id) {
  const map = {
    point: 'Point tool',
    line: 'Line tool',
    polygon: 'Polygon tool',
    rectangle: 'Rectangle tool',
    delete: 'Delete',
    undo: 'Undo',
    redo: 'Redo'
  };
  return map[id] || 'Tool';
}

// ---- Subtitle / footer -------------------------------------------------

function refreshSubtitle() {
  if (!subtitleNode) return;
  const n = scene.layers.length;
  const bm = BASEMAPS[scene.basemap]?.label || scene.basemap;
  const saved = scene.dirty ? 'unsaved' : 'saved';
  subtitleNode.textContent = `Scene · ${n} layer${n === 1 ? '' : 's'} · ${bm} · ${saved}`;
}

function renderFooter() {
  if (!footerStrip) return;
  footerStrip.innerHTML = '';

  // 2D/3D toggle — cosmetic.
  const viewToggle = el('button', {
    type: 'button',
    class: 'pb-scene-footer-btn',
    'aria-label': 'Toggle 2D/3D'
  }, [
    el('span', { class: 'material-symbols-outlined pb-icon-xs' }, '3d_rotation'),
    ' ',
    el('span', { class: 'pb-scene-view-label' }, scene.viewMode.toUpperCase())
  ]);
  viewToggle.addEventListener('click', () => {
    scene.viewMode = scene.viewMode === '2d' ? '3d' : '2d';
    const lbl = viewToggle.querySelector('.pb-scene-view-label');
    if (lbl) lbl.textContent = scene.viewMode.toUpperCase();
    toast(scene.viewMode === '3d' ? '3D view — coming soon' : 'Switched to 2D', 'info');
  });

  const crs = el('span', { class: 'pb-scene-footer-item' }, ['CRS: ', sridName(4326) ? 'EPSG:4326' : 'EPSG:4326']);

  const coords = el('span', { class: 'pb-scene-footer-item pb-scene-footer-coords' }, '— · —');
  const scaleEl = el('span', { class: 'pb-scene-footer-item pb-scene-footer-scale' }, '1:—');

  footerStrip.appendChild(viewToggle);
  footerStrip.appendChild(crs);
  footerStrip.appendChild(coords);
  footerStrip.appendChild(scaleEl);

  // Bind coord / scale readouts once the map is live.
  if (map) {
    map.on('mousemove', (e) => {
      if (!coords || destroyed) return;
      coords.textContent = `${e.lngLat.lng.toFixed(4)} · ${e.lngLat.lat.toFixed(4)}`;
    });
    const updateScale = () => {
      if (!scaleEl || destroyed || !map) return;
      const z = map.getZoom();
      // Rough metres-per-pixel → 1:X scale denominator.
      const lat = map.getCenter().lat;
      const mPerPx = 156543.03392 * Math.cos((lat * Math.PI) / 180) / Math.pow(2, z);
      const denom = Math.round(mPerPx * 96 / 0.0254); // 96dpi
      scaleEl.textContent = `1:${denom.toLocaleString()}`;
    };
    map.on('zoom', updateScale);
    map.on('moveend', updateScale);
    updateScale();
  }
}

// ---- Empty state -------------------------------------------------------

function renderEmptyState() {
  if (!emptyStateHost) return;
  emptyStateHost.innerHTML = '';
  const addBtn = el('button', { type: 'button', class: 'btn-primary' }, [
    el('span', { class: 'material-symbols-outlined pb-icon-sm' }, 'add'),
    ' Add layer'
  ]);
  addBtn.addEventListener('click', () => openAddExistingPicker());
  const card = el('div', { class: 'pb-scene-empty-card' }, [
    el('span', { class: 'material-symbols-outlined pb-scene-empty-icon' }, 'layers'),
    el('div', { class: 'pb-scene-empty-title' }, 'This scene is empty'),
    el('div', { class: 'pb-scene-empty-desc' }, 'Add a layer to get started — pull in an existing layer, upload a file, or draw from scratch.'),
    addBtn
  ]);
  emptyStateHost.appendChild(card);
}

function updateEmptyState() {
  if (!emptyStateHost) return;
  emptyStateHost.hidden = scene.layers.length > 0;
}

// ---- Map ---------------------------------------------------------------

function initMap() {
  if (typeof maplibregl === 'undefined') {
    mapHost.innerHTML = '';
    mapHost.appendChild(el('div', { class: 'pb-card pb-card--padded' }, [
      el('div', { class: 'empty-state-title' }, 'Map library not loaded'),
      el('div', { class: 'empty-state-description' }, 'MapLibre GL JS is unavailable.')
    ]));
    return;
  }
  map = new maplibregl.Map({
    container: mapHost,
    style: CARTO_POSITRON,
    center: [8.54, 47.37],
    zoom: 9,
    attributionControl: true
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  map.on('click', handleMapClick);
  // Footer readouts bind after a tick so `map` is populated.
  setTimeout(renderFooter, 0);
}

function handleMapClick(e) {
  if (!map || destroyed || !scene) return;
  // Hit-test every layer in render order (top first).
  const hitLayerIds = [];
  for (const l of scene.layers) {
    if (!l.visible) continue;
    for (const id of l.layerIds || []) hitLayerIds.push({ id, layer: l });
  }
  if (!hitLayerIds.length) return;
  const hits = map.queryRenderedFeatures(e.point, { layers: hitLayerIds.map((h) => h.id) });
  if (!hits || !hits.length) return;
  const hit = hits[0];
  const hitId = hit.layer?.id;
  const owning = hitLayerIds.find((h) => h.id === hitId);
  if (!owning) return;
  const layerEntry = owning.layer;
  const featureId = hit.id ?? hit.properties?.__id;
  scene.selectedFeature = {
    layerName: layerEntry.name,
    id: featureId,
    geometry: hit.geometry,
    properties: { ...(hit.properties || {}) }
  };
  openInspector();
}

// ---- Layer loading -----------------------------------------------------

async function loadLayersByName(names) {
  for (const name of names) {
    // eslint-disable-next-line no-await-in-loop
    await addExistingLayer(name, { silent: true });
  }
}

async function addExistingLayer(name, { silent } = {}) {
  if (!map) return;
  if (scene.layers.some((l) => l.name === name)) return;
  let layer;
  try { layer = await api.getLayer(name); }
  catch (err) {
    console.error('[map-scene] getLayer failed', err);
    if (!silent) toast(`Failed to load "${name}"`, 'error');
    return;
  }
  let features = [];
  try {
    const res = await api.listFeatures(name, { limit: -1 });
    features = res.features || [];
  } catch (err) {
    console.error('[map-scene] listFeatures failed', err);
  }

  const fc = toFeatureCollection(features);
  const sourceId = `pb-scene-src-${sanitize(name)}`;
  const layerIds = [];

  // Wait for style load on fresh maps; otherwise add immediately.
  const doAdd = () => {
    if (destroyed || !map) return;
    try {
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    } catch {}
    map.addSource(sourceId, { type: 'geojson', data: fc });

    const gt = layer.geometry_type;
    if (gt === 'Point' || gt === 'MultiPoint') {
      const id = `${sourceId}-points`;
      map.addLayer({
        id, type: 'circle', source: sourceId,
        paint: {
          'circle-radius': 6,
          'circle-color': BRAND,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5
        }
      });
      layerIds.push(id);
    } else if (gt === 'LineString' || gt === 'MultiLineString') {
      const id = `${sourceId}-lines`;
      map.addLayer({
        id, type: 'line', source: sourceId,
        paint: { 'line-color': BRAND, 'line-width': 2 }
      });
      layerIds.push(id);
    } else if (gt === 'Polygon' || gt === 'MultiPolygon') {
      const fillId = `${sourceId}-fill`;
      const lineId = `${sourceId}-line`;
      map.addLayer({
        id: fillId, type: 'fill', source: sourceId,
        paint: { 'fill-color': BRAND, 'fill-opacity': 0.3 }
      });
      map.addLayer({
        id: lineId, type: 'line', source: sourceId,
        paint: { 'line-color': BRAND, 'line-width': 1.5 }
      });
      layerIds.push(fillId, lineId);
    }
  };

  if (map.isStyleLoaded()) doAdd();
  else map.once('load', doAdd);

  const bounds = computeBbox(fc);
  scene.layers.unshift({
    name,
    title: layer.title || name,
    visible: true,
    geometry_type: layer.geometry_type,
    sourceId,
    layerIds,
    featureCount: features.length,
    bounds,
    columns: layer.columns || []
  });
  scene.dirty = true;
  refreshSubtitle();
  updateEmptyState();
  layerManagerMod?.refresh?.();
}

// ---- Handlers passed to layer-manager ---------------------------------

function handleLayerToggle(name, nextVisible) {
  const entry = scene.layers.find((l) => l.name === name);
  if (!entry || !map) return;
  entry.visible = nextVisible;
  const vis = nextVisible ? 'visible' : 'none';
  for (const id of entry.layerIds || []) {
    try { map.setLayoutProperty(id, 'visibility', vis); }
    catch (err) { console.warn('[map-scene] visibility toggle failed', err); }
  }
  scene.dirty = true;
  refreshSubtitle();
}

function handleLayerReorder() {
  // Not wired for real drag — toast only. The stub is in layer-manager.
  toast('Reorder — coming soon', 'info');
}

async function handleLayerRemove(name) {
  const entry = scene.layers.find((l) => l.name === name);
  if (!entry) return;
  const ok = await confirmModal({
    title: 'Remove layer from scene?',
    message: `"${entry.title}" will be removed from the scene. The underlying layer is not deleted.`,
    confirmLabel: 'Remove'
  });
  if (!ok) return;
  if (map) {
    for (const id of entry.layerIds || []) {
      try { if (map.getLayer(id)) map.removeLayer(id); } catch {}
    }
    try { if (map.getSource(entry.sourceId)) map.removeSource(entry.sourceId); } catch {}
  }
  scene.layers = scene.layers.filter((l) => l.name !== name);
  if (scene.selectedFeature?.layerName === name) closeInspector();
  scene.dirty = true;
  refreshSubtitle();
  updateEmptyState();
  layerManagerMod?.refresh?.();
  toast(`Removed "${entry.title}"`, 'success');
}

function handleLayerZoom(name) {
  const entry = scene.layers.find((l) => l.name === name);
  if (!entry || !map) return;
  if (!entry.bounds) {
    toast('No geometry to zoom to', 'info');
    return;
  }
  const [w, s, e, n] = entry.bounds;
  try {
    if (w === e && s === n) map.jumpTo({ center: [w, s], zoom: 14 });
    else map.fitBounds([[w, s], [e, n]], { padding: 60, maxZoom: 16, duration: 400 });
  } catch (err) {
    console.warn('[map-scene] fitBounds failed', err);
  }
}

function handleBasemapChange(id) {
  const bm = BASEMAPS[id];
  if (!bm) return;
  scene.basemap = id;
  if (bm.style) {
    // Real style swap. Preserve our sources/layers by re-adding on `idle`.
    // Per repo memory: only `idle` fires reliably after setStyle().
    const layersSnapshot = scene.layers.slice();
    try { map.setStyle(bm.style); }
    catch (err) { console.error('[map-scene] setStyle', err); }
    const rebind = () => {
      if (destroyed || !map) return;
      map.off('idle', rebind);
      // Re-add every scene layer against the new style.
      for (const entry of layersSnapshot) {
        reAddLayerToStyle(entry);
      }
    };
    map.on('idle', rebind);
  } else if (bm.cosmetic) {
    toast('Basemap not reachable in prototype — toggled cosmetically', 'info');
  }
  scene.dirty = true;
  refreshSubtitle();
  layerManagerMod?.refresh?.();
}

/** Re-attach a scene layer's source/layers after a basemap setStyle(). */
function reAddLayerToStyle(entry) {
  if (!map) return;
  // Pull the geometry back off the api and rebuild. Cheap for the prototype.
  api.listFeatures(entry.name, { limit: -1 }).then((res) => {
    if (destroyed || !map) return;
    const fc = toFeatureCollection(res.features || []);
    try { if (map.getSource(entry.sourceId)) map.removeSource(entry.sourceId); } catch {}
    try { map.addSource(entry.sourceId, { type: 'geojson', data: fc }); } catch (err) { console.warn(err); return; }
    const gt = entry.geometry_type;
    const vis = entry.visible ? 'visible' : 'none';
    if (gt === 'Point' || gt === 'MultiPoint') {
      const id = `${entry.sourceId}-points`;
      map.addLayer({
        id, type: 'circle', source: entry.sourceId,
        layout: { visibility: vis },
        paint: { 'circle-radius': 6, 'circle-color': BRAND, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 }
      });
      entry.layerIds = [id];
    } else if (gt === 'LineString' || gt === 'MultiLineString') {
      const id = `${entry.sourceId}-lines`;
      map.addLayer({ id, type: 'line', source: entry.sourceId, layout: { visibility: vis }, paint: { 'line-color': BRAND, 'line-width': 2 } });
      entry.layerIds = [id];
    } else if (gt === 'Polygon' || gt === 'MultiPolygon') {
      const fillId = `${entry.sourceId}-fill`;
      const lineId = `${entry.sourceId}-line`;
      map.addLayer({ id: fillId, type: 'fill', source: entry.sourceId, layout: { visibility: vis }, paint: { 'fill-color': BRAND, 'fill-opacity': 0.3 } });
      map.addLayer({ id: lineId, type: 'line', source: entry.sourceId, layout: { visibility: vis }, paint: { 'line-color': BRAND, 'line-width': 1.5 } });
      entry.layerIds = [fillId, lineId];
    }
  }).catch((err) => console.warn('[map-scene] re-add failed', err));
}

function handleEditModeToggle(next) {
  scene.editMode = !!next;
  if (toolbarHost) toolbarHost.hidden = !scene.editMode;
  if (featureInspectorMod && scene.selectedFeature) {
    // Re-render the inspector in the new edit-mode state.
    featureInspectorMod.setEditMode?.(scene.editMode);
  }
  toast(scene.editMode ? 'Edit mode on' : 'Edit mode off', 'info');
}

function handleAddLayer(opts) {
  if (opts.source === 'upload') {
    toast('Upload file — coming soon', 'info');
    return;
  }
  if (opts.source === 'draw') {
    toast('Draw new layer — coming soon', 'info');
    return;
  }
  if (opts.source === 'existing') {
    const names = Array.isArray(opts.layerNames) ? opts.layerNames : [];
    if (!names.length) {
      openAddExistingPicker();
      return;
    }
    (async () => {
      for (const n of names) {
        // eslint-disable-next-line no-await-in-loop
        await addExistingLayer(n);
      }
      toast(`Added ${names.length} layer${names.length === 1 ? '' : 's'}`, 'success');
    })();
  }
}

// ---- "Add existing" picker modal ---------------------------------------

async function openAddExistingPicker() {
  let allLayers = [];
  try { allLayers = await api.listLayers(); }
  catch (err) { console.error(err); toast('Failed to load layers', 'error'); return; }

  const taken = new Set(scene.layers.map((l) => l.name));
  const available = allLayers.filter((l) => !taken.has(l.name));

  const checks = new Map();
  const rows = available.length
    ? available.map((l) => {
      const cb = el('input', { type: 'checkbox', 'aria-label': `Select ${l.name}` });
      checks.set(l.name, cb);
      return el('label', { class: 'pb-scene-picker-row' }, [
        cb,
        el('span', { class: 'material-symbols-outlined pb-scene-picker-geom' }, geomTypeIcon(l.geometry_type)),
        el('div', { class: 'pb-scene-picker-body' }, [
          el('div', { class: 'pb-scene-picker-title' }, l.title || l.name),
          el('div', { class: 'pb-scene-picker-sub' }, `${(l.feature_count || 0).toLocaleString()} record${l.feature_count === 1 ? '' : 's'} · ${l.geometry_type}`)
        ])
      ]);
    })
    : [el('div', { class: 'pb-muted', style: { padding: 'var(--space-4)' } },
        allLayers.length ? 'All existing layers are already in the scene.' : 'No layers exist yet. Create one from the Layers tab.')];

  const cancelBtn = el('button', { type: 'button', class: 'btn-secondary' }, 'Cancel');
  const addBtn = el('button', { type: 'button', class: 'btn-primary' }, 'Add selected');
  cancelBtn.addEventListener('click', () => closeModal());
  addBtn.addEventListener('click', () => {
    const picked = [];
    for (const [name, cb] of checks.entries()) if (cb.checked) picked.push(name);
    closeModal();
    if (picked.length) handleAddLayer({ source: 'existing', layerNames: picked });
  });

  openModal(el('div', { class: 'pb-scene-picker' }, [
    el('div', { class: 'pb-modal-header' }, 'Add from existing layers'),
    el('div', { class: 'pb-modal-body pb-scene-picker-body-host' }, rows),
    el('div', { class: 'pb-modal-footer' }, [cancelBtn, addBtn])
  ]));
}

// ---- Inspector ---------------------------------------------------------

function openInspector() {
  if (!inspectorHost || !scene.selectedFeature) return;
  const layerEntry = scene.layers.find((l) => l.name === scene.selectedFeature.layerName);
  if (!layerEntry) return;

  if (!featureInspectorMod) {
    featureInspectorMod = featureInspector;
    featureInspector.mount(inspectorHost, {
      feature: scene.selectedFeature,
      layer: layerEntry,
      editMode: scene.editMode,
      onClose: closeInspector,
      onSave: (patch) => {
        toast('Attribute save — coming soon', 'info');
        return Promise.resolve();
      }
    });
  } else {
    featureInspectorMod.setFeature?.(scene.selectedFeature, layerEntry);
    featureInspectorMod.setEditMode?.(scene.editMode);
  }
  inspectorHost.classList.add('pb-scene-inspector--open');
}

function closeInspector() {
  if (!inspectorHost) return;
  inspectorHost.classList.remove('pb-scene-inspector--open');
  scene.selectedFeature = null;
}

// ---- helpers -----------------------------------------------------------

function sanitize(s) {
  return String(s || '').replace(/[^a-z0-9_-]/gi, '_');
}

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
