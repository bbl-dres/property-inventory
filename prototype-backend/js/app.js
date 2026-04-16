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

const DEFAULT_ROUTE = '#/products';

// Sections that have an object sidebar mounted next to the main view.
const SECTIONS_WITH_SIDEBAR = new Set(['features', 'settings']);

// Primary nav definition — painted once into the topbar. Settings is
// intentionally NOT a primary tab: it lives as a gear icon in the right
// cluster (next to the account avatar) so the tab row stays focused on
// "things you work on" (content) rather than workspace configuration.
const TABS = [
  { key: 'products', label: 'Maps & Apps', icon: 'apps',     href: '#/products' },
  { key: 'features', label: 'Layers',      icon: 'layers',   href: '#/features' }
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
    if (sub === 'about') {
      return { name: 'settings-about', section: 'settings' };
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
  // Settings gear (right cluster) mirrors tab active state.
  const gear = document.getElementById('pb-settings-btn');
  if (gear) gear.classList.toggle('is-active', activeSection === 'settings');
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
 * @param {Array<{label: string, href?: string}>} [opts.breadcrumb] - Trail of
 *   parent → current. Items with an `href` render as links; the last item
 *   (typically with no `href`) is styled as the current page. Omit or pass
 *   an empty array on section-root views where a single-crumb trail would
 *   just duplicate the title.
 * @param {string|Node} opts.title
 * @param {string|Node} [opts.subtitle]
 * @param {string|Node} [opts.description]
 * @param {Node|Node[]} [opts.actions]
 */
export function renderViewHeader({ breadcrumb, title, subtitle, description, actions } = {}) {
  const mainChildren = [];
  if (Array.isArray(breadcrumb) && breadcrumb.length > 0) {
    const crumbNodes = [];
    breadcrumb.forEach((c, i) => {
      if (i > 0) crumbNodes.push(el('span', { class: 'pb-breadcrumb-sep', 'aria-hidden': 'true' }, '/'));
      if (c.href) {
        crumbNodes.push(el('a', { href: c.href, class: 'pb-breadcrumb-link' }, c.label));
      } else {
        crumbNodes.push(el('span', { class: 'pb-breadcrumb-current', 'aria-current': 'page' }, c.label));
      }
    });
    mainChildren.push(el('nav', { class: 'pb-breadcrumb', 'aria-label': 'Breadcrumb' }, crumbNodes));
  }
  mainChildren.push(el('h1', { class: 'pb-view-title' }, title ?? ''));
  if (subtitle != null && subtitle !== '') {
    mainChildren.push(el('div', { class: 'pb-view-subtitle' }, subtitle));
  }
  if (description != null && description !== '') {
    mainChildren.push(el('div', { class: 'pb-view-description' }, description));
  }
  const main = el('div', { class: 'pb-view-header-main' }, mainChildren);
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
    else if (route.name === 'settings-about') activeKey = 'about';
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
      el('span', { class: 'material-symbols-outlined pb-icon-sm' }, 'add'),
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
      breadcrumb: [
        { label: 'Settings', href: '#/settings' },
        { label: 'Preferences' }
      ],
      title: 'Preferences',
      subtitle: 'Coming soon',
      description: 'Workspace-level defaults (units, theme, notifications) will live here.'
    }));
    app.appendChild(emptyState('tune', 'Not implemented yet', 'Preferences are not part of this prototype.'));
    return;
  }

  // About — version marker and external links. Used to live as a shell
  // footer, but that collided with the scene viewer's own footer strip
  // (double chrome at the bottom). Inline here.
  if (route.name === 'settings-about') {
    app.appendChild(renderViewHeader({
      breadcrumb: [
        { label: 'Settings', href: '#/settings' },
        { label: 'About' }
      ],
      title: 'About',
      subtitle: 'v0.1.0 · prototype',
      description: 'Static JS frontend for a PostGIS-backed REST API (Supabase-compatible). This is a visual mockup — most mutations go to browser localStorage.'
    }));
    const linkRow = (icon, label, href) =>
      el('a', { class: 'pb-about-link', href, target: '_blank', rel: 'noopener' }, [
        el('span', { class: 'material-symbols-outlined' }, icon),
        el('div', { class: 'pb-about-link-body' }, [
          el('div', { class: 'pb-about-link-title' }, label),
          el('div', { class: 'pb-about-link-url pb-muted' }, href)
        ]),
        el('span', { class: 'material-symbols-outlined pb-about-link-arrow' }, 'open_in_new')
      ]);
    app.appendChild(el('div', { class: 'pb-card pb-card--padded' }, [
      el('div', { class: 'pb-card-header' }, 'Links'),
      el('div', { class: 'pb-card-body pb-about-links' }, [
        linkRow('code',         'Source code', 'https://github.com/bbl-dres/property-inventory'),
        linkRow('mail',         'Contact',     'https://www.bbl.admin.ch/de/kontakt'),
        linkRow('gavel',        'Legal',       'https://www.admin.ch/gov/de/start/rechtliches.html')
      ])
    ]));
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
  const rightWrap = document.querySelector('.pb-topbar-right');
  if (!rightWrap) return;
  let chip = rightWrap.querySelector('.pb-role-chip');
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
    // Insert before the hint chip so order reads: role · mock · avatar
    const hint = rightWrap.querySelector('.pb-topbar-hint');
    if (hint) rightWrap.insertBefore(chip, hint);
    else rightWrap.insertBefore(chip, rightWrap.firstChild);
  }
  const label = chip.querySelector('.pb-role-chip-text');
  if (label) label.textContent = `Role: ${role}`;
}

renderRoleChip();
bus.on('user:role-changed', renderRoleChip);

// ===== Account menu (topbar avatar dropdown) =====
//
// Prototype-only: clicking an item toasts "Coming soon" — no real auth.
// Shares the `.pb-menu` visual pattern with the Maps & Apps "+ New" menu.
function wireAccountMenu() {
  const btn = document.getElementById('pb-account-btn');
  const menu = document.getElementById('pb-account-menu');
  const wrap = document.getElementById('pb-account-wrap');
  if (!btn || !menu || !wrap) return;

  const openMenu = () => {
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onOutside, true);
    document.addEventListener('keydown', onEsc);
  };
  const closeMenu = () => {
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onOutside, true);
    document.removeEventListener('keydown', onEsc);
  };
  const onOutside = (e) => { if (!wrap.contains(e.target)) closeMenu(); };
  const onEsc = (e) => { if (e.key === 'Escape') { closeMenu(); btn.focus(); } };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.hidden) openMenu(); else closeMenu();
  });

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-account-action]');
    if (!item) return;
    closeMenu();
    // All account actions are mocked for now. Prototype-only — no auth.
    const action = item.dataset.accountAction;
    // Sign-out is a distinct concept from "not implemented yet" — the
    // prototype has no auth to sign out of. Calling it "coming soon" would
    // imply users are stuck in the app. Own the honest copy.
    const msg = action === 'signout'
      ? 'Sign out is not available in this prototype — reload the page to reset.'
      : `${ { profile: 'Profile', preferences: 'Preferences' }[action] || 'Action' } — coming soon`;
    import('./utils.js').then((u) => u.toast(msg, 'info'));
  });
}
wireAccountMenu();

if (!location.hash) location.hash = DEFAULT_ROUTE;
else handleRoute();
