// UI module: view management, toast notifications, menu, accordion, tabs, and panels

import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { setLang, getLang, t } from './i18n.js';
import { renderListView, renderGalleryView, renderParcelsView, renderLandCoversView, syncGalleryFilter } from './list.js';
import { populateDetailView, renderMeasurementsTable, renderDocumentsTable, renderContactsTable, renderCostsTable, renderContractsTable, renderAssetsTable } from './detail.js';
import { updateMapFilter } from './filters.js';
import { showPrintPreview, hidePrintPreview, updatePrintPreview } from './print.js';
import { updateShareLink, getShareUrl, updateExportCount } from './export.js';
import { loadGeokatalog } from './swisstopo.js';
import { selectBuilding, selectParcel, selectLandCover, smartFlyTo, updateSelectedBuilding, updateSelectedParcel, updateSelectedLandCover, updateUrlWithSelection, getPolygonCentroid } from './map.js';

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

  // Sync gallery filter with search input and re-render
  if (view === 'gallery') {
    syncGalleryFilter();
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
  initMobileMenu();
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

// ===== MOBILE HAMBURGER MENU =====

function initMobileMenu() {
  var hamburgerBtn = document.getElementById('hamburger-btn');
  var menu = document.getElementById('mobile-menu');
  var backdrop = document.getElementById('mobile-menu-backdrop');
  var closeBtn = document.getElementById('mobile-menu-close');
  if (!hamburgerBtn || !menu) return;

  function openMenu() {
    menu.classList.add('active');
    backdrop.classList.add('active');
    hamburgerBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    menu.classList.remove('active');
    backdrop.classList.remove('active');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  hamburgerBtn.addEventListener('click', openMenu);
  closeBtn.addEventListener('click', closeMenu);
  backdrop.addEventListener('click', closeMenu);

  // Escape key closes menu
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && menu.classList.contains('active')) {
      e.stopImmediatePropagation();
      closeMenu();
    }
  });

  // Filter button in mobile menu → opens filter panel, closes menu
  var mobileFilterBtn = document.getElementById('mobile-filter-btn');
  if (mobileFilterBtn) {
    mobileFilterBtn.addEventListener('click', function() {
      closeMenu();
      // Trigger the existing filter panel button
      var filterBtn = document.getElementById('filter-panel-btn');
      if (filterBtn) filterBtn.click();
    });
  }

  // Language pills in mobile menu
  document.querySelectorAll('.mobile-lang-pill').forEach(function(pill) {
    pill.addEventListener('click', function() {
      var lang = this.dataset.lang;
      document.querySelectorAll('.mobile-lang-pill').forEach(function(p) { p.classList.remove('active'); });
      this.classList.add('active');
      setLang(lang);
      // Sync desktop lang selector
      var langCurrent = document.getElementById('lang-current');
      if (langCurrent) langCurrent.textContent = lang.toUpperCase();
      document.querySelectorAll('.lang-option').forEach(function(o) {
        o.classList.toggle('active', o.dataset.lang === lang);
      });
    });
  });

  // Mobile view toggle
  document.querySelectorAll('.mobile-view-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var view = this.dataset.view;
      document.querySelectorAll('.mobile-view-btn').forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      closeMenu();
      switchView(view);
    });
  });

  // Mobile API link
  var mobileApiLink = document.getElementById('mobile-api-link');
  if (mobileApiLink) {
    mobileApiLink.addEventListener('click', function(e) {
      e.preventDefault();
      closeMenu();
      showApiDocsView();
    });
  }

  // Populate layers section
  populateMobileLayers();

}

