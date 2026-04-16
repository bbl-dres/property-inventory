// prototype-backend — Catalogue component
//
// Shared primitive behind the Maps & Apps and Layers landing pages. Handles:
//   - Search box with 200ms debounced filter
//   - View-mode toggle: Gallery / List (always) + Map (opt-in via
//     `renderMapView`). Selection is sessionStorage-persisted per section.
//   - Empty / zero-match / populated states
//
// Callers supply per-section renderers (cards, list rows, header,
// optional map view) and the raw items. They can call `refresh(newItems)`
// after a create/delete to re-paint without re-mounting.
//
// The component does NOT own the view-header (title, actions) — the caller
// wraps this mount in a renderViewHeader + mount container of its choice.

import { el } from './utils.js';

const SESSION_PREFIX = 'pb:view:';
const VALID_VIEWS = new Set(['gallery', 'list', 'map']);

/**
 * Mount a catalogue into `container`.
 *
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {Array<object>} opts.items
 * @param {string} opts.sectionKey             - `'maps'` | `'features'`; keys sessionStorage
 * @param {'gallery'|'list'|'map'} [opts.defaultView]
 * @param {string} [opts.searchPlaceholder]
 * @param {(item: object, q: string) => boolean} [opts.matchesQuery]
 * @param {(item: object) => Node} opts.renderCard
 * @param {() => Node} opts.renderListHeader   - returns a `<tr>`
 * @param {(item: object) => Node} opts.renderListRow - returns a `<tr>`
 * @param {(container: HTMLElement, items: object[]) => ({ unmount?: () => void } | void)} [opts.renderMapView]
 *   Optional. When provided, the view-mode toggle gains a "Map" option
 *   and this function is called to paint the map into the body container.
 *   May return `{ unmount }` for cleanup when leaving the map view.
 * @param {{icon: string, title: string, description: string, cta?: Node}} [opts.emptyState]
 * @returns {{ refresh: (items: Array<object>) => void, unmount: () => void }}
 */
