// Entry point: boot sequence, data loading and the global action delegation.

import { state } from './state.js';
import { internalLayers, statusLegendItems, entityDataFiles } from './config.js';
import { fetchWithErrorHandling } from './utils.js';
import { initI18n, translationsLoaded, t, tf } from './i18n.js';
import { showError, showWarning } from './toast.js';
import { showLoadingOverlay, hideLoadingOverlay, markBooted, initGlobalErrorHandlers, fatalBootError } from './boot.js';
import { setStyleSwitcherVisible } from './basemaps.js';
import { initMeasure, toggleMeasurement } from './measure.js';
import { initContextMenu } from './context-menu.js';
import { initSwisstopo, swisstopoClickActions, swisstopoChangeActions } from './swisstopo.js';
import { initPrintWidget } from './print.js';
import { carouselActions } from './carousel.js';
import { initMap, addMapLayers } from './map.js';
import { initUI, switchView, showDetailView, comingSoon, getViewFromURL, getBuildingIdFromURL, getTabFromURL } from './ui.js';
import { getFiltersFromURL, applyFilters, initFilterOptions, initFilterPane, initDrawerResize, resetFilters, navigateToAllObjects, navigateWithLandFilter, navigateWithRegionFilter } from './filters.js';
import { initTables, renderListView, initListToolbar, initGalleryFilter } from './list.js';
import { initEntityTables } from './entity-tables.js';
import { initExportPanel, shareActions } from './export.js';
import { initSearch, searchActions } from './search.js';

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
  initTables();
  initListToolbar();
  initGalleryFilter();
  initEntityTables();
}

function buildIndexes() {
  state.buildingIndex = new Map();
  state.buildingsData.features.forEach(function(f) { state.buildingIndex.set(f.properties.buildingId, f); });
  state.parcelIndex = new Map();
  if (state.parcelData && state.parcelData.features) {
    state.parcelData.features.forEach(function(f) { state.parcelIndex.set(f.properties.parcelId, f); });
  }
}

// Only ?view=detail opens the detail page; a plain ?id= (as written by a map selection)
// keeps the map view and restores the selection there.
function restoreViewFromUrl() {
  const buildingId = getBuildingIdFromURL();
  const initialView = getViewFromURL();
  if (initialView === 'detail' && buildingId && state.buildingIndex.has(buildingId)) {
    showDetailView(buildingId, getTabFromURL());
  } else if (initialView === 'list' || initialView === 'gallery') {
    switchView(initialView);
  } else {
    setStyleSwitcherVisible(true);
  }
}

function applyLoadedData(buildings, parcels, entities) {
  state.buildingsData = buildings;
  state.parcelData = parcels;
  Object.keys(entityDataFiles).forEach(function(stateKey) {
    const file = entityDataFiles[stateKey];
    const payload = entities[stateKey];
    state[stateKey] = (payload && Array.isArray(payload[file.key])) ? payload[file.key] : [];
  });

  // Buildings are the only mandatory dataset
  if (!state.buildingsData || !Array.isArray(state.buildingsData.features)) {
    throw new Error('Ungültiges Datenformat: Gebäudedaten fehlen');
  }

  buildIndexes();
  state.activeFilters = getFiltersFromURL();
  initFilterOptions();
  initDataDependentUI();

  applyFilters();
  renderListView();

  if (state.map.loaded()) addMapLayers();
  else state.map.once('load', addMapLayers);

  restoreViewFromUrl();
}

function loadAllData() {
  showLoadingOverlay(tf('loading.data', 'Daten werden geladen...'));

  // Parcels and the entity tables are optional: the app still works with buildings only
  function optional(url) {
    return fetchWithErrorHandling(url).catch(function(err) {
      console.warn('[app] optional dataset failed to load:', url, err);
      return null;
    });
  }

  const entityKeys = Object.keys(entityDataFiles);
  Promise.all([
    fetchWithErrorHandling('data/buildings.geojson'),
    optional('data/parcels.geojson')
  ].concat(entityKeys.map(function(key) { return optional(entityDataFiles[key].url); })))
    .then(function(results) {
      const entities = {};
      entityKeys.forEach(function(key, i) { entities[key] = results[2 + i]; });
      applyLoadedData(results[0], results[1], entities);
      hideLoadingOverlay();
      markBooted();
      if (results.slice(1).some(function(r) { return r === null; })) {
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
    getSources: function() { return { buildings: state.buildingsData, parcels: state.parcelData }; },
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
    navigateWithRegionFilter: function() { navigateWithRegionFilter(); },
    toggleMeasure: function() { toggleMeasurement(); },
    comingSoon: function() { comingSoon(); }
  }, swisstopoClickActions, carouselActions, searchActions, shareActions);

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

// Load translations first (German UI; the JS-rendered texts come from the same file as prototype-main),
// then initialise everything. Any error on the way is made visible.
initI18n('data/i18n.json', { persistLang: false }).then(boot).catch(fatalBootError);
