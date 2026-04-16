// prototype-backend — Maps & Apps catalogue (#/products)
//
// Gallery + list views of product cards. Clicking a card navigates to the
// product detail view. Uses the shared `mountCatalogue` primitive from
// catalogue.js to keep the same shape as the Layers catalogue.

import * as api from './api.js';
import { el, toast, wireMenu, formatRelativeTime } from './utils.js';
import { renderViewHeader } from './app.js';
import { mountCatalogue } from './catalogue.js';

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
    actions: buildNewButton()
  }));

  catalogueBody = el('div', { class: 'pb-catalogue' });
  root.appendChild(catalogueBody);

  catalogueCtl = mountCatalogue(catalogueBody, {
    items: products,
    sectionKey: 'products',
    defaultView: 'gallery',
    searchPlaceholder: 'Search maps & apps…',
    matchesQuery: (p, q) => (p.name || '').toLowerCase().includes(q)
      || (p.slug || '').toLowerCase().includes(q)
      || (p.description || '').toLowerCase().includes(q),
    renderCard,
    renderListHeader,
    renderListRow,
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

function buildNewButton() {
  // "+ New ▾" dropdown — splits creation into three kinds.
  const newBtn = el('button', {
    type: 'button',
    class: 'btn-primary',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
    title: 'New map or app'
  }, [
    el('span', { class: 'material-symbols-outlined pb-icon-sm' }, 'add'),
    ' New ',
    el('span', { class: 'material-symbols-outlined pb-icon-md' }, 'arrow_drop_down')
  ]);

  const openModalFor = async (kind) => {
    const mod = await import('./new-product-modal.js');
    mod.open({
      kind,
      onCreated: async (created) => {
        // A new map drops the user straight into the scene viewer so they
        // can start authoring. Registered apps stay on the gallery.
        if (kind === 'map') {
          location.hash = `#/products/${encodeURIComponent(created.slug)}`;
        } else {
          await refreshList();
        }
      }
    });
  };

  // Shortcut: upload a file, which creates a layer AND a wrapping map.
  const openNewMapFromData = async () => {
    const mod = await import('./new-feature-drawer.js');
    mod.open({
      onCreated: async ({ name: layerName, title }) => {
        const baseLabel = (title || layerName).trim();
        const mapName = `${baseLabel} map`;
        const mapSlug = `${layerName}-map-${Date.now().toString(36).slice(-5)}`;
        try {
          const created = await api.createProduct({
            slug: mapSlug,
            name: mapName,
            kind: 'map',
            tags: ['map'],
            consumed_layers: [layerName]
          });
          toast(`Created layer "${layerName}" and map "${mapName}"`, 'success');
          location.hash = `#/products/${encodeURIComponent(created.slug)}`;
        } catch (err) {
          toast(`Layer created, but map wrapper failed: ${err?.message || err}`, 'error');
          await refreshList();
        }
      }
    });
  };

  const menu = el('div', { class: 'pb-menu', role: 'menu', hidden: true });
  const newBtnWrap = el('div', { class: 'pb-menu-wrap' }, [newBtn, menu]);
  const menuCtl = wireMenu(newBtn, menu, newBtnWrap);

  const menuItem = (icon, label, handler) => {
    const b = el('button', { type: 'button', class: 'pb-menu-item', role: 'menuitem' }, [
      el('span', { class: 'material-symbols-outlined' }, icon),
      el('span', {}, label)
    ]);
    b.addEventListener('click', () => { menuCtl.close(); handler(); });
    return b;
  };
  menu.append(
    menuItem('link',        'Register app',      () => openModalFor('app')),
    menuItem('map',         'New map',           () => openModalFor('map')),
    menuItem('upload_file', 'New map from data', openNewMapFromData)
  );

  return newBtnWrap;
}

function renderCard(p) {
  const href = `#/products/${encodeURIComponent(p.slug)}`;
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
  const href = `#/products/${encodeURIComponent(p.slug)}`;
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
