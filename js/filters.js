// Filter, drawer, and filter-pill management

import { state } from './state.js';
import { filterConfig } from './config.js';
import { escapeHtml, getNestedProperty } from './utils.js';
import { renderListView } from './list.js';
import { renderGalleryView } from './gallery.js';
import { renderParcelsView } from './parcels.js';
import { switchView } from './views.js';
import { updateExportCount } from './export.js';

export function getFiltersFromURL() {
  var params = new URLSearchParams(window.location.search);
  var filters = {};
  Object.keys(filterConfig).forEach(function(key) {
    filters[key] = [];
  });

  Object.keys(filters).forEach(function(key) {
    var value = params.get('filter_' + key);
    if (value) {
      filters[key] = value.split(',').map(function(v) {
        return decodeURIComponent(v);
      });
    }
  });

  return filters;
}

export function setFiltersInURL(filters) {
  var url = new URL(window.location);

  // Remove all filter params first
  Object.keys(filters).forEach(function(key) {
    url.searchParams.delete('filter_' + key);
  });

  // Add active filters
  Object.keys(filters).forEach(function(key) {
    if (filters[key].length > 0) {
      var encoded = filters[key].map(function(v) {
        return encodeURIComponent(v);
      }).join(',');
      url.searchParams.set('filter_' + key, encoded);
    }
  });

  window.history.pushState({}, '', url);
}

export function getActiveFilterCount() {
  var count = 0;
  Object.keys(state.activeFilters).forEach(function(key) {
    count += state.activeFilters[key].length;
  });
  return count;
}

export function applyFilters() {
  if (!state.portfolioData) return;

  // Reset list pagination to page 1 when filters change
  state.listCurrentPage = 1;

  // Filter the data
  state.filteredData = {
    type: state.portfolioData.type,
    name: state.portfolioData.name,
    features: state.portfolioData.features.filter(function(feature) {
      var props = feature.properties;

      // Check each filter category (AND between categories)
      for (var filterKey in state.activeFilters) {
        var filterValues = state.activeFilters[filterKey];
        if (filterValues.length === 0) continue;

        var propKey = filterConfig[filterKey].property;
        var propValue = getNestedProperty(props, propKey);

        // OR within category - at least one must match
        var matches = filterValues.some(function(filterValue) {
          return propValue === filterValue;
        });

        if (!matches) return false;
      }

      return true;
    })
  };

  // Update URL
  setFiltersInURL(state.activeFilters);

  // Update export count
  updateExportCount();

  // Update filter button state
  updateFilterButtonState();

  // Update filter pills in toolbar
  renderFilterPills();

  // Re-render current view
  renderCurrentView();

  // Update map layer filter
  if (state.map && state.map.getLayer('portfolio-points')) {
    updateMapFilter();
  }
}

export function updateMapFilter() {
  if (!state.map || !state.map.getLayer('portfolio-points')) return;

  // If no active filters, show all buildings
  if (getActiveFilterCount() === 0) {
    state.map.setFilter('portfolio-points', null);
    if (state.map.getLayer('portfolio-labels')) {
      state.map.setFilter('portfolio-labels', null);
    }
    return;
  }

  var filteredIds = state.filteredData.features.map(function(f) {
    return f.properties.bbl_id;
  });

  // Apply filter to show only filtered buildings
  state.map.setFilter('portfolio-points', ['in', ['get', 'bbl_id'], ['literal', filteredIds]]);

  // Also filter labels layer if it exists
  if (state.map.getLayer('portfolio-labels')) {
    state.map.setFilter('portfolio-labels', ['in', ['get', 'bbl_id'], ['literal', filteredIds]]);
  }

  // Zoom to fit filtered points (skip during style change restore)
  if (!state.skipFilterZoom) {
    zoomToFilteredPoints();
  }
}

