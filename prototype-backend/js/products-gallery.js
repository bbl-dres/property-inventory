// prototype-backend — Maps & Apps gallery (#/products)
//
// Visual grid of product cards. Clicking a card navigates to the product
// detail view. Replaces the earlier "Select an item" / "No items yet"
// empty states — an empty state is still shown when literally zero
// products exist.

import * as api from './api.js';
import { el } from './utils.js';
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
    el('span', { class: 'material-symbols-outlined', style: { fontSize: '16px' } }, 'add'),
    ' New ',
    el('span', { class: 'material-symbols-outlined', style: { fontSize: '18px' } }, 'arrow_drop_down')
  ]);

  const refreshList = async () => {
    try { products = await api.listProducts(); }
    catch { products = []; }
    render();
  };

  const openModalFor = async (kind) => {
    const mod = await import('./new-product-modal.js');
    mod.open({ kind, onCreated: refreshList });
  };

  const menuItem = (icon, label, kind) => {
    const b = el('button', { type: 'button', class: 'pb-menu-item', role: 'menuitem' }, [
      el('span', { class: 'material-symbols-outlined' }, icon),
      el('span', {}, label)
    ]);
    b.addEventListener('click', () => { closeMenu(); openModalFor(kind); });
    return b;
  };

  const menu = el('div', { class: 'pb-menu', role: 'menu', hidden: true }, [
    menuItem('link', 'Register app', 'app'),
    menuItem('map', 'New map', 'map')
  ]);

  const newBtnWrap = el('div', { class: 'pb-menu-wrap' }, [newBtn, menu]);

  const closeMenu = () => {
    menu.hidden = true;
    newBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onOutsideClick, true);
    document.removeEventListener('keydown', onEscape);
  };
  const openMenu = () => {
    menu.hidden = false;
    newBtn.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onOutsideClick, true);
    document.addEventListener('keydown', onEscape);
  };
  const onOutsideClick = (e) => { if (!newBtnWrap.contains(e.target)) closeMenu(); };
  const onEscape = (e) => { if (e.key === 'Escape') { closeMenu(); newBtn.focus(); } };

  newBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.hidden) openMenu(); else closeMenu();
  });

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
