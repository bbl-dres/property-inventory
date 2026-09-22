// Entry point: boot sequence, data loading and the global action delegation.

import { state } from './state.js';
import { initReferenceData } from './reference-data.js';
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
import { initMap, addMapLayers, hasMapLoaded, selectBuilding, selectParcel } from './map.js';
import { initLocationTree } from './location-tree.js';
import { initUI, switchView, showDetailView, initApiDocs, comingSoon, getViewFromURL, getBuildingIdFromURL, getTabFromURL } from './ui.js';
import { getFiltersFromURL, featureMatchesFilters, setExactFilters, applyFilters, initFilterOptions, initFilterPane, initDrawerResize, resetFilters, navigateToAllObjects, navigateWithLandFilter, navigateWithRegionFilter } from './filters.js';
import { initTables, renderTables, initListToolbar, initTableTabs, initGalleryFilter, initTablePanel } from './list.js';
import { initEntityTables } from './entity-tables.js';
import { initExportPanel, shareActions } from './export.js';
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
  initExportPanel();
  initTables();
  initListToolbar();
  initTableTabs();
  initTablePanel();
  initLocationTree({
    buildings: function() { return state.buildingsData ? state.buildingsData.features.filter(function(f) { return featureMatchesFilters(f, LOCATION_FILTER_KEYS); }) : []; },
    allBuildings: function() { return state.buildingsData ? state.buildingsData.features : []; },
    parcels: function() { return state.parcelData ? state.parcelData.features : []; },
    building: function(f) { const p = f.properties; const parts = String(p.buildingId).split('/'); return { id: p.buildingId, code: parts[2] || p.buildingId, label: p.name, country: p.country, region: p.stateProvincePrefecture, city: p.city, we: parts[1] || '' }; },
    parcel: function(f) { const p = f.properties; const parts = String(p.parcelId).split('/'); return { id: p.parcelId, code: parts[2] || p.parcelId, label: p.name, we: parts[1] || '' }; },
    filterKeys: { country: 'land', region: 'region', city: 'ort' },
    getFilter: function(key) { return state.activeFilters[key] || []; },
    setFilters: setExactFilters,
    // Selects on the map; on the detail page it also opens that object's page (a parcel: its building's)
    onSelectObject: function(kind, id) {
      if (kind === 'parcel') selectParcel(id, true); else selectBuilding(id, true);
      if (state.currentView !== 'detail') return;
      const buildingId = kind === 'building' ? id : buildingOfParcel(id);
      if (buildingId) showDetailView(buildingId, getTabFromURL()); else switchView('map');
    }
  });
  initGalleryFilter();
  initEntityTables();
}

// The building a parcel belongs to, for the tree on the detail page
function buildingOfParcel(parcelId) {
  const parcel = state.parcelIndex.get(parcelId);
  const id = parcel && parcel.properties.buildingId;
  return id && state.buildingIndex.has(id) ? id : null;
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
  } else if (initialView === 'gallery' || initialView === 'api-docs') {
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
  renderTables();

  // Map loaded first: add the layers now. Otherwise the map's load handler (initMap) adds them.
  // (map.loaded() is no substitute: it is false again while tiles stream, and 'load' fires only once.)
  if (hasMapLoaded()) addMapLayers();

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
  ].concat(entityKeys.map(function(key) { return optional(entityDataFiles[key].url); }), [fetchWithErrorHandling('data/meta.json')]))
    .then(function(results) {
      initReferenceData(results[2 + entityKeys.length]);
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
    comingSoon: function() { comingSoon(); },
    retryApiDocs: function() { initApiDocs(); }
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

// Load translations first (German UI; the JS-rendered texts come from the same file as prototype-simple),
// then initialise everything. Any error on the way is made visible.
initI18n('data/i18n.json', { persistLang: false }).then(boot).catch(fatalBootError);
