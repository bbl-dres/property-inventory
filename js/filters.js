// Filter, drawer, and filter-pill management

import { state } from './state.js';
import { filterConfig } from './config.js';
import { escapeHtml, getNestedProperty } from './utils.js';
import { renderListView, updateFilteredExportHeader, renderGalleryView, renderParcelsView, renderLandCoversView } from './list.js';
import { switchView } from './ui.js';
import { updateExportCount } from './export.js';

export function getFiltersFromURL() {
  const params = new URLSearchParams(window.location.search);
  const filters = {};
  Object.keys(filterConfig).forEach(function(key) {
    filters[key] = [];
  });

  Object.keys(filters).forEach(function(key) {
    const value = params.get('filter_' + key);
    if (value) {
      filters[key] = value.split(',').map(function(v) {
        return decodeURIComponent(v);
      });
    }
  });

  return filters;
}

export function setFiltersInURL(filters) {
  const url = new URL(window.location);

  // Remove all filter params first
  Object.keys(filters).forEach(function(key) {
    url.searchParams.delete('filter_' + key);
  });

  // Add active filters
  Object.keys(filters).forEach(function(key) {
    if (filters[key].length > 0) {
      const encoded = filters[key].map(function(v) {
        return encodeURIComponent(v);
      }).join(',');
      url.searchParams.set('filter_' + key, encoded);
    }
  });

  window.history.pushState({}, '', url);
}

export function getActiveFilterCount() {
  let count = 0;
  Object.keys(state.activeFilters).forEach(function(key) {
    count += state.activeFilters[key].length;
  });
  return count;
}

