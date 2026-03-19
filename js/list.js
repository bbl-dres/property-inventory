// List view: building table, column management, search, pagination, table tabs

import { state } from './state.js';
import { placeholderImages } from './config.js';
import { formatCHF, formatArea, formatVolume, formatNum } from './utils.js';
import { selectBuilding } from './map.js';
import { selectParcel } from './map.js';
import { showDetailView } from './views.js';
import { renderParcelsView } from './parcels.js';
import { showToast } from './toast.js';
import { downloadBlob } from './utils.js';
import { t, onLangChange } from './i18n.js';

// ===== BUILDING TABLE COLUMN DEFINITIONS =====
var buildingColumns = [
  // Stammdaten
  { field: 'bbl_id', label: 'ID' },
  { field: 'bbl_bez', label: 'Bezeichnung' },
  { field: 'bbl_stat', label: 'Status', format: function(v) {
    if (!v) return '\u2013';
    var cls = v === 'Aktiv' ? 'status-active' : v === 'In Renovation' ? 'status-renovation' : v === 'In Planung' ? 'status-planning' : 'status-inactive';
    return '<span class="badge status-badge ' + cls + '">' + v + '</span>';
  }},
  { field: 'bbl_buch', label: 'Buchungskreis' },
  { field: 'bbl_we', label: 'WE' },
  { field: 'bbl_tobj', label: 'Teilobjekt' },
  { field: 'bbl_gbda1', label: 'Objektart 1' },
  { field: 'bbl_gbda2', label: 'Objektart 2' },
  { field: 'bbl_eigen', label: 'Eigentum' },
  { field: 'bbl_ostr', label: 'Strategie' },
  { field: 'bbl_mietm', label: 'Mietmodell' },
  { field: 'bbl_port', label: 'Teilportfolio' },
  { field: 'bbl_port2', label: 'Portfoliogruppe' },
  { field: 'bbl_bjahr', label: 'Baujahr' },
  { field: 'bbl_vjahr', label: 'Verkaufsjahr' },
  { field: 'bbl_awrt', label: 'Anschaffungswert', format: function(v) { return v != null ? formatCHF(v) : '\u2013'; } },
  { field: 'bbl_bwrt', label: 'Buchwert', format: function(v) { return v != null ? formatCHF(v) : '\u2013'; } },
  { field: 'bbl_ovtw', label: 'Verantwortlich' },
  { field: 'bbl_pvtw', label: 'Portfoliomanager' },
  // Adresse
  { field: 'adr_land', label: 'Land' },
  { field: 'adr_reg', label: 'Region' },
  { field: 'adr_ort', label: 'Ort' },
  { field: 'adr_plz', label: 'PLZ' },
  { field: 'adr_str', label: 'Strasse' },
  { field: 'adr_hsnr', label: 'Hausnr.' },
  { field: 'adr_conct', label: 'Adresse' },
  // Koordinaten
  { field: 'wgs84_lat', label: 'Lat' },
  { field: 'wgs84_lon', label: 'Lon' },
  { field: 'lv95_e', label: 'LV95 E', format: function(v) { return v != null ? formatNum(v, 0) : '\u2013'; } },
  { field: 'lv95_n', label: 'LV95 N', format: function(v) { return v != null ? formatNum(v, 0) : '\u2013'; } },
  // Amtliche Vermessung
  { field: 'av_egid', label: 'EGID' },
  { field: 'av_egrid', label: 'EGRID' },
  { field: 'bfs_gem', label: 'Gemeinde' },
  { field: 'bfs_gemnr', label: 'Gemeinde Nr.' },
  // Bauzone
  { field: 'av_zbez', label: 'Bauzone' },
  { field: 'av_znut', label: 'Nutzung' },
  // Denkmalschutz
  { field: 'bbl_hist', label: 'Hist. Ausstattung' },
  { field: 'bbl_arch', label: 'Archivw\u00FCrdigkeit' },
  { field: 'kgs_kat', label: 'KGS Kat.' },
  { field: 'kgs_nr', label: 'KGS Nr.' },
  // Fl\u00E4chen
  { field: 'garea_gf', label: 'GF', format: function(v) { return v != null ? formatArea(v) : '\u2013'; } },
  { field: 'garea_gfo', label: 'GF oberird.', format: function(v) { return v != null ? formatArea(v) : '\u2013'; } },
  { field: 'garea_gfu', label: 'GF unterird.', format: function(v) { return v != null ? formatArea(v) : '\u2013'; } },
  { field: 'garea_ngf', label: 'NGF', format: function(v) { return v != null ? formatArea(v) : '\u2013'; } },
  { field: 'garea_nf', label: 'NF', format: function(v) { return v != null ? formatArea(v) : '\u2013'; } },
  { field: 'garea_hnf', label: 'HNF', format: function(v) { return v != null ? formatArea(v) : '\u2013'; } },
  { field: 'garea_nnf', label: 'NNF', format: function(v) { return v != null ? formatArea(v) : '\u2013'; } },
  { field: 'garea_ff', label: 'FF', format: function(v) { return v != null ? formatArea(v) : '\u2013'; } },
  { field: 'garea_vf', label: 'VF', format: function(v) { return v != null ? formatArea(v) : '\u2013'; } },
  { field: 'garea_vmf', label: 'VMF', format: function(v) { return v != null ? formatArea(v) : '\u2013'; } },
  { field: 'garea_ebf', label: 'EBF', format: function(v) { return v != null ? formatArea(v) : '\u2013'; } },
  // Volumen / Geschosse
  { field: 'gvol_gv', label: 'GV', format: function(v) { return v != null ? formatVolume(v) : '\u2013'; } },
  { field: 'gvol_gvo', label: 'GV oberird.', format: function(v) { return v != null ? formatVolume(v) : '\u2013'; } },
  { field: 'gvol_gvu', label: 'GV unterird.', format: function(v) { return v != null ? formatVolume(v) : '\u2013'; } },
  { field: 'gastw', label: 'Geschosse' },
  { field: 'gastw_og', label: 'Gesch. oberird.' },
  { field: 'gastw_ug', label: 'Gesch. unterird.' },
  // Grundst\u00FCck
  { field: 'larea_ggf', label: 'GGF', format: function(v) { return v != null ? formatArea(v) : '\u2013'; } },
  { field: 'larea_gsf', label: 'GSF', format: function(v) { return v != null ? formatArea(v) : '\u2013'; } },
  { field: 'larea_uf', label: 'UF', format: function(v) { return v != null ? formatArea(v) : '\u2013'; } },
  // Sonstiges
  { field: 'objectid', label: 'OBJECTID' },
  { field: 'etl_ts', label: 'ETL' },
];

