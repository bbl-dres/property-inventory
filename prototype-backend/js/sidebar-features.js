// prototype-backend — Layers object sidebar.
// Search + "New layer" + scrollable list. Supports delete via row action.
//
// Note on terminology: internal code still uses `layer` / `layers` identifiers
// (mock API method names, bus event keys, storage keys) to keep the
// Supabase-swap contract stable. UI copy says "layer(s)" everywhere.

import * as api from './api.js';
import { bus, isAllowed } from './state.js';
import { el, debounce, confirmModal, toast } from './utils.js';
import { open as openNewFeatureDrawer } from './new-feature-drawer.js';

const ROLE_GATED_TITLE = 'Requires editor or admin role';

let root = null;
let layers = [];
let searchValue = '';
let activeKey = null;
let unsubs = [];

export function mount(container, { activeKey: ak } = {}) {
  root = container;
  activeKey = ak || null;
  root.innerHTML = '';
  renderShell();
  refresh();

  unsubs.push(bus.on('layer:created', async ({ name } = {}) => {
    await refresh();
    if (name) location.hash = `#/features/${encodeURIComponent(name)}`;
  }));
  unsubs.push(bus.on('layer:deleted', refresh));
  unsubs.push(bus.on('layer:updated', refresh));
  // Re-paint shell (header button + row delete buttons) when role flips.
  unsubs.push(bus.on('user:role-changed', () => {
    if (!root) return;
    root.innerHTML = '';
    renderShell();
    renderList();
  }));
}

export function unmount() {
  for (const off of unsubs) { try { off(); } catch {} }
  unsubs = [];
  if (root) root.innerHTML = '';
  root = null;
  layers = [];
  searchValue = '';
  activeKey = null;
}

export function setActive(key) {
  activeKey = key || null;
  renderList();
}

function renderShell() {
  const header = el('div', { class: 'pb-sidebar-header' }, [
    el('div', { class: 'pb-sidebar-title' }, 'Layers'),
    (() => {
      const canWrite = isAllowed('write');
      const btn = el('button', {
        type: 'button',
        class: 'btn-primary pb-sidebar-new',
        disabled: !canWrite ? true : false,
        title: canWrite ? 'New layer' : ROLE_GATED_TITLE
      }, [
        el('span', { class: 'material-symbols-outlined', style: { fontSize: '16px' } }, 'add'),
        ' New'
      ]);
      btn.addEventListener('click', () => openNewFeatureDrawer());
      return btn;
    })()
  ]);

  const searchBox = el('div', { class: 'pb-sidebar-search' }, [
    el('span', { class: 'material-symbols-outlined' }, 'search'),
    el('input', { type: 'search', placeholder: 'Search layers…', 'aria-label': 'Search layers', value: searchValue })
  ]);
  const searchInput = searchBox.querySelector('input');
  searchInput.addEventListener('input', debounce((e) => {
    searchValue = e.target.value;
    renderList();
  }, 120));

  const list = el('div', { class: 'pb-sidebar-list', id: 'pb-sidebar-features-list' });

  // Phase-2 UX: search is the first interactive element. The title + "New"
  // header sits *below* the search; the scrollable list goes last.
  root.appendChild(searchBox);
  root.appendChild(header);
  root.appendChild(list);
}

async function refresh() {
  try {
    layers = await api.listLayers();
  } catch (err) {
    console.error(err);
    layers = [];
    // Surface the failure — auto-refresh paths (boot, bus-driven) otherwise
    // swallow real network errors silently when the real Supabase adapter
    // replaces the in-browser mock.
    toast(err?.message || 'Failed to refresh layers', 'error');
  }
  renderList();
}

function renderList() {
  if (!root) return;
  const host = root.querySelector('#pb-sidebar-features-list');
  if (!host) return;
  host.innerHTML = '';

  const q = searchValue.trim().toLowerCase();
  const filtered = q
    ? layers.filter((l) =>
        l.name.toLowerCase().includes(q) ||
        (l.title || '').toLowerCase().includes(q))
    : layers;

  if (!filtered.length) {
    host.appendChild(el('div', { class: 'pb-sidebar-empty' },
      layers.length ? `No matches for "${searchValue}"` : 'No layers yet. Click + New.'
    ));
    return;
  }

  for (const l of filtered) {
    host.appendChild(buildItem(l));
  }
}

function buildItem(layer) {
  const isActive = layer.name === activeKey;
  const canWrite = isAllowed('write');
  const deleteBtn = el('button', {
    type: 'button',
    class: 'pb-sidebar-item-action',
    disabled: !canWrite ? true : false,
    title: canWrite ? `Delete ${layer.name}` : ROLE_GATED_TITLE,
    'aria-label': `Delete ${layer.name}`,
    dataset: { role: 'delete' }
  }, [el('span', { class: 'material-symbols-outlined' }, 'delete')]);

  const recordCount = Number(layer.feature_count ?? 0);
  const item = el('a', {
    href: `#/features/${encodeURIComponent(layer.name)}`,
    class: 'pb-sidebar-item' + (isActive ? ' is-active' : ''),
    dataset: { key: layer.name }
  }, [
    el('span', { class: 'material-symbols-outlined pb-sidebar-item-icon' },
      layer.geometry_type === 'Table' ? 'table_chart'
        : layer.geometry_type === 'Point' ? 'location_on'
        : 'hexagon'
    ),
    el('div', { class: 'pb-sidebar-item-body' }, [
      el('div', { class: 'pb-sidebar-item-title' }, layer.title || layer.name),
      el('div', { class: 'pb-sidebar-item-sub' }, [
        el('span', { class: 'pb-badge-type' }, layer.geometry_type),
        ' · ',
        `${recordCount.toLocaleString()} record${recordCount === 1 ? '' : 's'}`
      ])
    ]),
    deleteBtn
  ]);

  item.addEventListener('click', async (e) => {
    if (e.target.closest('[data-role="delete"]')) {
      e.preventDefault();
      e.stopPropagation();
      await handleDelete(layer);
    }
  });

  return item;
}

async function handleDelete(layer) {
  const ok = await confirmModal({
    title: `Delete layer "${layer.name}"?`,
    message: 'This will permanently remove the layer and all its records. This cannot be undone.',
    requireText: layer.name,
    confirmLabel: 'Delete layer',
    danger: true
  });
  if (!ok) return;
  try {
    await api.deleteLayer(layer.name);
    toast(`Deleted "${layer.name}"`, 'success');
    bus.emit('layer:deleted', { name: layer.name });
  } catch (err) {
    console.error(err);
    toast(err.message || 'Delete failed', 'error');
  }
}
