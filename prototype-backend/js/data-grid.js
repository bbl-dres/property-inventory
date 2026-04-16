// prototype-backend — Data tab (M4 + M5 import)
// Paginated record grid with sort, side-panel CRUD form, export, and import modal.

import * as api from './api.js';
import { ApiError } from './api.js';
import {
  el, toast, confirmModal, downloadBlob,
  parseGeometry, geometryToWkt, trapFocus, safeUnsubscribe, wireMenu
} from './utils.js';
import { bus, isAllowed } from './state.js';
import { openImportModal } from './import-modal.js';
import { GEOMETRY_COMPAT, geomTypeIcon } from './constants.js';

const ROLE_GATED_TITLE = 'Requires editor or admin role';

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 50;

let root = null;
let layer = null;

// view state
let rows = [];
let total = 0;
let page = 1; // 1-based
let pageSize = DEFAULT_PAGE_SIZE;
let sort = null; // { column, direction }
let loading = false;
let sidePanel = null;
let escHandler = null;
let sidePanelTrapDetach = null;
let lastFocused = null;
let loadToken = 0;
let roleUnsub = null;
// Pending filter-input debounce timer. Held at module scope so a full
// re-render (which re-creates the filter input) can cancel any in-flight
// timeout from the previous input element instead of leaking it — the old
// closure otherwise fires against a detached DOM node 300ms later.
let filterDebounceTimer = null;
// Client-side attribute filter (Phase 3). Case-insensitive partial match
// across all user columns. For MVP this filters the CURRENT page only after
// the server returns rows — a real grid would push this down as a query.
// TODO(v1.1): push filter to API as PostgREST 'ilike' or CQL
let filterText = '';

export async function mount(container, { layer: l, focusFeatureId } = {}) {
  // Refetch to pick up fresh schema — tabs share the layer object but the
  // Schema tab may have added columns before the user switched here.
  try { l = await api.getLayer(l.name); } catch {}
  root = container;
  layer = l;
  rows = [];
  total = 0;
  page = 1;
  pageSize = DEFAULT_PAGE_SIZE;
  sort = null;
  loadToken = 0;
  render();
  // Re-render toolbar buttons when role changes so disabled state updates live.
  roleUnsub = safeUnsubscribe(roleUnsub);
  roleUnsub = bus.on('user:role-changed', () => { if (root) render(); });
  await loadPage();
  // If we were mounted with a focus hint (user clicked "Open in Data" from
  // a map popup), look the record up and open its side panel. Fetched
  // directly rather than paged through — for the prototype scale (≤100
  // records per layer) this is cheap. TODO(v1.1): page-aware navigation.
  if (focusFeatureId != null) {
    try {
      const all = await api.listFeatures(layer.name, { limit: -1 });
      const match = (all.features || []).find((f) => f.id === focusFeatureId);
      if (match) openSidePanel(match);
      else toast(`Record not found in ${layer.title || layer.name}`, 'info');
    } catch (err) {
      toast(err?.message || 'Failed to open record', 'error');
    }
  }
}

export function unmount() {
  closeSidePanel();
  roleUnsub = safeUnsubscribe(roleUnsub);
  if (filterDebounceTimer) { clearTimeout(filterDebounceTimer); filterDebounceTimer = null; }
  if (root) root.innerHTML = '';
  root = null;
  layer = null;
  rows = [];
}

function userColumns() {
  return (layer.columns || []).filter((c) => !c.locked);
}

/**
 * Apply the current filter (if any) to a row list. Case-insensitive partial
 * match across all user columns. Client-side only for MVP.
 * TODO(v1.1): push filter to API as PostgREST 'ilike' or CQL
 */
function applyFilter(list) {
  const q = filterText.trim().toLowerCase();
  if (!q) return list;
  const cols = userColumns().map((c) => c.name);
  return list.filter((f) => {
    const props = f.properties || {};
    for (const c of cols) {
      const v = props[c];
      if (v == null) continue;
      if (String(v).toLowerCase().includes(q)) return true;
    }
    return false;
  });
}

function filteredRows() {
  return applyFilter(rows);
}

function isSpatial() {
  return layer.geometry_type && layer.geometry_type !== 'Table';
}

