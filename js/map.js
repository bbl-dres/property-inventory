// Map initialization, layers, selection, and style switching

import { state } from './state.js';
import { statusColors, mapStyles, placeholderImages } from './config.js';
import { escapeHtml, escapeForJs } from './utils.js';
import { showToast } from './toast.js';
import { t } from './i18n.js';
import {
  identifySwisstopoFeatures,
  clearIdentifyHighlight,
  initIdentifyHighlightLayer,
  loadLayersFromUrl,
  readdSwisstopoLayers
} from './swisstopo.js';
import { syncTableToBuilding, syncTableToParcel } from './list.js';
import { showDetailView } from './views.js';
import { getActiveFilterCount, updateMapFilter, applyFilters } from './filters.js';

// ===== MAP INITIALIZATION =====

function initMap() {
  // Parse URL parameters for map state
  var urlParams = new URLSearchParams(window.location.search);
  var initialLat = parseFloat(urlParams.get('lat'));
  var initialLng = parseFloat(urlParams.get('lng'));
  var initialZoom = parseFloat(urlParams.get('zoom'));

  // Defaults (Switzerland)
  var startCenter = [8.2275, 46.8182];
  var startZoom = 2;

  // Override defaults if URL params exist
  if (!isNaN(initialLat) && !isNaN(initialLng) && !isNaN(initialZoom)) {
    startCenter = [initialLng, initialLat];
    startZoom = initialZoom;
  }

  var map = new mapboxgl.Map({
    container: 'map',
    style: mapStyles[state.currentMapStyle].url,
    center: startCenter,
    zoom: startZoom,
    preserveDrawingBuffer: true
  });

  state.map = map;

  map.addControl(new mapboxgl.NavigationControl(), 'top-right');
  map.addControl(new mapboxgl.ScaleControl({ maxWidth: 200 }), 'bottom-left');

  // Home button control
  var HomeControl = function() {};
  HomeControl.prototype.onAdd = function(mapInstance) {
    this._map = mapInstance;
    this._container = document.createElement('div');
    this._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

    var button = document.createElement('button');
    button.className = 'map-home-btn';
    button.type = 'button';
    button.title = t('map.home');
    button.innerHTML = '<span class="material-symbols-outlined">home</span>';
    button.onclick = function() {
      map.flyTo({
        center: [8.2275, 46.8182],
        zoom: 2,
        duration: 1000
      });
    };

    this._container.appendChild(button);
    return this._container;
  };
  HomeControl.prototype.onRemove = function() {
    this._container.parentNode.removeChild(this._container);
    this._map = undefined;
  };

  map.addControl(new HomeControl(), 'top-right');

  // 2D/3D toggle control
  var Toggle3DControl = function() {};
  Toggle3DControl.prototype.onAdd = function(mapInstance) {
    this._map = mapInstance;
    this._container = document.createElement('div');
    this._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

    var button = document.createElement('button');
    button.className = 'map-3d-btn';
    button.type = 'button';
    button.title = t('map.toggle3d');
    button.textContent = '3D';
    button.onclick = function() {
      state.is3D = !state.is3D;
      if (state.is3D) {
        map.easeTo({ pitch: 60, bearing: -20, duration: 800 });
        button.textContent = '2D';
        button.classList.add('active');
      } else {
        map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
        button.textContent = '3D';
        button.classList.remove('active');
      }
    };

    this._container.appendChild(button);
    return this._container;
  };
  Toggle3DControl.prototype.onRemove = function() {
    this._container.parentNode.removeChild(this._container);
    this._map = undefined;
  };

  map.addControl(new Toggle3DControl(), 'top-right');

  // Update URL on map move/zoom
  map.on('moveend', function() {
    if (state.currentView === 'detail') return;

    var center = map.getCenter();
    var zoom = map.getZoom();

    var url = new URL(window.location);
    url.searchParams.set('lng', center.lng.toFixed(5));
    url.searchParams.set('lat', center.lat.toFixed(5));
    url.searchParams.set('zoom', zoom.toFixed(2));

    window.history.replaceState({}, '', url);
  });

  // Coordinate display on mousemove
  var pendingCoordUpdate = null;
  var coordsEl = document.getElementById('coordinates');
  map.on('mousemove', function(e) {
    if (!pendingCoordUpdate) {
      var lng = e.lngLat.lng;
      var lat = e.lngLat.lat;
      pendingCoordUpdate = requestAnimationFrame(function() {
        coordsEl.textContent = t('map.coordinates', {lat: lat.toFixed(5), lon: lng.toFixed(5)});
        pendingCoordUpdate = null;
      });
    }
  });

  return map;
}

