// BBL GIS Immobilienportfolio - Main Entry Point
// Orchestrates module initialization and data loading

import { state } from './state.js';
import { fetchWithErrorHandling } from './utils.js';
import {
  showError, getViewFromURL, getBuildingIdFromURL, getTabFromURL,
  switchView, showDetailView, initUI
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
  renderLandCoversView, initLandCoversTable
} from './list.js';
import { initAllEntityTables, carouselPrev, carouselNext } from './detail.js';
import { initMap, addMapLayers, initStyleSwitcher, initContextMenu } from './map.js';
import { initSearch, handleSearchClick } from './search.js';
import { initMeasure } from './measure.js';
import { initPrintWidget } from './print.js';
import { initI18n, t } from './i18n.js';
import {
  removeSwisstopoLayer, toggleSwisstopoLayerVisibility,
  showLayerInfo, showInternalLayerInfo
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

// ===== TABLE PANEL TOGGLE & RESIZE =====

function initTablePanel() {
  const toggleBtn = document.getElementById('tbl-toggle');
  const panel = document.getElementById('table-panel');
  const handle = document.getElementById('tbl-resize-handle');

  // Table visibility: check URL param first, then auto-decide by viewport size
  var urlParams = new URLSearchParams(window.location.search);
  var tableParam = urlParams.get('table');
  var showTable;
  if (tableParam === 'open') {
    showTable = true;
  } else if (tableParam === 'closed') {
    showTable = false;
  } else {
    // Default: show only on large screens
    showTable = window.innerWidth > 1024 && window.innerHeight > 800;
  }

  if (!showTable) {
    state.tableOpen = false;
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
    handle.style.display = state.tableOpen ? '' : 'none';
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

function loadAllData() {
  showLoadingOverlay('Daten werden geladen...');

  Promise.all([
    fetchWithErrorHandling('data/buildings.geojson'),
    fetchWithErrorHandling('data/parcels.geojson'),
    fetchWithErrorHandling('data/landcovers.geojson')
  ])
    .then(function(results) {
      state.buildingsData = results[0];
      state.parcelData = results[1];
      state.landCoverData = results[2];

      // Validate buildings data
      if (!state.buildingsData || !state.buildingsData.features) {
        throw new Error('Ung\u00FCltiges Datenformat: Geb\u00E4udedaten fehlen');
      }

      // Build O(1) lookup indexes
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

      // Initialize filters from URL
      state.activeFilters = getFiltersFromURL();

      // Initialize filter pane with options
      initFilterOptions();
      initFilterPane();
      initDrawerResize();
      initExportPanel();

      // Apply initial filters
      applyFilters();

      initBuildingTableHeaders();
      renderListView();
      renderParcelsView();
      renderLandCoversView();
      initDelegatedListeners();
      initListToolbar();
      initListPagination();
      initParcelsTable();
      initLandCoversTable();
      initTableTabs();
      initInternalLayerToggles();
      initTablePanel();
      initAllEntityTables();

      // Add map layers when map is ready
      if (state.map.loaded()) {
        addMapLayers();
      } else {
        state.map.once('load', addMapLayers);
      }

      // Restore view from URL
      const buildingId = getBuildingIdFromURL();
      const initialTab = getTabFromURL();
      const initialView = getViewFromURL();
      if (buildingId) {
        showDetailView(buildingId, initialTab);
      } else if (initialView === 'gallery') {
        switchView('gallery');
        renderGalleryView();
      } else {
        const styleSwitcher = document.getElementById('style-switcher');
        if (styleSwitcher) {
          styleSwitcher.classList.add('visible');
        }
      }

      hideLoadingOverlay();
    })
    .catch(function(error) {
      console.error('Fehler beim Laden der Daten:', error);
      hideLoadingOverlay();

      showError(
        t('error.data.title'),
        t('error.data.message'),
        function() {
          loadAllData();
        }
      );
    });
}

// ===== INITIALIZE UI COMPONENTS =====

// Load translations first, then initialize everything
initI18n().then(function() {
  initMap();
  initSearch();
  initContextMenu();
  initMeasure();
  initStyleSwitcher();
  initPrintWidget();
  initUI();

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
    searchLocal: function(el) { handleSearchClick('local', el.dataset.id); },
    searchLocation: function(el) { handleSearchClick('location', null, parseFloat(el.dataset.lat), parseFloat(el.dataset.lng), parseFloat(el.dataset.zoom)); },
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
});