// ===== TABLE HEADERS =====
export function initBuildingTableHeaders() {
  var headerRow = document.getElementById('list-table-header-row');
  if (!headerRow) return;
  var html = '';
  buildingColumns.forEach(function(col) {
    var label = t('col.' + col.field);
    html += '<th class="col-' + col.field + '">' + label + ' <span class="material-symbols-outlined">unfold_more</span></th>';
  });
  headerRow.innerHTML = html;

  // Apply initial visibility from building column checkboxes
  document.querySelectorAll('#columns-list input[type="checkbox"][data-column]').forEach(function(cb) {
    handleColumnToggle(cb);
  });

  // Re-render headers when language changes
  onLangChange(function() {
    var row = document.getElementById('list-table-header-row');
    if (!row) return;
    var h = '';
    buildingColumns.forEach(function(col) {
      h += '<th class="col-' + col.field + '">' + t('col.' + col.field) + ' <span class="material-symbols-outlined">unfold_more</span></th>';
    });
    row.innerHTML = h;
    // Re-apply column visibility
    document.querySelectorAll('#columns-list input[type="checkbox"][data-column]').forEach(function(cb) {
      handleColumnToggle(cb);
    });
  });
}

// Column search filter
var colSearchInput = document.getElementById('columns-search-input');
if (colSearchInput) {
  colSearchInput.addEventListener('input', function() {
    var term = this.value.toLowerCase().trim();
    // Filter the currently visible columns list
    var activeList = state.activeTableTab === 'parcels'
      ? document.getElementById('parcel-columns-list')
      : document.getElementById('columns-list');
    if (!activeList) return;
    activeList.querySelectorAll('.dropdown-menu-item').forEach(function(item) {
      var text = item.textContent.toLowerCase();
      item.style.display = text.includes(term) ? '' : 'none';
    });
    // Hide group labels that have no visible items after them
    activeList.querySelectorAll('.columns-group-label').forEach(function(label) {
      var next = label.nextElementSibling;
      var hasVisible = false;
      while (next && !next.classList.contains('columns-group-label')) {
        if (next.style.display !== 'none') hasVisible = true;
        next = next.nextElementSibling;
      }
      label.style.display = hasVisible ? '' : 'none';
    });
  });
}

