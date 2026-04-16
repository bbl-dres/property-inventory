// prototype-backend — hash router + shell controller
//
// Routes:
//   #/                                   -> redirects to DEFAULT_ROUTE (Maps & Apps)
//   #/maps                               -> maps-catalogue (Maps & Apps catalogue, full-width)
//   #/maps/:slug                         -> maps-detail (or map-scene for kind='map')
//   #/features                           -> features-catalogue (Layers catalogue, full-width)
//   #/features/:name                     -> feature-detail (default tab=schema)
//   #/features/:name?tab=schema|data|map -> feature-detail (switch tab, no remount)
//   #/settings                           -> redirects to #/settings/members
//   #/settings/members                   -> sidebar(settings) + members
//   #/settings/connection                -> sidebar(settings) + Connection
//   #/settings/preferences               -> sidebar(settings) + Preferences stub
//   #/settings/about                     -> sidebar(settings) + About
//
// Legacy redirects (kept so old bookmarks don't 404):
//   `#/layers*`   → `#/features*`
//   `#/products*` → `#/maps*`
//   `#/users*`    → `#/settings/members`
//
// Primary nav lives in the `.pb-section-nav` band below the topbar (not
// in the topbar itself). The band shows either the primary tabs (Maps &
// Apps · Layers) or, when in Settings, the Settings sub-tabs (Members,
// Connection, Preferences, About). No object sidebars — Layers and Maps
// & Apps are full-width catalogues (js/catalogue.js); Settings is now
// tab-driven too.
//
// Domain note: the underlying data entity is still called `product` in the
// API layer (`api.listProducts`, `mock-products.json`, `pb:products`
// storage key). It's an umbrella type that covers both maps (authored
// scenes) and apps (registered external tools). The URL/section label
// says `maps` because that matches the primary user action in this
// section; the internal `product` name is preserved to keep the data
// model stable when the Supabase adapter lands.

import { closeModal, el, wireMenu } from './utils.js';
import * as api from './api.js';
import { bus, state } from './state.js';

const app = document.getElementById('app');
const tabsHost = document.getElementById('pb-tabs');

let currentView = null;
let currentSection = null;
let navToken = 0;

const DEFAULT_ROUTE = '#/maps';

// Primary nav definition — painted once into the topbar. Settings is
// intentionally NOT a primary tab: it lives as a gear icon in the right
// cluster (next to the account avatar) so the tab row stays focused on
// "things you work on" (content) rather than workspace configuration.
const TABS = [
  { key: 'maps',     label: 'Maps & Apps', icon: 'apps',     href: '#/maps' },
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

  // Legacy: #/products* → #/maps* (the section was renamed to align with
  // the UI label; old bookmarks and external links still resolve).
  if (section === 'products') {
    const rest = path.slice(1).map(encodeURIComponent).join('/');
    const q = rawQuery ? `?${rawQuery}` : '';
    return { name: 'redirect', to: `#/maps${rest ? '/' + rest : ''}${q}` };
  }

  // Legacy: #/users* → #/settings/members
  if (section === 'users') {
    return { name: 'redirect', to: '#/settings/members' };
  }

  if (section === 'features') {
    if (path.length === 1) return { name: 'features-catalogue', section: 'features' };
    if (path[1] === 'new') return { name: 'redirect', to: '#/features', openNewFeature: true };
    const tab = query.get('tab') || 'schema';
    return { name: 'feature-detail', section: 'features', params: { layerName: path[1], tab } };
  }
  if (section === 'maps') {
    if (path.length === 1) return { name: 'maps-catalogue', section: 'maps' };
    const tab = query.get('tab') || 'overview';
    return { name: 'maps-detail', section: 'maps', params: { slug: path[1], tab } };
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
    // Bare `#/settings` → default to the first sidebar item (Members).
    return { name: 'redirect', to: '#/settings/members' };
  }
  return { name: 'redirect', to: DEFAULT_ROUTE };
}

async function importView(routeName) {
  switch (routeName) {
    case 'feature-detail': return import('./feature-detail.js');
    case 'features-catalogue': return import('./features-catalogue.js');
    case 'maps-detail': return import('./maps-detail.js');
    case 'maps-catalogue': return import('./maps-catalogue.js');
    case 'settings-members': return import('./users-view.js');
    case 'settings-connection': return import('./settings-view.js');
    // `settings-preferences` is a small inline stub (see handleRoute) so it
    // doesn't need its own module — returning null here would fall through to
    // the 404 redirect, which is not what we want. Handled explicitly in
    // handleRoute before importView is called.
    default: return null;
  }
}

// Settings sub-tabs — surface inside the same section-nav band when the
// current route is under Settings. No sidebar; horizontal tabs in the
// same slot as primary tabs, swapped in on route match.
const SETTINGS_TABS = [
  { key: 'members',     label: 'Members',     href: '#/settings/members',     icon: 'group' },
  { key: 'connection',  label: 'Connection',  href: '#/settings/connection',  icon: 'storage' },
  { key: 'preferences', label: 'Preferences', href: '#/settings/preferences', icon: 'tune' },
  { key: 'about',       label: 'About',       href: '#/settings/about',       icon: 'info' }
];

/** Where should a Back link on this route point? `null` = no back link.
 *  Detail views (feature-detail, maps-detail) already render a breadcrumb
 *  in the view header whose parent crumb ("Layers" / "Maps & Apps") is
 *  the back path — a second back link would duplicate that affordance.
 *  Settings sub-pages use a pure tab-nav with no breadcrumb, so the back
 *  link is their only exit to the default route. */