// ===== MAP LAYERS =====

function addMapLayers() {
  if (!state.portfolioData) return;

  var map = state.map;

  // Prevent duplicate source errors if called multiple times
  if (map.getSource('portfolio')) {
    return;
  }

  map.addSource('portfolio', {
    type: 'geojson',
    data: state.portfolioData
  });

  // Add parcels source and layers
  if (state.parcelData && state.parcelData.features) {
    map.addSource('parcels', {
      type: 'geojson',
      data: state.parcelData
    });

    // Parcel fill layer
    map.addLayer({
      id: 'parcels-fill',
      type: 'fill',
      source: 'parcels',
      paint: {
        'fill-color': '#1976d2',
        'fill-opacity': 0.15
      }
    });

    // Parcel outline layer
    map.addLayer({
      id: 'parcels-outline',
      type: 'line',
      source: 'parcels',
      paint: {
        'line-color': '#1976d2',
        'line-width': 2,
        'line-opacity': 0.8
      }
    });

    // Parcel hover highlight layer
    map.addLayer({
      id: 'parcels-highlight',
      type: 'fill',
      source: 'parcels',
      filter: ['==', ['get', 'bbl_id'], ''],
      paint: {
        'fill-color': '#1976d2',
        'fill-opacity': 0.35
      }
    });

    // Parcel selected fill layer (persistent selection)
    map.addLayer({
      id: 'parcels-selected',
      type: 'fill',
      source: 'parcels',
      filter: ['==', ['get', 'bbl_id'], ''],
      paint: {
        'fill-color': '#1976d2',
        'fill-opacity': 0.45
      }
    });

    // Parcel selected outline layer (persistent selection)
    map.addLayer({
      id: 'parcels-selected-outline',
      type: 'line',
      source: 'parcels',
      filter: ['==', ['get', 'bbl_id'], ''],
      paint: {
        'line-color': '#1976d2',
        'line-width': 3,
        'line-opacity': 1
      }
    });
  }

  // Main points layer
  map.addLayer({
    id: 'portfolio-points',
    type: 'circle',
    source: 'portfolio',
    paint: {
      'circle-radius': 10,
      'circle-color': [
        'match',
        ['get', 'bbl_stat'],
        'Aktiv', statusColors['Aktiv'],
        'In Renovation', statusColors['In Renovation'],
        'In Planung', statusColors['In Planung'],
        'Verkauft', statusColors['Verkauft'],
        '#6C757D'  // fallback
      ],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff'
    }
  });

  // Selected point highlight layer - outer ring
  map.addLayer({
    id: 'portfolio-selected',
    type: 'circle',
    source: 'portfolio',
    filter: ['==', ['get', 'bbl_id'], ''],
    paint: {
      'circle-radius': 18,
      'circle-color': 'transparent',
      'circle-stroke-width': 3,
      'circle-stroke-color': '#c00',
      'circle-stroke-opacity': 0.9
    }
  });

  // Selected point pulse animation layer
  map.addLayer({
    id: 'portfolio-selected-pulse',
    type: 'circle',
    source: 'portfolio',
    filter: ['==', ['get', 'bbl_id'], ''],
    paint: {
      'circle-radius': 24,
      'circle-color': 'transparent',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#c00',
      'circle-stroke-opacity': 0.4
    }
  });

  // Building ID labels (visible at zoom >= 16)
  map.addLayer({
    id: 'portfolio-labels',
    type: 'symbol',
    source: 'portfolio',
    minzoom: 16,
    layout: {
      'text-field': ['get', 'bbl_id'],
      'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
      'text-size': 13,
      'text-anchor': 'bottom',
      'text-offset': [0, -1.5],
      'text-allow-overlap': false
    },
    paint: {
      'text-color': '#1a1a1a',
      'text-halo-color': '#ffffff',
      'text-halo-width': 2
    }
  });

  // Animate the pulse layer (throttled to every 3rd frame for performance)
  var pulseRadius = 24;
  var pulseOpacity = 0.4;
  var pulseDirection = 1;
  var pulseAnimationId = null;
  var pulseFrameCount = 0;

  function animatePulse() {
    if (!state.selectedBuildingId) {
      pulseAnimationId = null;
      return;
    }

    pulseFrameCount++;
    if (pulseFrameCount % 3 === 0) {
      pulseRadius += 0.9 * pulseDirection;
      pulseOpacity -= 0.03 * pulseDirection;

      if (pulseRadius >= 32) {
        pulseDirection = -1;
      } else if (pulseRadius <= 24) {
        pulseDirection = 1;
      }

      if (map.getLayer('portfolio-selected-pulse')) {
        map.setPaintProperty('portfolio-selected-pulse', 'circle-radius', pulseRadius);
        map.setPaintProperty('portfolio-selected-pulse', 'circle-stroke-opacity', Math.max(0.1, pulseOpacity));
      }
    }

    pulseAnimationId = requestAnimationFrame(animatePulse);
  }

  // Start/stop pulse animation based on selection (exposed globally)
  window.startPulseAnimation = function() {
    if (pulseAnimationId === null) {
      pulseRadius = 24;
      pulseOpacity = 0.4;
      pulseDirection = 1;
      animatePulse();
    }
  };

  window.stopPulseAnimation = function() {
    if (pulseAnimationId !== null) {
      cancelAnimationFrame(pulseAnimationId);
      pulseAnimationId = null;
    }
  };

  map.on('mouseenter', 'portfolio-points', function() {
    map.getCanvas().style.cursor = 'pointer';
  });

  map.on('mouseleave', 'portfolio-points', function() {
    map.getCanvas().style.cursor = '';
  });

  // CLICK HANDLER
  map.on('click', 'portfolio-points', function(e) {
    var props = e.features[0].properties;
    selectBuilding(props.bbl_id, false);
  });

  // PARCEL HANDLERS
  if (state.parcelData && state.parcelData.features) {
    map.on('mouseenter', 'parcels-fill', function(e) {
      map.getCanvas().style.cursor = 'pointer';
      if (e.features.length > 0) {
        var parcelId = e.features[0].properties.bbl_id;
        map.setFilter('parcels-highlight', ['==', ['get', 'bbl_id'], parcelId]);
      }
    });

    map.on('mouseleave', 'parcels-fill', function() {
      map.getCanvas().style.cursor = '';
      map.setFilter('parcels-highlight', ['==', ['get', 'bbl_id'], '']);
    });

    map.on('click', 'parcels-fill', function(e) {
      var bbox = [
        [e.point.x - 15, e.point.y - 15],
        [e.point.x + 15, e.point.y + 15]
      ];
      var buildingFeatures = map.queryRenderedFeatures(bbox, { layers: ['portfolio-points'] });
      if (buildingFeatures.length > 0) {
        return; // Let the building click handler handle it
      }
      var props = e.features[0].properties;
      selectParcel(props.bbl_id);
    });
  }

  // Click on map (not on a point or parcel) to deselect or identify Swisstopo features
  map.on('click', function(e) {
    var pointFeatures = map.queryRenderedFeatures(e.point, { layers: ['portfolio-points'] });
    var parcelFeatures = state.parcelData && state.parcelData.features
      ? map.queryRenderedFeatures(e.point, { layers: ['parcels-fill'] })
      : [];
    if (pointFeatures.length === 0 && parcelFeatures.length === 0) {
      state.selectedBuildingId = null;
      state.selectedParcelId = null;
      updateSelectedBuilding();
      updateSelectedParcel();
      updateUrlWithSelection();
      document.getElementById('info-panel').classList.remove('show');

      // Try to identify features from active Swisstopo layers
      if (state.activeSwisstopoLayers.length > 0) {
        identifySwisstopoFeatures(e.lngLat);
      }
    } else {
      // Clear any Swisstopo highlight when selecting a portfolio feature
      clearIdentifyHighlight();
    }
  });

  // Apply initial filters to map if any
  if (state.filteredData && getActiveFilterCount() > 0) {
    updateMapFilter();
  }

  // Select building or parcel from URL parameter if present
  var urlParams = new URLSearchParams(window.location.search);
  var urlBuildingId = urlParams.get('id');
  var urlParcelId = urlParams.get('parcelId');
  if (urlBuildingId) {
    var building = state.portfolioData.features.find(function(f) {
      return f.properties.bbl_id === urlBuildingId;
    });
    if (building) {
      selectBuilding(urlBuildingId, true);
    }
  } else if (urlParcelId && state.parcelData && state.parcelData.features) {
    var parcel = state.parcelData.features.find(function(f) {
      return f.properties.bbl_id === urlParcelId;
    });
    if (parcel) {
      selectParcel(urlParcelId, true);
    }
  }

  // Initialize highlight layer for Swisstopo feature identification
  initIdentifyHighlightLayer();

  // Load background layers from URL parameters
  loadLayersFromUrl();
}

