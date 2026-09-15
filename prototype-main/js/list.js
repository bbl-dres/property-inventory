// Table panel (buildings, parcels, land covers), table tabs, toolbar and the gallery view.

import { state } from './state.js';
import { placeholderImages, getStatusClassName } from './config.js';
import { formatCHF, formatArea, formatVolume, formatNum, escapeHtml, cssUrl } from './utils.js';
import { t, onLangChange } from './i18n.js';
import { createFeatureTable, initColumnVisibility, toggleAllColumns, initColumnsSearch, initDropdowns, initTableSearch } from './table.js';
import { selectBuilding, selectParcel, selectLandCover } from './map.js';
import { showDetailView } from './ui.js';
import { initQuickExportMenu } from './export.js';

// ===== COLUMN DEFINITIONS =====

function areaCol(field) { return { field: field, format: function(v) { return v != null ? formatArea(v) : '–'; } }; }
function volumeCol(field) { return { field: field, format: function(v) { return v != null ? formatVolume(v) : '–'; } }; }
function chfCol(field) { return { field: field, format: function(v) { return v != null ? formatCHF(v) : '–'; } }; }
function intCol(field) { return { field: field, format: function(v) { return v != null ? formatNum(v, 0) : '–'; } }; }

function statusBadge(v) {
  if (!v) return '–';
  return '<span class="badge status-badge ' + getStatusClassName(v) + '">' + escapeHtml(v) + '</span>';
}

// Sorted to match DATAMODEL.json. Header labels come from the col.<field> translations.
const buildingColumns = [
  // Master data
  { field: 'bbl_id' }, { field: 'bbl_buch' }, { field: 'bbl_we' }, { field: 'bbl_obj' }, { field: 'bbl_bez' },
  { field: 'bbl_stat', format: statusBadge },
  // Address
  { field: 'adr_land' }, { field: 'adr_reg' }, { field: 'adr_ort' }, { field: 'adr_plz' }, { field: 'adr_str' }, { field: 'adr_hsnr' }, { field: 'adr_conct' },
  // Coordinates
  { field: 'wgs84_lat' }, { field: 'wgs84_lon' }, intCol('lv95_e'), intCol('lv95_n'), { field: 'egm_elev' },
  // Master data 2
  { field: 'bbl_eigen' }, { field: 'bbl_ostr' }, { field: 'bbl_mietm' }, { field: 'bbl_bjahr' }, { field: 'bbl_vjahr' },
  { field: 'bbl_port' }, { field: 'bbl_port2' }, chfCol('bbl_awrt'), chfCol('bbl_bwrt'),
  { field: 'bbl_gbda1' }, { field: 'bbl_gbda2' }, { field: 'bbl_ovtw' }, { field: 'bbl_pvtw' },
  // Official survey
  { field: 'av_egid' }, { field: 'av_egrid' }, { field: 'bfs_gem' }, { field: 'bfs_gemnr' },
  // Zoning
  { field: 'av_zbez' }, { field: 'av_znut' },
  // Heritage protection
  { field: 'bbl_hist' }, { field: 'bbl_arch' }, { field: 'kgs_kat' }, { field: 'kgs_nr' },
  // Other
  { field: 'objectid' },
  // Dimensions SIA 416 / SIA 380
  areaCol('garea_gf'), areaCol('garea_gfo'), areaCol('garea_gfu'), { field: 'garea_acu' },
  areaCol('garea_ngf'), areaCol('garea_nf'), areaCol('garea_hnf'), areaCol('garea_nnf'),
  areaCol('garea_ff'), areaCol('garea_vf'), areaCol('garea_vmf'), areaCol('garea_ebf'),
  // Volumes
  volumeCol('gvol_gv'), volumeCol('gvol_gvo'), volumeCol('gvol_gvu'), { field: 'gvol_acu' },
  // Floors
  { field: 'gastw' }, { field: 'gastw_og' }, { field: 'gastw_ug' }, { field: 'gastw_acu' },
  // Land areas
  areaCol('larea_ggf'), areaCol('larea_gsf'), areaCol('larea_uf'), { field: 'larea_acu' },
  // Other
  { field: 'etl_ts' }
].map(function(col) { return { field: col.field, cls: 'col-' + col.field, format: col.format }; });

const parcelColumns = [
  { field: 'bbl_id', cls: 'col-parcel-id' },
  { field: 'av_nr', cls: 'col-parcel-plot' },
  { field: 'bbl_bez', cls: 'col-parcel-name' },
  { field: 'bfs_gem', cls: 'col-parcel-municipality' },
  { field: 'adr_reg', cls: 'col-parcel-canton' },
  { field: 'larea_gsf', cls: 'col-parcel-area', format: function(v) { return formatArea(v || 0); } },
  { field: 'av_zbez', cls: 'col-parcel-zone' },
  { field: 'bbl_eigen', cls: 'col-parcel-ownership' }
];

const landCoverColumns = [
  { field: 'bbl_id' }, { field: 'geb_id' }, { field: 'av_type' }, areaCol('lc_area'), { field: 'av_stat' },
  { field: 'av_egid' }, { field: 'av_egrid' }, { field: 'wgs84_lat' }, { field: 'wgs84_lon' },
  intCol('lv95_e'), intCol('lv95_n'), { field: 'fid' }, { field: 'fid_src' }, { field: 'objectid' }, { field: 'etl_ts' }
].map(function(col) { return { field: col.field, cls: 'col-lc-' + col.field, format: col.format }; });