export function renderFilterPills() {
  var container = document.getElementById('filter-pills');
  if (!container) return;

  var html = '';
  var hasAny = false;

  for (var filterKey in state.activeFilters) {
    var values = state.activeFilters[filterKey];
    if (!values || values.length === 0) continue;
    hasAny = true;
    var label = filterConfig[filterKey] ? filterConfig[filterKey].label : filterKey;
    values.forEach(function(val) {
      html += '<span class="filter-pill">' +
        '<span class="filter-pill-label">' + label + ':</span>' +
        escapeHtml(val) +
        '<button class="filter-pill-remove" data-filter-key="' + filterKey + '" data-filter-value="' + escapeHtml(val) + '" title="Filter entfernen">close</button>' +
        '</span>';
    });
  }

  if (hasAny) {
    html += '<button class="filter-pills-reset" id="filter-pills-reset">Alle Filter zurücksetzen</button>';
  }

  container.innerHTML = html;

  // Remove individual filter pill
  container.querySelectorAll('.filter-pill-remove').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var key = this.dataset.filterKey;
      var val = this.dataset.filterValue;
      if (state.activeFilters[key]) {
        state.activeFilters[key] = state.activeFilters[key].filter(function(v) { return v !== val; });
        // Also uncheck the corresponding checkbox in the drawer
        var cb = document.querySelector('#filter-pane input[data-filter="' + key + '"][data-value="' + val + '"]');
        if (cb) cb.checked = false;
        applyFilters();
      }
    });
  });

  // Reset all filters
  var resetBtn = document.getElementById('filter-pills-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      for (var key in state.activeFilters) {
        state.activeFilters[key] = [];
      }
      // Uncheck all filter checkboxes in the drawer
      document.querySelectorAll('#filter-pane input[type="checkbox"]').forEach(function(cb) {
        cb.checked = false;
      });
      applyFilters();
    });
  }
}

export function zoomToFilteredPoints() {
  if (!state.filteredData || state.filteredData.features.length === 0) return;

  var features = state.filteredData.features;

  if (features.length === 1) {
    // Single point - fly to it with a reasonable zoom level
    var coords = features[0].geometry.coordinates;
    state.map.flyTo({
      center: coords,
      zoom: 14,
      duration: 1000
    });
  } else {
    // Multiple points - fit bounds
    var bounds = new mapboxgl.LngLatBounds();
    features.forEach(function(feature) {
      bounds.extend(feature.geometry.coordinates);
    });
    state.map.fitBounds(bounds, {
      padding: 80,
      duration: 1000,
      maxZoom: 16
    });
  }
}

export function resetFilters() {
  state.activeFilters = {};
  Object.keys(filterConfig).forEach(function(k) { state.activeFilters[k] = []; });

  // Uncheck all checkboxes
  document.querySelectorAll('#filter-pane input[type="checkbox"]').forEach(function(cb) {
    cb.checked = false;
  });

  applyFilters();
}

export function navigateToAllObjects() {
  resetFilters();
  switchView('map');
}

export function navigateWithLandFilter() {
  if (!state.currentDetailBuilding) return;
  var land = state.currentDetailBuilding.properties.adr_land;
  if (!land) return;

  // Reset all filters and set only land filter
  resetFilters();
  state.activeFilters.land = [land];

  // Update checkbox state
  var checkbox = document.querySelector('#filter-panel input[data-filter="land"][data-value="' + land + '"]');
  if (checkbox) checkbox.checked = true;

  applyFilters();
  switchView('map');
}

export function navigateWithRegionFilter() {
  if (!state.currentDetailBuilding) return;
  var region = state.currentDetailBuilding.properties.adr_reg;
  if (!region) return;

  // Reset all filters and set only region filter
  resetFilters();
  state.activeFilters.region = [region];

  // Update checkbox state
  var checkbox = document.querySelector('#filter-panel input[data-filter="region"][data-value="' + region + '"]');
  if (checkbox) checkbox.checked = true;

  applyFilters();
  switchView('map');
}