// ===== BUILDING SELECTION =====

// BUG FIX #5 (XSS): All property values are escaped with escapeHtml/escapeForJs
function selectBuilding(buildingId, flyToBuilding) {
  if (flyToBuilding === undefined) flyToBuilding = false;

  var building = state.portfolioData.features.find(function(f) {
    return f.properties.bbl_id === buildingId;
  });
  if (!building) return;

  var props = building.properties;
  var flaeche = Number(props.garea_ngf || 0).toLocaleString('de-CH');
  var baujahr = props.bbl_bjahr || '\u2014';
  var statusClass = props.bbl_stat === 'Aktiv' ? 'status-active' :
    props.bbl_stat === 'In Renovation' ? 'status-renovation' :
    props.bbl_stat === 'In Planung' ? 'status-planning' : 'status-inactive';

  // Update selected IDs (clear parcel selection)
  state.selectedBuildingId = buildingId;
  state.selectedParcelId = null;
  updateSelectedBuilding();
  updateSelectedParcel();
  updateUrlWithSelection();

  // Update header title
  document.getElementById('info-header-title').textContent = t('info.title.building');

  // Show preview image for buildings
  document.getElementById('info-preview-image').style.display = 'block';

  // Use first image from building data, fall back to placeholder
  var images = props.img_url || [];
  var imageUrl = images[0] || placeholderImages[0];

  // Set preview image
  document.getElementById('info-preview-image').style.backgroundImage = 'url(' + imageUrl + ')';

  var infoHtml =
    '<div class="info-row"><span class="info-label">' + t('info.label.id') + '</span><span class="info-value">' + escapeHtml(props.bbl_id) + '</span></div>' +
    '<div class="info-row"><span class="info-label">' + t('info.label.name') + '</span><span class="info-value">' + escapeHtml(props.bbl_bez) + '</span></div>' +
    '<div class="info-row"><span class="info-label">' + t('info.label.location') + '</span><span class="info-value">' + escapeHtml(props.adr_ort) + ', ' + escapeHtml(props.adr_land) + '</span></div>' +
    '<div class="info-row info-row-secondary"><span class="info-label">' + t('info.label.address') + '</span><span class="info-value">' + escapeHtml(props.adr_conct) + '</span></div>' +
    '<div class="info-row info-row-secondary"><span class="info-label">' + t('info.label.area_ngf') + '</span><span class="info-value">' + flaeche + ' m\u00b2</span></div>' +
    '<div class="info-row info-row-secondary"><span class="info-label">' + t('info.label.year') + '</span><span class="info-value">' + escapeHtml(baujahr) + '</span></div>' +
    '<div class="info-row info-row-secondary"><span class="info-label">' + t('info.label.responsible') + '</span><span class="info-value">' + escapeHtml(props.bbl_ovtw || '\u2014') + '</span></div>' +
    '<div class="info-row"><span class="info-label">' + t('info.label.status') + '</span><span class="info-value"><span class="badge status-badge ' + statusClass + '">' + escapeHtml(props.bbl_stat) + '</span></span></div>' +
    '<div class="info-footer">' +
      '<button class="info-detail-link" onclick="showDetailView(\'' + escapeForJs(props.bbl_id) + '\')">' +
        '<span class="material-symbols-outlined">open_in_new</span>' +
        t('info.details') +
      '</button>' +
    '</div>';

  document.getElementById('info-body').innerHTML = infoHtml;
  document.getElementById('info-panel').classList.add('show');

  // Sync table: switch tab, highlight row, scroll into view
  syncTableToBuilding(buildingId);

  // Only fly to building if explicitly requested (e.g. from Search)
  if (state.map && flyToBuilding) {
    state.map.flyTo({
      center: building.geometry.coordinates,
      zoom: 16
    });
  }
}