async function loadPage() {
  if (!root) return;
  // Request-id guard: rapid sort clicks / pagination otherwise let a late
  // response overwrite a later request's state (last-to-resolve wins wrong).
  const myToken = ++loadToken;
  const isStale = () => myToken !== loadToken || !root;
  loading = true;
  renderLoadingState();
  try {
    const offset = (page - 1) * pageSize;
    const opts = { limit: pageSize, offset };
    if (sort) opts.sort = sort;
    const res = await api.listFeatures(layer.name, opts);
    if (isStale()) return;
    rows = res.features;
    total = res.total;
  } catch (err) {
    if (isStale()) return;
    toast(err?.message || 'Failed to load records', 'error');
    rows = [];
    total = 0;
  }
  if (isStale()) return;
  loading = false;
  render();
}

function renderLoadingState() {
  // Keep toolbar, show loading row.
  const body = root.querySelector('.pb-data-grid tbody');
  if (!body) { render(); return; }
  body.innerHTML = '';
  const colspan = tableColumnCount();
  body.appendChild(el('tr', {}, [
    el('td', { colspan: String(colspan), class: 'pb-center pb-muted', style: { padding: '24px' } }, 'Loading…')
  ]));
}

function tableColumnCount() {
  // (geom-type icon if spatial) + id + user columns + (geom-present if spatial)
  return (isSpatial() ? 1 : 0) + 1 + userColumns().length + (isSpatial() ? 1 : 0);
}

// geomTypeIcon() lives in constants.js as the canonical mapping used by
// every layer-row surface in the app.

// ===== Render =====

function render() {
  if (!root) return;
  root.innerHTML = '';

  root.appendChild(renderToolbar());

  const card = el('div', { class: 'pb-card pb-data-card' });
  const tableWrap = el('div', { class: 'pb-data-scroll' }, [renderTable()]);
  card.appendChild(tableWrap);
  root.appendChild(card);

  root.appendChild(renderFooter());
}

/** Single toolbar row: search (left) + primary actions (right). */
function renderToolbar() {
  const canWrite = isAllowed('write');

  // --- Search input ---
  // `type=search` renders a native clear affordance, so we don't ship an
  // explicit Clear button. Placeholder is just "Search table…" — the old
  // "case-insensitive, across all columns" hint read as API documentation.
  const searchInput = el('input', {
    type: 'search',
    class: 'pb-grid-search',
    placeholder: 'Search table…',
    value: filterText,
    'aria-label': 'Search rows'
  });
  const applySearchNow = () => {
    filterText = searchInput.value;
    const tbl = root?.querySelector('.pb-data-grid');
    const parent = tbl?.parentElement;
    if (parent) { parent.innerHTML = ''; parent.appendChild(renderTable()); }
    // Footer shows the row-count label — keep it in sync.
    const countEl = root?.querySelector('.pb-grid-footer-count');
    if (countEl) countEl.textContent = countLabel();
  };
  // Module-scope debounce timer (see top-of-file comment).
  const debouncedApply = () => {
    if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
    filterDebounceTimer = setTimeout(() => {
      filterDebounceTimer = null;
      if (!root) return;
      applySearchNow();
    }, 300);
  };
  searchInput.addEventListener('input', debouncedApply);

  const searchWrap = el('div', { class: 'pb-grid-search-wrap' }, [
    el('span', { class: 'material-symbols-outlined pb-icon-sm pb-grid-search-icon' }, 'search'),
    searchInput
  ]);

  // --- Primary actions ---
  const newBtn = el('button', {
    type: 'button',
    class: 'btn-primary',
    disabled: !canWrite ? true : false,
    title: canWrite ? '' : ROLE_GATED_TITLE
  }, [
    el('span', { class: 'material-symbols-outlined pb-icon-sm' }, 'add'),
    ' New record'
  ]);
  newBtn.addEventListener('click', () => openSidePanel(null));

  const importBtn = el('button', {
    type: 'button',
    class: 'btn-secondary',
    disabled: !canWrite ? true : false,
    title: canWrite ? '' : ROLE_GATED_TITLE
  }, 'Import');
  importBtn.addEventListener('click', () => {
    openImportModal(layer, async () => {
      bus.emit('data:changed');
      await loadPage();
    });
  });

  // --- Export dropdown ---
  const exportBtn = el('button', {
    type: 'button',
    class: 'btn-secondary',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false'
  }, [
    el('span', { class: 'material-symbols-outlined pb-icon-sm' }, 'file_download'),
    ' Export ',
    el('span', { class: 'material-symbols-outlined pb-icon-sm' }, 'arrow_drop_down')
  ]);
  const exportMenu = el('div', { class: 'pb-menu', role: 'menu', hidden: true });
  const exportWrap = el('div', { class: 'pb-menu-wrap' }, [exportBtn, exportMenu]);
  const exportCtl = wireMenu(exportBtn, exportMenu, exportWrap);
  const exportItem = (icon, label, fmt) => {
    const b = el('button', { type: 'button', class: 'pb-menu-item', role: 'menuitem' }, [
      el('span', { class: 'material-symbols-outlined' }, icon),
      el('span', {}, label)
    ]);
    b.addEventListener('click', () => { exportCtl.close(); handleExport(fmt); });
    return b;
  };
  exportMenu.append(
    exportItem('data_object', 'GeoJSON', 'geojson'),
    exportItem('table_rows',  'CSV',     'csv')
  );

  return el('div', { class: 'pb-toolbar pb-grid-toolbar' }, [
    searchWrap,
    el('div', { style: { flex: '1' } }),
    el('div', { class: 'pb-grid-actions' }, [newBtn, importBtn, exportWrap])
  ]);
}

