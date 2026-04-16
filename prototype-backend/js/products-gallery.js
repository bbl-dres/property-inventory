// prototype-backend — Maps & Apps gallery (#/products)
//
// Visual grid of product cards. Clicking a card navigates to the product
// detail view. Replaces the earlier "Select an item" / "No items yet"
// empty states — an empty state is still shown when literally zero
// products exist.

import * as api from './api.js';
import { el, toast, wireMenu } from './utils.js';
import { renderViewHeader } from './app.js';

let root = null;
let products = [];

export async function mount(container) {
  root = container;
  root.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><div class="loading-text">Loading…</div></div>';
  try { products = await api.listProducts(); }
  catch { products = []; }
  render();
}

export function unmount() {
  if (root) root.innerHTML = '';
  root = null;
  products = [];
}

function render() {
  if (!root) return;
  root.innerHTML = '';

  // "+ New ▾" dropdown — splits creation into two small dedicated modals.
  // The dropdown pattern scales better than a radio picker inside the modal
  // as more kinds get added later (dashboard, storymap, embed…).
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

  const refreshList = async () => {
    try { products = await api.listProducts(); }
    catch { products = []; }
    render();
  };

  const openModalFor = async (kind) => {
    const mod = await import('./new-product-modal.js');
    mod.open({
      kind,
      onCreated: async (created) => {
        // A new map drops the user straight into the scene viewer so they
        // can start authoring. Registered apps stay on the gallery so the
        // user can see the card they just added.
        if (kind === 'map') {
          location.hash = `#/products/${encodeURIComponent(created.slug)}`;
        } else {
          await refreshList();
        }
      }
    });
  };

  // Shortcut flow: upload a file, which creates BOTH a new layer (via the
  // existing New Layer drawer) AND a wrapping map that consumes it. After
  // the layer is created, auto-create the map and navigate straight into
  // the scene viewer.
  const openNewMapFromData = async () => {
    const mod = await import('./new-feature-drawer.js');
    mod.open({
      onCreated: async ({ name: layerName, title }) => {
        const baseLabel = (title || layerName).trim();
        const mapName = `${baseLabel} map`;
        // Layer names already conform to the slug charset ([a-z0-9_]).
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

  const count = products.length;
  root.appendChild(renderViewHeader({
    title: 'Maps & Apps',
    subtitle: `${count} item${count === 1 ? '' : 's'}`,
    description: 'Maps & Apps are downstream apps, dashboards, and viewers that consume your layers.',
    actions: newBtnWrap
  }));

  if (!products.length) {
    root.appendChild(el('div', { class: 'empty-state' }, [
      el('span', { class: 'material-symbols-outlined' }, 'apps'),
      el('div', { class: 'empty-state-title' }, 'No maps or apps yet'),
      el('div', { class: 'empty-state-description' },
        'Maps & Apps are downstream apps, dashboards, and viewers that consume your layers.')
    ]));
    return;
  }

  const grid = el('div', { class: 'pb-product-grid' },
    products.map(renderCard)
  );
  root.appendChild(grid);
}

function renderCard(p) {
  const href = `#/products/${encodeURIComponent(p.slug)}`;
  const count = (p.consumed_layers || []).length;

  const thumb = p.thumbnail
    ? el('img', { class: 'pb-product-card-thumb', src: p.thumbnail, alt: '' })
    : el('div', { class: 'pb-product-card-thumb pb-product-card-thumb--placeholder' }, [
        el('span', { class: 'material-symbols-outlined' }, 'apps')
      ]);

  // The whole card is a real anchor: semantic link, keyboard-accessible,
  // middle-click-opens-new-tab works for free. We dropped the inner
  // "Open →" link (was invalid nested <a>) — the detail view has its own
  // open button when an external URL is configured.
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
        el('span', { class: 'pb-muted', style: { fontSize: '12px' } },
          `${count} layer${count === 1 ? '' : 's'}`)
      ])
    ])
  ]);
}