function updateSelectedBuilding() {
  var map = state.map;
  if (map && map.getLayer('portfolio-selected')) {
    map.setFilter('portfolio-selected', ['==', ['get', 'bbl_id'], state.selectedBuildingId || '']);
  }
  if (map && map.getLayer('portfolio-selected-pulse')) {
    map.setFilter('portfolio-selected-pulse', ['==', ['get', 'bbl_id'], state.selectedBuildingId || '']);
  }
  // Start or stop pulse animation based on selection
  if (state.selectedBuildingId && typeof window.startPulseAnimation === 'function') {
    window.startPulseAnimation();
  } else if (typeof window.stopPulseAnimation === 'function') {
    window.stopPulseAnimation();
  }
}

// ===== URL STATE HELPERS =====

function updateUrlWithSelection() {
  var url = new URL(window.location);
  if (state.selectedBuildingId) {
    url.searchParams.set('id', state.selectedBuildingId);
  } else {
    url.searchParams.delete('id');
  }
  if (state.selectedParcelId) {
    url.searchParams.set('parcelId', state.selectedParcelId);
  } else {
    url.searchParams.delete('parcelId');
  }
  window.history.replaceState({}, '', url);
}

// ===== PARCEL SELECTION =====

function getPolygonCentroid(coordinates) {
  var ring = coordinates[0]; // outer ring
  var x = 0, y = 0, n = ring.length - 1; // exclude closing point
  for (var i = 0; i < n; i++) {
    x += ring[i][0];
    y += ring[i][1];
  }
  return [x / n, y / n];
}

