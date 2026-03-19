// UI module: view management, toast notifications, menu, accordion, tabs, and panels

import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { setLang, getLang, t } from './i18n.js';
import { renderListView, renderGalleryView, renderParcelsView, renderLandCoversView } from './list.js';
import { populateDetailView, renderMeasurementsTable, renderDocumentsTable, renderContactsTable, renderCostsTable, renderContractsTable, renderAssetsTable } from './detail.js';
import { updateMapFilter } from './filters.js';
import { showPrintPreview, hidePrintPreview, updatePrintPreview } from './print.js';
import { updateShareLink, getShareUrl, updateExportCount } from './export.js';
import { loadGeokatalog } from './swisstopo.js';
import { selectBuilding, selectParcel, selectLandCover, updateSelectedBuilding, updateSelectedParcel, updateSelectedLandCover, updateUrlWithSelection, getPolygonCentroid } from './map.js';

// ===== TOAST NOTIFICATION SYSTEM =====

const toastIcons = {
  error: 'error',
  warning: 'warning',
  success: 'check_circle',
  info: 'info'
};

export function showToast(options) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const type = options.type || 'info';
  const title = options.title || '';
  const message = options.message || '';
  const duration = options.duration !== undefined ? options.duration : 5000;
  const actions = options.actions || [];

  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;

  let html = '<div class="toast-icon"><span class="material-symbols-outlined">' + toastIcons[type] + '</span></div>';
  html += '<div class="toast-content">';
  if (title) {
    html += '<div class="toast-title">' + escapeHtml(title) + '</div>';
  }
  if (message) {
    html += '<div class="toast-message">' + escapeHtml(message) + '</div>';
  }
  if (actions.length > 0) {
    html += '<div class="toast-actions">';
    actions.forEach(function(action, index) {
      html += '<button class="toast-action-btn ' + (action.primary ? 'primary' : 'secondary') + '" data-action="' + index + '">' + escapeHtml(action.label) + '</button>';
    });
    html += '</div>';
  }
  html += '</div>';
  html += '<button class="toast-close" aria-label="' + t('modal.close') + '"><span class="material-symbols-outlined">close</span></button>';

  toast.innerHTML = html;
  container.appendChild(toast);

  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', function() {
    hideToast(toast);
  });

  actions.forEach(function(action, index) {
    const btn = toast.querySelector('[data-action="' + index + '"]');
    if (btn && action.onClick) {
      btn.addEventListener('click', function() {
        action.onClick();
        hideToast(toast);
      });
    }
  });

  if (duration > 0) {
    setTimeout(function() {
      hideToast(toast);
    }, duration);
  }

  return toast;
}

export function hideToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.classList.add('hiding');
  setTimeout(function() {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 300);
}

export function showError(title, message, retryCallback) {
  const actions = [];
  if (retryCallback) {
    actions.push({
      label: t('error.retry'),
      primary: true,
      onClick: retryCallback
    });
  }
  return showToast({
    type: 'error',
    title: title,
    message: message,
    duration: retryCallback ? 0 : 8000,
    actions: actions
  });
}

export function showWarning(title, message) {
  return showToast({ type: 'warning', title: title, message: message, duration: 6000 });
}

export function showSuccess(title, message) {
  return showToast({ type: 'success', title: title, message: message, duration: 4000 });
}

export function showInfo(title, message) {
  return showToast({ type: 'info', title: title, message: message, duration: 5000 });
}

// ===== URL HELPERS =====
export function getViewFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('view') || 'map';
}

export function getBuildingIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

export function getTabFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('tab') || 'overview';
}

export function setViewInURL(view, buildingId, tab) {
  const url = new URL(window.location);
  url.searchParams.set('view', view);
  if (buildingId) {
    url.searchParams.set('id', buildingId);
  } else {
    url.searchParams.delete('id');
  }
  if (view === 'detail' && tab && tab !== 'overview') {
    url.searchParams.set('tab', tab);
  } else {
    url.searchParams.delete('tab');
  }
  window.history.pushState({}, '', url);
}

export function setTabInURL(tab) {
  const url = new URL(window.location);
  if (tab && tab !== 'overview') {
    url.searchParams.set('tab', tab);
  } else {
    url.searchParams.delete('tab');
  }
  window.history.replaceState({}, '', url);
}

