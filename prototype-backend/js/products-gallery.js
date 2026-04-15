// prototype-backend — Products gallery (#/products)
//
// Visual grid of data product cards. Clicking a card navigates to the
// product detail view. Replaces the earlier "Select a data product" /
// "No data products yet" empty states — an empty state is still shown
// when literally zero products exist.

import * as api from './api.js';
import { el, toast } from './utils.js';
import { renderBreadcrumb } from './app.js';

let root = null;
let products = [];

export async function mount(container) {
  root = container;
  renderBreadcrumb([{ label: 'Data products' }]);
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

  const header = el('div', { class: 'pb-view-header' }, [
    el('div', {}, [
      el('div', { class: 'pb-view-title' }, 'Data products'),
      el('div', { class: 'pb-view-subtitle' },
        'Downstream apps and dashboards that consume your features.')
    ]),
    newBtn
  ]);
  root.appendChild(header);

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

  const openLink = el('a', { href, class: 'pb-product-card-link' }, 'Open →');

  const card = el('article', { class: 'pb-product-card', tabindex: '0', role: 'link', 'aria-label': p.name || p.slug }, [
    thumb,
    el('div', { class: 'pb-product-card-body' }, [
      el('div', { class: 'pb-product-card-titlebar' }, [
        el('h3', { class: 'pb-product-card-title' }, p.name || p.slug),
        el('span', { class: `pb-status pb-status--${p.status || 'staging'}` }, p.status || 'staging')
      ]),
      el('p', { class: 'pb-product-card-desc' }, p.description || ''),
      el('div', { class: 'pb-product-card-foot' }, [
        el('span', { class: 'pb-muted', style: { fontSize: '12px' } },
          `${count} feature${count === 1 ? '' : 's'}`),
        openLink
      ])
    ])
  ]);

  // Clicking anywhere on the card (except the explicit link) navigates.
  card.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    location.hash = href;
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      location.hash = href;
    }
  });
  return card;
}
