// prototype-backend — Layers catalogue (#/features)
//
// Gallery + list views of the layer inventory. Replaces the old sidebar-
// driven landing page. Clicking a card/row navigates into the layer detail
// view. The `+ New layer` button opens the existing new-feature-drawer.

import * as api from './api.js';
import { el, relativeTimeNode } from './utils.js';
import { renderViewHeader } from './app.js';
import { mountCatalogue } from './catalogue.js';
import { paintExtentMap, extentThumbnail } from './extent-map.js';
import { open as openNewFeatureDrawer } from './new-feature-drawer.js';
import { buildNewButton } from './new-button.js';
import { bus, isAllowed } from './state.js';
import { geomTypeIcon } from './constants.js';

const ROLE_GATED_TITLE = 'Requires editor or admin role';

let root = null;
let catalogueBody = null;
let catalogueCtl = null;
let layers = [];
let busUnsub = [];

export async function mount(container, params = {}) {
  root = container;
  root.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><div class="loading-text">Loading layers…</div></div>';
  try { layers = await api.listLayers(); }
  catch { layers = []; }
  renderShell();

  // Auto-refresh on any layer-level change. Bus subscriptions are swept in
  // unmount(). `layer:updated` fires on title/description/metadata edits —
  // catalogue cards show the title and updated-at, so we re-paint.
  busUnsub.push(bus.on('layer:created', refresh));
  busUnsub.push(bus.on('layer:deleted', refresh));
  busUnsub.push(bus.on('layer:updated', refresh));

  // If the router hinted we should immediately open the New-layer drawer
  // (e.g. the legacy `#/layers/new` redirect), honour it after the shell
  // is painted.
  if (params.openNewFeature) {
    setTimeout(() => {
      try { openNewFeatureDrawer({ onCreated: refresh }); }
      catch (err) { console.error('[features-catalogue] openNewFeatureDrawer', err); }
    }, 50);
  }
}

export function unmount() {
  for (const off of busUnsub) { try { off(); } catch {} }
  busUnsub = [];
  if (catalogueCtl) { try { catalogueCtl.unmount(); } catch {} }
  catalogueCtl = null;
  catalogueBody = null;
  if (root) root.innerHTML = '';
  root = null;
  layers = [];
}

async function refresh() {
  try { layers = await api.listLayers(); }
  catch { layers = []; }
  renderShell();
}

function renderShell() {
  if (!root) return;
  root.innerHTML = '';

  root.appendChild(renderViewHeader({
    title: 'Layers',
    subtitle: `${layers.length} layer${layers.length === 1 ? '' : 's'}`,
    description: 'Each layer is a PostGIS table with a geometry column (spatial) or a plain data table (non-spatial). Used by the maps and apps in the section next door.',
    actions: buildNewButton({ onRefresh: refresh, canWrite: isAllowed('write') })
  }));

  catalogueBody = el('div', { class: 'pb-catalogue' });
  root.appendChild(catalogueBody);

  catalogueCtl = mountCatalogue(catalogueBody, {
    items: layers,
    sectionKey: 'features',
    defaultView: 'gallery',
    searchPlaceholder: 'Filter layers…',
    matchesQuery: (l, q) => (l.name || '').toLowerCase().includes(q)
      || (l.title || '').toLowerCase().includes(q)
      || (l.description || '').toLowerCase().includes(q),
    renderCard,
    renderListHeader,
    renderListRow,
    renderMapView: (host, rows) => paintExtentMap(host, rows, {
      itemLabel: (l) => l.title || l.name,
      itemHref:  (l) => `#/features/${encodeURIComponent(l.name)}`,
      itemBbox:  (l) => l.metadata?.bbox
    }),
    emptyState: {
      icon: 'layers',
      title: 'No layers yet',
      description: 'Create your first layer to start building inventories.',
      cta: isAllowed('write') ? ctaNewLayer() : null
    }
  });
}

function ctaNewLayer() {
  const b = el('button', { type: 'button', class: 'btn-primary' }, [
    el('span', { class: 'material-symbols-outlined pb-icon-sm' }, 'add'),
    ' New layer'
  ]);
  b.addEventListener('click', () => openNewFeatureDrawer({ onCreated: refresh }));
  return b;
}


function sridLabel(code) {
  const c = Number(code);
  if (c === 4326) return 'EPSG:4326 (WGS 84)';
  if (c === 2056) return 'EPSG:2056 (LV95)';
  if (!c) return '—';
  return `EPSG:${c}`;
}

function renderCard(l) {
  const href = `#/features/${encodeURIComponent(l.name)}`;
  const fc = Number(l.feature_count ?? 0);
  const isTable = l.geometry_type === 'Table';

  const badgeTokens = isTable
    ? ['Table']
    : [l.geometry_type, sridLabel(l.srid)];

  // Thumbnail: prefer a real bbox preview when the layer has one in its
  // metadata. Falls back to the geometry-type icon so non-spatial tables
  // (Table kind) still get a card chrome that reads as a layer card.
  const thumb = extentThumbnail(l.metadata?.bbox);
  const thumbNode = thumb
    ? el('div', { class: 'pb-layer-card-thumb' }, [thumb])
    : el('div', { class: 'pb-layer-card-thumb pb-layer-card-thumb--placeholder' }, [
        el('span', { class: 'material-symbols-outlined' }, geomTypeIcon(l.geometry_type))
      ]);

  return el('a', {
    href,
    class: 'pb-layer-card',
    'aria-label': l.title || l.name
  }, [
    thumbNode,
    el('div', { class: 'pb-layer-card-body' }, [
      el('div', { class: 'pb-layer-card-title' }, l.title || l.name),
      el('div', { class: 'pb-layer-card-name pb-muted' }, l.name),
      el('div', { class: 'pb-layer-card-meta' }, badgeTokens.join(' · ')),
      el('div', { class: 'pb-layer-card-count' },
        `${fc.toLocaleString()} record${fc === 1 ? '' : 's'}`),
      l.updated_at
        ? el('div', { class: 'pb-muted pb-layer-card-updated' },
            ['Updated ', relativeTimeNode(l.updated_at)])
        : null
    ].filter(Boolean))
  ]);
}

function renderListHeader() {
  return el('tr', {}, [
    el('th', {}, 'Name'),
    el('th', {}, 'Title'),
    el('th', { style: { width: '120px' } }, 'Type'),
    el('th', { style: { width: '110px' } }, 'Records'),
    el('th', { style: { width: '160px' } }, 'SRID'),
    el('th', { style: { width: '140px' } }, 'Updated')
  ]);
}

function renderListRow(l) {
  const href = `#/features/${encodeURIComponent(l.name)}`;
  const fc = Number(l.feature_count ?? 0);
  const tr = el('tr', { class: 'pb-catalogue-row', dataset: { name: l.name } }, [
    el('td', {}, [
      el('a', { href, class: 'pb-catalogue-row-name pb-name-mono' }, l.name)
    ]),
    el('td', {}, l.title || el('span', { class: 'pb-muted' }, '—')),
    el('td', {}, [
      el('span', { class: 'pb-badge' }, l.geometry_type)
    ]),
    el('td', {}, fc.toLocaleString()),
    el('td', {}, l.geometry_type === 'Table'
      ? el('span', { class: 'pb-muted' }, '—')
      : sridLabel(l.srid)),
    el('td', {}, l.updated_at
      ? relativeTimeNode(l.updated_at)
      : el('span', { class: 'pb-muted' }, '—'))
  ]);
  tr.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    location.hash = href;
  });
  return tr;
}