// ===== VIEW SWITCHING =====
export function switchView(view) {
  if (view !== 'detail') {
    state.previousView = (state.currentView !== 'detail' && state.currentView !== 'api-docs') ? state.currentView : state.previousView;
  }
  state.currentView = view;
  setViewInURL(view);

  // Update toggle buttons and ARIA attributes
  document.querySelectorAll('.view-toggle-btn').forEach(function(btn) {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
    if (btn.dataset.view === view) {
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
    }
  });

  // Show/hide views
  document.getElementById('map-view').classList.remove('active');
  document.getElementById('gallery-view').classList.remove('active');
  document.getElementById('detail-view').classList.remove('active');
  document.getElementById('api-docs-view').classList.remove('active');

  // Disable page scrolling mode when leaving detail view
  document.body.classList.remove('detail-active');

  const viewElement = document.getElementById(view + '-view');
  if (viewElement) {
    viewElement.classList.add('active');
  }

  // Show/hide style switcher based on view (only visible in map view)
  const styleSwitcher = document.getElementById('style-switcher');
  if (styleSwitcher) {
    styleSwitcher.classList.toggle('visible', view === 'map');
  }

  // Resize map if switching to map view
  if (view === 'map' && state.map) {
    setTimeout(function() {
      state.map.resize();
      if (state.map.getLayer('buildings-points')) {
        updateMapFilter();
      }
    }, 100);
  }

  // Re-render gallery view if dirty
  if (view === 'gallery' && state.galleryViewDirty) {
    renderGalleryView();
    state.galleryViewDirty = false;
  }

  // Re-render table views if dirty when switching to map
  if (view === 'map' && state.listViewDirty && state.tableOpen) {
    renderListView();
    renderParcelsView();
    renderLandCoversView();
    state.listViewDirty = false;
  }
}

// ===== DETAIL VIEW =====
export function showDetailView(buildingId, tab) {
  if (!state.buildingsData) return;

  // Default tab to overview if not specified
  if (!tab) tab = 'overview';

  // Find building by ID (O(1) index lookup)
  const building = state.buildingIndex.get(buildingId);

  if (!building) {
    console.error('Building not found:', buildingId);
    return;
  }

  state.currentDetailBuilding = building;
  state.previousView = state.currentView !== 'detail' ? state.currentView : state.previousView;
  state.currentView = 'detail';

  // Update URL with building ID and tab
  setViewInURL('detail', buildingId, tab);

  // Deactivate toggle buttons
  document.querySelectorAll('.view-toggle-btn').forEach(function(btn) {
    btn.classList.remove('active');
  });

  // Hide map and gallery, show detail
  document.getElementById('map-view').classList.remove('active');
  document.getElementById('gallery-view').classList.remove('active');
  document.getElementById('detail-view').classList.add('active');

  // Enable page scrolling mode for detail view
  document.body.classList.add('detail-active');
  window.scrollTo(0, 0);

  // Hide style switcher in detail view
  const detailStyleSwitcher = document.getElementById('style-switcher');
  if (detailStyleSwitcher) {
    detailStyleSwitcher.classList.remove('visible');
  }

  // Populate detail view
  populateDetailView(building);

  // Activate the specified tab
  activateTab(tab);
}

// ===== TAB ACTIVATION =====
export function activateTab(tab) {
  // Update active tab styling
  document.querySelectorAll('.detail-tab').forEach(function(t) {
    t.classList.remove('active');
    if (t.dataset.tab === tab) {
      t.classList.add('active');
    }
  });

  // Switch content visibility
  document.querySelectorAll('.tab-content').forEach(function(content) {
    content.classList.remove('active');
  });
  const targetContent = document.querySelector('.tab-content[data-content="' + tab + '"]');
  if (targetContent) {
    targetContent.classList.add('active');
  }

  // Render tab-specific content (simplified: only overview + measurements)
  // Measurements tab is now static HTML, no table rendering needed
}

// ===== MENU TOGGLE =====
let menuToggle = null;
let accordionPanel = null;
let menuToggleText = null;
let menuToggleIcon = null;
let menuOpen = true;