const BUILDING_SEARCH_FIELDS = ['bbl_id', 'bbl_bez', 'adr_land', 'adr_ort', 'adr_conct', 'bbl_port', 'bbl_stat'];
const PARCEL_SEARCH_FIELDS = ['bbl_id', 'av_nr', 'bbl_bez', 'bfs_gem', 'adr_reg', 'av_zbez', 'bbl_eigen'];
const LANDCOVER_SEARCH_FIELDS = ['objectid', 'bbl_id', 'av_type', 'av_stat', 'av_egid', 'av_egrid'];

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
    getRowId: function(p) { return p.bbl_id; },
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
    getRowId: function(p) { return p.bbl_id; },
    columns: parcelColumns,
    getFeatures: function() { return state.parcelData ? state.parcelData.features : []; },
    searchFields: PARCEL_SEARCH_FIELDS,
    onRowSelect: function(id) { selectParcel(id, true); },
    pagination: { infoId: 'parcels-pagination-info', pageInfoId: 'parcels-page-info', prevId: 'parcels-prev-btn', nextId: 'parcels-next-btn', rowsSelectId: 'parcels-rows-per-page', infoKey: 'pagination.parcels.info', emptyKey: 'pagination.parcels.empty' },
    empty: { type: 'row', colspan: parcelColumns.length, key: 'empty.parcels' }
  }),
  landcovers: createFeatureTable({
    tbodyId: 'landcovers-body',
    rowIdAttr: 'data-landcover-id',
    getRowId: function(p) { return p.objectid; },
    parseRowId: function(s) { return parseInt(s, 10); },
    columns: landCoverColumns,
    getFeatures: function() { return state.landCoverData ? state.landCoverData.features : []; },
    searchFields: LANDCOVER_SEARCH_FIELDS,
    onRowSelect: function(id) { selectLandCover(id, true); },
    pagination: { infoId: 'landcovers-pagination-info', pageInfoId: 'landcovers-page-info', prevId: 'landcovers-prev-btn', nextId: 'landcovers-next-btn', rowsSelectId: 'landcovers-rows-per-page', infoKey: 'pagination.landcovers.info', emptyKey: 'pagination.landcovers.empty' },
    empty: { type: 'row', colspan: landCoverColumns.length, key: 'empty.landcovers' }
  })
};

const TABLE_TABS = ['buildings', 'parcels', 'landcovers'];

export function initTables() {
  TABLE_TABS.forEach(function(tab) { tables[tab].init(); });
}

export function renderTables() {
  TABLE_TABS.forEach(function(tab) { tables[tab].render(); });
}

// ===== TABLE HEADERS (buildings: rendered from the column definitions) =====

function renderBuildingTableHeaders() {
  const row = document.getElementById('list-table-header-row');
  if (!row) return;
  row.innerHTML = buildingColumns.map(function(col) {
    return '<th class="' + col.cls + '">' + t('col.' + col.field) + ' <span class="material-symbols-outlined">unfold_more</span></th>';
  }).join('');
}

export function initBuildingTableHeaders() {
  renderBuildingTableHeaders();
  onLangChange(renderBuildingTableHeaders);
}

// ===== TABLE TABS =====

function columnsListFor(tab) {
  return document.getElementById(tab === 'parcels' ? 'parcel-columns-list' : tab === 'landcovers' ? 'landcover-columns-list' : 'columns-list');
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
export function syncTableToLandCover(objectid) { if (state.landCoverData) syncTableTo('landcovers', objectid); }

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
    return [p.bbl_bez, p.adr_conct, p.adr_ort, p.bbl_id].some(function(v) {
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
  features.slice(startIndex, endIndex).forEach(function(feature, i) {
    const props = feature.properties;
    const flaeche = formatNum(props.garea_ngf || 0, 0);
    const images = props.img_url || [];
    const imageUrl = images[0] || placeholderImages[(startIndex + i) % placeholderImages.length];

    html += '<div class="gallery-card" data-id="' + escapeHtml(props.bbl_id) + '" tabindex="0" role="article" aria-label="' + escapeHtml(props.bbl_bez) + '">' +
      '<div class="gallery-image" style="background-image: ' + cssUrl(imageUrl) + '" role="img" aria-label="' + escapeHtml(t('gallery.image.alt', { name: props.bbl_bez })) + '">' +
        '<div class="gallery-image-label">' + escapeHtml(props.adr_land) + '</div>' +
      '</div>' +
      '<div class="gallery-content">' +
        '<div class="gallery-title">' + escapeHtml(props.bbl_bez) + '</div>' +
        '<div class="gallery-subtitle">' + escapeHtml(props.adr_conct) + '</div>' +
        '<div class="gallery-meta">' +
          '<span class="gallery-tag">' + escapeHtml(props.bbl_port || '—') + '</span>' +
          '<span class="gallery-tag">' + flaeche + ' m²</span>' +
          '<span class="badge status-badge ' + getStatusClassName(props.bbl_stat) + '">' + escapeHtml(props.bbl_stat) + '</span>' +
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
