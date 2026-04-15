// prototype-backend — Users sidebar
//
// Prototype-only IAM. Roles here have no auth enforcement — the sidebar
// just mirrors the table in the main view and offers quick navigation.

import * as api from './api.js';
import { el, debounce } from './utils.js';

let root = null;
let users = [];
let searchValue = '';

export function mount(container) {
  root = container;
  root.innerHTML = '';
  renderShell();
  refresh();
}

export function unmount() {
  if (root) root.innerHTML = '';
  root = null;
  users = [];
  searchValue = '';
}

export function setActive() {}

function renderShell() {
  const header = el('div', { class: 'pb-sidebar-header' }, [
    el('div', { class: 'pb-sidebar-title' }, 'Users')
  ]);

  const searchBox = el('div', { class: 'pb-sidebar-search' }, [
    el('span', { class: 'material-symbols-outlined' }, 'search'),
    el('input', {
      type: 'search',
      placeholder: 'Search users…',
      'aria-label': 'Search users',
      value: searchValue
    })
  ]);
  searchBox.querySelector('input').addEventListener('input', debounce((e) => {
    searchValue = e.target.value;
    renderList();
  }, 120));

  const list = el('div', { class: 'pb-sidebar-list', id: 'pb-sidebar-users-list' });

  root.appendChild(header);
  root.appendChild(searchBox);
  root.appendChild(list);
}

async function refresh() {
  try { users = await api.listUsers(); }
  catch { users = []; }
  renderList();
}

function renderList() {
  if (!root) return;
  const host = root.querySelector('#pb-sidebar-users-list');
  if (!host) return;
  host.innerHTML = '';

  const q = searchValue.trim().toLowerCase();
  const filtered = q
    ? users.filter((u) =>
        (u.email || '').toLowerCase().includes(q) ||
        (u.name || '').toLowerCase().includes(q))
    : users;

  if (!filtered.length) {
    host.appendChild(el('div', { class: 'pb-sidebar-empty' },
      users.length ? `No matches for "${searchValue}"` : 'No users yet.'));
    return;
  }

  for (const u of filtered) {
    host.appendChild(el('a', {
      href: '#/users',
      class: 'pb-sidebar-item',
      dataset: { key: u.id }
    }, [
      el('span', { class: 'material-symbols-outlined pb-sidebar-item-icon' }, 'person'),
      el('div', { class: 'pb-sidebar-item-body' }, [
        el('div', { class: 'pb-sidebar-item-title' }, u.name || u.email),
        el('div', { class: 'pb-sidebar-item-sub' }, [
          el('span', { class: `pb-role pb-role--${u.role}` }, u.role),
          ' · ',
          u.email
        ])
      ])
    ]));
  }
}