export function updateFilterButtonState() {
  var drawerBtn = document.getElementById('filter-panel-btn');
  if (!drawerBtn) return;

  var count = getActiveFilterCount();

  if (count > 0) {
    // Add active filters highlight
    drawerBtn.classList.add('has-active-filters');
    // Add or update count badge
    var badge = drawerBtn.querySelector('.filter-count');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'filter-count';
      drawerBtn.appendChild(badge);
    }
    badge.textContent = count;
  } else {
    // Remove active filters highlight
    drawerBtn.classList.remove('has-active-filters');
    // Remove count badge
    var badge = drawerBtn.querySelector('.filter-count');
    if (badge) {
      badge.remove();
    }
  }
}

export function renderCurrentView() {
  // Only render list/parcels if table panel is visible and we're in map view
  if (state.currentView === 'map' && state.tableOpen) {
    renderListView();
    renderParcelsView();
  } else {
    state.listViewDirty = true;
  }
  if (state.currentView === 'gallery') {
    renderGalleryView();
  } else {
    state.galleryViewDirty = true;
  }
  // Map view updates via updateMapFilter()
}

// ===== SMART DRAWER =====
export function toggleSmartDrawer(open) {
  var drawer = document.getElementById('filter-panel');
  var drawerBtn = document.getElementById('filter-panel-btn');

  if (open === undefined) {
    open = !drawer.classList.contains('open');
  }

  if (open) {
    drawer.classList.add('open');
    drawerBtn.classList.add('panel-open');
    drawerBtn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('drawer-open');
  } else {
    drawer.classList.remove('open');
    drawerBtn.classList.remove('panel-open');
    drawerBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('drawer-open');
  }

  // Resize map after transition completes
  if (state.map) {
    setTimeout(function() {
      state.map.resize();
    }, 350);
  }
}

// ===== DRAWER RESIZE =====
export function initDrawerResize() {
  var drawer = document.getElementById('filter-panel');
  var handle = drawer.querySelector('.filter-panel-resize-handle');
  if (!handle) return;

  var isResizing = false;
  var startX, startWidth;

  // Get min/max from CSS variables
  var styles = getComputedStyle(document.documentElement);
  var minWidth = parseInt(styles.getPropertyValue('--drawer-min-width')) || 300;
  var maxWidth = parseInt(styles.getPropertyValue('--drawer-max-width')) || 800;

  // Load saved width from localStorage
  var savedWidth = localStorage.getItem('drawerWidth');
  if (savedWidth) {
    document.documentElement.style.setProperty('--drawer-width', savedWidth + 'px');
  }

  handle.addEventListener('mousedown', function(e) {
    isResizing = true;
    startX = e.clientX;
    startWidth = drawer.offsetWidth;
    handle.classList.add('dragging');
    drawer.classList.add('resizing');
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', function(e) {
    if (!isResizing) return;

    // Calculate new width (dragging left = wider, right = narrower)
    var delta = startX - e.clientX;
    var newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));

    document.documentElement.style.setProperty('--drawer-width', newWidth + 'px');
  });

  document.addEventListener('mouseup', function() {
    if (!isResizing) return;

    isResizing = false;
    handle.classList.remove('dragging');
    drawer.classList.remove('resizing');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    // Save width to localStorage
    var currentWidth = drawer.offsetWidth;
    localStorage.setItem('drawerWidth', currentWidth);

    // Resize map
    if (state.map) {
      state.map.resize();
    }
  });
}

