// Search functionality

import { state } from './state.js';
import { escapeHtml, escapeForJs } from './utils.js';
import { selectBuilding } from './map.js';
import { addSwisstopoLayer } from './swisstopo.js';
import { switchView } from './views.js';

// Strip HTML tags from API results (e.g., Swisstopo returns <b>, <i> markup)
function stripHtml(str) {
  if (!str) return '';
  return str.replace(/<[^>]*>/g, '');
}

export function initSearch() {
  var searchInput = document.getElementById('search-input');
  var searchResults = document.getElementById('search-results');
  var searchSpinner = document.getElementById('search-spinner');
  var searchClearBtn = document.getElementById('search-clear-btn');
  var searchDebounceTimer;
  var searchAbortController = null;

  // Listen for input
  searchInput.addEventListener('input', function(e) {
    clearTimeout(searchDebounceTimer);
    var val = e.target.value.trim();

    // Toggle clear button visibility
    if (val.length > 0) {
      searchClearBtn.classList.add('visible');
    } else {
      searchClearBtn.classList.remove('visible');
    }

    if (val.length < 2) {
      searchResults.classList.remove('active');
      searchSpinner.style.display = 'none';
      return;
    }

    searchSpinner.style.display = 'block';
    searchDebounceTimer = setTimeout(function() {
      performSearch(val);
    }, 300);
  });

  // Clear Button Click Listener
  searchClearBtn.addEventListener('click', function() {
    searchInput.value = '';
    searchClearBtn.classList.remove('visible');
    searchResults.classList.remove('active');
    searchInput.focus();

    // Remove the search marker if it exists
    if (state.searchMarker) {
      state.searchMarker.remove();
      state.searchMarker = null;
    }
  });

  // Close search on click outside
  document.addEventListener('click', function(e) {
    if (!document.getElementById('search-wrapper').contains(e.target)) {
      searchResults.classList.remove('active');
    }
  });

  // Close search on Escape (only if search is active)
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && searchResults.classList.contains('active')) {
      e.stopImmediatePropagation();
      searchResults.classList.remove('active');
    }
  });

  function performSearch(term) {
    // Cancel any pending search requests
    if (searchAbortController) {
      searchAbortController.abort();
    }
    searchAbortController = new AbortController();
    var signal = searchAbortController.signal;

    var promises = [];

    // 1. Local Search
    promises.push(new Promise(function(resolve) {
      var matches = [];
      if (state.portfolioData) {
        var lowerTerm = term.toLowerCase();
        matches = state.portfolioData.features.filter(function(f) {
          var p = f.properties;
          return (p.bbl_bez && p.bbl_bez.toLowerCase().includes(lowerTerm)) ||
                 (p.adr_conct && p.adr_conct.toLowerCase().includes(lowerTerm)) ||
                 (p.adr_ort && p.adr_ort.toLowerCase().includes(lowerTerm));
        });
      }
      resolve({ type: 'local', data: matches });
    }));

    // 2. Swisstopo Locations
    promises.push(fetch('https://api3.geo.admin.ch/rest/services/ech/SearchServer?type=locations&limit=5&sr=4326&searchText=' + encodeURIComponent(term), { signal: signal })
      .then(function(r) { return r.json(); })
      .then(function(data) { return { type: 'locations', data: data.results }; })
      .catch(function(e) {
        if (e.name === 'AbortError') return { type: 'locations', data: [], aborted: true };
        return { type: 'locations', data: [] };
      }));

    // 3. Swisstopo Layers
    promises.push(fetch('https://api3.geo.admin.ch/rest/services/ech/SearchServer?type=layers&limit=5&lang=de&searchText=' + encodeURIComponent(term), { signal: signal })
      .then(function(r) { return r.json(); })
      .then(function(data) { return { type: 'layers', data: data.results }; })
      .catch(function(e) {
        if (e.name === 'AbortError') return { type: 'layers', data: [], aborted: true };
        return { type: 'layers', data: [] };
      }));

    Promise.all(promises).then(function(results) {
      // Don't render if request was aborted (newer search in progress)
      var wasAborted = results.some(function(r) { return r.aborted; });
      if (wasAborted) return;

      renderSearchResults(results);
      searchSpinner.style.display = 'none';
    });
  }

  function renderSearchResults(results) {
    var localResults = results.find(function(r) { return r.type === 'local'; }).data;
    var locResults = results.find(function(r) { return r.type === 'locations'; }).data;
    var layerResults = results.find(function(r) { return r.type === 'layers'; }).data;

    var html = '';

    // Section: Objekte (Local)
    // BUG FIX #2 (XSS): escape all property values with escapeHtml/escapeForJs
    // BUG FIX #10: use adr_conct instead of non-existent streetName/city
    if (localResults.length > 0) {
      html += '<div class="search-section-header">Objekte</div>';
      localResults.forEach(function(f) {
        html += '<div class="search-item" onclick="handleSearchClick(\'local\', \'' + escapeForJs(f.properties.bbl_id) + '\')">' +
                '<div class="search-item-title">' + escapeHtml(f.properties.bbl_bez) + '</div>' +
                '<div class="search-item-subtitle">' + escapeHtml(f.properties.adr_conct || '') + '</div>' +
                '</div>';
      });
    }

    // Section: Orte (API)
    // BUG FIX #2 (XSS): escape API result labels
    if (locResults.length > 0) {
      html += '<div class="search-section-header">Orte</div>';
      locResults.forEach(function(r, index) {
        var lat = r.attrs.lat;
        var lon = r.attrs.lon;
        var zoom = r.attrs.zoomlevel || 14;
        html += '<div class="search-item" onclick="handleSearchClick(\'location\', null, ' + lat + ', ' + lon + ', ' + zoom + ')">' +
                '<div class="search-item-title">' + escapeHtml(stripHtml(r.attrs.label)) + '</div>' +
                '</div>';
      });
    }

    // Section: Karten (API)
    // BUG FIX #2 (XSS): escape layer labels and use escapeForJs in onclick
    if (layerResults.length > 0) {
      html += '<div class="search-section-header">Karten hinzuf\u00FCgen...</div>';
      layerResults.forEach(function(r) {
        var layerId = r.attrs.layer || '';
        var layerTitle = stripHtml(r.attrs.title || r.attrs.label || layerId);
        html += '<div class="search-item" onclick="handleSearchClick(\'layer\', \'' + escapeForJs(layerId) + '\', null, null, null, \'' + escapeForJs(layerTitle) + '\')">' +
                '<div class="search-item-title">' + escapeHtml(stripHtml(r.attrs.label)) + '</div>' +
                '</div>';
      });
    }

    if (html === '') {
      html = '<div class="search-item" style="cursor:default;"><div class="search-item-subtitle">Keine Resultate gefunden</div></div>';
    }

    searchResults.innerHTML = html;
    searchResults.classList.add('active');
  }

  // Make this function global so onclick in HTML string works
  window.handleSearchClick = function(type, id, lat, lon, zoom, title) {
    searchResults.classList.remove('active');

    // Close detail view if open
    if (state.currentView === 'detail') {
      switchView('map');
    }

    if (type === 'local') {
      // Pass true to fly to the building when searching
      selectBuilding(id, true);

      // Remove generic search marker if we select a specific building
      if (state.searchMarker) {
        state.searchMarker.remove();
        state.searchMarker = null;
      }

      // BUG FIX #11: use bbl_bez instead of non-existent name property
      // BUG FIX #12: use function expression instead of arrow function
      var b = state.portfolioData.features.find(function(f) { return f.properties.bbl_id === id; });
      if (b) {
        searchInput.value = b.properties.bbl_bez;
        searchClearBtn.classList.add('visible');
      }

    } else if (type === 'location') {
      // 1. Remove existing marker
      if (state.searchMarker) {
        state.searchMarker.remove();
      }

      // 2. Fly to location
      state.map.flyTo({
        center: [lon, lat],
        zoom: zoom
      });

      // 3. Add Red Marker
      state.searchMarker = new maplibregl.Marker({ color: '#c00' })
        .setLngLat([lon, lat])
        .addTo(state.map);

      // Clear selected building info panel
      state.selectedBuildingId = null;
      // Note: updateSelectedBuilding and updateUrlWithSelection are in the main app
      // and will be called via the state change
      if (typeof window.updateSelectedBuilding === 'function') window.updateSelectedBuilding();
      if (typeof window.updateUrlWithSelection === 'function') window.updateUrlWithSelection();
      document.getElementById('info-panel').classList.remove('show');

      searchClearBtn.classList.add('visible');

    } else if (type === 'layer') {
      addSwisstopoLayer(id, title);
    }
  };
}
