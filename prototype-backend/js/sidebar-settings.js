// prototype-backend — Settings sidebar

import { el } from './utils.js';

let root = null;
let activeKey = 'connection';

const ITEMS = [
  { key: 'members',     label: 'Members',     sub: 'Users & roles',    icon: 'group',    href: '#/settings/members' },
  { key: 'connection',  label: 'Connection',  sub: 'Mock · localStorage', icon: 'storage', href: '#/settings' },
  { key: 'preferences', label: 'Preferences', sub: 'Coming soon',      icon: 'tune',     href: '#/settings' }
];

export function mount(container, opts = {}) {
  root = container;
  activeKey = opts.activeKey || 'connection';
  render();
}

export function unmount() {
  if (root) root.innerHTML = '';
  root = null;
}

export function setActive(key) {
  activeKey = key || 'connection';
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
