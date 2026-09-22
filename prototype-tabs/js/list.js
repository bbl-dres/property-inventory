// Table panel (buildings, parcels), table tabs, toolbar and the gallery view.

import { state } from './state.js';
import { collapseToolsPanelIfColliding } from './tools-panel.js';
import { placeholderImages, getStatusClassName } from './config.js';
import { formatNum, formatArea, escapeHtml, cssUrl } from './utils.js';
import { t, onLangChange } from './i18n.js';
import { createFeatureTable, initColumnVisibility, toggleAllColumns, initColumnsSearch, initDropdowns, initTableSearch } from './table.js';
import { selectBuilding, selectParcel } from './map.js';
import { showDetailView } from './ui.js';
import { initQuickExportMenu } from './export.js';

// ===== COLUMN DEFINITIONS =====

function ext(props) {
  return props.extensionData || {};
}

function statusBadge(v) {
  if (!v) return '–';
  return '<span class="badge status-badge ' + getStatusClassName(v) + '">' + escapeHtml(v) + '</span>';
}

const columnLabels = {
  "col-name": {
    "labelKey": 'col.bbl_bez'
  },
  "col-land": {
    "labelKey": 'col.adr_land'
  },
  "col-ort": {
    "labelKey": 'col.adr_ort'
  },
  "col-adresse": {
    "labelKey": 'col.adr_conct'
  },
  "col-portfolio": {
    "labelKey": 'col.bbl_port'
  },
  "col-flaeche": {
    "labelKey": 'info.label.area_ngf'
  },
  "col-status": {
    "labelKey": 'col.bbl_stat'
  },
  "col-parcel-plot": {
    "labelKey": 'col.parcel.plot'
  },
  "col-parcel-name": {
    "labelKey": 'col.parcel.name'
  },
  "col-parcel-municipality": {
    "labelKey": 'col.parcel.municipality'
  },
  "col-parcel-canton": {
    "labelKey": 'col.parcel.canton'
  },
  "col-parcel-area": {
    "labelKey": 'col.parcel.area'
  },
  "col-parcel-zone": {
    "labelKey": 'col.parcel.zone'
  },
  "col-parcel-ownership": {
    "labelKey": 'col.parcel.ownership'
  }
};

function columnWidth(col) {
  const field = col.sortField || col.field;
  if (/^(garea_|gvol_|larea_)/.test(field) && !field.endsWith('_acu') || ['area','lc_area','extensionData.netFloorArea'].includes(field)) return 'number';
  if (['bbl_awrt','bbl_bwrt'].includes(field)) return 'amount';
  if (['bbl_stat','status','av_stat'].includes(field)) return 'status';
  if (field === 'etl_ts') return 'date';
  if (['bbl_bjahr','bbl_vjahr','gastw','gastw_og','gastw_ug'].includes(field)) return 'year';
  if (['wgs84_lat','wgs84_lon','lv95_e','lv95_n','egm_elev'].includes(field)) return 'number';
  if (['adr_land','country','adr_reg','canton','av_nr','plotNumber','adr_plz','adr_hsnr','bfs_gemnr','kgs_nr','kgs_kat'].includes(field)) return 'code';
  if (['bbl_bez','name'].includes(field)) return 'name';
  if (['adr_conct','streetName'].includes(field)) return 'description';
  return 'text';
}

const buildingColumns = [
  { field: 'name', cls: 'col-name' },
  { field: 'country', cls: 'col-land' },
  { field: 'city', cls: 'col-ort' },
  { field: 'streetName', cls: 'col-adresse' },
  { field: 'extensionData', sortField: 'extensionData.portfolio', cls: 'col-portfolio', format: function(v, props) { return escapeHtml(ext(props).portfolio || '—'); } },
  { field: 'extensionData', sortField: 'extensionData.netFloorArea', cls: 'col-flaeche', format: function(v, props) { return formatNum(ext(props).netFloorArea || 0, 0) + ' m²'; } },
  { field: 'status', cls: 'col-status', format: statusBadge }
];

