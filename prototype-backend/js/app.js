// prototype-backend — hash router + shell controller
//
// Routes:
//   #/features                           -> sidebar(features) + "Select a layer" empty state
//   #/features/:name                     -> sidebar(features) + feature-detail (default tab=schema)
//   #/features/:name?tab=schema|data|map -> feature-detail (switch tab, no remount)
//   #/products                           -> gallery, full-width (default route, no sidebar)
//   #/products/:slug                     -> product-detail, full-width (no sidebar)
//   #/settings                           -> redirects to #/settings/members
//   #/settings/members                   -> sidebar(settings) + members (formerly Users)
//   #/settings/connection                -> sidebar(settings) + Connection view
//   #/settings/preferences               -> sidebar(settings) + Preferences stub
//
// Legacy: #/users* redirects to #/settings/members.
//
// Primary nav lives in the horizontal tab bar at the top of the topbar; the
// old vertical icon rail was removed. Sidebar is only mounted for the
// `features` and `settings` sections (see SECTIONS_WITH_SIDEBAR).
//
// Legacy redirects: `#/layers*` → `#/features*` (kept so existing bookmarks
// don't break; the route path stays `features` even though UI says "Layer").

import { closeModal, el } from './utils.js';
import * as api from './api.js';
import { bus, state } from './state.js';

const app = document.getElementById('app');
const sidebarHost = document.getElementById('pb-object-sidebar');
const tabsHost = document.getElementById('pb-tabs');
const layoutGrid = document.getElementById('pb-layout-grid');

let currentView = null;
let currentSidebar = null;
let currentSection = null;
let navToken = 0;

const DEFAULT_ROUTE = '#/features';

// Sections that have an object sidebar mounted next to the main view.
const SECTIONS_WITH_SIDEBAR = new Set(['features', 'settings']);

// Primary nav definition — painted once into the topbar.
const TABS = [
  { key: 'products', label: 'Maps & Apps', icon: 'apps',     href: '#/products' },
  { key: 'features', label: 'Layers',      icon: 'layers',   href: '#/features' },
  { key: 'settings', label: 'Settings',    icon: 'settings', href: '#/settings' }
];

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
    if (sub === 'connection') {
      return { name: 'settings-connection', section: 'settings' };
    }
    if (sub === 'preferences') {
      return { name: 'settings-preferences', section: 'settings' };
    }
    // Bare `#/settings` → default to the first sidebar item (Members), matching
    // the "first sidebar item is the section default" convention also used by
    // the Features section (see `features-empty` auto-navigate below).
    return { name: 'redirect', to: '#/settings/members' };
  }
  return { name: 'redirect', to: DEFAULT_ROUTE };
}

async function importView(routeName) {
  switch (routeName) {
    case 'feature-detail': return import('./feature-detail.js');
    case 'product-detail': return import('./product-detail.js');
    case 'products-gallery': return import('./products-gallery.js');
    case 'settings-members': return import('./users-view.js');
    case 'settings-connection': return import('./settings-view.js');
    // `settings-preferences` is a small inline stub (see handleRoute) so it
    // doesn't need its own module — returning null here would fall through to
    // the 404 redirect, which is not what we want. Handled explicitly in
    // handleRoute before importView is called.
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

/**
 * Small utility to build a standard `.pb-view-header` block. Every view
 * should render this as the first node inside its mount container so the
 * page chrome is identical across sections.
 *
 * @param {object} opts
 * @param {string|Node} opts.title
 * @param {string|Node} [opts.subtitle]
 * @param {string|Node} [opts.description]
 * @param {Node|Node[]} [opts.actions]
 */
export function renderViewHeader({ title, subtitle, description, actions } = {}) {
  const main = el('div', { class: 'pb-view-header-main' }, [
    el('h1', { class: 'pb-view-title' }, title ?? ''),
    subtitle != null && subtitle !== ''
      ? el('div', { class: 'pb-view-subtitle' }, subtitle)
      : null,
    description != null && description !== ''
      ? el('div', { class: 'pb-view-description' }, description)
      : null
  ].filter(Boolean));
  const children = [main];
  if (actions) {
    const list = Array.isArray(actions) ? actions.filter(Boolean) : [actions];
    if (list.length) children.push(el('div', { class: 'pb-view-header-actions' }, list));
  }
  return el('header', { class: 'pb-view-header' }, children);
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

  // Mount sidebar for the section. We intentionally do this BEFORE clearing
  // `app.innerHTML` so that if a newer navigation has already started (e.g.
  // the user clicked through the sidebar twice in quick succession), the
  // stale call's destructive clear is gated behind `isStale()` and cannot
  // wipe out a newer mount that already painted. Previously the clear ran
  // synchronously before the first `await`, which was safe within a single
  // tick but became unsafe once Task 2 added a `#/settings` → members
  // redirect (an extra hashchange pair per navigation).
  let activeKey = route.params?.layerName || route.params?.slug || null;
  if (route.section === 'settings') {
    if (route.name === 'settings-members') activeKey = 'members';
    else if (route.name === 'settings-connection') activeKey = 'connection';
    else if (route.name === 'settings-preferences') activeKey = 'preferences';
  }
  await mountSidebar(route.section, activeKey);
  if (isStale()) return;
  app.innerHTML = '';

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
    const cta = el('button', { type: 'button', class: 'btn-primary' }, [
      el('span', { class: 'material-symbols-outlined', style: { fontSize: '16px' } }, 'add'),
      ' New layer'
    ]);
    cta.addEventListener('click', async () => {
      const mod = await import('./new-feature-drawer.js');
      mod.open();
    });
    app.appendChild(renderViewHeader({
      title: 'Layers',
      subtitle: '0 layers',
      description: 'Create your first layer to get started.'
    }));
    app.appendChild(emptyState('layers', 'No layers yet', 'Create your first layer to get started.', cta));
    return;
  }

  // Preferences is a tiny placeholder — inline here (mirrors how
  // `features-empty` is handled above) so we don't spin up a dedicated module
  // for a "Coming soon" state.
  if (route.name === 'settings-preferences') {
    app.appendChild(renderViewHeader({
      title: 'Preferences',
      subtitle: 'Coming soon',
      description: 'Workspace-level defaults (units, theme, notifications) will live here.'
    }));
    app.appendChild(emptyState('tune', 'Not implemented yet', 'Preferences are not part of this prototype.'));
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

// Role chip next to the env hint. Shown only when the current role is not
// admin (single-user prototype default). Updates on every role change so the
// user always knows which restricted mode they're in.
function renderRoleChip() {
  const topbar = document.querySelector('.pb-topbar');
  if (!topbar) return;
  let chip = topbar.querySelector('.pb-role-chip');
  const role = state.currentUser?.role || 'admin';
  if (role === 'admin') {
    if (chip) chip.remove();
    return;
  }
  if (!chip) {
    chip = el('div', {
      class: 'pb-role-chip',
      title: 'Demo role (no server enforcement). Change in Settings → Connection.'
    }, [
      el('span', { class: 'material-symbols-outlined' }, 'shield_person'),
      el('span', { class: 'pb-role-chip-text' }, '')
    ]);
    const hint = topbar.querySelector('.pb-topbar-hint');
    if (hint) topbar.insertBefore(chip, hint);
    else topbar.appendChild(chip);
  }
  const label = chip.querySelector('.pb-role-chip-text');
  if (label) label.textContent = `Role: ${role}`;
}

renderRoleChip();
bus.on('user:role-changed', renderRoleChip);

if (!location.hash) location.hash = DEFAULT_ROUTE;
else handleRoute();
