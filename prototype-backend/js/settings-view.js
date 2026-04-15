// prototype-backend — Settings view (stub)

import { el } from './utils.js';
import { renderBreadcrumb } from './app.js';

let root = null;

export function mount(container) {
  root = container;
  renderBreadcrumb([{ label: 'Settings' }]);
  root.innerHTML = '';
  root.appendChild(el('div', { class: 'pb-hero' }, [
    el('div', { class: 'pb-hero-title' }, 'Settings'),
    el('div', { class: 'pb-hero-subtitle' }, 'Workspace configuration.')
  ]));
  root.appendChild(el('div', { class: 'pb-card pb-card--padded' }, [
    el('div', { class: 'pb-card-header' }, 'Connection'),
    el('div', { class: 'pb-card-body' }, [
      el('div', { class: 'pb-kv' }, [el('dt', {}, 'Mode'), el('dd', {}, 'Mock (browser localStorage)')]),
      el('div', { class: 'pb-kv' }, [el('dt', {}, 'Endpoint'), el('dd', {}, '—')]),
      el('div', { class: 'pb-kv' }, [el('dt', {}, 'User'), el('dd', {}, 'local')])
    ])
  ]));
}

export function unmount() { if (root) root.innerHTML = ''; root = null; }
