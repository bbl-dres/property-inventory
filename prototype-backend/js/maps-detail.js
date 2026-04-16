// prototype-backend — Maps & Apps detail view (#/maps/:slug)
//
// Branch point:
//   - product.kind === 'map' → hand off to the scene authoring view
//     (js/map-scene.js). The scene module owns the full `app` container
//     while mounted.
//   - otherwise (kind === 'app'): render the app-detail cards here.
//
// Scene handoff uses dynamic import so the MapLibre-heavy scene module is
// not loaded when viewing an app-kind product. `unmount()` delegates back
// to whichever module actually did the mount.
//
// Internal nomenclature still uses `product` because the API layer does —
// see the note at the top of maps-catalogue.js for the rationale.

import * as api from './api.js';
import { el, relativeTimeNode, statusPill, toast } from './utils.js';
import { renderViewHeader, metaLine, emptyState } from './app.js';

// App-kind detail tabs. Kept deliberately shallow (Overview + Activity)
// so app detail pages share the tabbed shape used by layer detail pages
// and the scene viewer. Activity is a placeholder today — deploy events
// and version history will populate it once the adapter lands.
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' }
];

let root = null;
let product = null;
let sceneModule = null; // non-null when a map-kind scene is mounted
let currentTab = 'overview';

export async function mount(container, { slug, tab }) {
  root = container;
  product = null;
  sceneModule = null;
  currentTab = TABS.some((t) => t.id === tab) ? tab : 'overview';
  root.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><div class="loading-text">Loading…</div></div>';
  try {
    product = await api.getProduct(slug);
  } catch {
    root.innerHTML = '';
    const backBtn = el('a', { href: '#/maps', class: 'btn-primary' }, [
      el('span', { class: 'material-symbols-outlined pb-icon-sm' }, 'arrow_back'),
      ' Maps & Apps'
    ]);
    root.appendChild(emptyState(
      'error',
      'Not found',
      `"${slug}" does not exist. It may have been deleted, or the URL is mistyped.`,
      backBtn
    ));
    return;
  }

  if (product.kind === 'map') {
    try {
      const mod = await import('./map-scene.js');
      sceneModule = mod;
      await mod.mount(root, { product });
      return;
    } catch (err) {
      console.error('[maps-detail] scene mount failed', err);
      sceneModule = null;
      root.innerHTML = '';
      const backBtn = el('a', { href: '#/maps', class: 'btn-primary' }, [
        el('span', { class: 'material-symbols-outlined pb-icon-sm' }, 'arrow_back'),
        ' Maps & Apps'
      ]);
      root.appendChild(emptyState(
        'error',
        'Scene failed to load',
        err?.message || 'Unknown error — try reloading the page.',
        backBtn
      ));
      return;
    }
  }

  render();
}

export function unmount() {
  // If we handed off to a scene module, let it tear down its own resources
  // (map instance, sub-modules, listeners) before we clear the container.
  if (sceneModule?.unmount) {
    try { sceneModule.unmount(); } catch (err) { console.error('[maps-detail] scene unmount', err); }
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
    el('span', { class: 'material-symbols-outlined pb-icon-sm' }, 'open_in_new'),
    ' Open'
  ]);
  if (!product.url) {
    openBtn.addEventListener('click', (e) => { e.preventDefault(); toast('No URL set', 'info'); });
  }

  const titleRow = el('div', { class: 'pb-title-row' }, [
    el('span', {}, product.name || product.slug),
    statusPill(product.status)
  ]);

  const subtitle = metaLine([
    el('span', { class: 'pb-name-mono' }, product.slug),
    `owner: ${product.owner || '—'}`,
    el('span', {}, ['last deployed ', relativeTimeNode(product.last_deployed_at)])
  ]);

  const header = renderViewHeader({
    breadcrumb: [
      { label: 'Maps & Apps', href: '#/maps' },
      { label: product.name || product.slug }
    ],
    title: titleRow,
    subtitle,
    description: product.description || '',
    actions: openBtn
  });

  const featureChips = (product.consumed_layers || []).map((name) =>
    el('a', { href: `#/features/${encodeURIComponent(name)}`, class: 'pb-chip' }, [
      el('span', { class: 'material-symbols-outlined pb-icon-xs' }, 'layers'),
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
      el('div', { class: 'pb-kv' }, [el('dt', {}, 'Status'), el('dd', {}, statusPill(product.status))]),
      el('div', { class: 'pb-kv' }, [el('dt', {}, 'Last deployed'), el('dd', {}, relativeTimeNode(product.last_deployed_at))]),
      el('div', { class: 'pb-kv' }, [el('dt', {}, 'Tags'), el('dd', {}, tagChips.length ? el('div', { class: 'pb-chip-row' }, tagChips) : '—')])
    ])
  ]);

  root.appendChild(header);
  if (product.thumbnail) {
    root.appendChild(el('img', { class: 'pb-hero-thumb', src: product.thumbnail, alt: '' }));
  }

  // Subtab row — shares the `.pb-subtabs` pattern with feature-detail so
  // app detail and layer detail read the same structurally.
  const tabsBar = el('nav', { class: 'pb-subtabs', role: 'tablist', 'aria-label': 'App sections' },
    TABS.map((t) => el('a', {
      href: `#/maps/${encodeURIComponent(product.slug)}?tab=${t.id}`,
      class: 'pb-subtab' + (t.id === currentTab ? ' is-active' : ''),
      role: 'tab',
      'aria-selected': t.id === currentTab ? 'true' : 'false',
      dataset: { tab: t.id }
    }, t.label))
  );

  const tabHost = el('div', { class: 'pb-tab-host' });
  root.appendChild(el('div', { class: 'pb-tabs-wrap' }, [tabsBar, tabHost]));

  if (currentTab === 'activity') {
    tabHost.appendChild(renderActivityTab());
  } else {
    tabHost.appendChild(el('div', { class: 'pb-card-grid' }, [featuresCard, metaCard]));
  }
}

function renderActivityTab() {
  // Stub until the adapter surfaces real deploy / incident events. Today
  // we only have `last_deployed_at` on the product — show that and note
  // that more signals will land with the real backend.
  return el('section', { class: 'pb-card pb-card--padded' }, [
    el('div', { class: 'pb-card-header' }, 'Activity'),
    el('div', { class: 'pb-card-body' }, [
      el('div', { class: 'pb-kv' }, [
        el('dt', {}, 'Last deployed'),
        el('dd', {}, relativeTimeNode(product.last_deployed_at))
      ]),
      el('div', { class: 'pb-muted', style: { marginTop: 'var(--space-3)' } },
        'Deployment, incident, and version history will surface here once the backend adapter lands.')
    ])
  ]);
}