function getBackHref(route) {
  if (route.section === 'settings') return DEFAULT_ROUTE;
  return null;
}

function renderTabs(route) {
  if (!tabsHost) return;
  const inSettings = route.section === 'settings';
  const activeSection = route.section;

  // Repaint the whole tab row every call — cheap (≤5 nodes) and keeps the
  // back link's presence in sync with the current route without a separate
  // mode tracker.
  tabsHost.innerHTML = '';
  const source = inSettings ? SETTINGS_TABS : TABS;
  for (const t of source) {
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

  // Back link on the right edge of the nav — shown on every non-catalogue
  // route (Settings sub-pages + detail views). The nav band is already
  // hidden altogether in the scene viewer via `.pb-body--fixed-viewport`,
  // so the scene viewer keeps its own full-width chrome.
  const backHref = getBackHref(route);
  if (backHref) {
    const back = el('a', {
      href: backHref,
      class: 'pb-section-nav-back',
      'aria-label': 'Back'
    }, [
      el('span', { class: 'material-symbols-outlined pb-icon-sm' }, 'arrow_back'),
      el('span', { class: 'pb-tab-label' }, 'Back')
    ]);
    tabsHost.appendChild(back);
  }

  const activeKey = inSettings ? settingsActiveKey(route.name) : activeSection;
  tabsHost.querySelectorAll('.pb-tab').forEach((a) => {
    a.classList.toggle('pb-tab--active', a.dataset.tab === activeKey);
  });

  // Settings gear mirrors the "am I in Settings?" state.
  const gear = document.getElementById('pb-settings-btn');
  if (gear) gear.classList.toggle('is-active', inSettings);
}

function settingsActiveKey(routeName) {
  if (routeName === 'settings-members') return 'members';
  if (routeName === 'settings-connection') return 'connection';
  if (routeName === 'settings-preferences') return 'preferences';
  if (routeName === 'settings-about') return 'about';
  return null;
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

/**
 * Compose a single-line meta row — items separated by " · ". Use in the
 * `subtitle` slot of `renderViewHeader` (or anywhere a dot-separated row
 * of facts belongs). Nullish / empty items are dropped so callers can
 * pass conditional tokens without pre-filtering.
 *
 * @param {Array<string|Node|null|undefined>} items
 * @returns {Node}
 */
export function metaLine(items) {
  const kept = (items || []).filter((x) => x != null && x !== '');
  const children = [];
  kept.forEach((item, i) => {
    if (i > 0) children.push(el('span', { class: 'pb-meta-sep', 'aria-hidden': 'true' }, ' · '));
    children.push(typeof item === 'string' ? document.createTextNode(item) : item);
  });
  return el('span', { class: 'pb-meta-line' }, children);
}

/**
 * Two-row meta block: a `metaLine` on top, a smaller muted secondary line
 * below (typically an updated-at timestamp). Use in the `subtitle` slot
 * when a single line can't hold all the relevant facts.
 *
 * @param {{ meta: Array<string|Node>, secondary?: string|Node }} opts
 * @returns {Node}
 */
export function metaStack({ meta, secondary } = {}) {
  const children = [metaLine(meta || [])];
  if (secondary != null && secondary !== '') {
    children.push(el('div', { class: 'pb-meta-secondary' },
      typeof secondary === 'string' ? secondary : secondary));
  }
  return el('div', { class: 'pb-meta-stack' }, children);
}

function emptyState(icon, title, desc, cta) {
  return el('div', { class: 'empty-state' }, [
    el('span', { class: 'material-symbols-outlined' }, icon),
    el('div', { class: 'empty-state-title' }, title),
    el('div', { class: 'empty-state-description' }, desc || ''),
    cta || null
  ].filter(Boolean));
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
  renderTabs(route);

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
    // No sidebar to refresh on a feature tab switch — Layers catalogues
    // are full-width now.
    return;
  }

  // Unmount old view.
  if (currentView?.module?.unmount) {
    try { currentView.module.unmount(); } catch (e) { console.error(e); }
  }
  currentView = null;
  closeModal();

  app.innerHTML = '';

  // Mount main view.
  // Note: the old `features-empty` inline handler was replaced by
  // `features-catalogue.js` — a real module that owns its empty state and
  // the search/gallery/list toggle. The router no longer auto-navigates to
  // the first layer; the catalogue shows the full inventory instead.

  // Preferences is a tiny placeholder — inline here (mirrors About below)
  // so we don't spin up a dedicated module for a "Coming soon" state.
  if (route.name === 'settings-preferences') {
    app.appendChild(renderViewHeader({
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

  const ctl = wireMenu(btn, menu, wrap);

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-account-action]');
    if (!item) return;
    ctl.close();
    // All account actions are mocked for now. Prototype-only — no auth.
    // Sign-out is distinct from "not implemented yet" — the prototype has
    // no auth to sign out of, so "coming soon" would imply users are stuck.
    const action = item.dataset.accountAction;
    const msg = action === 'signout'
      ? 'Sign out is not available in this prototype — reload the page to reset.'
      : `${ { profile: 'Profile', preferences: 'Preferences' }[action] || 'Action' } — coming soon`;
    import('./utils.js').then((u) => u.toast(msg, 'info'));
  });
}
wireAccountMenu();

// Topbar global search — wired once on boot. The module owns its own
// data index + bus subscriptions so we don't need a router-level hook.
import('./global-search.js').then((m) => m.mountGlobalSearch());

if (!location.hash) location.hash = DEFAULT_ROUTE;
else handleRoute();
