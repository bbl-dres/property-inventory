// prototype-backend — Data products sidebar

import * as api from './api.js';
import { el, debounce, toast } from './utils.js';

let root = null;
let products = [];
let searchValue = '';
let activeKey = null;

export function mount(container, { activeKey: ak } = {}) {
  root = container;
  activeKey = ak || null;
  root.innerHTML = '';
  renderShell();
  refresh();
}

export function unmount() {
  if (root) root.innerHTML = '';
  root = null;
  products = [];
  searchValue = '';
  activeKey = null;
}

export function setActive(key) {
  activeKey = key || null;
  renderList();
}

function renderShell() {
  const header = el('div', { class: 'pb-sidebar-header' }, [
    el('div', { class: 'pb-sidebar-title' }, 'Data products'),
    (() => {
      const btn = el('button', {
        type: 'button',
        class: 'btn-primary pb-sidebar-new',
        title: 'New product (coming soon)'
      }, [
        el('span', { class: 'material-symbols-outlined', style: { fontSize: '16px' } }, 'add'),
        ' New'
      ]);
      btn.addEventListener('click', () => {
        toast('Create product: coming soon', 'info');
      });
      return btn;
    })()
  ]);

  const searchBox = el('div', { class: 'pb-sidebar-search' }, [
    el('span', { class: 'material-symbols-outlined' }, 'search'),
    el('input', { type: 'search', placeholder: 'Search products…', 'aria-label': 'Search products', value: searchValue })
  ]);
  searchBox.querySelector('input').addEventListener('input', debounce((e) => {
    searchValue = e.target.value;
    renderList();
  }, 120));

  const list = el('div', { class: 'pb-sidebar-list', id: 'pb-sidebar-products-list' });

  root.appendChild(header);
  root.appendChild(searchBox);
  root.appendChild(list);
}

async function refresh() {
  try {
    products = await api.listProducts();
  } catch { products = []; }
  renderList();
}

function renderList() {
  if (!root) return;
  const host = root.querySelector('#pb-sidebar-products-list');
  if (!host) return;
  host.innerHTML = '';

  const q = searchValue.trim().toLowerCase();
  const filtered = q
    ? products.filter((p) =>
        p.slug.toLowerCase().includes(q) ||
        (p.name || '').toLowerCase().includes(q))
    : products;

  if (!filtered.length) {
    host.appendChild(el('div', { class: 'pb-sidebar-empty' },
      products.length ? `No matches for "${searchValue}"` : 'No products yet.'));
    return;
  }

  for (const p of filtered) {
    const isActive = p.slug === activeKey;
    host.appendChild(el('a', {
      href: `#/products/${encodeURIComponent(p.slug)}`,
      class: 'pb-sidebar-item' + (isActive ? ' is-active' : ''),
      dataset: { key: p.slug }
    }, [
      p.thumbnail
        ? el('img', { class: 'pb-sidebar-item-thumb', src: p.thumbnail, alt: '' })
        : el('span', { class: 'material-symbols-outlined pb-sidebar-item-icon' }, 'apps'),
      el('div', { class: 'pb-sidebar-item-body' }, [
        el('div', { class: 'pb-sidebar-item-title' }, p.name || p.slug),
        el('div', { class: 'pb-sidebar-item-sub' }, [
          el('span', { class: `pb-status pb-status--${p.status || 'staging'}` }, p.status || 'staging'),
          ' · ',
          `${(p.consumed_layers || []).length} feature${(p.consumed_layers || []).length === 1 ? '' : 's'}`
        ])
      ])
    ]));
  }
}
