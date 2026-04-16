// prototype-backend — Product detail view

import * as api from './api.js';
import { el, formatRelativeTime, toast } from './utils.js';
import { renderBreadcrumb, renderViewHeader, sectionCrumb } from './app.js';

let root = null;
let product = null;

export async function mount(container, { slug }) {
  root = container;
  product = null;
  renderBreadcrumb([sectionCrumb('products'), { label: slug }]);
  root.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><div class="loading-text">Loading…</div></div>';
  try {
    product = await api.getProduct(slug);
  } catch {
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'empty-state' }, [
      el('span', { class: 'material-symbols-outlined' }, 'error'),
      el('div', { class: 'empty-state-title' }, 'Product not found'),
      el('div', { class: 'empty-state-description' }, `"${slug}" does not exist.`)
    ]));
    return;
  }
  renderBreadcrumb([
    sectionCrumb('products'),
    { label: product.name || product.slug }
  ]);
  render();
}

export function unmount() {
  if (root) root.innerHTML = '';
  root = null;
  product = null;
}

function render() {
  root.innerHTML = '';

  const openBtn = el('a', {
    href: product.url || '#',
    class: 'btn-primary',
    target: '_blank',
    rel: 'noopener noreferrer'
  }, [
    el('span', { class: 'material-symbols-outlined', style: { fontSize: '16px' } }, 'open_in_new'),
    ' Open'
  ]);
  if (!product.url) {
    openBtn.addEventListener('click', (e) => { e.preventDefault(); toast('No URL set', 'info'); });
  }

  const status = product.status || 'staging';
  const titleRow = el('div', { class: 'pb-title-row' }, [
    el('span', {}, product.name || product.slug),
    el('span', { class: `pb-status pb-status--${status}` }, status)
  ]);

  const subtitle = el('span', {}, [
    el('span', { class: 'pb-name-mono' }, product.slug),
    ' · ',
    `owner: ${product.owner || '—'}`,
    ' · ',
    `last deployed ${formatRelativeTime(product.last_deployed_at)}`
  ]);

  const header = renderViewHeader({
    title: titleRow,
    subtitle,
    description: product.description || '',
    actions: openBtn
  });

  const featureChips = (product.consumed_layers || []).map((name) =>
    el('a', { href: `#/features/${encodeURIComponent(name)}`, class: 'pb-chip' }, [
      el('span', { class: 'material-symbols-outlined', style: { fontSize: '14px' } }, 'layers'),
      ' ',
      name
    ])
  );

  const tagChips = (product.tags || []).map((t) => el('span', { class: 'pb-chip pb-chip--muted' }, t));

  const featuresCard = el('section', { class: 'pb-card pb-card--padded' }, [
    el('div', { class: 'pb-card-header' }, 'Features used'),
    el('div', { class: 'pb-card-body' }, [
      featureChips.length
        ? el('div', { class: 'pb-chip-row' }, featureChips)
        : el('div', { class: 'pb-muted' }, 'No features consumed.')
    ])
  ]);

  const metaCard = el('section', { class: 'pb-card pb-card--padded' }, [
    el('div', { class: 'pb-card-header' }, 'Metadata'),
    el('div', { class: 'pb-card-body' }, [
      el('div', { class: 'pb-kv' }, [el('dt', {}, 'Slug'), el('dd', {}, el('span', { class: 'pb-name-mono' }, product.slug))]),
      el('div', { class: 'pb-kv' }, [el('dt', {}, 'URL'), el('dd', {}, product.url || '—')]),
      el('div', { class: 'pb-kv' }, [el('dt', {}, 'Owner'), el('dd', {}, product.owner || '—')]),
      el('div', { class: 'pb-kv' }, [el('dt', {}, 'Status'), el('dd', {}, product.status || 'staging')]),
      el('div', { class: 'pb-kv' }, [el('dt', {}, 'Last deployed'), el('dd', {}, formatRelativeTime(product.last_deployed_at))]),
      el('div', { class: 'pb-kv' }, [el('dt', {}, 'Tags'), el('dd', {}, tagChips.length ? el('div', { class: 'pb-chip-row' }, tagChips) : '—')])
    ])
  ]);

  root.appendChild(header);
  if (product.thumbnail) {
    root.appendChild(el('img', { class: 'pb-hero-thumb', src: product.thumbnail, alt: '' }));
  }
  const grid = el('div', { class: 'pb-card-grid' }, [featuresCard, metaCard]);
  root.appendChild(grid);
}