function selectParcel(parcelId, flyToParcel) {
  if (flyToParcel === undefined) flyToParcel = false;

  var parcel = state.parcelData.features.find(function(f) {
    return f.properties.bbl_id === parcelId;
  });
  if (!parcel) return;

  var props = parcel.properties;

  // Format area with thousand separators
  var formattedArea = Number(props.larea_gsf || 0).toLocaleString('de-CH');

  // Update selected IDs (clear building selection)
  state.selectedParcelId = parcelId;
  state.selectedBuildingId = null;
  updateSelectedBuilding();
  updateSelectedParcel();
  updateUrlWithSelection();

  // Update header title
  document.getElementById('info-header-title').textContent = t('info.title.parcel');

  // Hide preview image for parcels
  document.getElementById('info-preview-image').style.display = 'none';

  // Build info panel HTML content
  var infoHtml =
    '<div class="info-row"><span class="info-label">' + t('info.label.id') + '</span><span class="info-value">' + escapeHtml(props.bbl_id || '\u2014') + '</span></div>' +
    '<div class="info-row"><span class="info-label">' + t('info.label.name') + '</span><span class="info-value">' + escapeHtml(props.bbl_bez || '\u2014') + '</span></div>' +
    '<div class="info-row"><span class="info-label">' + t('info.label.location') + '</span><span class="info-value">' + escapeHtml(props.bfs_gem || props.adr_ort || '\u2014') + ', ' + escapeHtml(props.adr_reg || '\u2014') + '</span></div>' +
    '<div class="info-row info-row-secondary"><span class="info-label">' + t('info.label.plot') + '</span><span class="info-value">' + escapeHtml(props.av_nr || '\u2014') + '</span></div>' +
    '<div class="info-row info-row-secondary"><span class="info-label">' + t('info.label.area') + '</span><span class="info-value">' + formattedArea + ' m\u00b2</span></div>' +
    '<div class="info-row info-row-secondary"><span class="info-label">' + t('info.label.zone') + '</span><span class="info-value">' + escapeHtml(props.av_zbez || '\u2014') + '</span></div>' +
    '<div class="info-row info-row-secondary"><span class="info-label">' + t('info.label.ownership') + '</span><span class="info-value">' + escapeHtml(props.bbl_eigen || '\u2014') + '</span></div>';

  document.getElementById('info-body').innerHTML = infoHtml;
  document.getElementById('info-panel').classList.add('show');

  // Sync table: switch tab, highlight row, scroll into view
  syncTableToParcel(parcelId);

  // Fly to parcel if requested
  if (state.map && flyToParcel && parcel.geometry && parcel.geometry.coordinates) {
    var center = getPolygonCentroid(parcel.geometry.coordinates);
    state.map.flyTo({
      center: center,
      zoom: 16
    });
  }
}

function updateSelectedParcel() {
  var map = state.map;
  if (map && map.getLayer('parcels-selected')) {
    map.setFilter('parcels-selected', ['==', ['get', 'bbl_id'], state.selectedParcelId || '']);
  }
  if (map && map.getLayer('parcels-selected-outline')) {
    map.setFilter('parcels-selected-outline', ['==', ['get', 'bbl_id'], state.selectedParcelId || '']);
  }
}

// ===== STYLE SWITCHER =====