function countLabel() {
  if (!total) return '0 records';
  if (filterText.trim()) {
    const shown = filteredRows().length;
    return `${shown.toLocaleString()} of ${total.toLocaleString()} records (filtered)`;
  }
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()} records`;
}

/** Footer: count label (left), pagination (center), rows-per-page (right). */
function renderFooter() {
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const prevBtn = el('button', { type: 'button', class: 'pb-grid-page-btn', disabled: page <= 1, 'aria-label': 'Previous page' }, [
    el('span', { class: 'material-symbols-outlined pb-icon-sm' }, 'chevron_left')
  ]);
  prevBtn.addEventListener('click', () => { if (page > 1) { page--; loadPage(); } });

  const nextBtn = el('button', { type: 'button', class: 'pb-grid-page-btn', disabled: page >= pages, 'aria-label': 'Next page' }, [
    el('span', { class: 'material-symbols-outlined pb-icon-sm' }, 'chevron_right')
  ]);
  nextBtn.addEventListener('click', () => { if (page < pages) { page++; loadPage(); } });

  const pageSizeSelect = el('select', { class: 'pb-grid-pagesize', 'aria-label': 'Rows per page' },
    PAGE_SIZE_OPTIONS.map((n) =>
      el('option', { value: String(n), selected: n === pageSize ? true : undefined }, String(n))
    )
  );
  pageSizeSelect.addEventListener('change', () => {
    const next = Number(pageSizeSelect.value) || DEFAULT_PAGE_SIZE;
    if (next === pageSize) return;
    pageSize = next;
    page = 1;
    loadPage();
  });

  return el('div', { class: 'pb-grid-footer' }, [
    el('span', { class: 'pb-muted pb-grid-footer-count' }, countLabel()),
    el('div', { class: 'pb-grid-pager' }, [
      prevBtn,
      el('span', { class: 'pb-muted pb-grid-page-label' }, `Page ${page} of ${pages}`),
      nextBtn
    ]),
    el('label', { class: 'pb-grid-footer-pagesize' }, [
      el('span', { class: 'pb-muted' }, 'Rows per page:'),
      pageSizeSelect
    ])
  ]);
}

function renderTable() {
  const userCols = userColumns();
  const spatial = isSpatial();

  const headers = [];
  if (spatial) {
    // Geom-type icon column header (narrow, non-sortable). Label kept short
    // and the material icon doubles as the visual.
    headers.push(el('th', {
      style: { width: '48px' },
      class: 'pb-center',
      title: 'Geometry type of each record (compared against the layer declaration)'
    }, [
      el('span', { class: 'material-symbols-outlined pb-icon-sm' }, 'category')
    ]));
  }
  headers.push(renderHeaderCell('id', 'id', { width: '140px' }));
  for (const c of userCols) headers.push(renderHeaderCell(c.name, c.name));
  if (spatial) {
    headers.push(el('th', { style: { width: '140px' } }, 'geom'));
  }

  const body = el('tbody', {});
  if (loading) {
    body.appendChild(el('tr', {}, [
      el('td', { colspan: String(headers.length), class: 'pb-center pb-muted', style: { padding: '24px' } }, 'Loading…')
    ]));
  } else if (!filteredRows().length && filterText.trim()) {
    body.appendChild(el('tr', {}, [
      el('td', { colspan: String(headers.length), class: 'pb-center pb-muted', style: { padding: '24px' } },
        `No rows match "${filterText}" on this page.`)
    ]));
  } else if (!rows.length) {
    const canWrite = isAllowed('write');
    const newBtn = el('button', {
      type: 'button',
      class: 'btn-primary',
      disabled: !canWrite ? true : false,
      title: canWrite ? '' : ROLE_GATED_TITLE
    }, [
      el('span', { class: 'material-symbols-outlined pb-icon-md' }, 'add'),
      ' New record'
    ]);
    newBtn.addEventListener('click', () => openSidePanel(null));
    body.appendChild(el('tr', {}, [
      el('td', { colspan: String(headers.length), class: 'pb-center pb-muted', style: { padding: '40px 24px' } }, [
        el('div', { class: 'empty-state-title', style: { marginBottom: '8px' } }, 'No records yet'),
        el('div', { class: 'empty-state-description', style: { marginBottom: '16px' } }, 'Add your first record to get started, or import from a file.'),
        newBtn
      ])
    ]));
  } else {
    for (const f of filteredRows()) body.appendChild(renderDataRow(f, userCols));
  }

  return el('table', { class: 'pb-table pb-data-grid' }, [
    el('thead', {}, [el('tr', {}, headers)]),
    body
  ]);
}

function renderHeaderCell(label, colKey, styleOpts = {}) {
  const isSorted = sort && sort.column === colKey;
  const dir = isSorted ? sort.direction : null;
  // Dual-arrow indicator — both directions always rendered; the active one
  // is highlighted via a class. Communicates "sortable" on every header
  // instead of only hinting when the user has already sorted a column.
  const indicator = el('span', {
    class: 'pb-sort-indicator' + (isSorted ? ` is-sorted is-${dir}` : ''),
    'aria-hidden': 'true'
  }, [
    el('span', { class: 'pb-sort-arrow pb-sort-arrow--up' }, '▲'),
    el('span', { class: 'pb-sort-arrow pb-sort-arrow--down' }, '▼')
  ]);
  const th = el('th', {
    class: 'pb-th-sortable' + (isSorted ? ' is-sorted' : ''),
    style: styleOpts,
    'aria-sort': isSorted ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'
  }, [
    el('span', { class: 'pb-th-label' }, label),
    indicator
  ]);
  th.addEventListener('click', () => toggleSort(colKey));
  return th;
}

function toggleSort(colKey) {
  if (!sort || sort.column !== colKey) {
    sort = { column: colKey, direction: 'asc' };
  } else if (sort.direction === 'asc') {
    sort = { column: colKey, direction: 'desc' };
  } else {
    sort = null;
  }
  page = 1;
  loadPage();
}

function renderDataRow(feature, userCols) {
  const tr = el('tr', { dataset: { id: feature.id } });
  tr.addEventListener('click', () => openSidePanel(feature));

  const spatial = isSpatial();
  if (spatial) {
    // Narrow first column: icon for the row's ACTUAL geometry type (not the
    // layer declaration) — a mismatch here is a signal of bad import data.
    const geomType = feature.geometry?.type || null;
    const iconName = geomTypeIcon(geomType);
    const tooltip = geomType
      ? (geomType === layer.geometry_type
          ? geomType
          : `${geomType} (layer declares ${layer.geometry_type})`)
      : 'No geometry';
    tr.appendChild(el('td', { class: 'pb-center', title: tooltip }, [
      el('span', {
        class: 'material-symbols-outlined pb-muted pb-icon-md',
        'aria-label': tooltip
      }, iconName)
    ]));
  }

  tr.appendChild(el('td', { class: 'pb-name-mono' }, shortId(feature.id)));
  for (const c of userCols) {
    tr.appendChild(el('td', {}, formatCell(feature.properties?.[c.name], c.type)));
  }
  if (spatial) {
    tr.appendChild(el('td', {}, [
      feature.geometry
        ? el('span', { class: 'pb-muted', title: 'Geometry present' }, `⬡ ${feature.geometry.type || layer.geometry_type}`)
        : el('span', { class: 'pb-muted' }, '—')
    ]));
  }
  return tr;
}

function shortId(id) {
  if (!id) return '—';
  const s = String(id);
  return s.length > 10 ? s.slice(0, 8) + '…' : s;
}

function formatCell(value, type) {
  if (value == null || value === '') return el('span', { class: 'pb-muted' }, '—');
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'timestamptz') return String(value).replace('T', ' ').replace('Z', ' UTC');
  if (type === 'jsonb') {
    // Render JSON as an inline code block so structure is obvious in the grid.
    let text;
    try { text = typeof value === 'string' ? value : JSON.stringify(value); }
    catch { text = String(value); }
    // Truncate aggressively in the cell view; full value visible in the side panel.
    const short = text.length > 60 ? text.slice(0, 57) + '…' : text;
    return el('code', { class: 'pb-code pb-code--inline', title: text }, short);
  }
  if (type === 'uuid') {
    return el('span', { class: 'pb-name-mono', title: String(value) }, String(value));
  }
  return String(value);
}

// ===== Export =====

async function handleExport(format) {
  try {
    const blob = await api.exportFeatures(layer.name, format);
    const ext = format === 'geojson' ? 'geojson' : 'csv';
    downloadBlob(`${layer.name}.${ext}`, blob);
    toast(`Exported ${format.toUpperCase()}`, 'success');
  } catch (err) {
    toast(err?.message || 'Export failed', 'error');
  }
}

// Extract the first coordinate pair from a GeoJSON geometry object, in
// `{ lat, lon }` form. Returns null when the geometry is absent, malformed,
// or its coords chain doesn't resolve to a `[lon, lat, ...]` array.
function firstPointFromGeometry(geom) {
  if (!geom || typeof geom !== 'object') return null;
  const { type, coordinates: c } = geom;
  if (!c) return null;
  let pt = null;
  try {
    switch (type) {
      case 'Point':             pt = c; break;
      case 'MultiPoint':
      case 'LineString':        pt = c[0]; break;
      case 'MultiLineString':
      case 'Polygon':           pt = c[0]?.[0]; break;
      case 'MultiPolygon':      pt = c[0]?.[0]?.[0]; break;
      default:                  pt = null;
    }
  } catch { return null; }
  if (!Array.isArray(pt) || pt.length < 2) return null;
  const lon = Number(pt[0]);
  const lat = Number(pt[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return { lat, lon };
}

// ===== Side panel =====

function openSidePanel(feature) {
  closeSidePanel();
  lastFocused = document.activeElement;

  const isEdit = !!feature;
  const userCols = userColumns();

  const inputs = {}; // colName -> input el
  const fieldRows = userCols.map((c) => {
    const input = buildInputForColumn(c, feature?.properties?.[c.name]);
    inputs[c.name] = input;
    return el('div', { class: 'pb-field' }, [
      el('label', {}, [
        c.name,
        ' ',
        el('span', { class: 'pb-badge-type' }, c.type),
        c.type === 'timestamptz' ? el('span', { class: 'pb-field-hint', style: { marginLeft: '6px' } }, '(UTC)') : null
      ]),
      input
    ]);
  });

  let geomInput = null;
  if (isSpatial()) {
    const initial = feature?.geometry ? JSON.stringify(feature.geometry, null, 2) : '';
    geomInput = el('textarea', {
      class: 'pb-geom-input',
      rows: '10',
      placeholder: `Paste ${layer.geometry_type} GeoJSON or WKT…`,
      spellcheck: 'false'
    });
    geomInput.value = initial;

    // Copy-as-WKT button (only when editing an existing geometry).
    const copyWktBtn = el('button', {
      type: 'button',
      class: 'btn-tertiary',
      style: { marginTop: '4px' }
    }, [
      el('span', { class: 'material-symbols-outlined pb-icon-xs' }, 'content_copy'),
      ' Copy as WKT'
    ]);
    copyWktBtn.addEventListener('click', async () => {
      const raw = geomInput.value.trim();
      if (!raw) { toast('Nothing to copy', 'info'); return; }
      try {
        const geom = parseGeometry(raw);
        const wkt = geometryToWkt(geom);
        await navigator.clipboard.writeText(wkt);
        toast('WKT copied', 'success');
      } catch (err) {
        toast('Cannot convert: ' + (err?.message || 'invalid geometry'), 'error');
      }
    });

    const accepted = GEOMETRY_COMPAT[layer.geometry_type] || [layer.geometry_type];

    // Read-only "Coordinates (first point)" display — gives users immediate
    // geographic context without having to decode the raw geometry JSON.
    // Shown as `lat, lon` to 6 decimal places (GeoJSON stores `[lon, lat]`
    // per spec; the display flip is intentional — humans expect lat-first).
    const firstPt = firstPointFromGeometry(feature?.geometry);
    const coordsRow = firstPt
      ? el('div', { class: 'pb-field-hint', style: { marginBottom: '4px' } }, [
          'Coordinates (first point): ',
          el('code', { class: 'pb-code pb-code--inline' },
            `${firstPt.lat.toFixed(6)}, ${firstPt.lon.toFixed(6)}`)
        ])
      : (feature
          ? el('div', { class: 'pb-field-hint', style: { marginBottom: '4px' } }, 'No geometry')
          : null);

    fieldRows.push(el('div', { class: 'pb-field' }, [
      el('label', {}, [
        'geometry',
        ' ',
        el('span', { class: 'pb-badge-type' }, layer.geometry_type)
      ]),
      el('div', { class: 'pb-field-hint', style: { marginBottom: '4px' } }, 'Accepts GeoJSON or WKT'),
      coordsRow,
      geomInput,
      el('div', { class: 'pb-field-hint' },
        `Geometry type must be one of: ${accepted.join(', ')}.`),
      isEdit ? copyWktBtn : null
    ].filter(Boolean)));
  }

  const errEl = el('div', { class: 'pb-field-error', style: { display: 'none' } });

  const canWriteSide = isAllowed('write');
  const saveBtn = el('button', {
    type: 'button',
    class: 'btn-primary',
    disabled: !canWriteSide ? true : false,
    title: canWriteSide ? '' : ROLE_GATED_TITLE
  }, isEdit ? 'Save changes' : 'Create record');
  const cancelBtn = el('button', { type: 'button', class: 'btn-secondary' }, 'Cancel');
  const deleteBtn = isEdit ? el('button', {
    type: 'button',
    class: 'btn-danger',
    disabled: !canWriteSide ? true : false,
    title: canWriteSide ? '' : ROLE_GATED_TITLE
  }, 'Delete') : null;
  const closeXBtn = el('button', {
    type: 'button',
    class: 'pb-side-panel-close',
    'aria-label': 'Close'
  }, [el('span', { class: 'material-symbols-outlined' }, 'close')]);

  const idRow = isEdit
    ? el('div', { class: 'pb-kv' }, [el('dt', {}, 'id'), el('dd', {}, [el('span', { class: 'pb-name-mono' }, feature.id)])])
    : null;

  const panel = el('aside', { class: 'pb-side-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': isEdit ? 'Edit record' : 'New record' }, [
    el('header', { class: 'pb-side-panel-header' }, [
      el('div', { class: 'pb-side-panel-title' }, isEdit ? 'Edit record' : 'New record'),
      closeXBtn
    ]),
    el('div', { class: 'pb-side-panel-body' }, [
      idRow,
      ...fieldRows,
      errEl
    ].filter(Boolean)),
    el('footer', { class: 'pb-side-panel-footer' }, [
      deleteBtn,
      el('div', { style: { flex: '1' } }),
      cancelBtn,
      saveBtn
    ].filter(Boolean))
  ]);

  const backdrop = el('div', { class: 'pb-side-panel-backdrop' });
  backdrop.addEventListener('click', () => closeSidePanel());

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
  // trigger slide-in
  requestAnimationFrame(() => {
    panel.classList.add('is-open');
    // Autofocus first input/textarea for a11y.
    const firstField = panel.querySelector('.pb-side-panel-body input, .pb-side-panel-body textarea, .pb-side-panel-body select');
    if (firstField) firstField.focus();
    else closeXBtn.focus();
  });

  sidePanel = { panel, backdrop };

  escHandler = (e) => { if (e.key === 'Escape') closeSidePanel(); };
  document.addEventListener('keydown', escHandler);

  // Trap Tab/Shift-Tab within the panel so keyboard users can't escape the
  // dialog into the document behind it.
  sidePanelTrapDetach = trapFocus(panel);

  closeXBtn.addEventListener('click', () => closeSidePanel());
  cancelBtn.addEventListener('click', () => closeSidePanel());

  saveBtn.addEventListener('click', async () => {
    errEl.style.display = 'none';
    const properties = {};
    for (const c of userCols) {
      let val;
      try {
        val = readInputValue(c, inputs[c.name]);
      } catch (e) {
        // Per-field parse errors (jsonb / uuid) surface inline.
        errEl.textContent = e?.message || 'Invalid value';
        errEl.style.display = '';
        return;
      }
      if (val !== undefined) properties[c.name] = val;
    }

    let geometry = null;
    if (isSpatial()) {
      const raw = geomInput.value.trim();
      if (raw) {
        try {
          const parsed = parseGeometry(raw);
          if (!parsed || typeof parsed !== 'object' || !parsed.type) {
            throw new Error('Geometry must be a GeoJSON object with a "type" field.');
          }
          const accepted = GEOMETRY_COMPAT[layer.geometry_type] || [layer.geometry_type];
          if (!accepted.includes(parsed.type)) {
            throw new Error(`Geometry type "${parsed.type}" not accepted for this layer (expects: ${accepted.join(' or ')}).`);
          }
          geometry = parsed;
        } catch (e) {
          errEl.textContent = 'Invalid geometry: ' + (e.message || e);
          errEl.style.display = '';
          return;
        }
      }
    }

    saveBtn.disabled = true;
    try {
      if (isEdit) {
        // NOTE (prototype-only semantics): the mock `updateFeature` shallow-merges
        // `properties` into the existing JSONB column. PostgREST PATCH on a JSONB
        // column REPLACES the whole value — so when we swap to the real Supabase
        // adapter this call must either send the FULL properties object (currently
        // safe: the side panel renders every non-locked column) OR be rewritten to
        // go through an RPC that does `properties || $1::jsonb`. See the JSDoc
        // block on `updateFeature` in js/api.js.
        await api.updateFeature(layer.name, feature.id, { properties, geometry });
        toast('Record saved', 'success');
      } else {
        await api.createFeature(layer.name, { properties, geometry });
        toast('Record created', 'success');
      }
      bus.emit('data:changed');
      // Refresh the grid BEFORE dismissing the panel so the user never sees
      // the freshly-edited record disappear for a blink while the reload runs.
      await loadPage();
      closeSidePanel();
    } catch (err) {
      const msg = err instanceof ApiError ? `${err.code}: ${err.message}` : (err?.message || 'Save failed');
      errEl.textContent = msg;
      errEl.style.display = '';
      saveBtn.disabled = false;
    }
  });

  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const ok = await confirmModal({
        title: 'Delete record',
        message: `Delete record ${shortId(feature.id)}? This cannot be undone.`,
        confirmLabel: 'Delete',
        danger: true
      });
      if (!ok) return;
      try {
        await api.deleteFeature(layer.name, feature.id);
        toast('Record deleted', 'success');
        bus.emit('data:changed');
        await loadPage();
        closeSidePanel();
      } catch (err) {
        toast(err?.message || 'Delete failed', 'error');
      }
    });
  }
}

function closeSidePanel() {
  if (!sidePanel) return;
  sidePanel.panel.classList.remove('is-open');
  const { panel, backdrop } = sidePanel;
  sidePanel = null;
  if (escHandler) { document.removeEventListener('keydown', escHandler); escHandler = null; }
  if (sidePanelTrapDetach) { try { sidePanelTrapDetach(); } catch {} sidePanelTrapDetach = null; }
  // Let transition play out; then remove.
  setTimeout(() => { panel.remove(); backdrop.remove(); }, 200);
  // Restore focus to whichever element opened the panel.
  if (lastFocused && typeof lastFocused.focus === 'function') {
    try { lastFocused.focus(); } catch {}
  }
  lastFocused = null;
}

// ===== Inputs per type =====

// Normalise `varchar(n)` down to its base so the switch handles bounded and
// unbounded varchar identically.
function baseType(t) {
  if (!t) return 'text';
  if (/^varchar\(/i.test(t)) return 'varchar';
  return t;
}

function buildInputForColumn(column, value) {
  switch (baseType(column.type)) {
    case 'integer':
    case 'bigint': {
      // Both are integer inputs; bigint step=1 stays the same in HTML-land.
      const i = el('input', { type: 'number', step: '1' });
      if (value != null && value !== '') i.value = String(value);
      return i;
    }
    case 'double precision':
    case 'numeric': {
      const i = el('input', { type: 'number', step: 'any' });
      if (value != null && value !== '') i.value = String(value);
      return i;
    }
    case 'boolean': {
      const i = el('input', { type: 'checkbox' });
      if (value === true) i.checked = true;
      return el('label', { class: 'pb-checkbox-row' }, [i, el('span', {}, value === true ? 'true' : 'false')]);
    }
    case 'date': {
      const i = el('input', { type: 'date' });
      if (value) i.value = String(value).slice(0, 10);
      return i;
    }
    case 'timestamptz': {
      const i = el('input', { type: 'datetime-local', step: '1' });
      if (value) {
        // Strip "Z" / offset for datetime-local; keep seconds.
        const s = String(value).replace('Z', '').replace(/([+-]\d{2}:?\d{2})$/, '');
        i.value = s.slice(0, 19);
      }
      return i;
    }
    case 'uuid': {
      const i = el('input', {
        type: 'text',
        pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
        placeholder: '00000000-0000-0000-0000-000000000000',
        class: 'pb-name-mono',
        spellcheck: 'false',
        autocomplete: 'off'
      });
      if (value != null) i.value = String(value);
      return i;
    }
    case 'jsonb': {
      const i = el('textarea', {
        rows: '6',
        class: 'pb-geom-input',
        spellcheck: 'false',
        placeholder: '{\n  "key": "value"\n}'
      });
      if (value != null) {
        try { i.value = typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
        catch { i.value = String(value); }
      }
      return i;
    }
    case 'varchar':
    case 'text':
    default: {
      const i = el('input', { type: 'text' });
      if (value != null) i.value = String(value);
      return i;
    }
  }
}

function readInputValue(column, wrapper) {
  const base = baseType(column.type);
  if (base === 'boolean') {
    const checkbox = wrapper.querySelector('input[type="checkbox"]');
    return !!checkbox.checked;
  }
  const input = wrapper; // for non-boolean, wrapper IS the input
  const raw = input.value;
  if (raw === '' || raw == null) return null;
  switch (base) {
    case 'integer':
    case 'bigint': {
      // bigint may overflow JS Number range — we still parseInt for MVP; a real
      // adapter would send it as a string to preserve precision.
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : null;
    }
    case 'double precision':
    case 'numeric': {
      const n = parseFloat(raw);
      return Number.isFinite(n) ? n : null;
    }
    case 'timestamptz': {
      // datetime-local has no timezone; interpret as UTC per the (UTC) label.
      return raw.length ? raw + 'Z' : null;
    }
    case 'uuid': {
      const s = raw.trim();
      if (!s) return null;
      const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
      if (!UUID_RE.test(s)) throw new Error(`Invalid UUID for "${column.name}": ${s}`);
      return s.toLowerCase();
    }
    case 'jsonb': {
      const s = raw.trim();
      if (!s) return null;
      try { return JSON.parse(s); }
      catch (e) { throw new Error(`Invalid JSON for "${column.name}": ${e.message}`); }
    }
    default:
      return raw;
  }
}
