// View management: URL routing, view switching, detail view

import { state } from './state.js';
import { renderListView } from './list.js';
import { renderGalleryView } from './gallery.js';
import { renderParcelsView } from './parcels.js';
import { populateDetailView } from './detail.js';
import { updateMapFilter } from './filters.js';

// ===== URL HELPERS =====
export function getViewFromURL() {
  var params = new URLSearchParams(window.location.search);
  return params.get('view') || 'map';
}

export function getBuildingIdFromURL() {
  var params = new URLSearchParams(window.location.search);
  return params.get('id');
}

export function getTabFromURL() {
  var params = new URLSearchParams(window.location.search);
  return params.get('tab') || 'overview';
}

export function setViewInURL(view, buildingId, tab) {
  var url = new URL(window.location);
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
  var url = new URL(window.location);
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
    state.previousView = state.currentView !== 'detail' ? state.currentView : state.previousView;
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

  var viewElement = document.getElementById(view + '-view');
  if (viewElement) {
    viewElement.classList.add('active');
  }

  // Show/hide style switcher based on view (only visible in map view)
  var styleSwitcher = document.getElementById('style-switcher');
  if (styleSwitcher) {
    styleSwitcher.classList.toggle('visible', view === 'map');
  }

  // Resize map if switching to map view
  if (view === 'map' && state.map) {
    setTimeout(function() {
      state.map.resize();
      if (state.map.getLayer('portfolio-points')) {
        updateMapFilter();
      }
    }, 100);
  }

  // Re-render gallery view if dirty
  if (view === 'gallery' && state.galleryViewDirty) {
    renderGalleryView();
    state.galleryViewDirty = false;
  }

  // Re-render list/parcels views if dirty when switching to map
  if (view === 'map' && state.listViewDirty && state.tableOpen) {
    renderListView();
    renderParcelsView();
    state.listViewDirty = false;
  }
}

// ===== DETAIL VIEW =====
export function showDetailView(buildingId, tab) {
  if (!state.portfolioData) return;

  // Default tab to overview if not specified
  if (!tab) tab = 'overview';

  // Find building by ID
  var building = state.portfolioData.features.find(function(f) {
    return f.properties.bbl_id === buildingId;
  });

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
  var styleSwitcher = document.getElementById('style-switcher');
  if (styleSwitcher) {
    styleSwitcher.classList.remove('visible');
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
  var targetContent = document.querySelector('.tab-content[data-content="' + tab + '"]');
  if (targetContent) {
    targetContent.classList.add('active');
  }

  // Render tab-specific content (simplified: only overview + measurements)
  // Measurements tab is now static HTML, no table rendering needed
}
