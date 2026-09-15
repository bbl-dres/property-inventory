// BBL GIS Immobilienportfolio - Main Entry Point
// Orchestrates module initialization and data loading

import { state } from './state.js';
import { fetchWithErrorHandling } from './utils.js';
import {
  showError, showWarning, getViewFromURL, getBuildingIdFromURL, getTabFromURL,
  switchView, showDetailView, showApiDocsView, initApiDocs, initUI
} from './ui.js';
import {
  getFiltersFromURL, applyFilters, initFilterOptions,
  initFilterPane, initDrawerResize,
  resetFilters, navigateToAllObjects, navigateWithLandFilter, navigateWithOrtFilter
} from './filters.js';
import { initExportPanel, copyShareLink } from './export.js';
import {
  initBuildingTableHeaders, renderListView, initListPagination,
  initDelegatedListeners, initListToolbar, initTableTabs,
  renderGalleryView, renderParcelsView, initParcelsTable,
  renderLandCoversView, initLandCoversTable, initGalleryFilter
} from './list.js';
import { initAllEntityTables, carouselPrev, carouselNext } from './detail.js';
import { initMap, addMapLayers, initStyleSwitcher, initContextMenu } from './map.js';
import { initSearch, handleSearchClick } from './search.js';
import { initMeasure } from './measure.js';
import { initPrintWidget } from './print.js';
import { initI18n, translationsLoaded, t } from './i18n.js';
import {
  removeSwisstopoLayer, toggleSwisstopoLayerVisibility,
  showLayerInfo, showInternalLayerInfo, loadGeokatalog, openTopicModal, initTopicSwitch
} from './swisstopo.js';

// ===== LOADING OVERLAY =====

function showLoadingOverlay(text) {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    const textEl = overlay.querySelector('.loading-text');
    if (textEl && text) {
      textEl.textContent = text;
    }
    overlay.classList.remove('hidden');
  }
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }
}

// ===== ERROR REPORTING =====

// t() returns the key itself when translations are unavailable — fall back to a static text then.
function tf(key, fallback) {
  const s = t(key);
  return s === key ? fallback : s;
}

// Marks the boot as finished for the watchdog in index.html (which otherwise replaces the
// spinner with a static error message after 20 s).
function markBooted() {
  window.__appBooted = true;
}

let lastRuntimeError = null;
let lastRuntimeErrorAt = 0;

// Surfaces uncaught errors / rejected promises as a toast instead of failing silently.
// Throttled and de-duplicated so a repeating error cannot flood the screen.
function reportRuntimeError(err) {
  const message = (err && err.message) ? err.message : String(err || 'Unknown error');
  if (/ResizeObserver loop|^Script error\.?$/.test(message)) return; // benign browser noise
  const now = Date.now();
  if (message === lastRuntimeError && now - lastRuntimeErrorAt < 10000) return;
  lastRuntimeError = message;
  lastRuntimeErrorAt = now;
  console.error('[app] runtime error:', err);
  showError(
    tf('error.unexpected.title', 'Unerwarteter Fehler'),
    tf('error.unexpected.message', 'Ein Fehler ist aufgetreten. Bitte laden Sie die Seite neu, falls das Problem weiterhin besteht.') +
      ' (' + message + ')'
  );
}

function initGlobalErrorHandlers() {
  window.addEventListener('error', function(e) {
    reportRuntimeError(e.error || e.message);
  });
  window.addEventListener('unhandledrejection', function(e) {
    reportRuntimeError(e.reason);
  });
}

// Anything that throws before the data is loaded ends up here: hide the spinner and
// show a persistent error with a reload action.
function fatalBootError(err) {
  console.error('[app] fatal boot error:', err);
  hideLoadingOverlay();
  markBooted();
  const message = (err && err.message) ? err.message : String(err);
  showError(
    tf('error.init.title', 'Anwendung konnte nicht gestartet werden'),
    tf('error.init.message', 'Bitte laden Sie die Seite neu. Details finden Sie in der Browser-Konsole.') + ' (' + message + ')',
    function() { window.location.reload(); }
  );
}

// ===== TABLE PANEL TOGGLE & RESIZE =====