// Generate thumbnail URL using Mapbox Static Images API
function getStyleThumbnail(styleId, width, height) {
  var lon = 8.2275;
  var lat = 46.8182;
  var zoom = 6;
  return 'https://api.mapbox.com/styles/v1/mapbox/' + styleId + '/static/' +
    lon + ',' + lat + ',' + zoom + '/' + width + 'x' + height +
    '?access_token=' + mapboxgl.accessToken;
}

// FIX #24: Lazy thumbnail initialization — only called when style panel is first opened
var thumbnailsInitialized = false;

function initStyleThumbnails() {
  if (thumbnailsInitialized) return;
  thumbnailsInitialized = true;

  Object.keys(mapStyles).forEach(function(styleId) {
    var thumbEl = document.getElementById('thumb-' + styleId);
    if (thumbEl) {
      thumbEl.src = getStyleThumbnail(styleId, 140, 100);
    }
  });
  // Set current style thumbnail
  document.getElementById('current-style-thumb').src = getStyleThumbnail(state.currentMapStyle, 160, 120);
}

// Update active style button
function updateActiveStyleButton() {
  document.querySelectorAll('.style-option').forEach(function(btn) {
    btn.classList.remove('active');
    if (btn.dataset.style === state.currentMapStyle) {
      btn.classList.add('active');
    }
  });
  document.getElementById('current-style-thumb').src = getStyleThumbnail(state.currentMapStyle, 160, 120);
}

// Toggle style panel
function toggleStylePanel() {
  state.stylePanelOpen = !state.stylePanelOpen;
  var stylePanel = document.getElementById('style-panel');
  if (state.stylePanelOpen) {
    // FIX #24: Lazy-load thumbnails on first open
    initStyleThumbnails();
    stylePanel.classList.add('show');
  } else {
    stylePanel.classList.remove('show');
  }
}

function initStyleSwitcher() {
  var styleSwitcherBtn = document.getElementById('style-switcher-btn');
  var stylePanel = document.getElementById('style-panel');

  // Close panel when clicking outside
  document.addEventListener('click', function(e) {
    if (state.stylePanelOpen && !e.target.closest('.style-switcher')) {
      state.stylePanelOpen = false;
      stylePanel.classList.remove('show');
    }
  });

  // Style switcher button click
  styleSwitcherBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    toggleStylePanel();
  });

  // Style option click handlers
  document.querySelectorAll('.style-option').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var styleId = this.dataset.style;
      if (styleId === state.currentMapStyle) {
        toggleStylePanel();
        return;
      }

      state.currentMapStyle = styleId;
      localStorage.setItem('mapStyle', styleId);
      updateActiveStyleButton();

      // Change map style
      state.map.setStyle(mapStyles[styleId].url);

      // Close panel
      state.stylePanelOpen = false;
      stylePanel.classList.remove('show');
    });
  });

  // Re-add layers after style change — preserve filters and selection
  state.map.on('style.load', function() {
    if (state.portfolioData && !state.map.getSource('portfolio')) {
      addMapLayers();

      // Restore active filters without triggering zoom
      state.skipFilterZoom = true;
      applyFilters();
      state.skipFilterZoom = false;

      // Restore selected building highlight
      if (state.selectedBuildingId && state.map.getLayer('portfolio-selected')) {
        state.map.setFilter('portfolio-selected', ['==', ['get', 'bbl_id'], state.selectedBuildingId]);
        state.map.setFilter('portfolio-selected-pulse', ['==', ['get', 'bbl_id'], state.selectedBuildingId]);
        if (window.startPulseAnimation) window.startPulseAnimation();
      }

      // Restore selected parcel highlight
      if (state.selectedParcelId && state.map.getLayer('parcels-selected')) {
        state.map.setFilter('parcels-selected', ['==', ['get', 'bbl_id'], state.selectedParcelId]);
        state.map.setFilter('parcels-selected-outline', ['==', ['get', 'bbl_id'], state.selectedParcelId]);
      }
    }

    // Re-add Swisstopo layers that were active before style change
    readdSwisstopoLayers();
  });

  updateActiveStyleButton();
}

// Make selectBuilding and showDetailView available on window for onclick handlers in generated HTML
window.selectBuilding = selectBuilding;
window.showDetailView = showDetailView;

// ===== EXPORTS =====

export {
  initMap,
  addMapLayers,
  selectBuilding,
  selectParcel,
  updateSelectedBuilding,
  updateSelectedParcel,
  updateUrlWithSelection,
  getPolygonCentroid,
  initStyleSwitcher
};
