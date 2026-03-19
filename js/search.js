// Search functionality

import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { selectBuilding, smartFlyTo, updateSelectedBuilding, updateUrlWithSelection } from './map.js';
import { addSwisstopoLayer } from './swisstopo.js';
import { switchView } from './ui.js';
import { t } from './i18n.js';

// --- Search history (localStorage) ---
const HISTORY_KEY = 'searchHistory';
const HISTORY_MAX = 15;

function getSearchHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch { return []; }
}

function saveToSearchHistory(term) {
  if (!term || term.length < 2) return;
  const history = getSearchHistory().filter(h => h !== term);
  history.unshift(term);
  if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function removeFromSearchHistory(term) {
  const history = getSearchHistory().filter(h => h !== term);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

// Strip HTML tags from API results (e.g., Swisstopo returns <b>, <i> markup)
function stripHtml(str) {
  if (!str) return '';
  return str.replace(/<[^>]*>/g, '');
}

// Module-level references set during initSearch
let _searchInput = null;
let _searchResults = null;
let _searchClearBtn = null;

export function handleSearchClick(type, id, lat, lon, zoom, title) {
  _searchResults.classList.remove('active');

  // Save search term to history
  const searchTerm = _searchInput ? _searchInput.value.trim() : '';
  if (searchTerm) saveToSearchHistory(searchTerm);

  // Switch to map view if not already there
  if (state.currentView !== 'map') {
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

    const b = state.buildingIndex.get(id);
    if (b) {
      _searchInput.value = b.properties.bbl_bez;
      _searchClearBtn.classList.add('visible');
    }

  } else if (type === 'location') {
    // 1. Remove existing marker
    if (state.searchMarker) {
      state.searchMarker.remove();
    }

    // 2. Fly to location
    smartFlyTo({ center: [lon, lat], zoom: zoom });

    // 3. Add Red Marker
    state.searchMarker = new maplibregl.Marker({ color: '#c00' })
      .setLngLat([lon, lat])
      .addTo(state.map);

    // Clear selected building info panel
    state.selectedBuildingId = null;
    updateSelectedBuilding();
    updateUrlWithSelection();
    document.getElementById('info-panel').classList.remove('show');

    _searchClearBtn.classList.add('visible');

  } else if (type === 'layer') {
    addSwisstopoLayer(id, title);
  }
}

export function initSearch() {
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const searchSpinner = document.getElementById('search-spinner');
  const searchClearBtn = document.getElementById('search-clear-btn');
  let searchDebounceTimer;
  let searchAbortController = null;

  // Set module-level references for handleSearchClick
  _searchInput = searchInput;
  _searchResults = searchResults;
  _searchClearBtn = searchClearBtn;

  // Show search history on focus (when input is empty or short)
  searchInput.addEventListener('focus', function() {
    const val = searchInput.value.trim();
    if (val.length < 2) {
      showSearchHistory();
    }
  });

  function showSearchHistory() {
    const history = getSearchHistory();
    if (history.length === 0) return;

    let html = '<div class="search-section-header">' + t('search.section.history') + '</div>';
    history.forEach(function(term) {
      html += '<div class="search-item search-history-item" data-action="searchHistory" data-term="' + escapeHtml(term) + '">' +
              '<span class="material-symbols-outlined search-history-icon" aria-hidden="true">history</span>' +
              '<div class="search-item-title">' + escapeHtml(term) + '</div>' +
              '<button class="search-history-remove" data-term="' + escapeHtml(term) + '" title="' + t('search.history.remove') + '">' +
              '<span class="material-symbols-outlined" aria-hidden="true">close</span>' +
              '</button>' +
              '</div>';
    });

    searchResults.innerHTML = html;
    searchResults.classList.add('active');
  }

  // Listen for input
  searchInput.addEventListener('input', function(e) {
    clearTimeout(searchDebounceTimer);
    const val = e.target.value.trim();

    // Toggle clear button visibility
    if (val.length > 0) {
      searchClearBtn.classList.add('visible');
    } else {
      searchClearBtn.classList.remove('visible');
    }

    if (val.length < 2) {
      searchSpinner.style.display = 'none';
      if (val.length === 0) {
        showSearchHistory();
      } else {
        searchResults.classList.remove('active');
      }
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
    // Dispatch input event so gallery filter reacts to the cleared value
    searchInput.dispatchEvent(new Event('input'));

    // Remove the search marker if it exists
    if (state.searchMarker) {
      state.searchMarker.remove();
      state.searchMarker = null;
    }
  });

  // Handle history item clicks (remove button + re-search)
  searchResults.addEventListener('click', function(e) {
    // Remove button
    const removeBtn = e.target.closest('.search-history-remove');
    if (removeBtn) {
      e.stopPropagation();
      removeFromSearchHistory(removeBtn.dataset.term);
      showSearchHistory();
      return;
    }
    // History item click → fill input and search
    const historyItem = e.target.closest('[data-action="searchHistory"]');
    if (historyItem) {
      e.stopPropagation();
      const term = historyItem.dataset.term;
      searchInput.value = term;
      searchClearBtn.classList.add('visible');
      searchResults.classList.remove('active');
      searchSpinner.style.display = 'block';
      performSearch(term);
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
    const signal = searchAbortController.signal;

    const promises = [];

    // 1. Local Search
    promises.push(new Promise(function(resolve) {
      let matches = [];
      if (state.buildingsData) {
        const lowerTerm = term.toLowerCase();
        matches = state.buildingsData.features.filter(function(f) {
          const p = f.properties;
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
      const wasAborted = results.some(function(r) { return r.aborted; });
      if (wasAborted) return;

      renderSearchResults(results);
      searchSpinner.style.display = 'none';
    });
  }

  function renderSearchResults(results) {
    const localResults = results.find(function(r) { return r.type === 'local'; }).data;
    const locResults = results.find(function(r) { return r.type === 'locations'; }).data;
    const layerResults = results.find(function(r) { return r.type === 'layers'; }).data;

    let html = '';

    // Section: Objekte (Local)
    // BUG FIX #2 (XSS): escape all property values with escapeHtml
    // BUG FIX #10: use adr_conct instead of non-existent streetName/city
    if (localResults.length > 0) {
      html += '<div class="search-section-header">' + t('search.section.objects') + '</div>';
      localResults.forEach(function(f) {
        html += '<div class="search-item" data-action="searchLocal" data-id="' + escapeHtml(f.properties.bbl_id) + '">' +
                '<div class="search-item-title">' + escapeHtml(f.properties.bbl_bez) + '</div>' +
                '<div class="search-item-subtitle">' + escapeHtml(f.properties.adr_conct || '') + '</div>' +
                '</div>';
      });
    }

    // Section: Orte (API)
    // BUG FIX #2 (XSS): escape API result labels
    if (locResults.length > 0) {
      html += '<div class="search-section-header">' + t('search.section.places') + '</div>';
      locResults.forEach(function(r, index) {
        const lat = r.attrs.lat;
        const lon = r.attrs.lon;
        const zoom = r.attrs.zoomlevel || 14;
        html += '<div class="search-item" data-action="searchLocation" data-lat="' + lat + '" data-lng="' + lon + '" data-zoom="' + zoom + '">' +
                '<div class="search-item-title">' + escapeHtml(stripHtml(r.attrs.label)) + '</div>' +
                '</div>';
      });
    }

    // Section: Karten (API)
    // BUG FIX #2 (XSS): escape layer labels
    if (layerResults.length > 0) {
      html += '<div class="search-section-header">' + t('search.section.maps') + '</div>';
      layerResults.forEach(function(r) {
        const layerId = r.attrs.layer || '';
        const layerTitle = stripHtml(r.attrs.title || r.attrs.label || layerId);
        html += '<div class="search-item" data-action="searchLayer" data-layer-id="' + escapeHtml(layerId) + '" data-title="' + escapeHtml(layerTitle) + '">' +
                '<div class="search-item-title">' + escapeHtml(stripHtml(r.attrs.label)) + '</div>' +
                '</div>';
      });
    }

    if (html === '') {
      html = '<div class="search-item" style="cursor:default;"><div class="search-item-subtitle">' + t('search.empty') + '</div></div>';
    }

    searchResults.innerHTML = html;
    searchResults.classList.add('active');
  }
}