const parcelColumns = [
  { field: 'plotNumber', cls: 'col-parcel-plot' },
  { field: 'name', cls: 'col-parcel-name' },
  { field: 'municipality', cls: 'col-parcel-municipality' },
  { field: 'canton', cls: 'col-parcel-canton' },
  { field: 'area', cls: 'col-parcel-area', format: function(v) { return formatArea(v || 0); } },
  { field: 'landUseZone', cls: 'col-parcel-zone' },
  { field: 'ownershipType', cls: 'col-parcel-ownership' }
];

[buildingColumns, parcelColumns].forEach(function(columns) {
  columns.forEach(function(col) { Object.assign(col, columnLabels[col.cls] || {}, { width: columnWidth(col) }); });
});

const BUILDING_SEARCH_FIELDS = ['buildingId', 'name', 'country', 'city', 'streetName', 'extensionData.portfolio', 'status'];
const PARCEL_SEARCH_FIELDS = ['parcelId', 'plotNumber', 'name', 'municipality', 'canton', 'landUseZone', 'ownershipType'];

// ===== EMPTY STATE (buildings table and gallery) =====

function emptyStateHtml() {
  return '<div class="empty-state">' +
    '<span class="material-symbols-outlined">search_off</span>' +
    '<div class="empty-state-title">' + t('empty.title') + '</div>' +
    '<div class="empty-state-description">' + t('empty.description') + '</div>' +
    '<div class="empty-state-action"><button type="button" class="btn-secondary" data-action="resetAllFilters">' + t('empty.reset') + '</button></div>' +
    '</div>';
}

// ===== TABLES =====

function filteredBuildings() {
  const source = state.filteredData || state.buildingsData;
  return source ? source.features : [];
}

export const tables = {
  buildings: createFeatureTable({
    tbodyId: 'list-body',
    rowIdAttr: 'data-id',
    getRowId: function(p) { return p.buildingId; },
    columns: buildingColumns,
    getFeatures: filteredBuildings,
    searchFields: BUILDING_SEARCH_FIELDS,
    onRowSelect: function(id) { selectBuilding(id, true); },
    pagination: { infoId: 'list-pagination-info', pageInfoId: 'list-page-info', prevId: 'list-prev-btn', nextId: 'list-next-btn', rowsSelectId: 'list-rows-per-page', infoKey: 'pagination.info', emptyKey: 'pagination.empty' },
    empty: { type: 'block', afterSelector: '#buildings-table-content .list-table-wrapper', html: emptyStateHtml }
  }),
  parcels: createFeatureTable({
    tbodyId: 'parcels-body',
    rowIdAttr: 'data-parcel-id',
    getRowId: function(p) { return p.parcelId; },
    columns: parcelColumns,
    getFeatures: function() { return state.parcelData ? state.parcelData.features : []; },
    searchFields: PARCEL_SEARCH_FIELDS,
    onRowSelect: function(id) { selectParcel(id, true); },
    pagination: { infoId: 'parcels-pagination-info', pageInfoId: 'parcels-page-info', prevId: 'parcels-prev-btn', nextId: 'parcels-next-btn', rowsSelectId: 'parcels-rows-per-page', infoKey: 'pagination.parcels.info', emptyKey: 'pagination.parcels.empty' },
    empty: { type: 'row', colspan: parcelColumns.length, key: 'empty.parcels' }
  })
};

const TABLE_TABS = ['buildings', 'parcels'];

export function initTables() {
  TABLE_TABS.forEach(function(tab) { tables[tab].init(); });
}

export function renderTables() {
  if (!state.buildingsData) return;
  TABLE_TABS.forEach(function(tab) { tables[tab].render(); });
}

// After a filter change: only the buildings table depends on the filters (the parcels table
// always lists every parcel), so it is not rebuilt
export function renderFilteredTables() {
  if (!state.buildingsData) return;
  tables.buildings.render();
}

// ===== TABLE TABS =====

function columnsListFor(tab) {
  return document.getElementById(tab === 'parcels' ? 'parcel-columns-list' : 'columns-list');
}

