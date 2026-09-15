// Filters: URL state, filter drawer, option lists, pills, object count and the map filter.

import { state } from './state.js';
import { filterConfig, filterLabel } from './config.js';
import { escapeHtml, getNestedProperty, storageGet, storageSet, isMobileLayout } from './utils.js';
import { t, onLangChange } from './i18n.js';
import { onEscape } from './keys.js';
import { renderListView, renderGalleryView } from './list.js';
import { switchView } from './ui.js';
import { updateFilteredExportHeader, updateExportCount } from './export.js';

// ===== URL STATE =====

export function getFiltersFromURL() {
  const params = new URLSearchParams(window.location.search);
  const filters = {};
  Object.keys(filterConfig).forEach(function(key) {
    const value = params.get('filter_' + key);
    filters[key] = value ? value.split(',').map(function(v) { return decodeURIComponent(v); }) : [];
  });
  return filters;
}

export function setFiltersInURL(filters) {
  const url = new URL(window.location);
  Object.keys(filters).forEach(function(key) {
    url.searchParams.delete('filter_' + key);
    if (filters[key].length > 0) {
      url.searchParams.set('filter_' + key, filters[key].map(function(v) { return encodeURIComponent(v); }).join(','));
    }
  });
  // replaceState on purpose: a history entry per checkbox click made the Back button change the
  // URL without changing the filters. Filters stay deep-linkable via the share URL.
  window.history.replaceState({}, '', url);
}

export function getActiveFilterCount() {
  return Object.keys(state.activeFilters).reduce(function(count, key) {
    return count + state.activeFilters[key].length;
  }, 0);
}

// ===== APPLY =====

function featureMatchesFilters(feature) {
  const props = feature.properties;
  // AND between categories, OR within a category
  return Object.keys(state.activeFilters).every(function(filterKey) {
    const filterValues = state.activeFilters[filterKey];
    if (filterValues.length === 0) return true;
    const propValue = getNestedProperty(props, filterConfig[filterKey].property);
    return filterValues.indexOf(propValue) !== -1;
  });
}

export function applyFilters() {
  if (!state.buildingsData) return;

  state.filteredData = {
    type: state.buildingsData.type,
    name: state.buildingsData.name,
    features: state.buildingsData.features.filter(featureMatchesFilters)
  };

  setFiltersInURL(state.activeFilters);
  updateObjectCount();
  updateExportCount();
  updateFilteredExportHeader();
  updateFilterButtonState();
  renderFilterPills();
  renderCurrentView();

  if (state.map && state.map.getLayer('buildings-points')) {
    updateMapFilter();
  }
}

export function updateMapFilter() {
  if (!state.map || !state.map.getSource('buildings')) return;

  // Update the source data (same approach as prototype-main, where clusters need it)
  const dataToShow = getActiveFilterCount() === 0 ? state.buildingsData : state.filteredData;
  state.map.getSource('buildings').setData(dataToShow);

  // Zoom to fit the filtered points (skipped while layers are restored after a basemap change)
  if (getActiveFilterCount() > 0 && !state.skipFilterZoom) {
    zoomToFilteredPoints();
  }
}

export function zoomToFilteredPoints() {
  if (!state.filteredData || state.filteredData.features.length === 0) return;
  const features = state.filteredData.features;

  if (features.length === 1) {
    state.map.flyTo({ center: features[0].geometry.coordinates, zoom: 14, duration: 800 });
    return;
  }
  const bounds = new maplibregl.LngLatBounds();
  features.forEach(function(feature) { bounds.extend(feature.geometry.coordinates); });
  state.map.fitBounds(bounds, { padding: 80, duration: 800, maxZoom: 16 });
}

// Table and gallery are re-rendered only while visible; hidden views are marked dirty
export function renderCurrentView() {
  if (state.currentView === 'list') {
    renderListView();
  } else {
    state.listViewDirty = true;
  }
  if (state.currentView === 'gallery') {
    renderGalleryView();
  } else {
    state.galleryViewDirty = true;
  }
}

