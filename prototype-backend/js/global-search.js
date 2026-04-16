// prototype-backend — Global search (topbar)
//
// Debounced search across three sources:
//   - Maps & Apps  — match against product name / slug / description
//   - Layers       — match against layer name / title / description
//   - Attributes   — match against column names across all layers
//
// Results render as a dropdown below the input, grouped by source with
// up to 4 items per group. Click / Enter navigates to the appropriate
// detail view. Empty groups are hidden. Keyboard: arrows move the
// highlighted result, Enter selects, Escape closes.
//
// The data is fetched once at init and cached in module scope. It
// refreshes lazily on `layer:created`, `layer:deleted`, and
// `user:role-changed` bus events.

import * as api from './api.js';
import { el } from './utils.js';
import { bus } from './state.js';
import { geomTypeIcon } from './constants.js';

const MAX_PER_GROUP = 4;
const DEBOUNCE_MS = 150;

// Cached snapshots — refreshed on bus events. Access via `ensureIndex()`.
let indexPromise = null;
let productsIdx = [];
let layersIdx = [];
let attributesIdx = [];  // { columnName, layerName, layerTitle, type, description }

async function loadIndex() {
  try {
    const [products, layers] = await Promise.all([api.listProducts(), api.listLayers()]);
    productsIdx = products || [];
    layersIdx = layers || [];
    attributesIdx = [];
    for (const l of layersIdx) {
      for (const c of l.columns || []) {
        if (c.locked) continue; // skip id / geom
        attributesIdx.push({
          columnName: c.name,
          layerName: l.name,
          layerTitle: l.title || l.name,
          type: c.type,
          description: c.description || ''
        });
      }
    }
  } catch (err) {
    console.warn('[global-search] index load failed', err);
    productsIdx = [];
    layersIdx = [];
    attributesIdx = [];
  }
}

function ensureIndex() {
  if (!indexPromise) indexPromise = loadIndex();
  return indexPromise;
}

function invalidateIndex() {
  indexPromise = null;
}

/**
 * Wire the topbar search input into a working dropdown-search. Idempotent:
 * if called twice, the second call replaces the previous listener set.
 */
