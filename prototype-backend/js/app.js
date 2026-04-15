// prototype-backend — hash router + shell controller
//
// Routes:
//   #/features                           -> sidebar(features) + "Select a feature" empty state
//   #/features/:name                     -> sidebar(features) + feature-detail (default tab=schema)
//   #/features/:name?tab=schema|data|map -> feature-detail (switch tab, no remount)
//   #/products                           -> gallery, full-width (default route, no sidebar)
//   #/products/:slug                     -> product-detail, full-width (no sidebar)
//   #/settings                           -> sidebar(settings) + settings view (Connection)
//   #/settings/members                   -> sidebar(settings) + members (formerly Users)
//
// Legacy: #/users* redirects to #/settings/members.
//
// Primary nav lives in the horizontal tab bar at the top of the topbar; the
// old vertical icon rail was removed. Sidebar is only mounted for the
// `features` and `settings` sections (see SECTIONS_WITH_SIDEBAR).
//
// Legacy redirects: `#/layers*` → `#/features*` (kept so existing bookmarks
// don't break after the Layers→Features rename).

import { closeModal, el } from './utils.js';
import * as api from './api.js';
import { bus } from './state.js';

const app = document.getElementById('app');
const sidebarHost = document.getElementById('pb-object-sidebar');
const breadcrumb = document.getElementById('pb-breadcrumb');
const tabsHost = document.getElementById('pb-tabs');
const layoutGrid = document.getElementById('pb-layout-grid');

let currentView = null;
let currentSidebar = null;
let currentSection = null;
let navToken = 0;

const DEFAULT_ROUTE = '#/features';

// Sections that have an object sidebar mounted next to the main view.
const SECTIONS_WITH_SIDEBAR = new Set(['features', 'settings']);

// Primary nav definition — used to paint the horizontal tabs and to dedupe
// the breadcrumb (first crumb matching the active tab label is dropped).
const TABS = [
  { key: 'products', label: 'Products', icon: 'apps',     href: '#/products' },
  { key: 'features', label: 'Layers',   icon: 'layers',   href: '#/features' },
  { key: 'settings', label: 'Settings', icon: 'settings', href: '#/settings' }
];

// Crumb labels that should be dropped when they match the active tab. We
// accept both the tab label and a couple of legacy labels used by callers.
const SECTION_CRUMB_ALIASES = {
  products: ['Products', 'Data products'],
  features: ['Layers', 'Features'],
  settings: ['Settings']
};