// ===== RENDER LIST VIEW =====
export function renderListView() {
  if (!state.portfolioData) return;

  var dataToRender = state.filteredData || state.portfolioData;
  var listBody = document.getElementById('list-body');
  var tableWrapper = document.querySelector('#table-panel .list-table-wrapper');
  var html = '';

  // Apply list search filter if active
  if (state.listSearchTerm) {
    dataToRender = {
      type: dataToRender.type,
      features: dataToRender.features.filter(function(feature) {
        var props = feature.properties;
        var searchableText = [
          props.bbl_id,
          props.bbl_bez,
          props.adr_land,
          props.adr_ort,
          props.adr_conct,
          props.bbl_port,
          props.bbl_stat
        ].join(' ').toLowerCase();
        return searchableText.includes(state.listSearchTerm);
      })
    };
  }

  // Handle empty state
  if (dataToRender.features.length === 0) {
    listBody.innerHTML = '';
    // Check if empty state already exists
    var existingEmpty = document.querySelector('#table-panel .empty-state');
    if (!existingEmpty) {
      var emptyHtml = '<div class="empty-state">' +
        '<span class="material-symbols-outlined">search_off</span>' +
        '<div class="empty-state-title">' + t('empty.title') + '</div>' +
        '<div class="empty-state-description">' + t('empty.description') + '</div>' +
        '<div class="empty-state-action"><button class="btn-secondary" onclick="resetAllFilters()">' + t('empty.reset') + '</button></div>' +
      '</div>';
      tableWrapper.insertAdjacentHTML('afterend', emptyHtml);
    }
    updateListPaginationInfo(0, 0, 0);
    return;
  } else {
    // Remove empty state if it exists
    var existingEmpty = document.querySelector('#table-panel .empty-state');
    if (existingEmpty) existingEmpty.remove();
  }

  // Pagination calculations
  var totalItems = dataToRender.features.length;
  var totalPages = Math.ceil(totalItems / state.listRowsPerPage);

  // Ensure current page is valid
  if (state.listCurrentPage > totalPages) {
    state.listCurrentPage = totalPages;
  }
  if (state.listCurrentPage < 1) {
    state.listCurrentPage = 1;
  }

  var startIndex = (state.listCurrentPage - 1) * state.listRowsPerPage;
  var endIndex = Math.min(startIndex + state.listRowsPerPage, totalItems);

  // Get paginated slice of data
  var paginatedFeatures = dataToRender.features.slice(startIndex, endIndex);

  paginatedFeatures.forEach(function(feature) {
    var props = feature.properties;
    html += '<tr data-id="' + props.bbl_id + '" tabindex="0" role="row">';
    buildingColumns.forEach(function(col) {
      var val = props[col.field];
      var display = (val !== null && val !== undefined && val !== '') ? String(val) : '\u2013';
      if (col.format) display = col.format(val, props);
      html += '<td class="col-' + col.field + '">' + display + '</td>';
    });
    html += '</tr>';
  });

  listBody.innerHTML = html;

  // Re-apply column visibility to new rows
  document.querySelectorAll('#columns-list input[type="checkbox"][data-column]').forEach(function(cb) {
    if (!cb.checked) handleColumnToggle(cb);
  });

  // Update pagination info
  updateListPaginationInfo(state.listCurrentPage, totalPages, totalItems);
}

// Update list pagination UI
function updateListPaginationInfo(currentPage, totalPages, totalItems) {
  var infoEl = document.getElementById('list-pagination-info');
  var pageInfoEl = document.getElementById('list-page-info');
  var prevBtn = document.getElementById('list-prev-btn');
  var nextBtn = document.getElementById('list-next-btn');

  if (infoEl) {
    if (totalItems === 0) {
      infoEl.textContent = t('pagination.empty');
    } else {
      var startIndex = (currentPage - 1) * state.listRowsPerPage + 1;
      var endIndex = Math.min(currentPage * state.listRowsPerPage, totalItems);
      infoEl.textContent = t('pagination.info', {start: startIndex, end: endIndex, total: totalItems});
    }
  }

  if (pageInfoEl) {
    if (totalItems === 0) {
      pageInfoEl.textContent = '';
    } else {
      pageInfoEl.textContent = t('pagination.page', {current: currentPage, total: totalPages});
    }
  }

  if (prevBtn) {
    prevBtn.disabled = currentPage <= 1;
  }

  if (nextBtn) {
    nextBtn.disabled = currentPage >= totalPages;
  }
}