export function applyFilters() {
  if (!state.buildingsData) return;

  // Reset list pagination to page 1 when filters change
  state.listCurrentPage = 1;

  // Filter the data
  state.filteredData = {
    type: state.buildingsData.type,
    name: state.buildingsData.name,
    features: state.buildingsData.features.filter(function(feature) {
      const props = feature.properties;

      // Check each filter category (AND between categories)
      for (const filterKey in state.activeFilters) {
        const filterValues = state.activeFilters[filterKey];
        if (filterValues.length === 0) continue;

        const propKey = filterConfig[filterKey].property;
        const propValue = getNestedProperty(props, propKey);

        // OR within category - at least one must match
        const matches = filterValues.some(function(filterValue) {
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
  updateFilteredExportHeader();

  // Update filter button state
  updateFilterButtonState();

  // Update filter pills in toolbar
  renderFilterPills();

  // Re-render current view
  renderCurrentView();

  // Update map layer filter
  if (state.map && state.map.getLayer('buildings-points')) {
    updateMapFilter();
  }
}

export function updateMapFilter() {
  if (!state.map || !state.map.getSource('buildings')) return;

  // With clustering enabled, layer-level setFilter doesn't affect cluster composition.
  // Instead, update the source data so clusters are recomputed from filtered features.
  var dataToShow = (getActiveFilterCount() === 0)
    ? state.buildingsData
    : state.filteredData;

  state.map.getSource('buildings').setData(dataToShow);

  // Zoom to fit filtered points (skip during style change restore)
  if (getActiveFilterCount() > 0 && !state.skipFilterZoom) {
    zoomToFilteredPoints();
  }
}

export function renderFilterPills() {
  const container = document.getElementById('filter-pills');
  if (!container) return;

  let html = '';
  let hasAny = false;

  for (const filterKey in state.activeFilters) {
    const values = state.activeFilters[filterKey];
    if (!values || values.length === 0) continue;
    hasAny = true;
    const label = filterConfig[filterKey] ? filterConfig[filterKey].label : filterKey;
    values.forEach(function(val) {
      html += '<span class="filter-pill">' +
        '<span class="filter-pill-label">' + label + ':</span>' +
        escapeHtml(val) +
        '<button class="filter-pill-remove" data-filter-key="' + filterKey + '" data-filter-value="' + escapeHtml(val) + '" title="Filter entfernen">close</button>' +
        '</span>';
    });
  }

  if (hasAny) {
    html += '<button class="filter-pills-reset" id="filter-pills-reset">Alle Filter zur\u00FCcksetzen</button>';
  }

  container.innerHTML = html;

  // Remove individual filter pill
  container.querySelectorAll('.filter-pill-remove').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const key = this.dataset.filterKey;
      const val = this.dataset.filterValue;
      if (state.activeFilters[key]) {
        state.activeFilters[key] = state.activeFilters[key].filter(function(v) { return v !== val; });
        // Also uncheck the corresponding checkbox in the drawer
        const cb = document.querySelector('#filter-pane input[data-filter="' + key + '"][data-value="' + val + '"]');
        if (cb) cb.checked = false;
        applyFilters();
      }
    });
  });

  // Reset all filters
  const resetBtn = document.getElementById('filter-pills-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      for (const key in state.activeFilters) {
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

  const features = state.filteredData.features;

  if (features.length === 1) {
    // Single point - fly to it with a reasonable zoom level
    const coords = features[0].geometry.coordinates;
    state.map.flyTo({
      center: coords,
      zoom: 14,
      duration: 1000
    });
  } else {
    // Multiple points - fit bounds
    const bounds = new maplibregl.LngLatBounds();
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
  const land = state.currentDetailBuilding.properties.adr_land;
  if (!land) return;

  // Reset all filters and set only land filter
  resetFilters();
  state.activeFilters.land = [land];

  // Update checkbox state
  const checkbox = document.querySelector('#filter-panel input[data-filter="land"][data-value="' + land + '"]');
  if (checkbox) checkbox.checked = true;

  applyFilters();
  switchView('map');
}

export function navigateWithRegionFilter() {
  if (!state.currentDetailBuilding) return;
  const region = state.currentDetailBuilding.properties.adr_reg;
  if (!region) return;

  // Reset all filters and set only region filter
  resetFilters();
  state.activeFilters.region = [region];

  // Update checkbox state
  const checkbox = document.querySelector('#filter-panel input[data-filter="region"][data-value="' + region + '"]');
  if (checkbox) checkbox.checked = true;

  applyFilters();
  switchView('map');
}

export function navigateWithOrtFilter() {
  if (!state.currentDetailBuilding) return;
  const ort = state.currentDetailBuilding.properties.adr_ort;
  if (!ort) return;

  // Reset all filters and set only ort filter
  resetFilters();
  state.activeFilters.ort = [ort];

  // Update checkbox state
  const checkbox = document.querySelector('#filter-panel input[data-filter="ort"][data-value="' + ort + '"]');
  if (checkbox) checkbox.checked = true;

  applyFilters();
  switchView('map');
}

export function updateFilterButtonState() {
  const drawerBtn = document.getElementById('filter-panel-btn');
  if (!drawerBtn) return;

  const count = getActiveFilterCount();

  if (count > 0) {
    // Add active filters highlight
    drawerBtn.classList.add('has-active-filters');
    // Add or update count badge
    let badge = drawerBtn.querySelector('.filter-count');
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
    const badge = drawerBtn.querySelector('.filter-count');
    if (badge) {
      badge.remove();
    }
  }
}

export function renderCurrentView() {
  // Only render tables if table panel is visible and we're in map view
  if (state.currentView === 'map' && state.tableOpen) {
    renderListView();
    renderParcelsView();
    renderLandCoversView();
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
  const drawer = document.getElementById('filter-panel');
  const drawerBtn = document.getElementById('filter-panel-btn');

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
  const drawer = document.getElementById('filter-panel');
  const handle = drawer.querySelector('.filter-panel-resize-handle');
  if (!handle) return;

  let startX, startWidth;

  // Get min/max from CSS variables
  const styles = getComputedStyle(document.documentElement);
  const minWidth = parseInt(styles.getPropertyValue('--drawer-min-width')) || 300;
  const maxWidth = parseInt(styles.getPropertyValue('--drawer-max-width')) || 800;

  // Load saved width from localStorage
  const savedWidth = localStorage.getItem('drawerWidth');
  if (savedWidth) {
    document.documentElement.style.setProperty('--drawer-width', savedWidth + 'px');
  }

  // Mousemove/mouseup handlers added only during drag to avoid per-move checks
  function onResizeMove(e) {
    const delta = startX - e.clientX;
    const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
    document.documentElement.style.setProperty('--drawer-width', newWidth + 'px');
  }

  function onResizeEnd() {
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeEnd);

    handle.classList.remove('dragging');
    drawer.classList.remove('resizing');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    // Save width to localStorage
    const currentWidth = drawer.offsetWidth;
    localStorage.setItem('drawerWidth', currentWidth);

    // Resize map
    if (state.map) {
      state.map.resize();
    }
  }

  handle.addEventListener('mousedown', function(e) {
    startX = e.clientX;
    startWidth = drawer.offsetWidth;
    handle.classList.add('dragging');
    drawer.classList.add('resizing');
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();

    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', onResizeEnd);
  });
}

export function initFilterOptions() {
  if (!state.buildingsData) return;

  // Collect unique values for each filter category
  const uniqueValues = {
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

  state.buildingsData.features.forEach(function(feature) {
    const props = feature.properties;
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
    const container = document.getElementById('filter-' + filterKey + '-options');
    if (!container) return;

    const values = Array.from(uniqueValues[filterKey]).sort();
    let html = '';

    values.forEach(function(value) {
      const id = 'filter-' + filterKey + '-' + value.replace(/[^a-zA-Z0-9]/g, '_');
      const checked = state.activeFilters[filterKey].includes(value) ? 'checked' : '';

      html += '<div class="filter-option">' +
        '<input type="checkbox" id="' + id + '" data-filter="' + escapeHtml(filterKey) + '" data-value="' + escapeHtml(value) + '" ' + checked + '>' +
        '<label for="' + id + '">' + escapeHtml(value) + '</label>' +
        '</div>';
    });

    container.innerHTML = html;

    // Add event listeners to checkboxes
    container.querySelectorAll('input[type="checkbox"]').forEach(function(checkbox) {
      checkbox.addEventListener('change', function() {
        const filterKey = this.dataset.filter;
        const value = this.dataset.value;

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
      const section = this.parentElement;
      section.classList.toggle('open');
    });
  });

  // Close on Escape key (only if drawer is open)
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    const drawer = document.getElementById('filter-panel');
    if (drawer && drawer.classList.contains('open')) {
      e.stopImmediatePropagation();
      toggleSmartDrawer(false);
    }
  });

  // Logo click - navigate to main page
  document.getElementById('logo-area').addEventListener('click', function() {
    navigateToAllObjects();
  });

  // Filter search input with clear button
  const filterSearchInput = document.getElementById('filter-search-input');
  const filterSearchClear = document.getElementById('filter-search-clear');

  function filterSections() {
    const term = filterSearchInput.value.toLowerCase().trim();
    if (filterSearchClear) filterSearchClear.hidden = !term;
    document.querySelectorAll('.filter-section').forEach(function(section) {
      const title = section.querySelector('.filter-section-title');
      const text = title ? title.textContent.toLowerCase() : '';
      section.style.display = (!term || text.includes(term)) ? '' : 'none';
    });
  }

  if (filterSearchInput) {
    filterSearchInput.addEventListener('input', filterSections);
  }
  if (filterSearchClear) {
    filterSearchClear.addEventListener('click', function() {
      filterSearchInput.value = '';
      filterSearchClear.hidden = true;
      filterSections();
      filterSearchInput.focus();
    });
  }
}

