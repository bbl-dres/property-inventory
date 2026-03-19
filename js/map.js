// Map initialization, layers, selection, style switching, and context menu

import { state } from './state.js';
import { statusColors, mapStyles, placeholderImages } from './config.js';
import { escapeHtml, getStatusClassName } from './utils.js';
import { showToast, showDetailView } from './ui.js';
import { t } from './i18n.js';
import {
  identifySwisstopoFeatures,
  clearIdentifyHighlight,
  initIdentifyHighlightLayer,
  loadLayersFromUrl,
  readdSwisstopoLayers
} from './swisstopo.js';
import { syncTableToBuilding, syncTableToParcel } from './list.js';
import { getActiveFilterCount, updateMapFilter, applyFilters } from './filters.js';
import { startMeasurement, clearMeasurement } from './measure.js';
import { getShareUrl } from './export.js';

// ===== MAP INITIALIZATION =====

function initMap() {
  // Parse URL parameters for map state
  const urlParams = new URLSearchParams(window.location.search);
  const initialLat = parseFloat(urlParams.get('lat'));
  const initialLng = parseFloat(urlParams.get('lng'));
  const initialZoom = parseFloat(urlParams.get('zoom'));

  // Defaults (Switzerland)
  let startCenter = [8.2275, 46.8182];
  let startZoom = 2;

  // Override defaults if URL params exist
  if (!isNaN(initialLat) && !isNaN(initialLng) && !isNaN(initialZoom)) {
    startCenter = [initialLng, initialLat];
    startZoom = initialZoom;
  }

  const map = new maplibregl.Map({
    container: 'map',
    style: mapStyles[state.currentMapStyle].url,
    center: startCenter,
    zoom: startZoom,
    preserveDrawingBuffer: true
  });

  state.map = map;

  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 200 }), 'bottom-left');

  // Home button control
  const HomeControl = function() {};
  HomeControl.prototype.onAdd = function(mapInstance) {
    this._map = mapInstance;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';

    const button = document.createElement('button');
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
  const Toggle3DControl = function() {};
  Toggle3DControl.prototype.onAdd = function(mapInstance) {
    this._map = mapInstance;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';

    const button = document.createElement('button');
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

    const center = map.getCenter();
    const zoom = map.getZoom();

    const url = new URL(window.location);
    url.searchParams.set('lng', center.lng.toFixed(5));
    url.searchParams.set('lat', center.lat.toFixed(5));
    url.searchParams.set('zoom', zoom.toFixed(2));

    window.history.replaceState({}, '', url);
  });

  // Coordinate display on mousemove
  let pendingCoordUpdate = null;
  const coordsEl = document.getElementById('coordinates');
  map.on('mousemove', function(e) {
    if (!pendingCoordUpdate) {
      const lng = e.lngLat.lng;
      const lat = e.lngLat.lat;
      pendingCoordUpdate = requestAnimationFrame(function() {
        coordsEl.textContent = t('map.coordinates', {lat: lat.toFixed(5), lon: lng.toFixed(5)});
        pendingCoordUpdate = null;
      });
    }
  });

  return map;
}

// ===== PULSE ANIMATION (module-level) =====

let pulseRadius = 24;
let pulseOpacity = 0.4;
let pulseDirection = 1;
let pulseAnimationId = null;
let pulseFrameCount = 0;

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

    if (state.map && state.map.getLayer('buildings-selected-pulse')) {
      state.map.setPaintProperty('buildings-selected-pulse', 'circle-radius', pulseRadius);
      state.map.setPaintProperty('buildings-selected-pulse', 'circle-stroke-opacity', Math.max(0.1, pulseOpacity));
    }
  }

  pulseAnimationId = requestAnimationFrame(animatePulse);
}

function startPulseAnimation() {
  if (pulseAnimationId === null) {
    pulseRadius = 24;
    pulseOpacity = 0.4;
    pulseDirection = 1;
    animatePulse();
  }
}

function stopPulseAnimation() {
  if (pulseAnimationId !== null) {
    cancelAnimationFrame(pulseAnimationId);
    pulseAnimationId = null;
  }
}

// ===== MAP LAYERS =====

