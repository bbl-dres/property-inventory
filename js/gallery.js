// Gallery view: card grid rendering with pagination

import { state } from './state.js';
import { placeholderImages } from './config.js';
import { escapeHtml } from './utils.js';

var GALLERY_PAGE_SIZE = 48;
var galleryCurrentPage = 1;

// ===== GALLERY VIEW =====
export function renderGalleryView() {
  if (!state.portfolioData) return;

  var dataToRender = state.filteredData || state.portfolioData;
  var galleryGrid = document.getElementById('gallery-grid');
  var html = '';

  // Handle empty state
  if (dataToRender.features.length === 0) {
    galleryGrid.innerHTML = '<div class="empty-state">' +
      '<span class="material-symbols-outlined">search_off</span>' +
      '<div class="empty-state-title">Keine Objekte gefunden</div>' +
      '<div class="empty-state-description">Die aktuellen Filter ergeben keine Treffer. Passen Sie die Filterkriterien an oder setzen Sie die Filter zur\u00FCck.</div>' +
      '<div class="empty-state-action"><button class="btn-secondary" onclick="resetAllFilters()">Filter zur\u00FCcksetzen</button></div>' +
    '</div>';
    return;
  }

  // Reset to page 1 when data changes
  var totalItems = dataToRender.features.length;
  var totalPages = Math.ceil(totalItems / GALLERY_PAGE_SIZE);
  if (galleryCurrentPage > totalPages) galleryCurrentPage = 1;

  var startIndex = (galleryCurrentPage - 1) * GALLERY_PAGE_SIZE;
  var endIndex = Math.min(startIndex + GALLERY_PAGE_SIZE, totalItems);
  var pageFeatures = dataToRender.features.slice(startIndex, endIndex);

  pageFeatures.forEach(function(feature, i) {
    var index = startIndex + i;
    var props = feature.properties;
    var flaeche = Number(props.garea_ngf || 0).toLocaleString('de-CH');
    var statusClass = props.bbl_stat === 'Aktiv' ? 'status-active' :
                      props.bbl_stat === 'In Renovation' ? 'status-renovation' :
                      props.bbl_stat === 'In Planung' ? 'status-planning' : 'status-inactive';
    var imageUrl = placeholderImages[index % placeholderImages.length];

    html += '<div class="gallery-card" data-id="' + escapeHtml(props.bbl_id) + '" tabindex="0" role="article" aria-label="' + escapeHtml(props.bbl_bez) + '">' +
      '<div class="gallery-image" style="background-image: url(' + imageUrl + ')" role="img" aria-label="Bild von ' + escapeHtml(props.bbl_bez) + '">' +
        '<div class="gallery-image-label">' + escapeHtml(props.adr_land) + '</div>' +
      '</div>' +
      '<div class="gallery-content">' +
        '<div class="gallery-title">' + escapeHtml(props.bbl_bez) + '</div>' +
        '<div class="gallery-subtitle">' + escapeHtml(props.adr_conct) + '</div>' +
        '<div class="gallery-meta">' +
          '<span class="gallery-tag">' + escapeHtml(props.bbl_port || '\u2014') + '</span>' +
          '<span class="gallery-tag">' + flaeche + ' m\u00B2</span>' +
          '<span class="status-badge ' + statusClass + '">' + escapeHtml(props.bbl_stat) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  });

  // Add pagination footer if multiple pages
  if (totalPages > 1) {
    html += '<div class="gallery-pagination">' +
      '<span class="pagination-info">' + (startIndex + 1) + '\u2013' + endIndex + ' von ' + totalItems + ' Objekte</span>' +
      '<div class="pagination-nav">' +
        '<button class="pagination-btn gallery-prev-btn" ' + (galleryCurrentPage <= 1 ? 'disabled' : '') + '>' +
          '<span class="material-symbols-outlined">chevron_left</span>' +
        '</button>' +
        '<span class="pagination-page-info">Seite ' + galleryCurrentPage + ' von ' + totalPages + '</span>' +
        '<button class="pagination-btn gallery-next-btn" ' + (galleryCurrentPage >= totalPages ? 'disabled' : '') + '>' +
          '<span class="material-symbols-outlined">chevron_right</span>' +
        '</button>' +
      '</div>' +
    '</div>';
  }

  galleryGrid.innerHTML = html;

  // Attach pagination event listeners
  var prevBtn = galleryGrid.querySelector('.gallery-prev-btn');
  var nextBtn = galleryGrid.querySelector('.gallery-next-btn');
  if (prevBtn) {
    prevBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (galleryCurrentPage > 1) {
        galleryCurrentPage--;
        renderGalleryView();
        document.getElementById('gallery-view').scrollTo(0, 0);
      }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (galleryCurrentPage < totalPages) {
        galleryCurrentPage++;
        renderGalleryView();
        document.getElementById('gallery-view').scrollTo(0, 0);
      }
    });
  }
}

export function resetGalleryPage() {
  galleryCurrentPage = 1;
}
