// Entry point: boot sequence, data loading, table panel and the global action delegation.

import { state } from './state.js';
import { internalLayers, statusLegendItems } from './config.js';
import { fetchWithErrorHandling } from './utils.js';
import { initI18n, translationsLoaded, t, tf } from './i18n.js';
import { showError, showWarning } from './toast.js';
import { showLoadingOverlay, hideLoadingOverlay, markBooted, initGlobalErrorHandlers, fatalBootError } from './boot.js';
import { setStyleSwitcherVisible } from './basemaps.js';
import { initMeasure } from './measure.js';
import { initContextMenu } from './context-menu.js';
import { initSwisstopo, swisstopoClickActions, swisstopoChangeActions } from './swisstopo.js';
import { initPrintWidget } from './print.js';
import { carouselActions } from './carousel.js';
import { initMap, addMapLayers } from './map.js';
import { initUI, switchView, showDetailView, initApiDocs, getViewFromURL, getBuildingIdFromURL, getTabFromURL } from './ui.js';
import { getFiltersFromURL, applyFilters, initFilterOptions, initFilterPane, initDrawerResize, resetFilters, navigateToAllObjects, navigateWithLandFilter, navigateWithOrtFilter } from './filters.js';
import { initTables, renderTables, initBuildingTableHeaders, initListToolbar, initTableTabs, initGalleryFilter } from './list.js';
import { initSearch, searchActions } from './search.js';

// ===== TABLE PANEL TOGGLE & RESIZE =====

function initTablePanel() {
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

  toggleBtn.addEventListener('click', function() {
    state.tableOpen = !state.tableOpen;
    panel.style.height = ''; // clear any drag-resize height so the CSS classes take effect
    panel.classList.toggle('collapsed', !state.tableOpen);
    toggleBtn.classList.toggle('collapsed', !state.tableOpen);
    if (handle) handle.style.display = state.tableOpen ? '' : 'none';
    if (state.tableOpen && state.listViewDirty) {
      renderTables();
      state.listViewDirty = false;
    }
    const url = new URL(window.location);
    url.searchParams.set('table', state.tableOpen ? 'open' : 'closed');
    window.history.replaceState({}, '', url);
    setTimeout(function() { if (state.map) state.map.resize(); }, 280);
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
      const maxH = window.innerHeight * MAX_FRAC;
      panel.style.height = Math.min(maxH, Math.max(MIN_H, startH + (startY - ev.clientY))) + 'px';
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

// ===== DATA LOADING =====

// UI wiring that must happen exactly once. Kept separate from the data application so a
// "retry" after a failed fetch does not register every event listener a second time.
let dataUiInitialized = false;

function initDataDependentUI() {
  if (dataUiInitialized) return;
  dataUiInitialized = true;
  initFilterPane();
  initDrawerResize();
  initBuildingTableHeaders();
  initTables();
  initListToolbar();
  initGalleryFilter();
  initTableTabs();
  initTablePanel();
}

function buildIndexes() {
  state.buildingIndex = new Map();
  state.buildingsData.features.forEach(function(f) { state.buildingIndex.set(f.properties.bbl_id, f); });
  state.parcelIndex = new Map();
  if (state.parcelData && state.parcelData.features) {
    state.parcelData.features.forEach(function(f) { state.parcelIndex.set(f.properties.bbl_id, f); });
  }
  state.landCoverIndex = new Map();
  if (state.landCoverData && state.landCoverData.features) {
    state.landCoverData.features.forEach(function(f) { state.landCoverIndex.set(f.properties.objectid, f); });
  }
}

// Only ?view=detail opens the detail page; a plain ?id= (as written by a map selection)
// keeps the map view and restores the selection there.
function restoreViewFromUrl() {
  const buildingId = getBuildingIdFromURL();
  const initialView = getViewFromURL();
  if (initialView === 'detail' && buildingId && state.buildingIndex.has(buildingId)) {
    showDetailView(buildingId, getTabFromURL());
  } else if (initialView === 'gallery' || initialView === 'api-docs') {
    switchView(initialView);
  } else {
    setStyleSwitcherVisible(true);
  }
}

function applyLoadedData(buildings, parcels, landcovers) {
  state.buildingsData = buildings;
  state.parcelData = parcels;
  state.landCoverData = landcovers;

  // Buildings are the only mandatory dataset
  if (!state.buildingsData || !Array.isArray(state.buildingsData.features)) {
    throw new Error('Ungültiges Datenformat: Gebäudedaten fehlen');
  }

  buildIndexes();
  state.activeFilters = getFiltersFromURL();
  initFilterOptions();
  initDataDependentUI();

  applyFilters();
  renderTables();

  if (state.map.loaded()) addMapLayers();
  else state.map.once('load', addMapLayers);

  restoreViewFromUrl();
}

function loadAllData() {
  showLoadingOverlay(tf('loading.data', 'Daten werden geladen...'));

  // Parcels and land covers are optional: the app still works with buildings only
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
      console.error('[app] data load failed:', error);
      hideLoadingOverlay();
      markBooted();
      showError(
        t('error.data.title'),
        t('error.data.message') + ' (' + (error && error.message ? error.message : error) + ')',
        loadAllData
      );
    });
}

// ===== BOOT =====

function boot() {
  if (typeof maplibregl === 'undefined') {
    throw new Error('MapLibre GL JS konnte nicht geladen werden (vendor/maplibre-gl/maplibre-gl.js)');
  }

  initMap();
  initMeasure(state.map);
  initContextMenu(state.map);
  initSwisstopo({ map: state.map, internalLayers: internalLayers });
  initPrintWidget(state.map, {
    getSources: function() {
      return { buildings: state.buildingsData, parcels: state.parcelData, landcovers: state.landCoverData };
    },
    legendItems: statusLegendItems
  });
  initSearch();
  initUI();

  if (!translationsLoaded()) {
    // Static text on purpose: t() cannot translate when the translation file failed to load
    showWarning(
      'Übersetzungen nicht verfügbar / Translations unavailable',
      'data/i18n.json konnte nicht geladen werden. Die Oberfläche zeigt Schlüssel statt Texte.'
    );
  }

  loadAllData();

  // ===== GLOBAL ACTION DELEGATION (data-action attributes instead of inline handlers) =====
  const clickActions = Object.assign({
    showDetailView: function(el) { showDetailView(el.dataset.id); },
    resetAllFilters: function() { resetFilters(); },
    navigateToAllObjects: function() { navigateToAllObjects(); },
    navigateWithLandFilter: function() { navigateWithLandFilter(); },
    navigateWithOrtFilter: function() { navigateWithOrtFilter(); },
    retryApiDocs: function() { initApiDocs(); }
  }, swisstopoClickActions, carouselActions, searchActions);

  document.addEventListener('click', function(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const handler = clickActions[target.dataset.action];
    if (!handler) return;
    if (target.tagName === 'A') e.preventDefault();
    handler(target);
  });

  document.addEventListener('change', function(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const handler = swisstopoChangeActions[target.dataset.action];
    if (handler) handler(target);
  });
}

initGlobalErrorHandlers();

// Load translations first, then initialise everything. Any error on the way is made visible.
initI18n('data/i18n.json').then(boot).catch(fatalBootError);