function addMapLayers() {
  if (!state.buildingsData) return;

  const map = state.map;

  // Prevent duplicate source errors if called multiple times
  if (map.getSource('buildings')) return;

  map.addSource('buildings', {
    type: 'geojson',
    data: state.buildingsData
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
    id: 'buildings-points',
    type: 'circle',
    source: 'buildings',
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
    id: 'buildings-selected',
    type: 'circle',
    source: 'buildings',
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
    id: 'buildings-selected-pulse',
    type: 'circle',
    source: 'buildings',
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
    id: 'buildings-labels',
    type: 'symbol',
    source: 'buildings',
    minzoom: 16,
    layout: {
      'text-field': ['get', 'bbl_id'],
      'text-font': ['Open Sans Bold', 'Noto Sans Bold'],
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

  map.on('mouseenter', 'buildings-points', function() {
    map.getCanvas().style.cursor = 'pointer';
  });

  map.on('mouseleave', 'buildings-points', function() {
    map.getCanvas().style.cursor = '';
  });

  // CLICK HANDLER
  map.on('click', 'buildings-points', function(e) {
    const props = e.features[0].properties;
    selectBuilding(props.bbl_id, false);
  });

  // PARCEL HANDLERS
  if (state.parcelData && state.parcelData.features) {
    map.on('mouseenter', 'parcels-fill', function(e) {
      map.getCanvas().style.cursor = 'pointer';
      if (e.features.length > 0) {
        const parcelId = e.features[0].properties.bbl_id;
        map.setFilter('parcels-highlight', ['==', ['get', 'bbl_id'], parcelId]);
      }
    });

    map.on('mouseleave', 'parcels-fill', function() {
      map.getCanvas().style.cursor = '';
      map.setFilter('parcels-highlight', ['==', ['get', 'bbl_id'], '']);
    });

    map.on('click', 'parcels-fill', function(e) {
      const bbox = [
        [e.point.x - 15, e.point.y - 15],
        [e.point.x + 15, e.point.y + 15]
      ];
      const buildingFeatures = map.queryRenderedFeatures(bbox, { layers: ['buildings-points'] });
      if (buildingFeatures.length > 0) {
        return; // Let the building click handler handle it
      }
      const props = e.features[0].properties;
      selectParcel(props.bbl_id);
    });
  }

  // Click on map (not on a point or parcel) to deselect or identify Swisstopo features
  map.on('click', function(e) {
    const pointFeatures = map.queryRenderedFeatures(e.point, { layers: ['buildings-points'] });
    const parcelFeatures = state.parcelData && state.parcelData.features
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
  const urlParams = new URLSearchParams(window.location.search);
  const urlBuildingId = urlParams.get('id');
  const urlParcelId = urlParams.get('parcelId');
  if (urlBuildingId) {
    const building = state.buildingsData.features.find(function(f) {
      return f.properties.bbl_id === urlBuildingId;
    });
    if (building) {
      selectBuilding(urlBuildingId, true);
    }
  } else if (urlParcelId && state.parcelData && state.parcelData.features) {
    const parcel = state.parcelData.features.find(function(f) {
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

// BUG FIX #5 (XSS): All property values are escaped with escapeHtml
function selectBuilding(buildingId, flyToBuilding) {
  if (flyToBuilding === undefined) flyToBuilding = false;

  const building = state.buildingsData.features.find(function(f) {
    return f.properties.bbl_id === buildingId;
  });
  if (!building) return;

  const props = building.properties;
  const flaeche = Number(props.garea_ngf || 0).toLocaleString('de-CH');
  const baujahr = props.bbl_bjahr || '\u2014';
  const statusClass = getStatusClassName(props.bbl_stat);

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
  const images = props.img_url || [];
  const imageUrl = images[0] || placeholderImages[0];

  // Set preview image (quote URL to prevent CSS injection)
  document.getElementById('info-preview-image').style.backgroundImage = "url('" + imageUrl.replace(/'/g, "\\'").replace(/\)/g, '\\)') + "')";

  const infoHtml =
    '<div class="info-row"><span class="info-label">' + t('info.label.id') + '</span><span class="info-value">' + escapeHtml(props.bbl_id) + '</span></div>' +
    '<div class="info-row"><span class="info-label">' + t('info.label.name') + '</span><span class="info-value">' + escapeHtml(props.bbl_bez) + '</span></div>' +
    '<div class="info-row"><span class="info-label">' + t('info.label.location') + '</span><span class="info-value">' + escapeHtml(props.adr_ort) + ', ' + escapeHtml(props.adr_land) + '</span></div>' +
    '<div class="info-row info-row-secondary"><span class="info-label">' + t('info.label.address') + '</span><span class="info-value">' + escapeHtml(props.adr_conct) + '</span></div>' +
    '<div class="info-row info-row-secondary"><span class="info-label">' + t('info.label.area_ngf') + '</span><span class="info-value">' + flaeche + ' m\u00b2</span></div>' +
    '<div class="info-row info-row-secondary"><span class="info-label">' + t('info.label.year') + '</span><span class="info-value">' + escapeHtml(baujahr) + '</span></div>' +
    '<div class="info-row info-row-secondary"><span class="info-label">' + t('info.label.responsible') + '</span><span class="info-value">' + escapeHtml(props.bbl_ovtw || '\u2014') + '</span></div>' +
    '<div class="info-row"><span class="info-label">' + t('info.label.status') + '</span><span class="info-value"><span class="badge status-badge ' + statusClass + '">' + escapeHtml(props.bbl_stat) + '</span></span></div>' +
    '<div class="info-footer">' +
      '<button class="info-detail-link" data-action="showDetailView" data-id="' + escapeHtml(props.bbl_id) + '">' +
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
  const map = state.map;
  if (map && map.getLayer('buildings-selected')) {
    map.setFilter('buildings-selected', ['==', ['get', 'bbl_id'], state.selectedBuildingId || '']);
  }
  if (map && map.getLayer('buildings-selected-pulse')) {
    map.setFilter('buildings-selected-pulse', ['==', ['get', 'bbl_id'], state.selectedBuildingId || '']);
  }
  // Start or stop pulse animation based on selection
  if (state.selectedBuildingId) {
    startPulseAnimation();
  } else {
    stopPulseAnimation();
  }
}

// ===== URL STATE HELPERS =====

function updateUrlWithSelection() {
  const url = new URL(window.location);
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
  const ring = coordinates[0]; // outer ring
  let x = 0, y = 0;
  const n = ring.length - 1; // exclude closing point
  for (let i = 0; i < n; i++) {
    x += ring[i][0];
    y += ring[i][1];
  }
  return [x / n, y / n];
}

function selectParcel(parcelId, flyToParcel) {
  if (flyToParcel === undefined) flyToParcel = false;

  const parcel = state.parcelData.features.find(function(f) {
    return f.properties.bbl_id === parcelId;
  });
  if (!parcel) return;

  const props = parcel.properties;

  // Format area with thousand separators
  const formattedArea = Number(props.larea_gsf || 0).toLocaleString('de-CH');

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
  const infoHtml =
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
    const center = getPolygonCentroid(parcel.geometry.coordinates);
    state.map.flyTo({
      center: center,
      zoom: 16
    });
  }
}

function updateSelectedParcel() {
  const map = state.map;
  if (map && map.getLayer('parcels-selected')) {
    map.setFilter('parcels-selected', ['==', ['get', 'bbl_id'], state.selectedParcelId || '']);
  }
  if (map && map.getLayer('parcels-selected-outline')) {
    map.setFilter('parcels-selected-outline', ['==', ['get', 'bbl_id'], state.selectedParcelId || '']);
  }
}

// ===== STYLE SWITCHER =====

// Get thumbnail URL from config (static tile images, no API key needed)
function getStyleThumbnail(styleId) {
  const style = mapStyles[styleId];
  return style && style.thumbnail ? style.thumbnail : '';
}

// FIX #24: Lazy thumbnail initialization — only called when style panel is first opened
let thumbnailsInitialized = false;

function initStyleThumbnails() {
  if (thumbnailsInitialized) return;
  thumbnailsInitialized = true;

  Object.keys(mapStyles).forEach(function(styleId) {
    const thumbEl = document.getElementById('thumb-' + styleId);
    if (thumbEl) {
      thumbEl.src = getStyleThumbnail(styleId);
    }
  });
  // Set current style thumbnail
  document.getElementById('current-style-thumb').src = getStyleThumbnail(state.currentMapStyle);
}

// Update active style button
function updateActiveStyleButton() {
  document.querySelectorAll('.style-option').forEach(function(btn) {
    btn.classList.remove('active');
    if (btn.dataset.style === state.currentMapStyle) {
      btn.classList.add('active');
    }
  });
  document.getElementById('current-style-thumb').src = getStyleThumbnail(state.currentMapStyle);
}

// Toggle style panel
function toggleStylePanel() {
  state.stylePanelOpen = !state.stylePanelOpen;
  const stylePanel = document.getElementById('style-panel');
  if (state.stylePanelOpen) {
    // FIX #24: Lazy-load thumbnails on first open
    initStyleThumbnails();
    stylePanel.classList.add('show');
  } else {
    stylePanel.classList.remove('show');
  }
}

function initStyleSwitcher() {
  const styleSwitcherBtn = document.getElementById('style-switcher-btn');
  const stylePanel = document.getElementById('style-panel');

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

  // Restore all custom layers after a style change
  function restoreLayersAfterStyleChange() {
    if (state.buildingsData) {
      addMapLayers();

      // Restore active filters without triggering zoom
      state.skipFilterZoom = true;
      applyFilters();
      state.skipFilterZoom = false;

      // Restore selected building highlight
      if (state.selectedBuildingId && state.map.getLayer('buildings-selected')) {
        state.map.setFilter('buildings-selected', ['==', ['get', 'bbl_id'], state.selectedBuildingId]);
        state.map.setFilter('buildings-selected-pulse', ['==', ['get', 'bbl_id'], state.selectedBuildingId]);
        startPulseAnimation();
      }

      // Restore selected parcel highlight
      if (state.selectedParcelId && state.map.getLayer('parcels-selected')) {
        state.map.setFilter('parcels-selected', ['==', ['get', 'bbl_id'], state.selectedParcelId]);
        state.map.setFilter('parcels-selected-outline', ['==', ['get', 'bbl_id'], state.selectedParcelId]);
      }
    }

    // Re-add Swisstopo layers that were active before style change
    readdSwisstopoLayers();
  }

  // Style option click handlers
  document.querySelectorAll('.style-option').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const styleId = this.dataset.style;
      if (styleId === state.currentMapStyle) {
        toggleStylePanel();
        return;
      }

      state.currentMapStyle = styleId;
      localStorage.setItem('mapStyle', styleId);
      updateActiveStyleButton();

      // Change map style — use 'idle' event (the only reliable event
      // MapLibre v4 emits after setStyle). Register after setStyle since
      // idle is always async (fires after next render frame).
      state.map.setStyle(mapStyles[styleId].url);
      state.map.once('idle', restoreLayersAfterStyleChange);

      // Close panel
      state.stylePanelOpen = false;
      stylePanel.classList.remove('show');
    });
  });

  updateActiveStyleButton();
}

// ===== MAP CONTEXT MENU =====

// Hide context menu
function hideContextMenu() {
  const contextMenu = document.getElementById('map-context-menu');
  if (contextMenu) {
    contextMenu.classList.remove('show');
  }
}

// Initialize context menu: set up all event handlers
function initContextMenu() {
  const map = state.map;
  const contextMenu = document.getElementById('map-context-menu');
  const contextMenuCoords = document.getElementById('context-menu-coords');
  const contextMenuCoordsText = document.getElementById('context-menu-coords-text');
  const contextMenuShare = document.getElementById('context-menu-share');
  const contextMenuMeasureText = document.getElementById('context-menu-measure-text');
  const contextMenuPrint = document.getElementById('context-menu-print');
  const contextMenuReport = document.getElementById('context-menu-report');

  // Show context menu on right-click
  map.on('contextmenu', function(e) {
    e.preventDefault();

    // Store clicked coordinates
    state.contextMenuLngLat = e.lngLat;

    // Update coordinates display (lat, lon with 5 decimals)
    const lat = state.contextMenuLngLat.lat.toFixed(5);
    const lon = state.contextMenuLngLat.lng.toFixed(5);
    contextMenuCoordsText.textContent = lat + ', ' + lon;
    contextMenuCoords.classList.remove('copied');

    // Toggle measure menu text based on state
    if (state.measureState.active) {
      contextMenuMeasureText.textContent = t('map.context.measure.delete');
    } else {
      contextMenuMeasureText.textContent = t('map.context.measure');
    }

    // Get map container dimensions
    const mapContainer = document.getElementById('map');
    const mapRect = mapContainer.getBoundingClientRect();

    // Calculate menu position relative to map container
    const menuWidth = 200;
    const menuHeight = 180;
    const clickX = e.point.x;
    const clickY = e.point.y;

    // Edge detection
    const flipHorizontal = (clickX + menuWidth) > mapRect.width;
    const flipVertical = (clickY + menuHeight) > mapRect.height;

    // Position the menu
    contextMenu.style.left = clickX + 'px';
    contextMenu.style.top = clickY + 'px';

    // Apply flip classes
    contextMenu.classList.toggle('flip-horizontal', flipHorizontal);
    contextMenu.classList.toggle('flip-vertical', flipVertical);

    // Show menu
    contextMenu.classList.add('show');
  });

  // Close menu on Escape key + clear measurement
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    const contextMenuEl = document.getElementById('map-context-menu');
    if (contextMenuEl && contextMenuEl.classList.contains('show')) {
      e.stopImmediatePropagation();
      hideContextMenu();
      return;
    }
    if (state.measureState.active) {
      e.stopImmediatePropagation();
      clearMeasurement();
    }
  });

  // Copy coordinates to clipboard
  contextMenuCoords.addEventListener('click', function() {
    const coordsText = contextMenuCoordsText.textContent;
    navigator.clipboard.writeText(coordsText).then(function() {
      contextMenuCoords.classList.add('copied');
      showToast({
        type: 'success',
        title: t('success.copy.title'),
        message: coordsText,
        duration: 2000
      });
      setTimeout(hideContextMenu, 300);
    }).catch(function(err) {
      showToast({
        type: 'error',
        title: t('error.copy.title'),
        message: t('error.copy.message'),
        duration: 3000
      });
    });
  });

  // Share - use native system share
  // BUG FIX #21: Fixed fallback showToast calls to use correct object format
  contextMenuShare.addEventListener('click', function(e) {
    e.stopPropagation();
    if (!state.contextMenuLngLat) return;

    // Generate share URL with coordinates
    const lat = state.contextMenuLngLat.lat.toFixed(5);
    const lon = state.contextMenuLngLat.lng.toFixed(5);
    const shareUrl = window.location.origin + window.location.pathname + '?center=' + lon + ',' + lat + '&zoom=' + Math.round(map.getZoom());

    hideContextMenu();

    // Use native Web Share API
    if (navigator.share) {
      navigator.share({
        title: t('share.title'),
        text: t('share.email.body'),
        url: shareUrl
      }).catch(function(err) {
        // User cancelled or share failed - copy to clipboard as fallback
        if (err.name !== 'AbortError') {
          navigator.clipboard.writeText(shareUrl).then(function() {
            showToast({
              type: 'success',
              title: 'Link kopiert',
              message: 'Link wurde in die Zwischenablage kopiert',
              duration: 2000
            });
          });
        }
      });
    } else {
      // Fallback for browsers without Web Share API - copy to clipboard
      navigator.clipboard.writeText(shareUrl).then(function() {
        showToast({
          type: 'success',
          title: t('success.copy.title'),
          message: t('success.copy.message'),
          duration: 2000
        });
      });
    }
  });

  // Print map
  contextMenuPrint.addEventListener('click', function() {
    hideContextMenu();
    window.print();
  });

  // Report problem
  contextMenuReport.addEventListener('click', function() {
    hideContextMenu();
    if (!state.contextMenuLngLat) return;
    const lat = state.contextMenuLngLat.lat.toFixed(5);
    const lon = state.contextMenuLngLat.lng.toFixed(5);
    const subject = encodeURIComponent('Problem melden - GIS Immobilienportfolio');
    const body = encodeURIComponent('Problembeschreibung:\n\n\n\n---\nKoordinaten: ' + lat + ', ' + lon + '\nURL: ' + window.location.href);
    window.location.href = 'mailto:info@gis-immo.ch?subject=' + subject + '&body=' + body;
  });
}

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
  initStyleSwitcher,
  initContextMenu,
  hideContextMenu
};