function activeColumnsList() {
  return columnsListFor(state.activeTableTab);
}

function switchTableTab(tabName) {
  if (TABLE_TABS.indexOf(tabName) === -1) tabName = 'buildings';
  state.activeTableTab = tabName;

  document.querySelectorAll('.table-tab').forEach(function(tab) {
    const active = tab.dataset.tableTab === tabName;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  TABLE_TABS.forEach(function(tab) {
    const content = document.getElementById(tab + '-table-content');
    if (content) content.classList.toggle('active', tab === tabName);
    const list = columnsListFor(tab);
    if (list) list.style.display = tab === tabName ? '' : 'none';
  });

  // The toolbar search belongs to the visible table
  const searchInput = document.getElementById('list-search-input');
  const searchClear = document.getElementById('list-search-clear');
  if (searchInput) {
    searchInput.placeholder = t('table.search.' + tabName);
    searchInput.value = '';
  }
  if (searchClear) searchClear.hidden = true;
  TABLE_TABS.forEach(function(tab) { tables[tab].setSearchTerm(''); });

  const url = new URL(window.location);
  url.searchParams.set('tableTab', tabName);
  window.history.replaceState({}, '', url);
}

export function initTableTabs() {
  document.querySelectorAll('.table-tab').forEach(function(tab) {
    tab.addEventListener('click', function() { switchTableTab(this.dataset.tableTab); });
  });
  const savedTab = new URLSearchParams(window.location.search).get('tableTab');
  if (TABLE_TABS.indexOf(savedTab) !== -1 && savedTab !== state.activeTableTab) switchTableTab(savedTab);
}

// ===== SYNC TABLE TO MAP SELECTION =====

function syncTableTo(tab, id) {
  if (state.activeTableTab !== tab) switchTableTab(tab);
  tables[tab].syncTo(id);
}

export function syncTableToBuilding(buildingId) { if (state.buildingsData) syncTableTo('buildings', buildingId); }
export function syncTableToParcel(parcelId) { if (state.parcelData) syncTableTo('parcels', parcelId); }

// ===== TOOLBAR =====

export function initListToolbar() {
  initDropdowns();
  initQuickExportMenu();

  const toggleAllBtn = document.getElementById('columns-toggle-all');
  const toggleNoneBtn = document.getElementById('columns-toggle-none');
  if (toggleAllBtn) toggleAllBtn.addEventListener('click', function() { toggleAllColumns(activeColumnsList(), true); });
  if (toggleNoneBtn) toggleNoneBtn.addEventListener('click', function() { toggleAllColumns(activeColumnsList(), false); });

  initColumnVisibility('#table-panel', '#columns-dropdown-menu');
  initColumnsSearch('columns-search-input', 'columns-search-clear', activeColumnsList);
  initTableSearch('list-search-input', 'list-search-clear', function(term) {
    tables[state.activeTableTab].setSearchTerm(term);
  });
}

// ===== GALLERY VIEW =====

const GALLERY_PAGE_SIZE = 48;
let galleryCurrentPage = 1;
let galleryFilterTerm = '';

// The header search box filters the gallery while it is visible
export function initGalleryFilter() {
  const input = document.getElementById('search-input');
  if (!input) return;
  input.addEventListener('input', function() {
    if (state.currentView !== 'gallery') return;
    const val = input.value.trim().toLowerCase();
    if (val === galleryFilterTerm) return;
    galleryFilterTerm = val;
    galleryCurrentPage = 1;
    renderGalleryView();
  });

  const galleryGrid = document.getElementById('gallery-grid');
  if (!galleryGrid) return;
  galleryGrid.addEventListener('click', function(e) {
    if (e.target.closest('.gallery-prev-btn')) {
      e.stopPropagation();
      if (galleryCurrentPage > 1) {
        galleryCurrentPage--;
        renderGalleryView();
        document.getElementById('gallery-view').scrollTo(0, 0);
      }
      return;
    }
    if (e.target.closest('.gallery-next-btn')) {
      e.stopPropagation();
      const totalPages = Math.ceil(galleryFeatures().length / GALLERY_PAGE_SIZE);
      if (galleryCurrentPage < totalPages) {
        galleryCurrentPage++;
        renderGalleryView();
        document.getElementById('gallery-view').scrollTo(0, 0);
      }
      return;
    }
    const card = e.target.closest('.gallery-card[data-id]');
    if (card) showDetailView(card.dataset.id);
  });
  galleryGrid.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.gallery-card[data-id]');
    if (!card) return;
    e.preventDefault();
    showDetailView(card.dataset.id);
  });
}

