// prototype-backend — Scene layer manager (left sidebar of the scene viewer).
//
// Render order (top to bottom):
//   - Section header "Layers" + "+ Add ▾" dropdown
//   - Search input (filters the rendered list)
//   - Layer list (drag-handle cosmetic, visibility cb, geom icon, name + sublabel, overflow)
//   - Divider
//   - Section header "Basemap" + 4 radio options
//   - Divider
//   - Edit-mode toggle
//
// Every interactive control either toasts "coming soon" or calls a
// callback provided by map-scene.js. No direct map/api access here.

import { el, toast } from './utils.js';

const GEOM_ICONS = {
  Point: 'location_on',
  MultiPoint: 'location_on',
  LineString: 'trending_up',
  MultiLineString: 'trending_up',
  Polygon: 'hexagon',
  MultiPolygon: 'hexagon',
  Table: 'category'
};

const BASEMAPS = [
  { id: 'swisstopo-pixelkarte', label: 'Swisstopo Pixelkarte', cosmetic: true },
  { id: 'swisstopo-orthofoto',  label: 'Swisstopo Orthofoto',  cosmetic: true },
  { id: 'osm',                  label: 'OpenStreetMap',        cosmetic: false },
  { id: 'none',                 label: 'None',                 cosmetic: true }
];

let root = null;
let opts = null;
let searchTerm = '';
let cachedLayerPanel = null; // host for the scrollable layer list
let cachedSearchInput = null;
let cachedBasemapHint = null;
let cachedEditToggle = null;

export function mount(container, options) {
  root = container;
  opts = options || {};
  root.innerHTML = '';
  render();
}

export function unmount() {
  if (root) root.innerHTML = '';
  root = null;
  opts = null;
  cachedLayerPanel = null;
  cachedSearchInput = null;
  cachedBasemapHint = null;
  cachedEditToggle = null;
}

/** Re-render just the volatile bits (layer list) in response to scene changes. */
export function refresh() {
  if (!root) return;
  renderLayerList();
}

function render() {
  root.innerHTML = '';

  // ---- Layers section ----
  const addBtn = el('button', {
    type: 'button',
    class: 'btn-secondary pb-sidebar-new',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false'
  }, [
    el('span', { class: 'material-symbols-outlined', style: { fontSize: '14px' } }, 'add'),
    ' Add ',
    el('span', { class: 'material-symbols-outlined', style: { fontSize: '16px' } }, 'arrow_drop_down')
  ]);

  const addMenu = el('div', { class: 'pb-menu', role: 'menu', hidden: true });
  const addWrap = el('div', { class: 'pb-menu-wrap' }, [addBtn, addMenu]);
  const addMenuCtl = wireMenu(addBtn, addMenu, addWrap);
  addMenu.append(
    menuItem('layers', 'From existing layer…', () => { addMenuCtl.close(); opts.onAddLayer?.({ source: 'existing' }); }),
    menuItem('upload', 'Upload file…',         () => { addMenuCtl.close(); opts.onAddLayer?.({ source: 'upload' }); }),
    menuItem('edit',   'Draw new…',            () => { addMenuCtl.close(); opts.onAddLayer?.({ source: 'draw' }); })
  );

  const layersHeader = el('div', { class: 'pb-scene-section-header-row' }, [
    el('span', { class: 'pb-scene-section-header' }, 'Layers'),
    addWrap
  ]);
  root.appendChild(layersHeader);

  // Search
  cachedSearchInput = el('input', {
    type: 'search',
    class: 'pb-scene-search-input',
    placeholder: 'Search layers…',
    'aria-label': 'Search layers'
  });
  cachedSearchInput.addEventListener('input', () => {
    searchTerm = cachedSearchInput.value.trim().toLowerCase();
    renderLayerList();
  });
  const searchWrap = el('div', { class: 'pb-scene-search' }, [cachedSearchInput]);
  root.appendChild(searchWrap);

  cachedLayerPanel = el('div', { class: 'pb-scene-layer-list' });
  root.appendChild(cachedLayerPanel);
  renderLayerList();

  // ---- Basemap section ----
  root.appendChild(el('div', { class: 'pb-scene-divider' }));
  root.appendChild(el('div', { class: 'pb-scene-section-header' }, 'Basemap'));

  const currentBasemap = opts.scene?.basemap || 'swisstopo-pixelkarte';
  const basemapHost = el('div', { class: 'pb-scene-basemap-list' });
  for (const bm of BASEMAPS) {
    const radio = el('input', {
      type: 'radio',
      name: 'pb-scene-basemap',
      value: bm.id,
      checked: bm.id === currentBasemap ? true : undefined
    });
    radio.addEventListener('change', () => {
      if (radio.checked) opts.onBasemapChange?.(bm.id);
      syncBasemapHint();
    });
    const row = el('label', { class: 'pb-scene-basemap-row' }, [
      radio,
      el('span', { class: 'pb-scene-basemap-label' }, bm.label)
    ]);
    basemapHost.appendChild(row);
  }
  root.appendChild(basemapHost);

  cachedBasemapHint = el('div', { class: 'pb-scene-basemap-hint', hidden: true },
    'Basemap tiles not reachable — preview only');
  root.appendChild(cachedBasemapHint);
  syncBasemapHint();

  // ---- Edit mode toggle ----
  root.appendChild(el('div', { class: 'pb-scene-divider' }));
  cachedEditToggle = el('button', {
    type: 'button',
    class: 'pb-scene-edit-toggle',
    'aria-pressed': opts.scene?.editMode ? 'true' : 'false'
  }, [
    el('span', { class: 'material-symbols-outlined', style: { fontSize: '16px' } }, 'edit'),
    ' Edit mode'
  ]);
  cachedEditToggle.addEventListener('click', () => {
    const next = cachedEditToggle.getAttribute('aria-pressed') !== 'true';
    cachedEditToggle.setAttribute('aria-pressed', next ? 'true' : 'false');
    opts.onEditModeToggle?.(next);
  });
  root.appendChild(cachedEditToggle);
}