function updateMenuTogglePosition() {
  // On mobile (≤767px), CSS handles positioning via position: fixed; bottom: 10px
  if (window.matchMedia('(max-width: 767px)').matches) {
    menuToggle.style.top = '';
    return;
  }

  const mainRect = document.getElementById('map-view').getBoundingClientRect();

  if (menuOpen) {
    const panelRect = accordionPanel.getBoundingClientRect();
    const calculatedTop = panelRect.bottom - mainRect.top;
    // Ensure button stays below the panel - if panel hasn't rendered yet, retry
    if (panelRect.height < 50) {
      setTimeout(updateMenuTogglePosition, 50);
      return;
    }
    menuToggle.style.top = calculatedTop + 'px';
  } else {
    menuToggle.style.top = '10px';
  }
}

// BUG FIX #22: Debounced more aggressively (50ms instead of 10ms) to reduce
// excessive MutationObserver-triggered layout recalculations
let menuToggleDebounceTimer = null;
function updateMenuTogglePositionDebounced() {
  if (menuToggleDebounceTimer) {
    clearTimeout(menuToggleDebounceTimer);
  }
  menuToggleDebounceTimer = setTimeout(updateMenuTogglePosition, 50);
}

// Initialize all UI components
function initUI() {
  initLanguageSelector();
  initAccordion();
  initPrintListeners();
  initMenuToggle();
  initInfoPanel();
  initDetailTabs();
  initViewToggle();
  initPopstate();
  initBackButton();
  initFooterApiLink();
}

// ===== BACK BUTTON =====
function initBackButton() {
  const btn = document.getElementById('btn-back');
  if (btn) {
    btn.addEventListener('click', function() {
      switchView(state.previousView || 'map');
    });
  }
}

// ===== FOOTER API LINK =====
function showApiDocsView() {
  state.previousView = state.currentView !== 'detail' ? state.currentView : state.previousView;
  state.currentView = 'api-docs';
  document.getElementById('map-view').classList.remove('active');
  document.getElementById('gallery-view').classList.remove('active');
  document.getElementById('detail-view').classList.remove('active');
  document.getElementById('api-docs-view').classList.add('active');
  document.body.classList.remove('detail-active');
  document.querySelectorAll('.view-toggle-btn').forEach(function(btn) { btn.classList.remove('active'); });
  var styleSwitcher = document.getElementById('style-switcher');
  if (styleSwitcher) styleSwitcher.classList.remove('visible');
  window.scrollTo(0, 0);
}

function initFooterApiLink() {
  var apiLink = document.getElementById('footer-api-link');
  if (apiLink) {
    apiLink.addEventListener('click', function(e) {
      e.preventDefault();
      showApiDocsView();
    });
  }

  // Back button in API docs header
  var backBtn = document.getElementById('btn-back-api');
  if (backBtn) {
    backBtn.addEventListener('click', function() {
      switchView(state.previousView || 'map');
    });
  }
}

// ===== LANGUAGE SELECTOR =====
function initLanguageSelector() {
  const langBtn = document.getElementById('lang-btn');
  const langDropdown = document.getElementById('lang-dropdown');
  const langCurrent = document.getElementById('lang-current');
  if (!langBtn || !langDropdown) return;

  langBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    const isOpen = langDropdown.classList.contains('open');
    langDropdown.classList.toggle('open', !isOpen);
    langBtn.setAttribute('aria-expanded', !isOpen);
  });

  // Set initial active state from current language
  const currentLang = getLang();
  langCurrent.textContent = currentLang.toUpperCase();
  langDropdown.querySelectorAll('.lang-option').forEach(function(o) {
    o.classList.toggle('active', o.dataset.lang === currentLang);
  });

  langDropdown.addEventListener('click', function(e) {
    const option = e.target.closest('.lang-option');
    if (!option) return;
    const lang = option.dataset.lang;
    langDropdown.querySelectorAll('.lang-option').forEach(function(o) { o.classList.remove('active'); });
    option.classList.add('active');
    langCurrent.textContent = option.textContent;
    langDropdown.classList.remove('open');
    langBtn.setAttribute('aria-expanded', 'false');
    setLang(lang);
  });

  document.addEventListener('click', function(e) {
    if (!e.target.closest('#lang-selector')) {
      langDropdown.classList.remove('open');
      langBtn.setAttribute('aria-expanded', 'false');
    }
  });
}

