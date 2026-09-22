// Header search: local objects (buildings and parcels), swisstopo locations, Geokatalog layers and
// the KI mock answers, with a scope menu and a search history.

import { state } from './state.js';
import { escapeHtml, stripHtml, highlightMatch, storageGet, storageSet } from './utils.js';
import { t, onLangChange, getLang } from './i18n.js';
import { onEscape } from './keys.js';
import { parseBox2d } from './geo.js';
import { smartFlyTo } from './map-controls.js';
import { selectBuilding, selectParcel, clearSelection } from './map.js';
import { addSwisstopoLayer } from './swisstopo.js';
import { switchView } from './ui.js';
import { suggestAiQuestion, renderAiSection, showAiAnswer } from './assistant.js';

// ===== SEARCH HISTORY (localStorage) =====

const HISTORY_KEY = 'searchHistory';
const HISTORY_MAX = 15;

function getSearchHistory() {
  try {
    return JSON.parse(storageGet(HISTORY_KEY)) || [];
  } catch (e) { return []; }
}

function saveToSearchHistory(term) {
  if (!term || term.length < 2) return;
  const history = getSearchHistory().filter(function(h) { return h !== term; });
  history.unshift(term);
  if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
  storageSet(HISTORY_KEY, JSON.stringify(history));
}

function removeFromSearchHistory(term) {
  storageSet(HISTORY_KEY, JSON.stringify(getSearchHistory().filter(function(h) { return h !== term; })));
}

// ===== HELPERS =====

// Lower-cased local search text, computed once per feature (WeakMap: no property pollution)
const localSearchCache = new WeakMap();

function searchText(feature, fields) {
  let text = localSearchCache.get(feature);
  if (text === undefined) {
    const p = feature.properties || {};
    text = fields.map(function(f) { return p[f] == null ? '' : String(p[f]); }).join(' ').toLowerCase();
    localSearchCache.set(feature, text);
  }
  return text;
}

const BUILDING_FIELDS = ['name', 'streetName', 'city', 'buildingId'];
const PARCEL_FIELDS = ['name', 'parcelId', 'municipality', 'plotNumber'];

// Fallback zoom levels for swisstopo result types
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

function sectionHeader(title, source) {
  return '<div class="search-section-header"><span>' + title + '</span>' +
    (source ? '<span class="search-section-source">' + source + '</span>' : '') + '</div>';
}

function icon(name) {
  return '<span class="material-symbols-outlined search-item-icon" aria-hidden="true">' + name + '</span>';
}

// Module-level references set during initSearch
let searchInput = null;
let searchResults = null;
let searchClearBtn = null;
let searchSpinner = null;
let currentAiSuggestion = null;

let cancelSearchForNavigation = () => {};
export function dismissSearchResults() {
  cancelSearchForNavigation();
  hideResults();
}

function hideResults() {
  if (searchResults) searchResults.classList.remove('active');
}

function removeSearchMarker() {
  if (state.searchMarker) {
    state.searchMarker.remove();
    state.searchMarker = null;
  }
}

// ===== RESULT CLICKS =====

export function handleSearchClick(type, id, lat, lon, title, bbox, origin) {
  hideResults();
  const searchTerm = searchInput ? searchInput.value.trim() : '';
  if (searchTerm) saveToSearchHistory(searchTerm);

  if (state.currentView !== 'map') switchView('map');

  if (type === 'local') {
    selectBuilding(id, true);
    removeSearchMarker();
    const b = state.buildingIndex.get(id);
    if (b) {
      searchInput.value = b.properties.name;
      searchClearBtn.classList.add('visible');
    }
  } else if (type === 'parcel') {
    selectParcel(id, true);
    removeSearchMarker();
    const parcel = state.parcelIndex.get(id);
    if (parcel) {
      searchInput.value = parcel.properties.name || id;
      searchClearBtn.classList.add('visible');
    }
  } else if (type === 'location') {
    removeSearchMarker();
    // Fly to the bounding box when the API provides one, otherwise to the point with a type-specific zoom
    const bounds = parseBox2d(bbox);
    if (bounds) {
      const minZoom = (origin === 'gg25' || origin === 'gazetteer') ? 13 : 0;
      state.map.fitBounds(bounds, { padding: 40, minZoom: minZoom, maxZoom: 18, duration: 1000 });
    } else {
      smartFlyTo(state.map, { center: [lon, lat], zoom: zoomForOrigin(origin) });
    }
    state.searchMarker = new maplibregl.Marker({ color: '#c00' }).setLngLat([lon, lat]).addTo(state.map);
    clearSelection();
    searchClearBtn.classList.add('visible');
  } else if (type === 'layer') {
    addSwisstopoLayer(id, title);
  }
}