function initTablePanel() {
  const toggleBtn = document.getElementById('tbl-toggle');
  const panel = document.getElementById('table-panel');
  const handle = document.getElementById('tbl-resize-handle');

  // Table visibility: hidden by default on every screen size; URL param ?table=open opts in.
  var urlParams = new URLSearchParams(window.location.search);
  var showTable = urlParams.get('table') === 'open';

  state.tableOpen = showTable;
  if (!showTable) {
    panel.classList.add('collapsed');
    toggleBtn.classList.add('collapsed');
    if (handle) handle.style.display = 'none';
  }

  toggleBtn.addEventListener('click', function() {
    state.tableOpen = !state.tableOpen;
    // Clear any inline height from drag-resize so CSS classes take effect
    panel.style.height = '';
    panel.classList.toggle('collapsed', !state.tableOpen);
    toggleBtn.classList.toggle('collapsed', !state.tableOpen);
    if (handle) handle.style.display = state.tableOpen ? '' : 'none';
    if (state.tableOpen && state.listViewDirty) {
      renderListView();
      renderParcelsView();
      renderLandCoversView();
      state.listViewDirty = false;
    }
    // Persist table visibility in URL
    var url = new URL(window.location);
    url.searchParams.set('table', state.tableOpen ? 'open' : 'closed');
    window.history.replaceState({}, '', url);
    setTimeout(function() {
      if (state.map) state.map.resize();
    }, 280);
  });

  if (!handle) return;
  const MIN_H = 120;
  const MAX_FRAC = 0.75;
  let startY, startH;

  handle.addEventListener('pointerdown', function(e) {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
    panel.style.transition = 'none';
    startY = e.clientY;
    startH = panel.getBoundingClientRect().height;

    function onMove(ev) {
      const delta = startY - ev.clientY;
      const maxH = window.innerHeight * MAX_FRAC;
      panel.style.height = Math.min(maxH, Math.max(MIN_H, startH + delta)) + 'px';
      if (state.map) state.map.resize();
    }

    function onUp() {
      handle.classList.remove('dragging');
      panel.style.transition = '';
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('lostpointercapture', onUp);
      if (state.map) state.map.resize();
    }

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('lostpointercapture', onUp);
  });
}

// ===== INTERNAL LAYER TOGGLES =====

function initInternalLayerToggles() {
  const buildingsToggle = document.getElementById('layer-toggle-buildings');
  const parcelsToggle = document.getElementById('layer-toggle-parcels');

  if (buildingsToggle) {
    buildingsToggle.addEventListener('change', function() {
      const vis = this.checked ? 'visible' : 'none';
      ['buildings-clusters', 'buildings-cluster-count', 'buildings-points', 'buildings-selected', 'buildings-selected-pulse', 'buildings-labels'].forEach(function(id) {
        if (state.map.getLayer(id)) state.map.setLayoutProperty(id, 'visibility', vis);
      });
    });
  }

  if (parcelsToggle) {
    parcelsToggle.addEventListener('change', function() {
      const vis = this.checked ? 'visible' : 'none';
      ['parcels-fill', 'parcels-outline', 'parcels-highlight', 'parcels-selected', 'parcels-selected-outline'].forEach(function(id) {
        if (state.map.getLayer(id)) state.map.setLayoutProperty(id, 'visibility', vis);
      });
    });
  }

  var landCoversToggle = document.getElementById('layer-toggle-landcovers');
  if (landCoversToggle) {
    landCoversToggle.addEventListener('change', function() {
      var vis = this.checked ? 'visible' : 'none';
      ['landcovers-fill', 'landcovers-outline', 'landcovers-highlight', 'landcovers-selected', 'landcovers-selected-outline'].forEach(function(id) {
        if (state.map.getLayer(id)) state.map.setLayoutProperty(id, 'visibility', vis);
      });
    });
  }
}

// ===== DATA LOADING =====

// UI wiring that must happen exactly once. Kept separate from the data application so a
// "retry" after a failed fetch does not register every event listener a second time.
let dataUiInitialized = false;

function initDataDependentUI() {
  if (dataUiInitialized) return;
  dataUiInitialized = true;

  initFilterPane();
  initDrawerResize();
  initExportPanel();
  initBuildingTableHeaders();
  initDelegatedListeners();
  initListToolbar();
  initListPagination();
  initGalleryFilter();
  initParcelsTable();
  initLandCoversTable();
  initTableTabs();
  initInternalLayerToggles();
  initTablePanel();
  initAllEntityTables();
}

function buildIndexes() {
  state.buildingIndex = new Map();
  state.buildingsData.features.forEach(function(f) {
    state.buildingIndex.set(f.properties.bbl_id, f);
  });
  state.parcelIndex = new Map();
  if (state.parcelData && state.parcelData.features) {
    state.parcelData.features.forEach(function(f) {
      state.parcelIndex.set(f.properties.bbl_id, f);
    });
  }
  state.landCoverIndex = new Map();
  if (state.landCoverData && state.landCoverData.features) {
    state.landCoverData.features.forEach(function(f) {
      state.landCoverIndex.set(f.properties.objectid, f);
    });
  }
}

// Restore the view from the URL. Only ?view=detail opens the detail page; a plain ?id=…
// (as written by a map selection) keeps the map view and restores the selection there.
function restoreViewFromUrl() {
  const buildingId = getBuildingIdFromURL();
  const initialTab = getTabFromURL();
  const initialView = getViewFromURL();
  if (initialView === 'detail' && buildingId && state.buildingIndex.has(buildingId)) {
    showDetailView(buildingId, initialTab);
  } else if (initialView === 'gallery') {
    switchView('gallery');
    renderGalleryView();
  } else if (initialView === 'api-docs') {
    showApiDocsView();
  } else {
    const styleSwitcher = document.getElementById('style-switcher');
    if (styleSwitcher) {
      styleSwitcher.classList.add('visible');
    }
  }
}