function parseHash() {
  let hash = (location.hash || '').replace(/^#/, '');
  if (hash.startsWith('/')) hash = hash.slice(1);
  const [pathPart, queryPart = ''] = hash.split('?');
  const path = pathPart.split('/').filter(Boolean).map((seg) => {
    try { return decodeURIComponent(seg); } catch { return seg; }
  });
  return { path, query: new URLSearchParams(queryPart), rawQuery: queryPart };
}

function resolveRoute({ path, query, rawQuery }) {
  if (path.length === 0) return { name: 'redirect', to: DEFAULT_ROUTE };
  const section = path[0];

  // Legacy: #/layers* → #/features*
  if (section === 'layers') {
    const rest = path.slice(1).map(encodeURIComponent).join('/');
    const q = rawQuery ? `?${rawQuery}` : '';
    const to = `#/features${rest ? '/' + rest : ''}${q}`;
    const openNew = path[1] === 'new';
    return { name: 'redirect', to: openNew ? '#/features' : to, openNewFeature: openNew };
  }

  // Legacy: #/users* → #/settings/members
  if (section === 'users') {
    return { name: 'redirect', to: '#/settings/members' };
  }

  if (section === 'features') {
    if (path.length === 1) return { name: 'features-empty', section: 'features' };
    if (path[1] === 'new') return { name: 'redirect', to: '#/features', openNewFeature: true };
    const tab = query.get('tab') || 'schema';
    return { name: 'feature-detail', section: 'features', params: { layerName: path[1], tab } };
  }
  if (section === 'products') {
    if (path.length === 1) return { name: 'products-gallery', section: 'products' };
    return { name: 'product-detail', section: 'products', params: { slug: path[1] } };
  }
  if (section === 'settings') {
    const sub = path[1];
    if (sub === 'members') {
      return { name: 'settings-members', section: 'settings' };
    }
    return { name: 'settings', section: 'settings' };
  }
  return { name: 'redirect', to: DEFAULT_ROUTE };
}

async function importView(routeName) {
  switch (routeName) {
    case 'feature-detail': return import('./feature-detail.js');
    case 'product-detail': return import('./product-detail.js');
    case 'products-gallery': return import('./products-gallery.js');
    case 'settings-members': return import('./users-view.js');
    case 'settings': return import('./settings-view.js');
    default: return null;
  }
}

async function importSidebar(section) {
  // Only `features` and `settings` actually mount a sidebar — other sections
  // (like `products`) are full-width and intentionally no-op here. See
  // SECTIONS_WITH_SIDEBAR above for the gate.
  switch (section) {
    case 'features': return import('./sidebar-features.js');
    case 'settings': return import('./sidebar-settings.js');
    default: return null;
  }
}

function renderTabs(activeSection) {
  if (!tabsHost) return;
  // Paint once, then just toggle active state on subsequent calls.
  if (!tabsHost.dataset.painted) {
    tabsHost.innerHTML = '';
    for (const t of TABS) {
      const a = el('a', {
        href: t.href,
        class: 'pb-tab',
        dataset: { tab: t.key },
        title: t.label,
        'aria-label': t.label
      }, [
        el('span', { class: 'material-symbols-outlined' }, t.icon),
        el('span', { class: 'pb-tab-label' }, t.label)
      ]);
      tabsHost.appendChild(a);
    }
    tabsHost.dataset.painted = '1';
  }
  tabsHost.querySelectorAll('.pb-tab').forEach((a) => {
    a.classList.toggle('pb-tab--active', a.dataset.tab === activeSection);
  });
}

function applySidebarVisibility(section) {
  const hasSidebar = SECTIONS_WITH_SIDEBAR.has(section);
  if (layoutGrid) {
    layoutGrid.classList.toggle('pb-layout-grid--no-sidebar', !hasSidebar);
  }
  if (sidebarHost) {
    sidebarHost.hidden = !hasSidebar;
  }
}

export function renderBreadcrumb(crumbs) {
  // crumbs: Array<{ label, href? }>  — last item has no href (current)
  // De-dup: if the first crumb matches the active tab's section label
  // (e.g. "Features"), drop it — the tab already tells the user where
  // they are. Callers can keep passing the full trail unchanged.
  if (crumbs && crumbs.length > 1 && currentSection) {
    const aliases = SECTION_CRUMB_ALIASES[currentSection] || [];
    if (aliases.includes(crumbs[0].label)) {
      crumbs = crumbs.slice(1);
    }
  }
  breadcrumb.innerHTML = '';
  // A single crumb (or none) is just the page title — the top tab already
  // communicates location, so fully hide the landmark to avoid a redundant
  // screen-reader announcement.
  if (!crumbs || crumbs.length <= 1) {
    breadcrumb.hidden = true;
    breadcrumb.setAttribute('aria-hidden', 'true');
    return;
  }
  breadcrumb.hidden = false;
  breadcrumb.removeAttribute('aria-hidden');
  crumbs.forEach((c, i) => {
    if (i > 0) {
      breadcrumb.appendChild(el('span', { class: 'pb-breadcrumb-sep' }, '/'));
    }
    const isLast = i === crumbs.length - 1;
    if (c.href && !isLast) {
      breadcrumb.appendChild(el('a', { href: c.href }, c.label));
    } else {
      breadcrumb.appendChild(el('span', { class: 'pb-breadcrumb-current' }, c.label));
    }
  });
}

function emptyState(icon, title, desc, cta) {
  return el('div', { class: 'empty-state' }, [
    el('span', { class: 'material-symbols-outlined' }, icon),
    el('div', { class: 'empty-state-title' }, title),
    el('div', { class: 'empty-state-description' }, desc || ''),
    cta || null
  ].filter(Boolean));
}

async function mountSidebar(section, activeKey) {
  // Sections without a sidebar: tear down any current one and bail.
  if (!SECTIONS_WITH_SIDEBAR.has(section)) {
    if (currentSidebar?.module?.unmount) {
      try { currentSidebar.module.unmount(); } catch (e) { console.error(e); }
    }
    currentSidebar = null;
    sidebarHost.innerHTML = '';
    return;
  }
  if (currentSidebar && currentSidebar.section === section) {
    currentSidebar.module.setActive?.(activeKey);
    return;
  }
  if (currentSidebar?.module?.unmount) {
    try { currentSidebar.module.unmount(); } catch (e) { console.error(e); }
  }
  sidebarHost.innerHTML = '';
  const mod = await importSidebar(section);
  if (!mod) { currentSidebar = null; return; }
  currentSidebar = { section, module: mod };
  mod.mount(sidebarHost, { activeKey });
}

async function handleRoute() {
  // Monotonic token: any `await` below must re-check that we're still the
  // latest navigation before mutating DOM / mounting, else rapid hashchange
  // double-mounts views with conflicting state.
  const myToken = ++navToken;
  const isStale = () => myToken !== navToken;

  const route = resolveRoute(parseHash());

  if (route.name === 'redirect') {
    // Setting location.hash schedules another `hashchange` → a fresh
    // handleRoute with a newer navToken. Return immediately so this stale
    // invocation doesn't also mutate the DOM. Skip DOM work entirely here.
    if (isStale()) return;
    location.hash = route.to;
    if (route.openNewFeature) {
      // Defer until sidebar mounts.
      setTimeout(async () => {
        const mod = await import('./new-feature-drawer.js');
        mod.open();
      }, 50);
    }
    return;
  }

  if (isStale()) return;
  currentSection = route.section;
  renderTabs(route.section);
  applySidebarVisibility(route.section);

  // Same-feature tab switch — fast path.
  if (
    currentView &&
    route.name === 'feature-detail' &&
    currentView.routeName === 'feature-detail' &&
    currentView.params.layerName === route.params.layerName &&
    currentView.params.tab !== route.params.tab
  ) {
    currentView.params.tab = route.params.tab;
    try { currentView.module.onTabChange?.(route.params.tab); }
    catch (err) { console.error('[router] onTabChange', err); }
    // Breadcrumb: update tab crumb
    try { currentView.module.updateBreadcrumb?.(); } catch {}
    await mountSidebar('features', route.params.layerName);
    if (isStale()) return;
    return;
  }

  // Unmount old view.
  if (currentView?.module?.unmount) {
    try { currentView.module.unmount(); } catch (e) { console.error(e); }
  }
  currentView = null;
  closeModal();
  app.innerHTML = '';

  // Mount sidebar for the section.
  let activeKey = route.params?.layerName || route.params?.slug || null;
  if (route.section === 'settings') {
    activeKey = route.name === 'settings-members' ? 'members' : 'connection';
  }
  await mountSidebar(route.section, activeKey);
  if (isStale()) return;

  // Mount main view.
  if (route.name === 'features-empty') {
    // If there are features, auto-navigate to the first.
    try {
      const layers = await api.listLayers();
      if (isStale()) return;
      if (layers.length) {
        location.hash = `#/features/${encodeURIComponent(layers[0].name)}`;
        return;
      }
    } catch {}
    if (isStale()) return;
    renderBreadcrumb([{ label: 'Layers' }]);
    const cta = el('button', { type: 'button', class: 'btn-primary' }, [
      el('span', { class: 'material-symbols-outlined', style: { fontSize: '16px' } }, 'add'),
      ' New layer'
    ]);
    cta.addEventListener('click', async () => {
      const mod = await import('./new-feature-drawer.js');
      mod.open();
    });
    app.appendChild(emptyState('layers', 'No layers yet', 'Create your first layer to get started.', cta));
    return;
  }

  const mod = await importView(route.name);
  if (isStale()) return;
  if (!mod) {
    location.hash = DEFAULT_ROUTE;
    return;
  }
  try {
    mod.mount(app, route.params || {});
    currentView = { module: mod, routeName: route.name, params: { ...(route.params || {}) } };
  } catch (err) {
    console.error('[router] mount', err);
    app.innerHTML = '';
    app.appendChild(emptyState('error', 'Failed to load view', err?.message || ''));
  }
}

// ===== Global click delegation =====

document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'toast-dismiss') {
    const toast = target.closest('.pb-toast');
    if (toast) toast.remove();
    e.preventDefault();
    return;
  }
  if (action === 'modal-close') {
    closeModal();
    e.preventDefault();
    return;
  }
});

// ===== Boot =====

window.addEventListener('hashchange', handleRoute);
bus.on('layer:deleted', () => {
  // If the deleted feature is the current one, fall back to features root.
  if (currentView?.routeName === 'feature-detail') {
    location.hash = '#/features';
  }
});

if (!location.hash) location.hash = DEFAULT_ROUTE;
else handleRoute();
