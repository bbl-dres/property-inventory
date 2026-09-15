// Search functionality

import { state } from './state.js';
import { escapeHtml, storageGet, storageSet } from './utils.js';
import { selectBuilding, smartFlyTo, updateSelectedBuilding, updateUrlWithSelection } from './map.js';
import { addSwisstopoLayer } from './swisstopo.js';
import { switchView } from './ui.js';
import { t, onLangChange } from './i18n.js';

// --- Search history (localStorage) ---
const HISTORY_KEY = 'searchHistory';
const HISTORY_MAX = 15;

function getSearchHistory() {
  try {
    return JSON.parse(storageGet(HISTORY_KEY)) || [];
  } catch { return []; }
}

function saveToSearchHistory(term) {
  if (!term || term.length < 2) return;
  const history = getSearchHistory().filter(h => h !== term);
  history.unshift(term);
  if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
  storageSet(HISTORY_KEY, JSON.stringify(history)); // never throws (blocked storage)
}

function removeFromSearchHistory(term) {
  const history = getSearchHistory().filter(h => h !== term);
  storageSet(HISTORY_KEY, JSON.stringify(history));
}

// Lower-cased local search text, computed once per building (WeakMap: no property pollution)
const localSearchCache = new WeakMap();

function getLocalSearchText(feature) {
  let text = localSearchCache.get(feature);
  if (text === undefined) {
    const p = feature.properties || {};
    text = [p.bbl_bez, p.adr_conct, p.adr_ort].map(function(v) { return v == null ? '' : String(v); }).join(' ').toLowerCase();
    localSearchCache.set(feature, text);
  }
  return text;
}

// Strip HTML tags from API results (e.g., Swisstopo returns <b>, <i> markup)
function stripHtml(str) {
  if (!str) return '';
  return str.replace(/<[^>]*>/g, '');
}

// Wrap the matched term in <b>. The text is escaped first, so API markup cannot leak through.
function highlightMatch(text, term) {
  const safe = escapeHtml(text || '');
  if (!term) return safe;
  const pattern = escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp('(' + pattern + ')', 'ig'), '<b>$1</b>');
}

// Map Swisstopo origin types to appropriate fallback zoom levels
function zoomForOrigin(origin) {
  switch (origin) {
    case 'kantone': return 10;
    case 'gg25': return 14;       // municipality
    case 'district': return 12;
    case 'gazetteer': return 14;  // settlement name
    case 'address': return 17;
    case 'parcel': return 17;
    default: return 15;
  }
}

// Module-level references set during initSearch
let _searchInput = null;
let _searchResults = null;
let _searchClearBtn = null;

