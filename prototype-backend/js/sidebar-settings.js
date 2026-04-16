// prototype-backend — Settings sidebar

import { el } from './utils.js';

let root = null;
let activeKey = 'members';

// First item wins the default-landing slot (see `resolveRoute` in app.js —
// `#/settings` redirects to this item's href). Keep Members first unless
// you're deliberately changing the section default.
const ITEMS = [
  { key: 'members',     label: 'Members',     sub: 'Users & roles',       icon: 'group',   href: '#/settings/members' },
  { key: 'connection',  label: 'Connection',  sub: 'Mock · localStorage', icon: 'storage', href: '#/settings/connection' },
  { key: 'preferences', label: 'Preferences', sub: 'Coming soon',         icon: 'tune',    href: '#/settings/preferences' },
  { key: 'about',       label: 'About',       sub: 'Version & links',     icon: 'info',    href: '#/settings/about' }
];

export function mount(container, opts = {}) {
  root = container;
  activeKey = opts.activeKey || 'members';
  // The aside element is shared across sections; label it from here so
  // the landmark's accessible name matches what's actually inside it.
  root.setAttribute('aria-label', 'Settings sections');
  render();
}

export function unmount() {
  if (root) {
    root.removeAttribute('aria-label');
    root.innerHTML = '';
  }
  root = null;
}

export function setActive(key) {
  activeKey = key || 'members';
  render();
}

function render() {
  if (!root) return;
  root.innerHTML = '';
  root.appendChild(el('div', { class: 'pb-sidebar-header' }, [
    el('div', { class: 'pb-sidebar-title' }, 'Settings')
  ]));
  const list = el('div', { class: 'pb-sidebar-list' },
    ITEMS.map((it) => el('a', {
      href: it.href,
      class: 'pb-sidebar-item' + (it.key === activeKey ? ' is-active' : ''),
      dataset: { key: it.key }
    }, [
      el('span', { class: 'material-symbols-outlined pb-sidebar-item-icon' }, it.icon),
      el('div', { class: 'pb-sidebar-item-body' }, [
        el('div', { class: 'pb-sidebar-item-title' }, it.label),
        el('div', { class: 'pb-sidebar-item-sub' }, it.sub)
      ])
    ]))
  );
  root.appendChild(list);
}