function renderLayerList() {
  if (!cachedLayerPanel || !opts) return;
  cachedLayerPanel.innerHTML = '';
  const layers = opts.scene?.layers || [];
  const filtered = searchTerm
    ? layers.filter((l) => (l.title || l.name || '').toLowerCase().includes(searchTerm)
                       || (l.name || '').toLowerCase().includes(searchTerm))
    : layers;

  if (!filtered.length) {
    cachedLayerPanel.appendChild(el('div', { class: 'pb-scene-layer-empty' },
      layers.length === 0
        ? 'No layers yet. Click Add to get started.'
        : 'No layers match your search.'
    ));
    return;
  }

  for (const layer of filtered) {
    cachedLayerPanel.appendChild(renderLayerRow(layer));
  }
}

function renderLayerRow(layer) {
  const dragHandle = el('button', {
    type: 'button',
    class: 'pb-scene-layer-drag',
    'aria-label': 'Reorder (not implemented)',
    title: 'Reorder — coming soon'
  }, [el('span', { class: 'material-symbols-outlined' }, 'drag_indicator')]);
  dragHandle.addEventListener('click', () => {
    opts.onLayerReorder?.(layer.name);
  });

  const vizCheckbox = el('input', {
    type: 'checkbox',
    class: 'pb-scene-layer-viz',
    checked: layer.visible ? true : undefined,
    'aria-label': `Toggle visibility of ${layer.title || layer.name}`
  });
  vizCheckbox.addEventListener('change', () => {
    opts.onLayerToggle?.(layer.name, vizCheckbox.checked);
  });

  const geomIcon = el('span', {
    class: 'material-symbols-outlined pb-scene-layer-geom',
    'aria-hidden': 'true'
  }, GEOM_ICONS[layer.geometry_type] || 'category');

  const body = el('div', { class: 'pb-scene-layer-row-body' }, [
    el('div', { class: 'pb-scene-layer-title' }, layer.title || layer.name),
    el('div', { class: 'pb-scene-layer-sub' },
      `${(layer.featureCount || 0).toLocaleString()} record${layer.featureCount === 1 ? '' : 's'} · ${layer.geometry_type}`)
  ]);

  // Overflow popover
  const overflowBtn = el('button', {
    type: 'button',
    class: 'pb-scene-layer-overflow',
    'aria-label': 'Layer actions',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false'
  }, [el('span', { class: 'material-symbols-outlined' }, 'more_vert')]);
  const overflowMenu = el('div', { class: 'pb-menu pb-menu--compact', role: 'menu', hidden: true });
  const overflowWrap = el('div', { class: 'pb-menu-wrap' }, [overflowBtn, overflowMenu]);
  const overflowCtl = wireMenu(overflowBtn, overflowMenu, overflowWrap);
  overflowMenu.append(
    menuItem('my_location', 'Zoom to layer', () => { overflowCtl.close(); opts.onLayerZoom?.(layer.name); }),
    menuItem('tune',        'Properties…',   () => { overflowCtl.close(); toast('Layer properties — coming soon', 'info'); }),
    menuItem('delete',      'Remove from scene', () => { overflowCtl.close(); opts.onLayerRemove?.(layer.name); })
  );

  return el('div', { class: 'pb-scene-layer-row', dataset: { layerName: layer.name } }, [
    dragHandle,
    vizCheckbox,
    geomIcon,
    body,
    overflowWrap
  ]);
}

function syncBasemapHint() {
  if (!cachedBasemapHint || !opts) return;
  const id = opts.scene?.basemap || 'swisstopo-pixelkarte';
  const bm = BASEMAPS.find((b) => b.id === id);
  cachedBasemapHint.hidden = !(bm && bm.cosmetic);
}

// ---- Menu helpers ------------------------------------------------------

function menuItem(icon, label, onClick) {
  const b = el('button', { type: 'button', class: 'pb-menu-item', role: 'menuitem' }, [
    el('span', { class: 'material-symbols-outlined' }, icon),
    el('span', {}, label)
  ]);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

/**
 * Wire open/close behavior onto a trigger button + .pb-menu pair.
 * Returns `{ close }` so callers (menu items) can programmatically close
 * the menu while ensuring the document-level click/Esc listeners are
 * detached cleanly.
 */
function wireMenu(button, menu, wrap) {
  let onOutside = null;
  let onEscape = null;
  const close = () => {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (onOutside) document.removeEventListener('click', onOutside, true);
    if (onEscape) document.removeEventListener('keydown', onEscape);
    onOutside = onEscape = null;
  };
  const open = () => {
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    onOutside = (e) => { if (!wrap.contains(e.target)) close(); };
    onEscape = (e) => { if (e.key === 'Escape') { close(); button.focus(); } };
    document.addEventListener('click', onOutside, true);
    document.addEventListener('keydown', onEscape);
  };
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.hidden) open(); else close();
  });
  return { close, open };
}