export function handleSearchClick(type, id, lat, lon, zoom, title, bbox, origin) {
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

    // 2. Fly to location using bounding box when available

    if (bbox) {
      // Parse "BOX(minLng minLat,maxLng maxLat)"
      var match = bbox.match(/BOX\(([^ ]+) ([^,]+),([^ ]+) ([^)]+)\)/);
      if (match) {
        var bounds = [[parseFloat(match[1]), parseFloat(match[2])], [parseFloat(match[3]), parseFloat(match[4])]];
        var minZoom = (origin === 'gg25' || origin === 'gazetteer') ? 13 : 0;
        state.map.fitBounds(bounds, { padding: 40, minZoom: minZoom, maxZoom: 18, duration: 1000 });
      } else {
        smartFlyTo({ center: [lon, lat], zoom: zoomForOrigin(origin) });
      }
    } else {
      smartFlyTo({ center: [lon, lat], zoom: zoomForOrigin(origin) });
    }

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

  // Scope menu inside the search box ("Alle ▾" opens checkboxes Objekte / Orte / Karten).
  // Several sources can be combined; with every box (or none) ticked the label reads "Alle".
  const searchScopeBtn = document.getElementById('search-scope-btn');
  const searchScopeMenu = document.getElementById('search-scope-menu');
  const searchScopeLabel = document.getElementById('search-scope-label');
  const searchScopeBoxes = searchScopeMenu ? Array.from(searchScopeMenu.querySelectorAll('input[type="checkbox"]')) : [];
  let searchScopes = []; // empty = every source

  function scopeAllows(section) {
    return searchScopes.length === 0 || searchScopes.includes(section);
  }

  function updateSearchScope() {
    const checked = searchScopeBoxes.filter(function(cb) { return cb.checked; });
    searchScopes = (checked.length === 0 || checked.length === searchScopeBoxes.length)
      ? [] : checked.map(function(cb) { return cb.value; });
    if (searchScopeLabel) {
      const names = checked.map(function(cb) { return cb.parentNode.textContent.trim(); });
      searchScopeLabel.textContent = searchScopes.length === 0 ? t('search.scope.all')
        : (names.length === 1 ? names[0] : t('search.scope.count', { n: names.length }));
    }
    if (searchScopeBtn) searchScopeBtn.classList.toggle('active', searchScopes.length > 0);
  }

  function setSearchScopeMenuOpen(open) {
    if (!searchScopeMenu || !searchScopeBtn) return;
    searchScopeMenu.hidden = !open;
    searchScopeBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  if (searchScopeBtn && searchScopeMenu) {
    searchScopeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      setSearchScopeMenuOpen(searchScopeMenu.hidden);
    });
    searchScopeMenu.addEventListener('change', function() {
      updateSearchScope();
      const val = searchInput.value.trim();
      if (val.length >= 2) {
        searchSpinner.style.display = 'block';
        performSearch(val);
      }
    });
    document.addEventListener('click', function(e) {
      if (!searchScopeMenu.hidden && !searchScopeBtn.contains(e.target) && !searchScopeMenu.contains(e.target)) {
        setSearchScopeMenuOpen(false);
      }
    });
    // Escape closes the scope menu first; registered before the results handler below, which stops propagation
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && !searchScopeMenu.hidden) {
        e.stopImmediatePropagation();
        setSearchScopeMenuOpen(false);
        searchScopeBtn.focus();
      }
    });
    onLangChange(updateSearchScope); // the "Alle" / "N Bereiche" label is rendered from JS
    updateSearchScope();
  }

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
      if (scopeAllows('objects') && state.buildingsData) {
        const lowerTerm = term.toLowerCase();
        matches = state.buildingsData.features.filter(function(f) {
          return getLocalSearchText(f).includes(lowerTerm);
        });
      }
      resolve({ type: 'local', data: matches });
    }));

    // 2. Swisstopo Locations (skipped when the scope menu excludes "Orte")
    if (scopeAllows('places')) {
      promises.push(fetch('https://api3.geo.admin.ch/rest/services/ech/SearchServer?type=locations&limit=5&sr=4326&searchText=' + encodeURIComponent(term), { signal: signal })
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(data) { return { type: 'locations', data: data.results }; })
        .catch(function(e) {
          if (e.name === 'AbortError') return { type: 'locations', data: [], aborted: true };
          console.warn('[search] swisstopo locations failed:', e);
          return { type: 'locations', data: [], error: true };
        }));
    } else {
      promises.push(Promise.resolve({ type: 'locations', data: [] }));
    }

    // 3. Swisstopo Layers (skipped when the scope menu excludes "Karten")
    if (scopeAllows('maps')) {
      promises.push(fetch('https://api3.geo.admin.ch/rest/services/ech/SearchServer?type=layers&limit=5&lang=de&searchText=' + encodeURIComponent(term), { signal: signal })
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(data) { return { type: 'layers', data: data.results }; })
        .catch(function(e) {
          if (e.name === 'AbortError') return { type: 'layers', data: [], aborted: true };
          console.warn('[search] swisstopo layers failed:', e);
          return { type: 'layers', data: [], error: true };
        }));
    } else {
      promises.push(Promise.resolve({ type: 'layers', data: [] }));
    }

    Promise.all(promises).then(function(results) {
      // Don't render if request was aborted (newer search in progress)
      const wasAborted = results.some(function(r) { return r.aborted; });
      if (wasAborted) return;

      renderSearchResults(results, term);
      searchSpinner.style.display = 'none';
    });
  }

  function renderSearchResults(results, term) {
    const localResults = results.find(function(r) { return r.type === 'local'; }).data;
    const locResults = results.find(function(r) { return r.type === 'locations'; }).data;
    const layerResults = results.find(function(r) { return r.type === 'layers'; }).data;

    let html = '';
    // Section header: title left, source right ("swisstopo", "Geokatalog")
    const sectionHeader = function(title, source) {
      return '<div class="search-section-header"><span>' + title + '</span>' +
        (source ? '<span class="search-section-source">' + source + '</span>' : '') + '</div>';
    };
    const icon = function(name) {
      return '<span class="material-symbols-outlined search-item-icon" aria-hidden="true">' + name + '</span>';
    };
    const infoTitle = escapeHtml(t('accordion.layers.info'));

    // Section: Objekte (local) — row: icon · title + address · meta
    // All property values are escaped (XSS); the matched term is highlighted in the title
    if (localResults.length > 0) {
      html += sectionHeader(t('search.section.objects'), '');
      localResults.forEach(function(f) {
        const p = f.properties;
        const meta = [t('search.meta.building'), p.adr_ort, p.bbl_id].filter(Boolean).join(' · ');
        html += '<div class="search-item" role="option" data-action="searchLocal" data-id="' + escapeHtml(p.bbl_id) + '">' +
                icon('apartment') +
                '<span class="search-item-main">' +
                  '<span class="search-item-title">' + highlightMatch(p.bbl_bez, term) + '</span>' +
                  '<span class="search-item-subtitle">' + escapeHtml(p.adr_conct || '') + '</span>' +
                '</span>' +
                '<span class="search-item-meta">' + escapeHtml(meta) + '</span>' +
                '</div>';
      });
    }

    // Section: Orte (swisstopo) — API labels are escaped, then the term is highlighted
    if (locResults.length > 0) {
      html += sectionHeader(t('search.section.places'), 'swisstopo');
      locResults.forEach(function(r) {
        const lat = r.attrs.lat;
        const lon = r.attrs.lon;
        const origin = r.attrs.origin || '';
        const bbox = r.attrs.geom_st_box2d || '';
        html += '<div class="search-item" role="option" data-action="searchLocation" data-lat="' + lat + '" data-lng="' + lon + '" data-origin="' + escapeHtml(origin) + '" data-bbox="' + escapeHtml(bbox) + '">' +
                icon('location_on') +
                '<span class="search-item-main"><span class="search-item-title">' + highlightMatch(stripHtml(r.attrs.label), term) + '</span></span>' +
                '<span class="search-item-meta">' + t('search.meta.place') + '</span>' +
                '</div>';
      });
    }

    // Section: Karten (Geokatalog) — the row adds the layer ("+ Als Ebene"); the info button at the
    // right opens the same layer info modal as in the "Dargestellte Karten" accordion
    if (layerResults.length > 0) {
      html += sectionHeader(t('search.section.maps'), 'Geokatalog');
      layerResults.forEach(function(r) {
        const layerId = r.attrs.layer || '';
        const layerTitle = stripHtml(r.attrs.title || r.attrs.label || layerId);
        html += '<div class="search-item" role="option" data-action="searchLayer" data-layer-id="' + escapeHtml(layerId) + '" data-title="' + escapeHtml(layerTitle) + '">' +
                icon('map') +
                '<span class="search-item-main"><span class="search-item-title">' + highlightMatch(stripHtml(r.attrs.label), term) + '</span></span>' +
                '<span class="search-item-action">' + t('search.addLayer') + '</span>' +
                '<button type="button" class="search-item-info" data-action="showLayerInfo" data-layer-id="' + escapeHtml(layerId) + '" title="' + infoTitle + '" aria-label="' + infoTitle + '">' +
                  '<span class="material-symbols-outlined" aria-hidden="true">info</span>' +
                '</button>' +
                '</div>';
      });
    }

    if (html === '') {
      html = '<div class="search-item search-item--empty"><span class="search-item-subtitle">' + t('search.empty') + '</span></div>';
    }

    // Tell the user when the external (swisstopo) search failed instead of silently showing fewer results
    if (results.some(function(r) { return r.error; })) {
      html += '<div class="search-item search-item-warning" role="status">' +
              '<span class="material-symbols-outlined" aria-hidden="true">warning</span>' +
              '<div class="search-item-subtitle">' + t('search.error.external') + '</div>' +
              '</div>';
    }

    searchResults.innerHTML = html;
    searchResults.classList.add('active');
  }
}