// Called when switching views: sync the gallery filter with the current search value
export function syncGalleryFilter() {
  const input = document.getElementById('search-input');
  galleryFilterTerm = input ? input.value.trim().toLowerCase() : '';
  galleryCurrentPage = 1;
}

function galleryFeatures() {
  const features = filteredBuildings();
  if (!galleryFilterTerm) return features;
  return features.filter(function(f) {
    const p = f.properties;
    return [p.name, p.streetName, p.city, p.buildingId].some(function(v) {
      return v && String(v).toLowerCase().indexOf(galleryFilterTerm) !== -1;
    });
  });
}

export function renderGalleryView() {
  if (!state.buildingsData) return;
  const galleryGrid = document.getElementById('gallery-grid');
  if (!galleryGrid) return;

  const allFeatures = filteredBuildings();
  const features = galleryFeatures();

  if (features.length === 0) {
    galleryGrid.innerHTML = emptyStateHtml();
    return;
  }

  const totalItems = features.length;
  const totalPages = Math.ceil(totalItems / GALLERY_PAGE_SIZE);
  if (galleryCurrentPage > totalPages) galleryCurrentPage = 1;
  const startIndex = (galleryCurrentPage - 1) * GALLERY_PAGE_SIZE;
  const endIndex = Math.min(startIndex + GALLERY_PAGE_SIZE, totalItems);

  let html = '';
  features.slice(startIndex, endIndex).forEach(function(feature) {
    const props = feature.properties;
    const flaeche = formatNum(ext(props).netFloorArea || 0, 0);
    const photos = ext(props).photos || [];
    const imageUrl = photos.length ? photos[0].url : placeholderImages[0];

    html += '<div class="gallery-card" data-id="' + escapeHtml(props.buildingId) + '" tabindex="0" role="article" aria-label="' + escapeHtml(props.name) + '">' +
      '<div class="gallery-image" style="background-image: ' + cssUrl(imageUrl) + '" role="img" aria-label="' + escapeHtml(t('gallery.image.alt', { name: props.name })) + '">' +
        '<div class="gallery-image-label">' + escapeHtml(props.country) + '</div>' +
      '</div>' +
      '<div class="gallery-content">' +
        '<div class="gallery-title">' + escapeHtml(props.name) + '</div>' +
        '<div class="gallery-subtitle">' + escapeHtml(props.streetName) + '</div>' +
        '<div class="gallery-meta">' +
          '<span class="badge gallery-tag">' + escapeHtml(ext(props).portfolio || '—') + '</span>' +
          '<span class="badge gallery-tag">' + flaeche + ' m²</span>' +
          '<span class="badge status-badge ' + getStatusClassName(props.status) + '">' + escapeHtml(props.status) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  });

  // Footer: pagination and, while the search box filters the gallery, the result count
  html += '<div class="gallery-pagination">';
  if (totalPages > 1) {
    html += '<span class="pagination-info">' + t('pagination.info', { start: startIndex + 1, end: endIndex, total: totalItems }) + '</span>' +
      '<div class="pagination-nav">' +
        '<button type="button" class="pagination-btn gallery-prev-btn" ' + (galleryCurrentPage <= 1 ? 'disabled' : '') + '><span class="material-symbols-outlined">chevron_left</span></button>' +
        '<span class="pagination-page-info">' + t('pagination.page', { current: galleryCurrentPage, total: totalPages }) + '</span>' +
        '<button type="button" class="pagination-btn gallery-next-btn" ' + (galleryCurrentPage >= totalPages ? 'disabled' : '') + '><span class="material-symbols-outlined">chevron_right</span></button>' +
      '</div>';
  }
  if (galleryFilterTerm) {
    html += '<span class="gallery-result-count">' + t('gallery.filter.count', { filtered: features.length, total: allFeatures.length }) + '</span>';
  }
  html += '</div>';

  galleryGrid.innerHTML = html;
}