// Header count ("10 Objekte")
export function updateObjectCount() {
  const count = state.filteredData ? state.filteredData.features.length : (state.buildingsData ? state.buildingsData.features.length : 0);
  const countEl = document.getElementById('object-count');
  if (countEl) countEl.textContent = t('header.objectCount', { count: count });
}

// ===== FILTER PILLS (table toolbar, when present) =====

export function renderFilterPills() {
  const container = document.getElementById('filter-pills');
  if (!container) return;

  let html = '';
  let hasAny = false;
  Object.keys(state.activeFilters).forEach(function(filterKey) {
    const values = state.activeFilters[filterKey];
    if (!values || values.length === 0) return;
    hasAny = true;
    values.forEach(function(val) {
      html += '<span class="filter-pill">' +
        '<span class="filter-pill-label">' + escapeHtml(filterLabel(filterKey)) + ':</span>' +
        escapeHtml(val) +
        '<button type="button" class="filter-pill-remove" data-filter-key="' + escapeHtml(filterKey) + '" data-filter-value="' + escapeHtml(val) + '" title="' + escapeHtml(t('filter.pill.remove')) + '">close</button>' +
        '</span>';
    });
  });
  if (hasAny) {
    html += '<button type="button" class="filter-pills-reset" id="filter-pills-reset">' + t('filter.reset.all') + '</button>';
  }
  container.innerHTML = html;
}

function initFilterPills() {
  const container = document.getElementById('filter-pills');
  if (!container) return;
  container.addEventListener('click', function(e) {
    const removeBtn = e.target.closest('.filter-pill-remove');
    if (removeBtn) {
      e.stopPropagation();
      setFilterValue(removeBtn.dataset.filterKey, removeBtn.dataset.filterValue, false);
      applyFilters();
      return;
    }
    if (e.target.closest('.filter-pills-reset')) {
      e.stopPropagation();
      resetFilters();
    }
  });
}

// ===== FILTER STATE HELPERS =====

function setCheckbox(filterKey, value, checked) {
  const cb = document.querySelector('#filter-panel input[data-filter="' + filterKey + '"][data-value="' + CSS.escape(value) + '"]');
  if (cb) cb.checked = checked;
}

// Add or remove one value of a category (state and checkbox), without applying
function setFilterValue(filterKey, value, on) {
  if (!state.activeFilters[filterKey]) return;
  if (on) {
    if (state.activeFilters[filterKey].indexOf(value) === -1) state.activeFilters[filterKey].push(value);
  } else {
    state.activeFilters[filterKey] = state.activeFilters[filterKey].filter(function(v) { return v !== value; });
  }
  setCheckbox(filterKey, value, on);
}

function clearFilterState() {
  Object.keys(filterConfig).forEach(function(k) { state.activeFilters[k] = []; });
  document.querySelectorAll('#filter-panel input[type="checkbox"]').forEach(function(cb) { cb.checked = false; });
}

export function resetFilters() {
  clearFilterState();
  applyFilters();
}

export function navigateToAllObjects() {
  resetFilters();
  switchView(state.previousView || 'gallery');
}

// Replace all filters by a single value of one category and return to the previous view (breadcrumb links)
export function navigateWithFilter(filterKey, value) {
  if (!value) return;
  clearFilterState();
  setFilterValue(filterKey, value, true);
  applyFilters();
  switchView(state.previousView || 'gallery');
}

export function navigateWithLandFilter() {
  if (state.currentDetailBuilding) navigateWithFilter('land', state.currentDetailBuilding.properties.country);
}

export function navigateWithRegionFilter() {
  if (state.currentDetailBuilding) navigateWithFilter('region', state.currentDetailBuilding.properties.stateProvincePrefecture);
}

// ===== HEADER BUTTON =====

