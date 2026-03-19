// BBL GIS Immobilienportfolio - Main Entry Point
// Orchestrates module initialization and data loading

import { state } from './state.js';
import { fetchWithErrorHandling } from './utils.js';
import { showError } from './toast.js';
import {
  getFiltersFromURL, applyFilters, initFilterOptions,
  initFilterPane, initDrawerResize
} from './filters.js';
import { initExportPanel } from './export.js';
import {
  getViewFromURL, getBuildingIdFromURL, getTabFromURL,
  switchView, showDetailView
} from './views.js';
import {
  initBuildingTableHeaders, renderListView, initListPagination,
  initDelegatedListeners, initListToolbar, initTableTabs
} from './list.js';
import { renderGalleryView } from './gallery.js';
import { renderParcelsView, initParcelsTable } from './parcels.js';
import { initAllEntityTables } from './detail.js';
import { initMap, addMapLayers, initStyleSwitcher } from './map.js';
import { initSearch } from './search.js';
import { initContextMenu } from './context-menu.js';
import { initMeasure } from './measure.js';
import { initUI, updateMenuTogglePositionDebounced } from './ui.js';
import { initPrintWidget } from './print.js';
import { initI18n, t } from './i18n.js';

// Make updateMenuTogglePositionDebounced available globally for geokatalog
window.updateMenuTogglePositionDebounced = updateMenuTogglePositionDebounced;

// ===== MAPBOX ACCESS TOKEN =====
mapboxgl.accessToken = 'pk.eyJ1IjoiZGF2aWRyYXNuZXI1IiwiYSI6ImNtMm5yamVkdjA5MDcycXMyZ2I2MHRhamgifQ.m651j7WIX7MyxNh8KIQ1Gg';

// ===== LOADING OVERLAY =====

function showLoadingOverlay(text) {
  var overlay = document.getElementById('loading-overlay');
  if (overlay) {
    var textEl = overlay.querySelector('.loading-text');
    if (textEl && text) {
      textEl.textContent = text;
    }
    overlay.classList.remove('hidden');
  }
}

function hideLoadingOverlay() {
  var overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }
}

// ===== TABLE PANEL TOGGLE & RESIZE =====

function initTablePanel() {
  var toggleBtn = document.getElementById('tbl-toggle');
  var panel = document.getElementById('table-panel');
  var handle = document.getElementById('tbl-resize-handle');

  toggleBtn.addEventListener('click', function() {
    state.tableOpen = !state.tableOpen;
    panel.classList.toggle('collapsed', !state.tableOpen);
    toggleBtn.classList.toggle('collapsed', !state.tableOpen);
    handle.style.display = state.tableOpen ? '' : 'none';
    if (state.tableOpen && state.listViewDirty) {
      renderListView();
      renderParcelsView();
      state.listViewDirty = false;
    }
    setTimeout(function() {
      if (state.map) state.map.resize();
    }, 280);
  });

  if (!handle) return;
  var MIN_H = 120;
  var MAX_FRAC = 0.75;
  var startY, startH;

  handle.addEventListener('pointerdown', function(e) {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
    panel.style.transition = 'none';
    startY = e.clientY;
    startH = panel.getBoundingClientRect().height;

    function onMove(ev) {
      var delta = startY - ev.clientY;
      var maxH = window.innerHeight * MAX_FRAC;
      panel.style.height = Math.min(maxH, Math.max(MIN_H, startH + delta)) + 'px';
      if (state.map) state.map.resize();
    }

    function onUp() {
      handle.classList.remove('dragging');
      panel.style.transition = '';
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      if (state.map) state.map.resize();
    }

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  });
}

// ===== INTERNAL LAYER TOGGLES =====

function initInternalLayerToggles() {
  var buildingsToggle = document.getElementById('layer-toggle-buildings');
  var parcelsToggle = document.getElementById('layer-toggle-parcels');

  if (buildingsToggle) {
    buildingsToggle.addEventListener('change', function() {
      var vis = this.checked ? 'visible' : 'none';
      ['portfolio-points', 'portfolio-selected', 'portfolio-selected-pulse', 'portfolio-labels'].forEach(function(id) {
        if (state.map.getLayer(id)) state.map.setLayoutProperty(id, 'visibility', vis);
      });
    });
  }

  if (parcelsToggle) {
    parcelsToggle.addEventListener('change', function() {
      var vis = this.checked ? 'visible' : 'none';
      ['parcels-fill', 'parcels-outline', 'parcels-highlight', 'parcels-selected', 'parcels-selected-outline'].forEach(function(id) {
        if (state.map.getLayer(id)) state.map.setLayoutProperty(id, 'visibility', vis);
      });
    });
  }
}

// ===== INITIALIZE MAP =====

initMap();

// ===== DATA LOADING =====

function loadAllData() {
  showLoadingOverlay('Daten werden geladen...');

  Promise.all([
    fetchWithErrorHandling('data/buildings.geojson'),
    fetchWithErrorHandling('data/parcels.geojson')
  ])
    .then(function(results) {
      state.portfolioData = results[0];
      state.parcelData = results[1];

      // Validate portfolio data
      if (!state.portfolioData || !state.portfolioData.features) {
        throw new Error('Ung\u00FCltiges Datenformat: Geb\u00E4udedaten fehlen');
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
      initDelegatedListeners();
      initListToolbar();
      initListPagination();
      initParcelsTable();
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
      var buildingId = getBuildingIdFromURL();
      var initialTab = getTabFromURL();
      var initialView = getViewFromURL();
      if (buildingId) {
        showDetailView(buildingId, initialTab);
      } else if (initialView === 'gallery') {
        switchView('gallery');
        renderGalleryView();
      } else {
        var styleSwitcher = document.getElementById('style-switcher');
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
  initSearch();
  initContextMenu();
  initMeasure();
  initStyleSwitcher();
  initPrintWidget();
  initUI();

  // ===== START DATA LOAD =====
  loadAllData();
});