export function initFilterOptions() {
  if (!state.portfolioData) return;

  // Collect unique values for each filter category
  var uniqueValues = {
    status: new Set(),
    eigentum: new Set(),
    strategie: new Set(),
    mietmodell: new Set(),
    teilportfolio: new Set(),
    portfoliogruppe: new Set(),
    gebaeudeart: new Set(),
    land: new Set(),
    region: new Set(),
    ort: new Set(),
    gemeinde: new Set(),
    kgskat: new Set()
  };

  state.portfolioData.features.forEach(function(feature) {
    var props = feature.properties;
    if (props.bbl_stat) uniqueValues.status.add(props.bbl_stat);
    if (props.bbl_eigen) uniqueValues.eigentum.add(props.bbl_eigen);
    if (props.bbl_ostr) uniqueValues.strategie.add(props.bbl_ostr);
    if (props.bbl_mietm) uniqueValues.mietmodell.add(props.bbl_mietm);
    if (props.bbl_port) uniqueValues.teilportfolio.add(props.bbl_port);
    if (props.bbl_port2) uniqueValues.portfoliogruppe.add(props.bbl_port2);
    if (props.bbl_gbda1) uniqueValues.gebaeudeart.add(props.bbl_gbda1);
    if (props.adr_land) uniqueValues.land.add(props.adr_land);
    if (props.adr_reg) uniqueValues.region.add(props.adr_reg);
    if (props.adr_ort) uniqueValues.ort.add(props.adr_ort);
    if (props.bfs_gem) uniqueValues.gemeinde.add(props.bfs_gem);
    if (props.kgs_kat) uniqueValues.kgskat.add(props.kgs_kat);
  });

  // Render options for each filter
  Object.keys(uniqueValues).forEach(function(filterKey) {
    var container = document.getElementById('filter-' + filterKey + '-options');
    if (!container) return;

    var values = Array.from(uniqueValues[filterKey]).sort();
    var html = '';

    values.forEach(function(value) {
      var id = 'filter-' + filterKey + '-' + value.replace(/[^a-zA-Z0-9]/g, '_');
      var checked = state.activeFilters[filterKey].includes(value) ? 'checked' : '';

      html += '<div class="filter-option">' +
        '<input type="checkbox" id="' + id + '" data-filter="' + filterKey + '" data-value="' + value + '" ' + checked + '>' +
        '<label for="' + id + '">' + value + '</label>' +
        '</div>';
    });

    container.innerHTML = html;

    // Add event listeners to checkboxes
    container.querySelectorAll('input[type="checkbox"]').forEach(function(checkbox) {
      checkbox.addEventListener('change', function() {
        var filterKey = this.dataset.filter;
        var value = this.dataset.value;

        if (this.checked) {
          if (!state.activeFilters[filterKey].includes(value)) {
            state.activeFilters[filterKey].push(value);
          }
        } else {
          state.activeFilters[filterKey] = state.activeFilters[filterKey].filter(function(v) {
            return v !== value;
          });
        }

        applyFilters();
      });
    });
  });
}

export function initFilterPane() {
  // Toggle smart drawer via header button
  document.getElementById('filter-panel-btn').addEventListener('click', function() {
    toggleSmartDrawer();
  });

  // Close smart drawer
  document.getElementById('drawer-close-btn').addEventListener('click', function() {
    toggleSmartDrawer(false);
  });

  // Reset filters (button inside drawer)
  document.getElementById('drawer-reset-btn').addEventListener('click', function() {
    resetFilters();
  });

  // Filter section accordion toggle
  document.querySelectorAll('.filter-section-header').forEach(function(header) {
    header.addEventListener('click', function() {
      var section = this.parentElement;
      section.classList.toggle('open');
    });
  });

  // Close on Escape key (only if drawer is open)
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    var drawer = document.getElementById('filter-panel');
    if (drawer && drawer.classList.contains('open')) {
      e.stopImmediatePropagation();
      toggleSmartDrawer(false);
    }
  });

  // Logo click - navigate to main page
  document.getElementById('logo-area').addEventListener('click', function() {
    navigateToAllObjects();
  });

  // Filter search input
  var filterSearchInput = document.getElementById('filter-search-input');
  if (filterSearchInput) {
    filterSearchInput.addEventListener('input', function() {
      var term = this.value.toLowerCase().trim();
      document.querySelectorAll('.filter-section').forEach(function(section) {
        var title = section.querySelector('.filter-section-title');
        var text = title ? title.textContent.toLowerCase() : '';
        section.style.display = (!term || text.includes(term)) ? '' : 'none';
      });
    });
  }
}

// Global alias for empty state buttons
window.resetAllFilters = resetFilters;
window.navigateToAllObjects = navigateToAllObjects;
window.navigateWithLandFilter = navigateWithLandFilter;
window.navigateWithRegionFilter = navigateWithRegionFilter;