function applyLoadedData(buildings, parcels, landcovers) {
  state.buildingsData = buildings;
  state.parcelData = parcels;
  state.landCoverData = landcovers;

  // Validate buildings data (the only mandatory dataset)
  if (!state.buildingsData || !Array.isArray(state.buildingsData.features)) {
    throw new Error('Ung\u00FCltiges Datenformat: Geb\u00E4udedaten fehlen');
  }

  buildIndexes();

  // Initialize filters from URL, then build filter options from the data
  state.activeFilters = getFiltersFromURL();
  initFilterOptions();

  initDataDependentUI();

  // Apply initial filters and render tables
  applyFilters();
  renderListView();
  renderParcelsView();
  renderLandCoversView();

  // Add map layers when map is ready
  if (state.map.loaded()) {
    addMapLayers();
  } else {
    state.map.once('load', addMapLayers);
  }

  restoreViewFromUrl();
}

function loadAllData() {
  showLoadingOverlay(tf('loading.data', 'Daten werden geladen...'));

  // Parcels and land covers are optional: the app still works with buildings only.
  function optional(url) {
    return fetchWithErrorHandling(url).catch(function(err) {
      console.warn('[app] optional dataset failed to load:', url, err);
      return null;
    });
  }

  Promise.all([
    fetchWithErrorHandling('data/buildings.geojson'),
    optional('data/parcels.geojson'),
    optional('data/landcovers.geojson')
  ])
    .then(function(results) {
      applyLoadedData(results[0], results[1], results[2]);
      hideLoadingOverlay();
      markBooted();

      if (results[1] === null || results[2] === null) {
        showWarning(t('error.data.partial.title'), t('error.data.partial.message'));
      }
    })
    .catch(function(error) {
      console.error('Fehler beim Laden der Daten:', error);
      hideLoadingOverlay();
      markBooted();

      showError(
        t('error.data.title'),
        t('error.data.message') + ' (' + (error && error.message ? error.message : error) + ')',
        function() {
          loadAllData();
        }
      );
    });
}

// ===== BOOT =====

function boot() {
  if (typeof maplibregl === 'undefined') {
    throw new Error('MapLibre GL JS konnte nicht geladen werden (vendor/maplibre-gl/maplibre-gl.js)');
  }

  initMap();
  initSearch();
  initContextMenu();
  initMeasure();
  initStyleSwitcher();
  initPrintWidget();
  initUI();
  initTopicSwitch();

  if (!translationsLoaded()) {
    // Static text on purpose: t() cannot translate when the translation file failed to load
    showWarning(
      '\u00DCbersetzungen nicht verf\u00FCgbar / Translations unavailable',
      'data/i18n.json konnte nicht geladen werden. Die Oberfl\u00E4che zeigt Schl\u00FCssel statt Texte.'
    );
  }

  // ===== START DATA LOAD =====
  loadAllData();

  // ===== GLOBAL ACTION DELEGATION =====
  // Replaces all window.* globals and onclick/onchange attributes
  var actions = {
    showDetailView: function(el) { showDetailView(el.dataset.id); },
    resetAllFilters: function() { resetFilters(); },
    carouselPrev: function() { carouselPrev(); },
    carouselNext: function() { carouselNext(); },
    copyShareLink: function() { copyShareLink(); },
    showInternalLayerInfo: function(el) { showInternalLayerInfo(el.dataset.layerKey); },
    navigateToAllObjects: function() { navigateToAllObjects(); },
    navigateWithLandFilter: function() { navigateWithLandFilter(); },
    navigateWithOrtFilter: function() { navigateWithOrtFilter(); },
    removeSwisstopoLayer: function(el) { removeSwisstopoLayer(el.dataset.layerId); },
    showLayerInfo: function(el) { showLayerInfo(el.dataset.layerId); },
    retryGeokatalog: function() { loadGeokatalog(); },
    switchTopic: function() { openTopicModal(); },
    retryApiDocs: function() { initApiDocs(); },
    searchLocal: function(el) { handleSearchClick('local', el.dataset.id); },
    searchLocation: function(el) { handleSearchClick('location', null, parseFloat(el.dataset.lat), parseFloat(el.dataset.lng), null, null, el.dataset.bbox || null, el.dataset.origin || ''); },
    searchLayer: function(el) { handleSearchClick('layer', el.dataset.layerId, null, null, null, el.dataset.title); }
  };

  document.addEventListener('click', function(e) {
    var target = e.target.closest('[data-action]');
    if (!target) return;
    var handler = actions[target.dataset.action];
    if (handler) {
      if (target.tagName === 'A') e.preventDefault();
      handler(target);
    }
  });

  document.addEventListener('change', function(e) {
    var target = e.target.closest('[data-action]');
    if (!target) return;
    if (target.dataset.action === 'toggleLayerVisibility') {
      toggleSwisstopoLayerVisibility(target.dataset.layerId);
    }
  });
}

initGlobalErrorHandlers();

// Load translations first, then initialize everything. Any error on the way is made visible.
initI18n().then(boot).catch(fatalBootError);
