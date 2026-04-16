// prototype-backend — Maps & Apps catalogue (#/maps)
//
// Gallery + list views of map & app cards. Clicking a card navigates to
// the maps-detail view. Uses the shared `mountCatalogue` primitive from
// catalogue.js to keep the same shape as the Layers catalogue.
//
// Note: the API layer still exposes `listProducts` / `createProduct` etc.
// The underlying entity is an umbrella type covering both maps (authored
// scenes) and apps (registered external tools). Only the URL, the route
// name, and the section key were renamed to `maps` — the data model
// keeps the `product` name to match the future Supabase table.

import * as api from './api.js';
import { el, formatRelativeTime } from './utils.js';
import { renderViewHeader } from './app.js';
import { mountCatalogue } from './catalogue.js';
import { paintExtentMap } from './extent-map.js';
import { buildNewButton } from './new-button.js';

let root = null;
let catalogueBody = null;
let catalogueCtl = null;
let products = [];

export async function mount(container) {
  root = container;
  root.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><div class="loading-text">Loading…</div></div>';
  try { products = await api.listProducts(); }
  catch { products = []; }
  renderShell();
}

export function unmount() {
  if (catalogueCtl) { try { catalogueCtl.unmount(); } catch {} }
  catalogueCtl = null;
  catalogueBody = null;
  if (root) root.innerHTML = '';
  root = null;
  products = [];
}

function renderShell() {
  if (!root) return;
  root.innerHTML = '';

  root.appendChild(renderViewHeader({
    title: 'Maps & Apps',
    subtitle: `${products.length} item${products.length === 1 ? '' : 's'}`,
    description: 'Maps & Apps are downstream apps, dashboards, and viewers that consume your layers.',
    actions: buildNewButton({ onRefresh: refreshList })
  }));

  catalogueBody = el('div', { class: 'pb-catalogue' });
  root.appendChild(catalogueBody);

  catalogueCtl = mountCatalogue(catalogueBody, {
    items: products,
    sectionKey: 'maps',
    defaultView: 'gallery',
    searchPlaceholder: 'Search maps & apps…',
    matchesQuery: (p, q) => (p.name || '').toLowerCase().includes(q)
      || (p.slug || '').toLowerCase().includes(q)
      || (p.description || '').toLowerCase().includes(q),
    renderCard,
    renderListHeader,
    renderListRow,
    renderMapView: (host, rows) => paintExtentMap(host, rows, {
      itemLabel: (p) => p.name || p.slug,
      itemHref:  (p) => `#/maps/${encodeURIComponent(p.slug)}`,
      itemBbox:  (p) => p.bbox
    }),
    emptyState: {
      icon: 'apps',
      title: 'No maps or apps yet',
      description: 'Maps & Apps are downstream apps, dashboards, and viewers that consume your layers.'
    }
  });
}

async function refreshList() {
  try { products = await api.listProducts(); }
  catch { products = []; }
  // Refresh both the subtitle count and the catalogue body.
  renderShell();
}

function renderCard(p) {
  const href = `#/maps/${encodeURIComponent(p.slug)}`;
  const count = (p.consumed_layers || []).length;

  const thumb = p.thumbnail
    ? el('img', { class: 'pb-product-card-thumb', src: p.thumbnail, alt: '' })
    : el('div', { class: 'pb-product-card-thumb pb-product-card-thumb--placeholder' }, [
        el('span', { class: 'material-symbols-outlined' }, 'apps')
      ]);

  return el('a', {
    href,
    class: 'pb-product-card',
    'aria-label': p.name || p.slug
  }, [
    thumb,
    el('div', { class: 'pb-product-card-body' }, [
      el('div', { class: 'pb-product-card-titlebar' }, [
        el('h3', { class: 'pb-product-card-title' }, p.name || p.slug),
        el('span', { class: `pb-status pb-status--${p.status || 'staging'}` }, p.status || 'staging')
      ]),
      el('p', { class: 'pb-product-card-desc' }, p.description || ''),
      el('div', { class: 'pb-product-card-foot' }, [
        el('span', { class: 'pb-muted pb-card-foot-meta' },
          `${count} layer${count === 1 ? '' : 's'}`)
      ])
    ])
  ]);
}

function renderListHeader() {
  return el('tr', {}, [
    el('th', {}, 'Name'),
    el('th', { style: { width: '110px' } }, 'Status'),
    el('th', { style: { width: '80px' } }, 'Kind'),
    el('th', { style: { width: '90px' } }, 'Layers'),
    el('th', {}, 'Owner'),
    el('th', { style: { width: '140px' } }, 'Updated')
  ]);
}

function renderListRow(p) {
  const href = `#/maps/${encodeURIComponent(p.slug)}`;
  const layerCount = (p.consumed_layers || []).length;
  const tr = el('tr', { class: 'pb-catalogue-row', dataset: { slug: p.slug } }, [
    el('td', {}, [
      el('a', { href, class: 'pb-catalogue-row-name' }, p.name || p.slug)
    ]),
    el('td', {}, [
      el('span', { class: `pb-status pb-status--${p.status || 'staging'}` }, p.status || 'staging')
    ]),
    el('td', {}, p.kind || 'app'),
    el('td', {}, `${layerCount}`),
    el('td', {}, p.owner || el('span', { class: 'pb-muted' }, '—')),
    el('td', {}, p.last_deployed_at
      ? formatRelativeTime(p.last_deployed_at)
      : el('span', { class: 'pb-muted' }, '—'))
  ]);
  tr.addEventListener('click', (e) => {
    // The name cell is a real anchor already — don't double-navigate on nested clicks.
    if (e.target.closest('a')) return;
    location.hash = href;
  });
  return tr;
}