// ===== ACCORDION =====
function initAccordion() {
  const geokatalogAccordion = document.getElementById('geokatalog-accordion');

  document.querySelectorAll('.accordion-header').forEach(function(header) {
    header.addEventListener('click', function() {
      const content = this.nextElementSibling;
      const isActive = this.classList.contains('active');
      const isGeokatalog = this.parentElement.id === 'geokatalog-accordion';

      document.querySelectorAll('.accordion-header').forEach(function(h) { h.classList.remove('active'); });
      document.querySelectorAll('.accordion-content').forEach(function(c) { c.classList.remove('show'); });
      geokatalogAccordion.classList.remove('expanded');

      // Hide print preview when any accordion closes
      hidePrintPreview();

      if (!isActive) {
        this.classList.add('active');
        content.classList.add('show');

        // Match accordion by data-i18n key instead of text content
        const headerSpans = this.querySelectorAll(':scope > span[data-i18n]');
        const i18nKey = headerSpans.length > 0 ? headerSpans[headerSpans.length - 1].getAttribute('data-i18n') : '';

        // Update share link when Share accordion is opened
        if (i18nKey === 'accordion.share') {
          updateShareLink();
        }

        // Show print preview when Print accordion is opened
        if (i18nKey === 'accordion.print') {
          showPrintPreview();
        }

        // Expand Geokatalog to full height
        if (isGeokatalog) {
          geokatalogAccordion.classList.add('expanded');
          loadGeokatalog();
        }
      }

      updateMenuTogglePositionDebounced();
    });
  });
}

// ===== PRINT ORIENTATION / WINDOW RESIZE =====
function initPrintListeners() {
  const printOrientationSelect = document.getElementById('print-orientation');
  if (printOrientationSelect) {
    printOrientationSelect.addEventListener('change', updatePrintPreview);
  }

  // Update print preview on window resize
  window.addEventListener('resize', function() {
    const printPreviewOverlay = document.querySelector('.print-preview-overlay');
    if (printPreviewOverlay && printPreviewOverlay.classList.contains('active')) {
      updatePrintPreview();
    }
  });
}

// ===== MENU TOGGLE =====
function initMenuToggle() {
  menuToggle = document.getElementById('menu-toggle');
  accordionPanel = document.getElementById('accordion-panel');
  menuToggleText = document.getElementById('menu-toggle-text');
  menuToggleIcon = menuToggle.querySelector('.material-symbols-outlined');
  menuOpen = true;

  setTimeout(updateMenuTogglePosition, 100);

  menuToggle.addEventListener('click', function() {
    menuOpen = !menuOpen;

    if (menuOpen) {
      accordionPanel.classList.remove('collapsed');
      menuToggleText.textContent = t('menu.close');
      menuToggleIcon.textContent = 'expand_less';
    } else {
      accordionPanel.classList.add('collapsed');
      menuToggleText.textContent = t('menu.open');
      menuToggleIcon.textContent = 'expand_more';
    }

    updateMenuTogglePositionDebounced();
  });

  // BUG FIX #22: Replaced broad subtree MutationObserver with a narrow observer
  // that only watches direct class/style changes on the accordion panel itself.
  // Accordion open/close and Swisstopo layer additions trigger explicit calls
  // to updateMenuTogglePositionDebounced() at their call sites.
  const observer = new MutationObserver(function() {
    updateMenuTogglePositionDebounced();
  });
  observer.observe(accordionPanel, { attributes: true, attributeFilter: ['class', 'style'] });
}