// Initialize list pagination event listeners
export function initListPagination() {
  var rowsSelect = document.getElementById('list-rows-per-page');
  var prevBtn = document.getElementById('list-prev-btn');
  var nextBtn = document.getElementById('list-next-btn');

  if (rowsSelect) {
    rowsSelect.addEventListener('change', function() {
      state.listRowsPerPage = parseInt(this.value, 10);
      state.listCurrentPage = 1;
      renderListView();
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', function() {
      if (state.listCurrentPage > 1) {
        state.listCurrentPage--;
        renderListView();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', function() {
      var dataToRender = state.filteredData || state.portfolioData;
      var totalPages = Math.ceil(dataToRender.features.length / state.listRowsPerPage);
      if (state.listCurrentPage < totalPages) {
        state.listCurrentPage++;
        renderListView();
      }
    });
  }
}

// ===== DELEGATED EVENT LISTENERS =====
export function initDelegatedListeners() {
  var listBody = document.getElementById('list-body');
  var galleryGrid = document.getElementById('gallery-grid');
  var parcelsBody = document.getElementById('parcels-body');

  // Buildings table: click to select & zoom
  if (listBody) {
    listBody.addEventListener('click', function(e) {
      var row = e.target.closest('tr[data-id]');
      if (!row) return;
      listBody.querySelectorAll('tr.row-active').forEach(function(r) { r.classList.remove('row-active'); });
      row.classList.add('row-active');
      selectBuilding(row.dataset.id, true);
    });
    listBody.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        var row = e.target.closest('tr[data-id]');
        if (!row) return;
        e.preventDefault();
        row.click();
      }
    });
  }

  // Gallery: click to show detail
  if (galleryGrid) {
    galleryGrid.addEventListener('click', function(e) {
      var card = e.target.closest('.gallery-card[data-id]');
      if (!card) return;
      showDetailView(card.dataset.id);
    });
    galleryGrid.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        var card = e.target.closest('.gallery-card[data-id]');
        if (!card) return;
        e.preventDefault();
        showDetailView(card.dataset.id);
      }
    });
  }

  // Parcels table: click to select & zoom
  if (parcelsBody) {
    parcelsBody.addEventListener('click', function(e) {
      var row = e.target.closest('tr[data-parcel-id]');
      if (!row) return;
      parcelsBody.querySelectorAll('tr.row-active').forEach(function(r) { r.classList.remove('row-active'); });
      row.classList.add('row-active');
      selectParcel(row.dataset.parcelId, true);
    });
    parcelsBody.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        var row = e.target.closest('tr[data-parcel-id]');
        if (!row) return;
        e.preventDefault();
        row.click();
      }
    });
  }
}

// ===== DROPDOWN =====
export function toggleDropdown(dropdownId) {
  var menu = document.getElementById(dropdownId);
  var isOpen = menu.classList.contains('show');

  // Close all dropdowns first
  document.querySelectorAll('.dropdown-menu').forEach(function(dropdown) {
    dropdown.classList.remove('show');
  });

  // Toggle the clicked one
  if (!isOpen) {
    menu.classList.add('show');
  }
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('.dropdown-container')) {
    document.querySelectorAll('.dropdown-menu').forEach(function(dropdown) {
      dropdown.classList.remove('show');
    });
  }
});

// ===== COLUMN TOGGLE =====
function handleColumnToggle(checkbox) {
  var columnClass = checkbox.getAttribute('data-column');
  var isVisible = checkbox.checked;

  // Toggle visibility of header and body cells
  document.querySelectorAll('.' + columnClass).forEach(function(cell) {
    cell.style.display = isVisible ? '' : 'none';
  });
}

function toggleAllColumns(showAll) {
  // Only toggle columns for the currently visible list
  var activeList = state.activeTableTab === 'parcels'
    ? document.getElementById('parcel-columns-list')
    : document.getElementById('columns-list');
  if (!activeList) return;

  activeList.querySelectorAll('input[type="checkbox"]').forEach(function(checkbox) {
    checkbox.checked = showAll;
    handleColumnToggle(checkbox);
  });
}

// ===== LIST SEARCH =====
export function handleListSearch(query) {
  var term = query.toLowerCase().trim();
  if (state.activeTableTab === 'parcels') {
    state.parcelSearchTerm = term;
    state.parcelCurrentPage = 1;
    renderParcelsView();
  } else {
    state.listSearchTerm = term;
    state.listCurrentPage = 1;
    renderListView();
  }
}

