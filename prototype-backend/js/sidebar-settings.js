// prototype-backend — Settings sidebar (stub)

import { el } from './utils.js';

let root = null;

export function mount(container) {
  root = container;
  root.innerHTML = '';
  root.appendChild(el('div', { class: 'pb-sidebar-header' }, [
    el('div', { class: 'pb-sidebar-title' }, 'Settings')
  ]));
  const list = el('div', { class: 'pb-sidebar-list' }, [
    el('a', { href: '#/settings', class: 'pb-sidebar-item is-active' }, [
      el('span', { class: 'material-symbols-outlined pb-sidebar-item-icon' }, 'storage'),
      el('div', { class: 'pb-sidebar-item-body' }, [
        el('div', { class: 'pb-sidebar-item-title' }, 'Connection'),
        el('div', { class: 'pb-sidebar-item-sub' }, 'Mock · localStorage')
      ])
    ]),
    el('a', { href: '#/settings', class: 'pb-sidebar-item' }, [
      el('span', { class: 'material-symbols-outlined pb-sidebar-item-icon' }, 'tune'),
      el('div', { class: 'pb-sidebar-item-body' }, [
        el('div', { class: 'pb-sidebar-item-title' }, 'Preferences'),
        el('div', { class: 'pb-sidebar-item-sub' }, 'Coming soon')
      ])
    ])
  ]);
  root.appendChild(list);
}

export function unmount() { if (root) root.innerHTML = ''; root = null; }
export function setActive() {}
