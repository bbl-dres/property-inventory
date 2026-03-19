// Parcels table: rendering, pagination, initialization

import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { t } from './i18n.js';

// ===== RENDER PARCELS VIEW =====
export function renderParcelsView() {
  if (!state.parcelData) return;

  var dataToRender = state.parcelData;

  // Apply search filter
  if (state.parcelSearchTerm) {
    dataToRender = {
      type: dataToRender.type,
      features: dataToRender.features.filter(function(feature) {
        var props = feature.properties;
        var searchableText = [
          props.bbl_id,
          props.av_nr,
          props.bbl_bez,
          props.bfs_gem,
          props.adr_reg,
          props.av_zbez,
          props.bbl_eigen
        ].join(' ').toLowerCase();
        return searchableText.includes(state.parcelSearchTerm);
      })
    };
  }

  var parcelsBody = document.getElementById('parcels-body');

  // Handle empty state
  if (dataToRender.features.length === 0) {
    parcelsBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px; color:var(--grey-500);">' + t('empty.parcels') + '</td></tr>';
    updateParcelsPaginationInfo(1, 1, 0);
    return;
  }

  // Pagination
  var totalItems = dataToRender.features.length;
  var totalPages = Math.ceil(totalItems / state.parcelRowsPerPage);
  if (state.parcelCurrentPage > totalPages) state.parcelCurrentPage = totalPages;
  if (state.parcelCurrentPage < 1) state.parcelCurrentPage = 1;

  var startIndex = (state.parcelCurrentPage - 1) * state.parcelRowsPerPage;
  var endIndex = Math.min(startIndex + state.parcelRowsPerPage, totalItems);
  var paginatedFeatures = dataToRender.features.slice(startIndex, endIndex);

  var html = '';
  paginatedFeatures.forEach(function(feature) {
    var props = feature.properties;
    var area = Number(props.larea_gsf || 0).toLocaleString('de-CH');

    html += '<tr data-parcel-id="' + escapeHtml(props.bbl_id) + '" tabindex="0" role="row">' +
      '<td class="col-parcel-id">' + escapeHtml(props.bbl_id) + '</td>' +
      '<td class="col-parcel-plot">' + escapeHtml(props.av_nr || '\u2013') + '</td>' +
      '<td class="col-parcel-name">' + escapeHtml(props.bbl_bez) + '</td>' +
      '<td class="col-parcel-municipality">' + escapeHtml(props.bfs_gem || '\u2013') + '</td>' +
      '<td class="col-parcel-canton">' + escapeHtml(props.adr_reg || '\u2013') + '</td>' +
      '<td class="col-parcel-area">' + area + ' m\u00B2</td>' +
      '<td class="col-parcel-zone">' + escapeHtml(props.av_zbez || '\u2013') + '</td>' +
      '<td class="col-parcel-ownership">' + escapeHtml(props.bbl_eigen || '\u2013') + '</td>' +
    '</tr>';
  });

  parcelsBody.innerHTML = html;
  updateParcelsPaginationInfo(state.parcelCurrentPage, totalPages, totalItems);

  // Re-apply parcel column visibility
  document.querySelectorAll('#parcel-columns-list input[type="checkbox"][data-column]').forEach(function(cb) {
    if (!cb.checked) {
      var columnClass = cb.getAttribute('data-column');
      document.querySelectorAll('.' + columnClass).forEach(function(cell) {
        cell.style.display = 'none';
      });
    }
  });
}

// ===== PAGINATION INFO =====
export function updateParcelsPaginationInfo(currentPage, totalPages, totalItems) {
  var infoEl = document.getElementById('parcels-pagination-info');
  var pageInfoEl = document.getElementById('parcels-page-info');
  var prevBtn = document.getElementById('parcels-prev-btn');
  var nextBtn = document.getElementById('parcels-next-btn');

  if (infoEl) {
    if (totalItems === 0) {
      infoEl.textContent = t('pagination.parcels.empty');
    } else {
      var startIndex = (currentPage - 1) * state.parcelRowsPerPage + 1;
      var endIndex = Math.min(currentPage * state.parcelRowsPerPage, totalItems);
      infoEl.textContent = t('pagination.parcels.info', {start: startIndex, end: endIndex, total: totalItems});
    }
  }

  if (pageInfoEl) {
    pageInfoEl.textContent = totalItems === 0 ? '' : t('pagination.page', {current: currentPage, total: totalPages});
  }

  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

// ===== INIT PARCELS TABLE =====
export function initParcelsTable() {
  var rowsSelect = document.getElementById('parcels-rows-per-page');
  var prevBtn = document.getElementById('parcels-prev-btn');
  var nextBtn = document.getElementById('parcels-next-btn');

  if (rowsSelect) {
    rowsSelect.addEventListener('change', function() {
      state.parcelRowsPerPage = parseInt(this.value, 10);
      state.parcelCurrentPage = 1;
      renderParcelsView();
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', function() {
      if (state.parcelCurrentPage > 1) {
        state.parcelCurrentPage--;
        renderParcelsView();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', function() {
      if (!state.parcelData) return;
      var totalPages = Math.ceil(state.parcelData.features.length / state.parcelRowsPerPage);
      if (state.parcelCurrentPage < totalPages) {
        state.parcelCurrentPage++;
        renderParcelsView();
      }
    });
  }
}