// ===== QUICK EXPORT =====
function handleQuickExport(format, scope) {
  var data;
  if (scope === 'all') {
    data = state.portfolioData ? state.portfolioData.features : [];
  } else {
    data = state.filteredData ? state.filteredData.features : [];
  }

  if (data.length === 0) {
    showToast({ type: 'error', message: t('error.export.nodata') });
    return;
  }

  try {
    if (format === 'csv' || format === 'excel') {
      quickExportCSV(data);
    } else if (format === 'geojson') {
      quickExportGeoJSON(data);
    }
    showToast({ type: 'success', message: t('success.export', {count: data.length}) });
  } catch (e) {
    console.error('Export error:', e);
    showToast({ type: 'error', message: t('error.export', {message: e.message}) });
  }

  // Close dropdown
  document.querySelectorAll('.dropdown-menu').forEach(function(d) { d.classList.remove('show'); });
}

function quickExportCSV(data) {
  var columns = ['bbl_id', 'bbl_bez', 'bbl_stat', 'bbl_eigen', 'bbl_port',
    'adr_land', 'adr_ort', 'adr_conct', 'garea_ngf', 'wgs84_lat', 'wgs84_lon'];
  var csvContent = columns.join(';') + '\n';

  data.forEach(function(feature) {
    var props = feature.properties || {};
    var row = columns.map(function(col) {
      if (col === 'wgs84_lat' && feature.geometry && feature.geometry.coordinates) return feature.geometry.coordinates[1];
      if (col === 'wgs84_lon' && feature.geometry && feature.geometry.coordinates) return feature.geometry.coordinates[0];
      var value = props[col];
      if (value === null || value === undefined) return '';
      var strValue = String(value);
      if (strValue.includes(';') || strValue.includes('"') || strValue.includes('\n')) {
        strValue = '"' + strValue.replace(/"/g, '""') + '"';
      }
      return strValue;
    });
    csvContent += row.join(';') + '\n';
  });

  var blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, 'bbl-portfolio-export.csv');
}

function quickExportGeoJSON(data) {
  var featureCollection = {
    type: 'FeatureCollection',
    features: data.map(function(f) { return JSON.parse(JSON.stringify(f)); })
  };
  var blob = new Blob([JSON.stringify(featureCollection, null, 2)], { type: 'application/geo+json' });
  downloadBlob(blob, 'bbl-portfolio-export.geojson');
}

// ===== LIST TOOLBAR =====
export function initListToolbar() {
  // Dropdown buttons
  var exportBtn = document.getElementById('export-dropdown-btn');
  var columnsBtn = document.getElementById('columns-dropdown-btn');

  if (exportBtn) {
    exportBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleDropdown('export-dropdown-menu');
    });
  }

  if (columnsBtn) {
    columnsBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleDropdown('columns-dropdown-menu');
    });
  }

  // Export menu items
  document.querySelectorAll('#export-dropdown-menu .dropdown-menu-item[data-export-format]').forEach(function(item) {
    item.addEventListener('click', function() {
      handleQuickExport(this.dataset.exportFormat, this.dataset.exportScope);
    });
  });

  // Update filtered export header with count
  updateFilteredExportHeader();

  // Column toggle all/none buttons
  var toggleAllBtn = document.getElementById('columns-toggle-all');
  var toggleNoneBtn = document.getElementById('columns-toggle-none');
  if (toggleAllBtn) {
    toggleAllBtn.addEventListener('click', function() { toggleAllColumns(true); });
  }
  if (toggleNoneBtn) {
    toggleNoneBtn.addEventListener('click', function() { toggleAllColumns(false); });
  }

  // Column checkboxes
  document.querySelectorAll('#columns-dropdown-menu input[type="checkbox"]').forEach(function(checkbox) {
    checkbox.addEventListener('change', function() {
      handleColumnToggle(this);
    });
  });

  // Search input (debounced)
  var searchInput = document.getElementById('list-search-input');
  var searchDebounceTimer = null;
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      var value = this.value;
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(function() {
        handleListSearch(value);
      }, 200);
    });
  }
}

// Update the "Gefiltert exportieren" header to show count
export function updateFilteredExportHeader() {
  var header = document.getElementById('export-filtered-header');
  if (!header) return;
  var filtered = state.filteredData ? state.filteredData.features.length : 0;
  var total = state.portfolioData ? state.portfolioData.features.length : 0;
  if (filtered === total) {
    header.textContent = 'Gefiltert exportieren';
  } else {
    header.textContent = 'Gefiltert exportieren (' + filtered + ')';
  }
}