export const searchActions = {
  searchLocal: function(el) { handleSearchClick('local', el.dataset.id); },
  searchParcel: function(el) { handleSearchClick('parcel', el.dataset.id); },
  searchLocation: function(el) {
    handleSearchClick('location', null, parseFloat(el.dataset.lat), parseFloat(el.dataset.lng), null, el.dataset.bbox || null, el.dataset.origin || '');
  },
  searchLayer: function(el) { handleSearchClick('layer', el.dataset.layerId, null, null, el.dataset.title); }
};

// ===== INIT =====

// Clears the field, hides the results and removes the location marker (clear button, logo/home)
export function clearSearch() {
  if (!searchInput) return;
  searchInput.value = '';
  if (searchClearBtn) searchClearBtn.classList.remove('visible');
  hideResults();
  // Dispatch input so the gallery filter reacts to the cleared value
  searchInput.dispatchEvent(new Event('input'));
  removeSearchMarker();
}

export function initSearch() {
  searchInput = document.getElementById('search-input');
  searchResults = document.getElementById('search-results');
  searchSpinner = document.getElementById('search-spinner');
  searchClearBtn = document.getElementById('search-clear-btn');
  let searchDebounceTimer;
  let searchAbortController = null;
  let searchSequence = 0; // a search only renders while it is the latest one (see cancelPendingSearch)

  function setSpinner(on) {
    if (searchSpinner) searchSpinner.style.display = on ? 'block' : 'none';
  }

  // Invalidates the search in flight: its external requests are aborted and, since the local part
  // resolves regardless, its results are dropped by the sequence check instead of appearing later
  // over a cleared or shortened field
  function cancelPendingSearch() {
    searchSequence++;
    if (searchAbortController) {
      searchAbortController.abort();
      searchAbortController = null;
    }
  }

  cancelSearchForNavigation = function() {
    clearTimeout(searchDebounceTimer);
    cancelPendingSearch();
    setSpinner(false);
  };

  function showSearchHistory() {
    const history = getSearchHistory();
    if (history.length === 0) return;
    let html = '<div class="search-section-header">' + t('search.section.history') + '</div>';
    history.forEach(function(term) {
      html += '<div class="search-item search-history-item" data-term="' + escapeHtml(term) + '">' +
        '<span class="material-symbols-outlined search-history-icon" aria-hidden="true">history</span>' +
        '<div class="search-item-title">' + escapeHtml(term) + '</div>' +
        '<button type="button" class="icon-btn icon-btn--xs search-history-remove" data-term="' + escapeHtml(term) + '" title="' + escapeHtml(t('search.history.remove')) + '">' +
        '<span class="material-symbols-outlined" aria-hidden="true">close</span>' +
        '</button>' +
        '</div>';
    });
    searchResults.innerHTML = html;
    searchResults.classList.add('active');
  }

  // Show the history on focus (when the input is empty or short)
  searchInput.addEventListener('focus', function() {
    if (searchInput.value.trim().length < 2) showSearchHistory();
  });

  searchInput.addEventListener('input', function(e) {
    clearTimeout(searchDebounceTimer);
    const val = e.target.value.trim();
    searchClearBtn.classList.toggle('visible', val.length > 0);

    if (val.length < 2) {
      cancelPendingSearch();
      setSpinner(false);
      if (val.length === 0) showSearchHistory(); else hideResults();
      return;
    }
    setSpinner(true);
    searchDebounceTimer = setTimeout(function() { performSearch(val); }, 300);
  });

  // Enter: answer the KI suggestion if there is one, otherwise open the first result
  searchInput.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!searchResults.classList.contains('active')) return;
    if (document.getElementById('search-ai-item')) {
      revealAiAnswer();
      return;
    }
    const first = searchResults.querySelector('.search-item[data-action]');
    if (first) first.click();
  });

  searchClearBtn.addEventListener('click', function() {
    clearSearch();
    searchInput.focus();
  });

  // Scope menu inside the search box ("Alle" opens checkboxes Fragen / Objekte / Orte / Karten).
  // Several sources can be combined; with every box (or none) ticked the label reads "Alle".
  const searchScopeBtn = document.getElementById('search-scope-btn');
  const searchScopeMenu = document.getElementById('search-scope-menu');
  const searchScopeLabel = document.getElementById('search-scope-label');
  const searchScopeBoxes = searchScopeMenu ? Array.from(searchScopeMenu.querySelectorAll('input[type="checkbox"]')) : [];
  let searchScopes = []; // empty = every source

  function scopeAllows(section) {
    return searchScopes.length === 0 || searchScopes.indexOf(section) !== -1;
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
        setSpinner(true);
        performSearch(val);
      }
    });
    document.addEventListener('click', function(e) {
      if (!searchScopeMenu.hidden && !searchScopeBtn.contains(e.target) && !searchScopeMenu.contains(e.target)) {
        setSearchScopeMenuOpen(false);
      }
    });
    onEscape(function() {
      if (searchScopeMenu.hidden) return false;
      setSearchScopeMenuOpen(false);
      searchScopeBtn.focus();
      return true;
    }, 60);
    onLangChange(function() {
      dismissSearchResults(); // cancel pending requests in the previous language
      updateSearchScope();
    });
    updateSearchScope();
  }

  // History items, KI question row
  searchResults.addEventListener('click', function(e) {
    const removeBtn = e.target.closest('.search-history-remove');
    if (removeBtn) {
      e.stopPropagation();
      removeFromSearchHistory(removeBtn.dataset.term);
      showSearchHistory();
      return;
    }
    const historyItem = e.target.closest('.search-history-item');
    if (historyItem) {
      e.stopPropagation();
      searchInput.value = historyItem.dataset.term;
      searchClearBtn.classList.add('visible');
      hideResults();
      setSpinner(true);
      performSearch(historyItem.dataset.term);
      return;
    }
    if (e.target.closest('#search-ai-item')) revealAiAnswer();
  });
  searchResults.addEventListener('keydown', function(e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('#search-ai-item')) {
      e.preventDefault();
      revealAiAnswer();
    }
  });

  document.addEventListener('click', function(e) {
    if (!document.getElementById('search-wrapper').contains(e.target)) hideResults();
  });

  onEscape(function() {
    if (!searchResults.classList.contains('active')) return false;
    hideResults();
    return true;
  }, 50);

  function revealAiAnswer() {
    showAiAnswer(currentAiSuggestion, function(buildingId) { handleSearchClick('local', buildingId); });
  }

  function swisstopoSearch(type, term, signal) {
    const url = 'https://api3.geo.admin.ch/rest/services/ech/SearchServer?type=' + type + '&limit=5&sr=4326&lang=' +
      encodeURIComponent(getLang()) + '&searchText=' + encodeURIComponent(term);
    return fetch(url, { signal: signal })
      .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(data) { return { type: type, data: data.results || [] }; })
      .catch(function(e) {
        if (e.name === 'AbortError') return { type: type, data: [], aborted: true };
        console.warn('[search] swisstopo ' + type + ' failed:', e);
        return { type: type, data: [], error: true };
      });
  }

  function performSearch(term) {
    cancelPendingSearch();
    const sequence = searchSequence;
    searchAbortController = new AbortController();
    const signal = searchAbortController.signal;
    const lowerTerm = term.toLowerCase();

    // Local search: buildings and parcels (the KI answers need the building matches too)
    const local = { type: 'local', data: [], parcels: [] };
    if ((scopeAllows('objects') || scopeAllows('ask')) && state.buildingsData) {
      local.data = state.buildingsData.features.filter(function(f) { return searchText(f, BUILDING_FIELDS).indexOf(lowerTerm) !== -1; });
    }
    if (scopeAllows('objects') && state.parcelData && state.parcelData.features) {
      local.parcels = state.parcelData.features.filter(function(f) { return searchText(f, PARCEL_FIELDS).indexOf(lowerTerm) !== -1; });
    }

    Promise.all([
      Promise.resolve(local),
      scopeAllows('places') ? swisstopoSearch('locations', term, signal) : Promise.resolve({ type: 'locations', data: [] }),
      scopeAllows('maps') ? swisstopoSearch('layers', term, signal) : Promise.resolve({ type: 'layers', data: [] })
    ]).then(function(results) {
      if (sequence !== searchSequence) return; // a newer search is in progress or the field was cleared
      renderSearchResults(results, term, scopeAllows('objects'), scopeAllows('ask'));
      setSpinner(false);
    });
  }

  function renderSearchResults(results, term, showObjects, showAsk) {
    const localResults = results[0].data;
    const parcelResults = results[0].parcels;
    const locResults = results[1].data;
    const layerResults = results[2].data;
    const infoTitle = escapeHtml(t('accordion.layers.info'));
    let html = '';

    // Frage stellen (KI): one suggested question, answered inline from the loaded data
    currentAiSuggestion = showAsk ? suggestAiQuestion(term, localResults) : null;
    html += renderAiSection(currentAiSuggestion);

    // Objekte (buildings and parcels, local). Property values are escaped; the term is highlighted.
    if (showObjects && (localResults.length > 0 || parcelResults.length > 0)) {
      html += sectionHeader(t('search.section.objects'), '');
      localResults.forEach(function(f) {
        const p = f.properties;
        const meta = [t('search.meta.building'), [p.city, p.country].filter(Boolean).join(' '), p.buildingId].filter(Boolean).join(' · ');
        html += '<div class="search-item" role="option" data-action="searchLocal" data-id="' + escapeHtml(p.buildingId) + '">' +
          icon('apartment') +
          '<span class="search-item-main">' +
            '<span class="search-item-title">' + highlightMatch(p.name, term) + '</span>' +
            '<span class="search-item-subtitle">' + escapeHtml([p.streetName, p.city].filter(Boolean).join(', ')) + '</span>' +
          '</span>' +
          '<span class="search-item-meta">' + escapeHtml(meta) + '</span>' +
          '</div>';
      });
      parcelResults.forEach(function(f) {
        const p = f.properties;
        const meta = [t('info.title.parcel'), p.municipality, p.plotNumber ? 'Nr. ' + p.plotNumber : ''].filter(Boolean).join(' · ');
        html += '<div class="search-item" role="option" data-action="searchParcel" data-id="' + escapeHtml(p.parcelId) + '">' +
          icon('crop_square') +
          '<span class="search-item-main">' +
            '<span class="search-item-title">' + highlightMatch(p.name || p.parcelId, term) + '</span>' +
            '<span class="search-item-subtitle">' + escapeHtml([p.municipality, p.canton].filter(Boolean).join(', ')) + '</span>' +
          '</span>' +
          '<span class="search-item-meta">' + escapeHtml(meta) + '</span>' +
          '</div>';
      });
    }

    // Orte (swisstopo): API labels are escaped, then the term is highlighted
    if (locResults.length > 0) {
      html += sectionHeader(t('search.section.places'), 'swisstopo');
      locResults.forEach(function(r) {
        html += '<div class="search-item" role="option" data-action="searchLocation" data-lat="' + r.attrs.lat + '" data-lng="' + r.attrs.lon + '" data-origin="' + escapeHtml(r.attrs.origin || '') + '" data-bbox="' + escapeHtml(r.attrs.geom_st_box2d || '') + '">' +
          icon('location_on') +
          '<span class="search-item-main"><span class="search-item-title">' + highlightMatch(stripHtml(r.attrs.label), term) + '</span></span>' +
          '<span class="search-item-meta">' + t('search.meta.place') + '</span>' +
          '</div>';
      });
    }

    // Karten (Geokatalog): the row adds the layer, the info button opens the layer info modal
    if (layerResults.length > 0) {
      html += sectionHeader(t('search.section.maps'), 'Geokatalog');
      layerResults.forEach(function(r) {
        const layerId = r.attrs.layer || '';
        const layerTitle = stripHtml(r.attrs.title || r.attrs.label || layerId);
        html += '<div class="search-item" role="option" data-action="searchLayer" data-layer-id="' + escapeHtml(layerId) + '" data-title="' + escapeHtml(layerTitle) + '">' +
          icon('map') +
          '<span class="search-item-main"><span class="search-item-title">' + highlightMatch(stripHtml(r.attrs.label), term) + '</span></span>' +
          '<span class="search-item-action">' + t('search.addLayer') + '</span>' +
          '<button type="button" class="icon-btn icon-btn--xs search-item-info" data-action="showLayerInfo" data-layer-id="' + escapeHtml(layerId) + '" title="' + infoTitle + '" aria-label="' + infoTitle + '">' +
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