function populateMobileLayers() {
  var container = document.getElementById('mobile-layers-section');
  if (!container) return;

  var layers = [
    { id: 'buildings', toggle: 'layer-toggle-buildings', label: 'accordion.layers.buildings' },
    { id: 'landcovers', toggle: 'layer-toggle-landcovers', label: 'accordion.layers.landcovers' },
    { id: 'parcels', toggle: 'layer-toggle-parcels', label: 'accordion.layers.parcels' }
  ];

  var html = '<div class="mobile-layers-group-label">' + t('accordion.layers.internal') + '</div>';

  layers.forEach(function(layer) {
    var desktopCheckbox = document.getElementById(layer.toggle);
    var checked = desktopCheckbox && desktopCheckbox.checked ? 'checked' : '';
    html += '<div class="mobile-layer-item">' +
      '<input type="checkbox" ' + checked + ' data-sync-toggle="' + layer.toggle + '">' +
      '<span class="mobile-layer-title" data-i18n="' + layer.label + '">' + t(layer.label) + '</span>' +
      '<button class="mobile-layer-info" data-action="showInternalLayerInfo" data-layer-key="' + layer.id + '">' +
        '<span class="material-symbols-outlined">info</span>' +
      '</button>' +
    '</div>';
  });

  container.innerHTML = html;

  // Sync mobile checkboxes with desktop layer toggles
  container.querySelectorAll('input[data-sync-toggle]').forEach(function(cb) {
    cb.addEventListener('change', function() {
      var desktopCb = document.getElementById(this.dataset.syncToggle);
      if (desktopCb) {
        desktopCb.checked = this.checked;
        // Fire change event on desktop checkbox to trigger layer visibility
        desktopCb.dispatchEvent(new Event('change'));
      }
    });
  });
}

function populateMobileAccordion() {
  var container = document.getElementById('mobile-accordion-section');
  if (!container) return;

  var items = [
    { icon: 'draw', i18n: 'accordion.draw' },
    { icon: 'print', i18n: 'accordion.print' },
    { icon: 'layers', i18n: 'accordion.catalog' }
  ];

  var html = '';
  items.forEach(function(item) {
    html += '<div class="mobile-accordion-item" data-accordion-key="' + item.i18n + '">' +
      '<span class="material-symbols-outlined">' + item.icon + '</span>' +
      '<span data-i18n="' + item.i18n + '">' + t(item.i18n) + '</span>' +
    '</div>';
  });

  container.innerHTML = html;

  // Clicking opens the corresponding desktop accordion and closes the mobile menu
  container.querySelectorAll('.mobile-accordion-item').forEach(function(item) {
    item.addEventListener('click', function() {
      var key = this.dataset.accordionKey;
      // Close mobile menu
      document.getElementById('mobile-menu').classList.remove('active');
      document.getElementById('mobile-menu-backdrop').classList.remove('active');
      document.body.style.overflow = '';

      // Find and click the matching desktop accordion header
      document.querySelectorAll('.accordion-header').forEach(function(header) {
        var spans = header.querySelectorAll(':scope > span[data-i18n]');
        var headerKey = spans.length > 0 ? spans[spans.length - 1].getAttribute('data-i18n') : '';
        if (headerKey === key) {
          // Open the accordion panel first
          var panel = document.getElementById('accordion-panel');
          if (panel && panel.classList.contains('collapsed')) {
            var toggle = document.getElementById('menu-toggle');
            if (toggle) toggle.click();
          }
          header.click();
        }
      });
    });
  });
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

      document.querySelectorAll('.accordion-header').forEach(function(h) {
        h.classList.remove('active');
        h.setAttribute('aria-expanded', 'false');
      });
      document.querySelectorAll('.accordion-content').forEach(function(c) { c.classList.remove('show'); });
      geokatalogAccordion.classList.remove('expanded');

      // Hide print preview when any accordion closes
      hidePrintPreview();

      if (!isActive) {
        this.classList.add('active');
        this.setAttribute('aria-expanded', 'true');
        content.classList.add('show');

        // Match accordion by data-i18n key instead of text content
        const headerSpans = this.querySelectorAll(':scope > span[data-i18n]');
        const i18nKey = headerSpans.length > 0 ? headerSpans[headerSpans.length - 1].getAttribute('data-i18n') : '';

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
  });
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
      var building = state.buildingIndex.get(state.selectedBuildingId);
      if (building && building.geometry) {
        smartFlyTo({ center: building.geometry.coordinates, zoom: 16 });
      }
    } else if (state.selectedParcelId && map) {
      var parcel = state.parcelIndex.get(state.selectedParcelId);
      if (parcel && parcel.geometry && parcel.geometry.coordinates) {
        smartFlyTo({ center: getPolygonCentroid(parcel.geometry.coordinates), zoom: 16 });
      }
    } else if (state.selectedLandCoverId != null && map) {
      var lc = state.landCoverIndex.get(state.selectedLandCoverId);
      if (lc && lc.geometry && lc.geometry.coordinates) {
        smartFlyTo({ center: getPolygonCentroid(lc.geometry.coordinates), zoom: 17 });
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

export { initUI };