// ===== TABLE TAB SWITCHING =====
export function switchTableTab(tabName) {
  state.activeTableTab = tabName;

  // Update tab buttons
  document.querySelectorAll('.table-tab').forEach(function(tab) {
    tab.classList.toggle('active', tab.dataset.tableTab === tabName);
    tab.setAttribute('aria-selected', tab.dataset.tableTab === tabName ? 'true' : 'false');
  });

  // Show/hide tab content
  document.getElementById('buildings-table-content').classList.toggle('active', tabName === 'buildings');
  document.getElementById('parcels-table-content').classList.toggle('active', tabName === 'parcels');

  // Update search placeholder
  var searchInput = document.getElementById('list-search-input');
  if (searchInput) {
    searchInput.placeholder = tabName === 'buildings' ? 'Geb\u00E4ude durchsuchen...' : 'Grundst\u00FCcke durchsuchen...';
    searchInput.value = '';
  }

  // Clear search terms
  state.listSearchTerm = '';
  state.parcelSearchTerm = '';

  // Switch columns dropdown to match active tab
  var buildingCols = document.getElementById('columns-list');
  var parcelCols = document.getElementById('parcel-columns-list');
  if (buildingCols && parcelCols) {
    buildingCols.style.display = tabName === 'buildings' ? '' : 'none';
    parcelCols.style.display = tabName === 'parcels' ? '' : 'none';
  }

  // Render the active table
  if (tabName === 'parcels') {
    renderParcelsView();
  } else {
    renderListView();
  }

  // Persist table tab in URL
  var url = new URL(window.location);
  url.searchParams.set('tableTab', tabName);
  window.history.replaceState({}, '', url);
}

export function initTableTabs() {
  document.querySelectorAll('.table-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      switchTableTab(this.dataset.tableTab);
    });
  });

  // Restore table tab from URL
  var urlParams = new URLSearchParams(window.location.search);
  var savedTab = urlParams.get('tableTab');
  if (savedTab === 'parcels' || savedTab === 'buildings') {
    switchTableTab(savedTab);
  }
}

// ===== SYNC TABLE TO MAP SELECTION =====
export function syncTableToBuilding(buildingId) {
  if (!state.portfolioData) return;

  // Switch to buildings tab
  if (state.activeTableTab !== 'buildings') {
    switchTableTab('buildings');
  }

  // Find the index of this building in the (filtered) data
  var dataToSearch = state.filteredData || state.portfolioData;
  var index = -1;
  for (var i = 0; i < dataToSearch.features.length; i++) {
    if (dataToSearch.features[i].properties.bbl_id === buildingId) {
      index = i;
      break;
    }
  }
  if (index === -1) return;

  // Jump to the correct page
  var targetPage = Math.floor(index / state.listRowsPerPage) + 1;
  if (state.listCurrentPage !== targetPage) {
    state.listCurrentPage = targetPage;
    renderListView();
  }

  // Highlight and scroll to the row
  var listBody = document.getElementById('list-body');
  if (!listBody) return;
  listBody.querySelectorAll('tr.row-active').forEach(function(r) { r.classList.remove('row-active'); });
  var row = listBody.querySelector('tr[data-id="' + buildingId + '"]');
  if (row) {
    row.classList.add('row-active');
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

export function syncTableToParcel(parcelId) {
  if (!state.parcelData) return;

  // Switch to parcels tab
  if (state.activeTableTab !== 'parcels') {
    switchTableTab('parcels');
  }

  // Find the index of this parcel
  var index = -1;
  for (var i = 0; i < state.parcelData.features.length; i++) {
    if (state.parcelData.features[i].properties.parcelId === parcelId) {
      index = i;
      break;
    }
  }
  if (index === -1) return;

  // Jump to the correct page
  var targetPage = Math.floor(index / state.parcelRowsPerPage) + 1;
  if (state.parcelCurrentPage !== targetPage) {
    state.parcelCurrentPage = targetPage;
    renderParcelsView();
  }

  // Highlight and scroll to the row
  var parcelsBody = document.getElementById('parcels-body');
  if (!parcelsBody) return;
  parcelsBody.querySelectorAll('tr.row-active').forEach(function(r) { r.classList.remove('row-active'); });
  var row = parcelsBody.querySelector('tr[data-parcel-id="' + parcelId + '"]');
  if (row) {
    row.classList.add('row-active');
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
