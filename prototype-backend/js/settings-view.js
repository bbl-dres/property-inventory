// prototype-backend — Settings → Connection view
//
// One of the Settings sub-pages (alongside Members and Preferences). Owns its
// own view-header identity — the title is "Connection", not "Settings", since
// the Settings section is defined by its sidebar not by a single landing view.

import { el } from './utils.js';
import { renderViewHeader } from './app.js';
import { state, setCurrentRole } from './state.js';

let root = null;

export function mount(container) {
  root = container;
  root.innerHTML = '';
  root.appendChild(renderViewHeader({
    title: 'Connection',
    subtitle: 'Mock · localStorage',
    description: 'How the prototype reads and writes data. This build uses the browser\'s localStorage as a stand-in for a real backend — the production build would connect to a Supabase Postgres instance.'
  }));

  // --- Demo role switcher ---
  // Prototype-only: this select flips `state.currentUser.role` and emits
  // `user:role-changed`. Views disable mutation buttons for the `viewer`
  // role. No server-side enforcement — the real Supabase build would
  // enforce roles via Row-Level-Security policies.
  const roleSelect = el('select', { class: 'pb-inline-input', 'aria-label': 'Demo role' },
    ['viewer', 'editor', 'admin'].map((r) =>
      el('option', { value: r, selected: r === state.currentUser.role ? true : undefined }, r)
    )
  );
  roleSelect.addEventListener('change', () => setCurrentRole(roleSelect.value));

  // Card header is dropped — the view-header already says "Connection", so a
  // duplicate card title would just repeat it. The card itself is kept as the
  // visual frame for the kv rows.
  root.appendChild(el('div', { class: 'pb-card pb-card--padded' }, [
    el('div', { class: 'pb-card-body' }, [
      el('div', { class: 'pb-kv' }, [el('dt', {}, 'Mode'), el('dd', {}, 'Mock (browser localStorage)')]),
      el('div', { class: 'pb-kv' }, [el('dt', {}, 'Endpoint'), el('dd', {}, '—')]),
      el('div', { class: 'pb-kv' }, [el('dt', {}, 'User'), el('dd', {}, 'local')]),
      el('div', { class: 'pb-kv' }, [
        el('dt', {}, 'Switch role (demo only)'),
        el('dd', {}, [
          roleSelect,
          el('div', { class: 'pb-field-hint', style: { marginTop: '4px' } },
            'Cosmetic only — disables mutation buttons in the UI. No server enforcement. The real backend would use Supabase RLS.')
        ])
      ])
    ])
  ]));
}

export function unmount() { if (root) root.innerHTML = ''; root = null; }
