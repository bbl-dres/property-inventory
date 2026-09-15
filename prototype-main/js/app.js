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
import { initMap, addMapLayers, selectBuilding, selectParcel } from './map.js';
import { initLocationTree } from './location-tree.js';
import { initUI, switchView, showDetailView, initApiDocs, comingSoon, getViewFromURL, getBuildingIdFromURL, getTabFromURL } from './ui.js';
import { getFiltersFromURL, featureMatchesFilters, setExactFilters, applyFilters, initFilterOptions, initFilterPane, initDrawerResize, resetFilters, navigateToAllObjects, navigateWithLandFilter, navigateWithOrtFilter } from './filters.js';
import { initTables, renderTables, initBuildingTableHeaders, initListToolbar, initTableTabs, initGalleryFilter, initTablePanel } from './list.js';
import { initSearch, searchActions } from './search.js';

// ===== DATA LOADING =====

// UI wiring that must happen exactly once. Kept separate from the data application so a
// "retry" after a failed fetch does not register every event listener a second time.
let dataUiInitialized = false;
const LOCATION_FILTER_KEYS = ['land', 'region', 'ort']; // the location tree's own filters (its counts ignore them)

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
  initLocationTree({
    buildings: function() { return state.buildingsData ? state.buildingsData.features.filter(function(f) { return featureMatchesFilters(f, LOCATION_FILTER_KEYS); }) : []; },
    allBuildings: function() { return state.buildingsData ? state.buildingsData.features : []; },
    parcels: function() { return state.parcelData ? state.parcelData.features : []; },
    building: function(f) { const p = f.properties; return { id: p.bbl_id, code: p.bbl_obj, label: p.bbl_bez, country: p.adr_land, region: p.adr_reg, city: p.adr_ort, we: p.bbl_we }; },
    parcel: function(f) { const p = f.properties; return { id: p.bbl_id, code: p.bbl_obj, label: p.bbl_bez, we: p.bbl_we }; },
    filterKeys: { country: 'land', region: 'region', city: 'ort' },
    getFilter: function(key) { return state.activeFilters[key] || []; },
    setFilters: setExactFilters,
    onSelectObject: function(kind, id) { if (kind === 'parcel') selectParcel(id, true); else selectBuilding(id, true); }
  });
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
    comingSoon: function() { comingSoon(); },
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
