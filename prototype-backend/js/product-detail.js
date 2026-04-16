// prototype-backend — Product detail view
//
// Branch point:
//   - product.kind === 'map' → hand off to the scene authoring view
//     (js/map-scene.js). The scene module owns the full `app` container
//     while mounted.
//   - otherwise: render the classic app-detail cards here.
//
// Scene handoff uses dynamic import so the MapLibre-heavy scene module is
// not loaded when viewing an app-kind product. `unmount()` delegates back
// to whichever module actually did the mount.

import * as api from './api.js';
import { el, formatRelativeTime, toast } from './utils.js';
import { renderViewHeader } from './app.js';

let root = null;
let product = null;
let sceneModule = null; // non-null when a map-kind scene is mounted

export async function mount(container, { slug }) {
  root = container;
  product = null;
  sceneModule = null;
  root.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><div class="loading-text">Loading…</div></div>';
  try {
    product = await api.getProduct(slug);
  } catch {
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'empty-state' }, [
      el('span', { class: 'material-symbols-outlined' }, 'error'),
      el('div', { class: 'empty-state-title' }, 'Not found'),
      el('div', { class: 'empty-state-description' }, `"${slug}" does not exist.`)
    ]));
    return;
  }

  if (product.kind === 'map') {
    try {
      const mod = await import('./map-scene.js');
      sceneModule = mod;
      await mod.mount(root, { product });
      return;
    } catch (err) {
      console.error('[product-detail] scene mount failed', err);
      sceneModule = null;
      root.innerHTML = '';
      root.appendChild(el('div', { class: 'empty-state' }, [
        el('span', { class: 'material-symbols-outlined' }, 'error'),
        el('div', { class: 'empty-state-title' }, 'Scene failed to load'),
        el('div', { class: 'empty-state-description' }, err?.message || 'Unknown error')
      ]));
      return;
    }
  }

  render();
}

export function unmount() {
  // If we handed off to a scene module, let it tear down its own resources
  // (map instance, sub-modules, listeners) before we clear the container.
  if (sceneModule?.unmount) {
    try { sceneModule.unmount(); } catch (err) { console.error('[product-detail] scene unmount', err); }
  }
  sceneModule = null;
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
    el('div', { class: 'pb-card-header' }, 'Layers used'),
    el('div', { class: 'pb-card-body' }, [
      featureChips.length
        ? el('div', { class: 'pb-chip-row' }, featureChips)
        : el('div', { class: 'pb-muted' }, 'No layers consumed.')
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