// ===== INFO PANEL CLOSE / ZOOM / SHARE =====
function initInfoPanel() {
  const map = state.map;

  // Info panel close
  document.getElementById('info-close').addEventListener('click', function() {
    document.getElementById('info-panel').classList.remove('show');
    state.selectedBuildingId = null;
    state.selectedParcelId = null;
    state.selectedLandCoverId = null;
    updateSelectedBuilding();
    updateSelectedParcel();
    updateSelectedLandCover();
    updateUrlWithSelection();
  });

  // Info panel zoom to
  document.getElementById('info-zoom-to').addEventListener('click', function() {
    if (state.selectedBuildingId && map) {
      const building = state.buildingIndex.get(state.selectedBuildingId);
      if (building && building.geometry) {
        map.flyTo({
          center: building.geometry.coordinates,
          zoom: 16
        });
      }
    } else if (state.selectedParcelId && map) {
      const parcel = state.parcelIndex.get(state.selectedParcelId);
      if (parcel && parcel.geometry && parcel.geometry.coordinates) {
        const center = getPolygonCentroid(parcel.geometry.coordinates);
        map.flyTo({
          center: center,
          zoom: 16
        });
      }
    } else if (state.selectedLandCoverId != null && map) {
      var lc = state.landCoverIndex.get(state.selectedLandCoverId);
      if (lc && lc.geometry && lc.geometry.coordinates) {
        var lcCenter = getPolygonCentroid(lc.geometry.coordinates);
        map.flyTo({
          center: lcCenter,
          zoom: 17
        });
      }
    }
  });

  // Info panel share
  // BUG FIX #21b: Fixed clipboard fallback to use correct showToast object format
  document.getElementById('info-share').addEventListener('click', function() {
    const url = getShareUrl();
    const title = t('share.title');
    const text = state.selectedBuildingId
      ? t('share.building', {id: state.selectedBuildingId})
      : state.selectedParcelId
        ? t('share.parcel', {id: state.selectedParcelId})
        : t('share.map');

    // Use Web Share API if available
    if (navigator.share) {
      navigator.share({
        title: title,
        text: text,
        url: url
      }).catch(function(err) {
        // User cancelled or error - silently ignore
        console.log('Share cancelled or failed:', err);
      });
    } else {
      // Fallback: copy to clipboard
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function() {
          showToast({
            type: 'success',
            title: t('success.copy.title'),
            message: t('success.copy.message'),
            duration: 2000
          });
        }).catch(function() {
          showToast({
            type: 'error',
            title: t('error.copy.title'),
            message: t('error.copy.message'),
            duration: 3000
          });
        });
      }
    }
  });
}

// ===== DETAIL TABS =====
function initDetailTabs() {
  document.querySelectorAll('.detail-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      if (this.classList.contains('disabled')) {
        return;
      }
      const targetTab = this.dataset.tab;

      // Update active tab
      document.querySelectorAll('.detail-tab').forEach(function(t) {
        t.classList.remove('active');
      });
      this.classList.add('active');

      // Switch content
      document.querySelectorAll('.tab-content').forEach(function(content) {
        content.classList.remove('active');
      });
      const targetContent = document.querySelector('.tab-content[data-content="' + targetTab + '"]');
      if (targetContent) {
        targetContent.classList.add('active');
      }

      // Update URL with current tab
      setTabInURL(targetTab);

      // Render measurements table when switching to measurements tab
      if (targetTab === 'measurements') {
        renderMeasurementsTable();
      }

      // Render documents table when switching to documents tab
      if (targetTab === 'documents') {
        renderDocumentsTable();
      }

      // Render contacts table when switching to contacts tab
      if (targetTab === 'contacts') {
        renderContactsTable();
      }

      // Render costs table when switching to costs tab
      if (targetTab === 'costs') {
        renderCostsTable();
      }

      // Render contracts table when switching to contracts tab
      if (targetTab === 'contracts') {
        renderContractsTable();
      }

      // Render assets table when switching to assets tab
      if (targetTab === 'assets') {
        renderAssetsTable();
      }
    });
  });
}

// ===== VIEW TOGGLE =====
function initViewToggle() {
  document.querySelectorAll('.view-toggle-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      switchView(this.dataset.view);
    });
  });
}

// ===== BROWSER BACK/FORWARD =====
function initPopstate() {
  window.addEventListener('popstate', function() {
    const buildingId = getBuildingIdFromURL();
    const tab = getTabFromURL();
    if (buildingId) {
      showDetailView(buildingId, tab);
    } else if (state.currentView === 'detail') {
      switchView(state.previousView || 'map');
    }
  });
}

export { initUI, updateMenuTogglePositionDebounced };