export function updateFilterButtonState() {
  const drawerBtn = document.getElementById('filter-panel-btn');
  if (!drawerBtn) return;
  const count = getActiveFilterCount();

  drawerBtn.classList.toggle('has-active-filters', count > 0);
  let badge = drawerBtn.querySelector('.filter-count');
  if (count > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'filter-count';
      drawerBtn.appendChild(badge);
    }
    badge.textContent = count;
  } else if (badge) {
    badge.remove();
  }

  // Mobile drawer footer: "Show N objects"
  const applyText = document.getElementById('drawer-apply-text');
  if (applyText) {
    applyText.textContent = t('filter.apply', { count: state.filteredData ? state.filteredData.features.length : 0 });
  }
}

// ===== DRAWER =====

export function toggleSmartDrawer(open) {
  const drawer = document.getElementById('filter-panel');
  const drawerBtn = document.getElementById('filter-panel-btn');
  if (!drawer || !drawerBtn) return;
  if (open === undefined) open = !drawer.classList.contains('open');
  const wasOpen = drawer.classList.contains('open');

  drawer.classList.toggle('open', open);
  drawerBtn.classList.toggle('panel-open', open);
  drawerBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  document.body.classList.toggle('drawer-open', open);

  if (open && !wasOpen && isMobileLayout()) {
    // Full-screen sheet on phones: move focus into it
    const closeBtn = document.getElementById('drawer-close-btn');
    if (closeBtn) closeBtn.focus();
  } else if (!open && wasOpen && drawer.contains(document.activeElement)) {
    drawerBtn.focus();
  }

  // Resize the map after the transition completes
  if (state.map) {
    setTimeout(function() { state.map.resize(); }, 350);
  }
}

export function initDrawerResize() {
  const drawer = document.getElementById('filter-panel');
  const handle = drawer ? drawer.querySelector('.filter-panel-resize-handle') : null;
  if (!handle) return;

  let startX, startWidth;
  const styles = getComputedStyle(document.documentElement);
  const minWidth = parseInt(styles.getPropertyValue('--drawer-min-width')) || 300;
  const maxWidth = parseInt(styles.getPropertyValue('--drawer-max-width')) || 800;

  const savedWidth = parseInt(storageGet('drawerWidth'), 10);
  if (savedWidth) {
    document.documentElement.style.setProperty('--drawer-width', Math.min(maxWidth, Math.max(minWidth, savedWidth)) + 'px');
  }

  function onResizeMove(e) {
    const delta = startX - e.clientX; // dragging left = wider
    const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
    document.documentElement.style.setProperty('--drawer-width', newWidth + 'px');
  }

  function onResizeEnd() {
    document.removeEventListener('pointermove', onResizeMove);
    document.removeEventListener('pointerup', onResizeEnd);
    document.removeEventListener('pointercancel', onResizeEnd);
    handle.classList.remove('dragging');
    drawer.classList.remove('resizing');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    storageSet('drawerWidth', drawer.offsetWidth);
    if (state.map) state.map.resize();
  }

  // Pointer events cover mouse, pen and touch (the handle has touch-action: none in the stylesheet)
  handle.addEventListener('pointerdown', function(e) {
    if (e.button !== 0 || isMobileLayout()) return; // full-screen sheet on phones: nothing to resize
    startX = e.clientX;
    startWidth = drawer.offsetWidth;
    handle.classList.add('dragging');
    drawer.classList.add('resizing');
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
    document.addEventListener('pointermove', onResizeMove);
    document.addEventListener('pointerup', onResizeEnd);
    document.addEventListener('pointercancel', onResizeEnd);
  });
}

// ===== OPTION LISTS =====

