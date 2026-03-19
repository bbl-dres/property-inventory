import { state } from './state.js';
import { showToast } from './toast.js';
import { setLang, getLang, t } from './i18n.js';
import { switchView, showDetailView, getBuildingIdFromURL, getTabFromURL, setTabInURL } from './views.js';
import { showPrintPreview, hidePrintPreview, updatePrintPreview } from './print.js';
import { updateShareLink } from './share.js';
import { updateExportCount } from './export.js';
import { loadGeokatalog } from './geokatalog.js';
import { selectBuilding, selectParcel, updateSelectedBuilding, updateSelectedParcel, updateUrlWithSelection, getPolygonCentroid } from './map.js';
import { getShareUrl } from './share.js';
import { renderMeasurementsTable, renderDocumentsTable, renderContactsTable, renderCostsTable, renderContractsTable, renderAssetsTable } from './detail.js';

// ===== MENU TOGGLE =====
var menuToggle = null;
var accordionPanel = null;
var menuToggleText = null;
var menuToggleIcon = null;
var menuOpen = true;

function updateMenuTogglePosition() {
  // On mobile (≤767px), CSS handles positioning via position: fixed; bottom: 10px
  if (window.matchMedia('(max-width: 767px)').matches) {
    menuToggle.style.top = '';
    return;
  }

  var mainRect = document.getElementById('map-view').getBoundingClientRect();

  if (menuOpen) {
    var panelRect = accordionPanel.getBoundingClientRect();
    var calculatedTop = panelRect.bottom - mainRect.top;
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
var menuToggleDebounceTimer = null;
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
  var btn = document.getElementById('btn-back');
  if (btn) {
    btn.addEventListener('click', function() {
      switchView(state.previousView || 'map');
    });
  }
}

// ===== FOOTER API LINK =====
function initFooterApiLink() {
  var apiLink = document.getElementById('footer-api-link');
  if (apiLink) {
    apiLink.addEventListener('click', function(e) {
      e.preventDefault();
      document.getElementById('map-view').classList.remove('active');
      document.getElementById('gallery-view').classList.remove('active');
      document.getElementById('detail-view').classList.remove('active');
      document.getElementById('api-docs-view').classList.add('active');
      document.body.classList.remove('detail-active');
      document.querySelectorAll('.view-toggle-btn').forEach(function(btn) { btn.classList.remove('active'); });
      window.scrollTo(0, 0);
    });
  }
}

// ===== LANGUAGE SELECTOR =====
function initLanguageSelector() {
  var langBtn = document.getElementById('lang-btn');
  var langDropdown = document.getElementById('lang-dropdown');
  var langCurrent = document.getElementById('lang-current');
  if (!langBtn || !langDropdown) return;

  langBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    var isOpen = langDropdown.classList.contains('open');
    langDropdown.classList.toggle('open', !isOpen);
    langBtn.setAttribute('aria-expanded', !isOpen);
  });

  // Set initial active state from current language
  var currentLang = getLang();
  langCurrent.textContent = currentLang.toUpperCase();
  langDropdown.querySelectorAll('.lang-option').forEach(function(o) {
    o.classList.toggle('active', o.dataset.lang === currentLang);
  });

  langDropdown.addEventListener('click', function(e) {
    var option = e.target.closest('.lang-option');
    if (!option) return;
    var lang = option.dataset.lang;
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
  var geokatalogAccordion = document.getElementById('geokatalog-accordion');

  document.querySelectorAll('.accordion-header').forEach(function(header) {
    header.addEventListener('click', function() {
      var content = this.nextElementSibling;
      var isActive = this.classList.contains('active');
      var isGeokatalog = this.parentElement.id === 'geokatalog-accordion';

      document.querySelectorAll('.accordion-header').forEach(function(h) { h.classList.remove('active'); });
      document.querySelectorAll('.accordion-content').forEach(function(c) { c.classList.remove('show'); });
      geokatalogAccordion.classList.remove('expanded');

      // Hide print preview when any accordion closes
      hidePrintPreview();

      if (!isActive) {
        this.classList.add('active');
        content.classList.add('show');

        // Match accordion by data-i18n key instead of text content
        var headerSpans = this.querySelectorAll(':scope > span[data-i18n]');
        var i18nKey = headerSpans.length > 0 ? headerSpans[headerSpans.length - 1].getAttribute('data-i18n') : '';

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
  var printOrientationSelect = document.getElementById('print-orientation');
  if (printOrientationSelect) {
    printOrientationSelect.addEventListener('change', updatePrintPreview);
  }

  // Update print preview on window resize
  window.addEventListener('resize', function() {
    var printPreviewOverlay = document.querySelector('.print-preview-overlay');
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
      menuToggleText.textContent = 'Menü schliessen';
      menuToggleIcon.textContent = 'expand_less';
    } else {
      accordionPanel.classList.add('collapsed');
      menuToggleText.textContent = 'Menü öffnen';
      menuToggleIcon.textContent = 'expand_more';
    }

    updateMenuTogglePositionDebounced();
  });

  // BUG FIX #22: The MutationObserver fires on every attribute/child/subtree
  // change in the accordion panel, which can be very frequent. Using a more
  // aggressive debounce (50ms) to batch rapid mutations into a single layout pass.
  var observer = new MutationObserver(function() {
    updateMenuTogglePositionDebounced();
  });
  observer.observe(accordionPanel, { attributes: true, childList: true, subtree: true });
}

// ===== INFO PANEL CLOSE / ZOOM / SHARE =====
function initInfoPanel() {
  var map = state.map;

  // Info panel close
  document.getElementById('info-close').addEventListener('click', function() {
    document.getElementById('info-panel').classList.remove('show');
    state.selectedBuildingId = null;
    state.selectedParcelId = null;
    updateSelectedBuilding();
    updateSelectedParcel();
    updateUrlWithSelection();
  });

  // Info panel zoom to
  document.getElementById('info-zoom-to').addEventListener('click', function() {
    if (state.selectedBuildingId && map) {
      var building = state.portfolioData.features.find(function(f) {
        return f.properties.bbl_id === state.selectedBuildingId;
      });
      if (building && building.geometry) {
        map.flyTo({
          center: building.geometry.coordinates,
          zoom: 16
        });
      }
    } else if (state.selectedParcelId && map) {
      var parcel = state.parcelData.features.find(function(f) {
        return f.properties.bbl_id === state.selectedParcelId;
      });
      if (parcel && parcel.geometry && parcel.geometry.coordinates) {
        var center = getPolygonCentroid(parcel.geometry.coordinates);
        map.flyTo({
          center: center,
          zoom: 16
        });
      }
    }
  });

  // Info panel share
  // BUG FIX #21b: Fixed clipboard fallback to use correct showToast object format
  document.getElementById('info-share').addEventListener('click', function() {
    var url = getShareUrl();
    var title = t('share.title');
    var text = state.selectedBuildingId
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
      var targetTab = this.dataset.tab;

      // Update active tab
      document.querySelectorAll('.detail-tab').forEach(function(t) {
        t.classList.remove('active');
      });
      this.classList.add('active');

      // Switch content
      document.querySelectorAll('.tab-content').forEach(function(content) {
        content.classList.remove('active');
      });
      var targetContent = document.querySelector('.tab-content[data-content="' + targetTab + '"]');
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
    var buildingId = getBuildingIdFromURL();
    var tab = getTabFromURL();
    if (buildingId) {
      showDetailView(buildingId, tab);
    } else if (state.currentView === 'detail') {
      switchView(state.previousView || 'map');
    }
  });
}

export { initUI, updateMenuTogglePositionDebounced };
