// prototype-backend — Products gallery (#/products)
//
// Visual grid of data product cards. Clicking a card navigates to the
// product detail view. Replaces the earlier "Select a data product" /
// "No data products yet" empty states — an empty state is still shown
// when literally zero products exist.

import * as api from './api.js';
import { el, toast } from './utils.js';
import { renderBreadcrumb, renderViewHeader, sectionCrumb } from './app.js';

let root = null;
let products = [];

export async function mount(container) {
  root = container;
  renderBreadcrumb([sectionCrumb('products', false)]);
  root.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><div class="loading-text">Loading products…</div></div>';
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

  const newBtn = el('button', {
    type: 'button',
    class: 'btn-primary',
    title: 'New data product (coming soon)'
  }, [
    el('span', { class: 'material-symbols-outlined', style: { fontSize: '16px' } }, 'add'),
    ' New data product'
  ]);
  newBtn.addEventListener('click', () => toast('Create product: coming soon', 'info'));

  const count = products.length;
  root.appendChild(renderViewHeader({
    title: 'Data products',
    subtitle: `${count} product${count === 1 ? '' : 's'}`,
    description: 'Downstream apps and dashboards that consume your layers.',
    actions: newBtn
  }));

  if (!products.length) {
    root.appendChild(el('div', { class: 'empty-state' }, [
      el('span', { class: 'material-symbols-outlined' }, 'apps'),
      el('div', { class: 'empty-state-title' }, 'No data products yet'),
      el('div', { class: 'empty-state-description' },
        'Data products are downstream apps and dashboards that consume your features.')
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
          `${count} feature${count === 1 ? '' : 's'}`)
      ])
    ])
  ]);
}