// One checkbox per distinct value of every filter category, with the number of objects per value
export function initFilterOptions() {
  if (!state.buildingsData) return;

  const valueCounts = {};
  Object.keys(filterConfig).forEach(function(key) { valueCounts[key] = {}; });

  state.buildingsData.features.forEach(function(feature) {
    Object.keys(filterConfig).forEach(function(key) {
      const value = getNestedProperty(feature.properties, filterConfig[key].property);
      if (value === null || value === undefined || value === '') return;
      valueCounts[key][value] = (valueCounts[key][value] || 0) + 1;
    });
  });

  Object.keys(filterConfig).forEach(function(filterKey) {
    const container = document.getElementById('filter-' + filterKey + '-options');
    if (!container) return;

    const values = Object.keys(valueCounts[filterKey]).sort();
    container.innerHTML = values.map(function(value) {
      const id = 'filter-' + filterKey + '-' + value.replace(/[^a-zA-Z0-9]/g, '_');
      const checked = state.activeFilters[filterKey].indexOf(value) !== -1 ? ' checked' : '';
      return '<div class="filter-option">' +
        '<input type="checkbox" id="' + id + '" data-filter="' + escapeHtml(filterKey) + '" data-value="' + escapeHtml(value) + '"' + checked + '>' +
        '<label for="' + id + '">' + escapeHtml(value) +
          ' <span class="filter-option-count">' + valueCounts[filterKey][value] + '</span>' +
        '</label>' +
        '</div>';
    }).join('');
  });
}

export function initFilterPane() {
  const panel = document.getElementById('filter-panel');
  if (!panel) return;

  // One delegated listener for every filter checkbox (the lists are re-rendered on data load)
  panel.addEventListener('change', function(e) {
    const cb = e.target.closest('input[type="checkbox"][data-filter]');
    if (!cb) return;
    setFilterValue(cb.dataset.filter, cb.dataset.value, cb.checked);
    applyFilters();
  });

  document.getElementById('filter-panel-btn').addEventListener('click', function() { toggleSmartDrawer(); });
  document.getElementById('drawer-close-btn').addEventListener('click', function() { toggleSmartDrawer(false); });
  document.getElementById('drawer-reset-btn').addEventListener('click', resetFilters);

  // Mobile footer: filters apply instantly, the primary button only closes the full-screen drawer
  const applyBtn = document.getElementById('drawer-apply-btn');
  if (applyBtn) applyBtn.addEventListener('click', function() { toggleSmartDrawer(false); });
  const resetMobileBtn = document.getElementById('drawer-reset-mobile-btn');
  if (resetMobileBtn) resetMobileBtn.addEventListener('click', resetFilters);

  onLangChange(function() {
    updateFilterButtonState();
    updateObjectCount();
    renderFilterPills();
  });

  // Filter section accordion toggle
  document.querySelectorAll('.filter-section-header').forEach(function(header) {
    header.addEventListener('click', function() {
      this.parentElement.classList.toggle('open');
    });
  });

  onEscape(function() {
    if (!panel.classList.contains('open')) return false;
    toggleSmartDrawer(false);
    return true;
  }, 30);

  // Logo click: back to all objects
  document.getElementById('logo-area').addEventListener('click', navigateToAllObjects);

  // Filter search (only when the drawer has one)
  const filterSearchInput = document.getElementById('filter-search-input');
  const filterSearchClear = document.getElementById('filter-search-clear');

  function filterSections() {
    const term = filterSearchInput.value.toLowerCase().trim();
    if (filterSearchClear) filterSearchClear.hidden = !term;
    document.querySelectorAll('.filter-section').forEach(function(section) {
      const title = section.querySelector('.filter-section-title');
      const text = title ? title.textContent.toLowerCase() : '';
      section.style.display = (!term || text.indexOf(term) !== -1) ? '' : 'none';
    });
  }

  if (filterSearchInput) filterSearchInput.addEventListener('input', filterSections);
  if (filterSearchClear) {
    filterSearchClear.addEventListener('click', function() {
      filterSearchInput.value = '';
      filterSearchClear.hidden = true;
      filterSections();
      filterSearchInput.focus();
    });
  }

  initFilterPills();
}