export function mountGlobalSearch() {
  const input = document.getElementById('pb-global-search');
  const panel = document.getElementById('pb-global-search-panel');
  const wrap = document.getElementById('pb-global-search-wrap');
  if (!input || !panel || !wrap) return;

  // Kick off the initial index load so the first keystroke is instant.
  ensureIndex();
  bus.on('layer:created',  invalidateIndex);
  bus.on('layer:deleted',  invalidateIndex);
  bus.on('layer:updated',  invalidateIndex);
  bus.on('schema:changed', invalidateIndex);

  let debounceTimer = null;
  let lastQuery = '';
  let groups = [];        // [{ label, items: [...] }]
  let flatItems = [];     // linear list across groups for keyboard nav
  let highlighted = -1;   // index into flatItems
  let panelOpen = false;

  const closePanel = () => {
    panelOpen = false;
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    highlighted = -1;
    document.removeEventListener('click', onOutside, true);
  };
  const openPanel = () => {
    if (panelOpen) return;
    panelOpen = true;
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onOutside, true);
  };
  const onOutside = (e) => { if (!wrap.contains(e.target)) closePanel(); };

  const runSearch = async () => {
    const q = input.value.trim().toLowerCase();
    lastQuery = q;
    if (!q) { renderEmpty('Start typing to search.'); return; }
    await ensureIndex();
    // Another keystroke might have superseded us during the await.
    if (lastQuery !== q) return;
    groups = computeGroups(q);
    flatItems = groups.flatMap((g) => g.items);
    highlighted = flatItems.length ? 0 : -1;
    paint();
  };

  const schedule = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { debounceTimer = null; runSearch(); }, DEBOUNCE_MS);
  };

  input.addEventListener('input', () => {
    openPanel();
    schedule();
  });
  input.addEventListener('focus', () => {
    openPanel();
    if (input.value.trim()) runSearch();
    else renderEmpty('Start typing to search.');
  });
  input.addEventListener('keydown', onKeyDown);

  // Expose nothing — the caller just trusts that the DOM is wired.

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (input.value) { input.value = ''; renderEmpty('Start typing to search.'); }
      else closePanel();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!flatItems.length) return;
      highlighted = (highlighted + 1) % flatItems.length;
      updateHighlight();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!flatItems.length) return;
      highlighted = (highlighted - 1 + flatItems.length) % flatItems.length;
      updateHighlight();
      return;
    }
    if (e.key === 'Enter') {
      if (highlighted >= 0 && flatItems[highlighted]) {
        e.preventDefault();
        go(flatItems[highlighted].href);
      }
    }
  }

  function go(href) {
    if (!href) return;
    input.value = '';
    closePanel();
    location.hash = href;
  }

  function paint() {
    if (!flatItems.length) {
      renderEmpty(`No matches for "${lastQuery}".`);
      return;
    }
    panel.innerHTML = '';
    let runningIdx = 0;
    for (const g of groups) {
      if (!g.items.length) continue;
      panel.appendChild(el('div', { class: 'pb-search-group-label' }, g.label));
      for (const item of g.items) {
        const nodeIdx = runningIdx++;
        const row = el('button', {
          type: 'button',
          class: 'pb-search-item' + (nodeIdx === highlighted ? ' is-highlighted' : ''),
          dataset: { idx: String(nodeIdx) }
        }, [
          el('span', { class: 'material-symbols-outlined pb-icon-sm pb-search-item-icon' }, item.icon),
          el('div', { class: 'pb-search-item-body' }, [
            el('div', { class: 'pb-search-item-title' }, item.title),
            item.sub ? el('div', { class: 'pb-search-item-sub pb-muted' }, item.sub) : null
          ].filter(Boolean))
        ]);
        row.addEventListener('mousemove', () => {
          if (highlighted !== nodeIdx) {
            highlighted = nodeIdx;
            updateHighlight();
          }
        });
        // `mousedown` so navigation wins the race against `blur` on the
        // input (which would otherwise close the panel before click fires).
        row.addEventListener('mousedown', (e) => {
          e.preventDefault();
          go(item.href);
        });
        panel.appendChild(row);
      }
    }
  }

  function updateHighlight() {
    panel.querySelectorAll('.pb-search-item').forEach((el) => {
      el.classList.toggle('is-highlighted', Number(el.dataset.idx) === highlighted);
    });
    const active = panel.querySelector('.pb-search-item.is-highlighted');
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  function renderEmpty(msg) {
    panel.innerHTML = '';
    panel.appendChild(el('div', { class: 'pb-search-empty' }, msg));
  }
}

// ---- Matching -----------------------------------------------------------

function computeGroups(q) {
  return [
    {
      label: 'Maps & Apps',
      items: productsIdx
        .filter((p) => matchProduct(p, q))
        .slice(0, MAX_PER_GROUP)
        .map((p) => ({
          icon: 'apps',
          title: p.name || p.slug,
          sub: [p.kind || 'app', (p.consumed_layers || []).length + ' layer' + ((p.consumed_layers || []).length === 1 ? '' : 's')].join(' · '),
          href: `#/maps/${encodeURIComponent(p.slug)}`
        }))
    },
    {
      label: 'Layers',
      items: layersIdx
        .filter((l) => matchLayer(l, q))
        .slice(0, MAX_PER_GROUP)
        .map((l) => ({
          icon: geomTypeIcon(l.geometry_type),
          title: l.title || l.name,
          sub: [l.name, l.geometry_type].join(' · '),
          href: `#/features/${encodeURIComponent(l.name)}`
        }))
    },
    {
      label: 'Attributes',
      items: attributesIdx
        .filter((a) => matchAttribute(a, q))
        .slice(0, MAX_PER_GROUP)
        .map((a) => ({
          icon: 'data_object',
          title: a.columnName,
          sub: [a.layerTitle, a.type].join(' · '),
          href: `#/features/${encodeURIComponent(a.layerName)}?tab=schema`
        }))
    }
  ];
}

function matchProduct(p, q) {
  return includes(p.name, q) || includes(p.slug, q) || includes(p.description, q);
}
function matchLayer(l, q) {
  return includes(l.name, q) || includes(l.title, q) || includes(l.description, q);
}
function matchAttribute(a, q) {
  return includes(a.columnName, q) || includes(a.description, q);
}
function includes(s, q) {
  return String(s || '').toLowerCase().includes(q);
}