onLangChange(function() {
  if (state.currentView === 'gallery') renderGalleryView();
  const input = document.getElementById('list-search-input');
  if (input) input.placeholder = t('table.search.' + state.activeTableTab);
});

// ===== TABLE PANEL (below the map): toggle, URL state, drag resize =====

// Opens or collapses the panel; ?table=open records the open state in the URL
export function setTablePanelOpen(open) {
  const toggleBtn = document.getElementById('tbl-toggle');
  const panel = document.getElementById('table-panel');
  const handle = document.getElementById('tbl-resize-handle');
  if (!toggleBtn || !panel) return;
  state.tableOpen = !!open;
  panel.style.height = ''; // clear any drag-resize height so the CSS classes take effect
  panel.classList.toggle('collapsed', !state.tableOpen);
  toggleBtn.classList.toggle('collapsed', !state.tableOpen);
  if (handle) handle.style.display = state.tableOpen ? '' : 'none';
  if (state.tableOpen && state.listViewDirty) {
    renderFilteredTables();
    state.listViewDirty = false;
  }
  const url = new URL(window.location);
  if (state.tableOpen) url.searchParams.set('table', 'open'); else url.searchParams.delete('table');
  window.history.replaceState({}, '', url);
  setTimeout(function() {
    if (state.map) state.map.resize();
    // The table takes the bottom of the map: a tools panel reaching into it folds (the toggle reopens it)
    if (state.tableOpen) collapseToolsPanelIfColliding(panel);
  }, 350);
}

export function initTablePanel() {
  const toggleBtn = document.getElementById('tbl-toggle');
  const panel = document.getElementById('table-panel');
  const handle = document.getElementById('tbl-resize-handle');
  if (!toggleBtn || !panel) return;

  // Hidden by default on every screen size; ?table=open opts in
  state.tableOpen = new URLSearchParams(window.location.search).get('table') === 'open';
  if (!state.tableOpen) {
    panel.classList.add('collapsed');
    toggleBtn.classList.add('collapsed');
    if (handle) handle.style.display = 'none';
  }

  toggleBtn.addEventListener('click', function() { setTablePanelOpen(!state.tableOpen); });
  // ?table=open at boot: the tools panel folds when the table would overlap it (same rule as a click)
  if (state.tableOpen) setTimeout(function() { collapseToolsPanelIfColliding(panel); }, 600);

  if (!handle) return;
  const MIN_H = 120;
  const MAX_FRAC = 0.75;
  let startY, startH;
  let resizeFrame = null;

  handle.addEventListener('pointerdown', function(e) {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
    panel.style.transition = 'none';
    startY = e.clientY;
    startH = panel.getBoundingClientRect().height;

    // The panel height follows every pointer event; the map (a full re-layout and render on
    // resize) and the collision check are updated once per animation frame
    function onMove(ev) {
      const maxH = window.innerHeight * MAX_FRAC;
      panel.style.height = Math.min(maxH, Math.max(MIN_H, startH + (startY - ev.clientY))) + 'px';
      if (resizeFrame) return;
      resizeFrame = requestAnimationFrame(function() {
        resizeFrame = null;
        if (state.map) state.map.resize();
        collapseToolsPanelIfColliding(panel);
      });
    }

    function onUp() {
      handle.classList.remove('dragging');
      panel.style.transition = '';
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('lostpointercapture', onUp);
      if (resizeFrame) {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = null;
      }
      if (state.map) state.map.resize();
      collapseToolsPanelIfColliding(panel);
    }

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('lostpointercapture', onUp);
  });
}


