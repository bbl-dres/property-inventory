// List view (buildings table with toolbar) and gallery view.

import { state } from './state.js';
import { placeholderImages, getStatusClassName } from './config.js';
import { formatNum, escapeHtml, cssUrl } from './utils.js';
import { t } from './i18n.js';
import { createFeatureTable, initColumnVisibility, toggleAllColumns, initDropdowns, initTableSearch } from './table.js';
import { showDetailView } from './ui.js';
import { initQuickExportMenu } from './export.js';

// ===== COLUMN DEFINITIONS =====

function ext(props) {
  return props.extensionData || {};
}

function statusBadge(v) {
  if (!v) return '–';
  return '<span class="status-badge ' + getStatusClassName(v) + '">' + escapeHtml(v) + '</span>';
}

const buildingColumns = [
  { field: 'buildingId', cls: 'col-id' },
  { field: 'name', cls: 'col-name' },
  { field: 'country', cls: 'col-land' },
  { field: 'city', cls: 'col-ort' },
  { field: 'streetName', cls: 'col-adresse' },
  { field: 'extensionData', cls: 'col-portfolio', format: function(v, props) { return escapeHtml(ext(props).portfolio || '—'); } },
  { field: 'extensionData', cls: 'col-flaeche', format: function(v, props) { return formatNum(ext(props).netFloorArea || 0, 0) + ' m²'; } },
  { field: 'status', cls: 'col-status', format: statusBadge }
];

const BUILDING_SEARCH_FIELDS = ['buildingId', 'name', 'country', 'city', 'streetName', 'extensionData.portfolio', 'status'];

// ===== EMPTY STATE (table and gallery) =====

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
    onRowSelect: function(id) { showDetailView(id); },
    pagination: { infoId: 'list-pagination-info', pageInfoId: 'list-page-info', prevId: 'list-prev-btn', nextId: 'list-next-btn', rowsSelectId: 'list-rows-per-page', infoKey: 'pagination.info', emptyKey: 'pagination.empty' },
    empty: { type: 'block', afterSelector: '#list-view .list-table-wrapper', html: emptyStateHtml }
  })
};

export function initTables() {
  Object.keys(tables).forEach(function(name) { tables[name].init(); });
}

export function renderListView() {
  if (!state.buildingsData) return;
  tables.buildings.render();
}

// ===== TOOLBAR =====

function columnsList() {
  return document.getElementById('columns-list');
}

export function initListToolbar() {
  initDropdowns();
  initQuickExportMenu();

  const toggleAllBtn = document.getElementById('columns-toggle-all');
  const toggleNoneBtn = document.getElementById('columns-toggle-none');
  if (toggleAllBtn) toggleAllBtn.addEventListener('click', function() { toggleAllColumns(columnsList(), true); });
  if (toggleNoneBtn) toggleNoneBtn.addEventListener('click', function() { toggleAllColumns(columnsList(), false); });

  initColumnVisibility('#list-view', '#columns-dropdown-menu');
  initTableSearch('list-search-input', 'list-search-clear', function(term) {
    tables.buildings.setSearchTerm(term);
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
  features.slice(startIndex, endIndex).forEach(function(feature, i) {
    const props = feature.properties;
    const flaeche = formatNum(ext(props).netFloorArea || 0, 0);
    const imageUrl = placeholderImages[(startIndex + i) % placeholderImages.length];

    html += '<div class="gallery-card" data-id="' + escapeHtml(props.buildingId) + '" tabindex="0" role="article" aria-label="' + escapeHtml(props.name) + '">' +
      '<div class="gallery-image" style="background-image: ' + cssUrl(imageUrl) + '" role="img" aria-label="' + escapeHtml(t('gallery.image.alt', { name: props.name })) + '">' +
        '<div class="gallery-image-label">' + escapeHtml(props.country) + '</div>' +
      '</div>' +
      '<div class="gallery-content">' +
        '<div class="gallery-title">' + escapeHtml(props.name) + '</div>' +
        '<div class="gallery-subtitle">' + escapeHtml(props.streetName) + '</div>' +
        '<div class="gallery-meta">' +
          '<span class="gallery-tag">' + escapeHtml(ext(props).portfolio || '—') + '</span>' +
          '<span class="gallery-tag">' + flaeche + ' m²</span>' +
          '<span class="status-badge ' + getStatusClassName(props.status) + '">' + escapeHtml(props.status) + '</span>' +
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