export function mountCatalogue(container, opts) {
  const {
    sectionKey,
    defaultView = 'gallery',
    searchPlaceholder = 'Search…',
    matchesQuery = defaultMatchesQuery,
    renderCard,
    renderListHeader,
    renderListRow,
    renderMapView,
    emptyState = { icon: 'inbox', title: 'Nothing here yet', description: '' }
  } = opts;

  const mapAvailable = typeof renderMapView === 'function';

  let items = Array.isArray(opts.items) ? opts.items.slice() : [];
  let query = '';
  let viewMode = readViewMode(sectionKey, defaultView, mapAvailable);
  let searchInput = null;
  let debounceTimer = null;
  let destroyed = false;
  // Cleanup returned by the caller's renderMapView (if any). Called when
  // leaving map mode OR when the catalogue itself unmounts.
  let mapCleanup = null;

  render();

  function render() {
    if (destroyed || !container) return;
    container.innerHTML = '';
    container.appendChild(renderToolbar());
    container.appendChild(renderBody());
  }

  function renderToolbar() {
    searchInput = el('input', {
      type: 'search',
      class: 'pb-catalogue-search',
      placeholder: searchPlaceholder,
      value: query,
      'aria-label': searchPlaceholder
    });
    searchInput.addEventListener('input', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (destroyed) return;
        query = searchInput.value;
        renderBodyOnly();
      }, 200);
    });

    const searchWrap = el('div', { class: 'pb-catalogue-search-wrap' }, [
      el('span', { class: 'material-symbols-outlined pb-icon-sm pb-catalogue-search-icon' }, 'search'),
      searchInput
    ]);

    const toggleButtons = [
      toggleBtn('gallery', 'grid_view',            'Gallery'),
      toggleBtn('list',    'format_list_bulleted', 'List')
    ];
    if (mapAvailable) toggleButtons.push(toggleBtn('map', 'public', 'Map'));
    const toggle = el('div', { class: 'pb-view-toggle', role: 'group', 'aria-label': 'View mode' }, toggleButtons);

    return el('div', { class: 'pb-catalogue-toolbar' }, [searchWrap, toggle]);
  }

  function toggleBtn(mode, icon, label) {
    const active = mode === viewMode;
    const b = el('button', {
      type: 'button',
      class: 'pb-view-toggle-btn' + (active ? ' is-active' : ''),
      title: label,
      'aria-label': label,
      'aria-pressed': active ? 'true' : 'false'
    }, [
      el('span', { class: 'material-symbols-outlined pb-icon-sm' }, icon)
    ]);
    b.addEventListener('click', () => {
      if (viewMode === mode) return;
      // Leaving map mode → tear down whatever the caller mounted.
      if (viewMode === 'map') teardownMap();
      viewMode = mode;
      writeViewMode(sectionKey, mode);
      render();
    });
    return b;
  }

  function teardownMap() {
    if (mapCleanup && typeof mapCleanup.unmount === 'function') {
      try { mapCleanup.unmount(); } catch {}
    }
    mapCleanup = null;
  }

  function filteredItems() {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => matchesQuery(it, q));
  }

  function renderBody() {
    const rows = filteredItems();

    if (!items.length) {
      const children = [
        el('span', { class: 'material-symbols-outlined' }, emptyState.icon),
        el('div', { class: 'empty-state-title' }, emptyState.title),
        el('div', { class: 'empty-state-description' }, emptyState.description || '')
      ];
      if (emptyState.cta) children.push(emptyState.cta);
      return el('div', { class: 'empty-state pb-catalogue-empty' }, children);
    }

    if (!rows.length) {
      return el('div', { class: 'empty-state pb-catalogue-empty' }, [
        el('span', { class: 'material-symbols-outlined' }, 'search_off'),
        el('div', { class: 'empty-state-title' }, 'No matches'),
        el('div', { class: 'empty-state-description' },
          `Nothing matched "${query.trim()}". Clear the search to see all ${items.length} items.`)
      ]);
    }

    if (viewMode === 'list') {
      return el('div', { class: 'pb-card pb-catalogue-list-wrap' }, [
        el('table', { class: 'pb-table pb-catalogue-list' }, [
          el('thead', {}, [renderListHeader()]),
          el('tbody', {}, rows.map(renderListRow))
        ])
      ]);
    }
    if (viewMode === 'map' && mapAvailable) {
      // Empty shell here; caller paints into it after the DOM is in place
      // (deferred by one tick so MapLibre has a sized container to measure).
      const mapHost = el('div', { class: 'pb-catalogue-map' });
      setTimeout(() => {
        if (destroyed || viewMode !== 'map') return;
        teardownMap();
        try { mapCleanup = renderMapView(mapHost, rows) || null; }
        catch (err) { console.error('[catalogue] renderMapView', err); }
      }, 0);
      return mapHost;
    }
    return el('div', { class: 'pb-catalogue-grid' }, rows.map(renderCard));
  }

  function renderBodyOnly() {
    // Replace only the body (second child) so the search input keeps focus
    // and the caret position isn't disturbed.
    const existing = container.children[1];
    const next = renderBody();
    if (existing) container.replaceChild(next, existing);
    else container.appendChild(next);
  }

  return {
    refresh(nextItems) {
      items = Array.isArray(nextItems) ? nextItems.slice() : [];
      renderBodyOnly();
    },
    unmount() {
      destroyed = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = null;
      searchInput = null;
      teardownMap();
    }
  };
}

function defaultMatchesQuery(item, q) {
  const name = String(item?.name || '').toLowerCase();
  const title = String(item?.title || '').toLowerCase();
  return name.includes(q) || title.includes(q);
}

function readViewMode(sectionKey, fallback, mapAvailable) {
  try {
    const v = sessionStorage.getItem(SESSION_PREFIX + sectionKey);
    if (VALID_VIEWS.has(v) && (v !== 'map' || mapAvailable)) return v;
  } catch {}
  return fallback;
}

function writeViewMode(sectionKey, v) {
  try { sessionStorage.setItem(SESSION_PREFIX + sectionKey, v); } catch {}
}
