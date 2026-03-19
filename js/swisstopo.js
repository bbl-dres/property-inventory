// Swisstopo layer management and feature identification

import { state } from './state.js';
import { escapeHtml, escapeForJs } from './utils.js';
import { showToast } from './toast.js';
import { t } from './i18n.js';
import { statusColors } from './config.js';
import { updateGeokatalogCheckboxes } from './geokatalog.js';

// ===== SWISSTOPO LAYER MANAGEMENT =====

export function addSwisstopoLayer(layerId, title, silent) {
  if (!layerId) {
    if (!silent) showToast({ type: 'error', title: t('error.copy.title'), message: 'No layer ID' });
    return;
  }

  // Validate layer ID format (alphanumeric, dots, hyphens, underscores only)
  if (!/^[a-zA-Z0-9._-]+$/.test(layerId)) {
    if (!silent) showToast({ type: 'error', title: 'Fehler', message: 'Ungültige Layer-ID.' });
    return;
  }

  // Check if layer already added
  var existing = state.activeSwisstopoLayers.find(function(l) { return l.id === layerId; });
  if (existing) {
    if (!silent) showToast({ type: 'info', title: 'Hinweis', message: 'Layer "' + title + '" ist bereits aktiv.' });
    return;
  }

  // Cancel any pending fetch for this layer
  if (state.pendingLayerFetches[layerId]) {
    state.pendingLayerFetches[layerId].abort();
    delete state.pendingLayerFetches[layerId];
  }

  // Create AbortController for this fetch
  var abortController = new AbortController();
  state.pendingLayerFetches[layerId] = abortController;

  // Show loading toast
  if (!silent) showToast({ type: 'info', title: 'Lade Layer...', message: 'Metadaten werden abgerufen.', duration: 2000 });

  // Fetch layer metadata to get correct format and timestamp
  fetch('https://api3.geo.admin.ch/rest/services/api/MapServer/' + layerId + '?lang=de', { signal: abortController.signal })
    .then(function(response) {
      if (!response.ok) throw new Error('Layer-Metadaten nicht verfügbar');
      return response.json();
    })
    .then(function(metadata) {
      // Clean up pending fetch reference
      delete state.pendingLayerFetches[layerId];

      // Check if layer was removed while fetching
      if (!state.pendingLayerFetches.hasOwnProperty(layerId) && state.activeSwisstopoLayers.find(function(l) { return l.id === layerId; })) {
        return; // Layer was removed during fetch
      }

      var sourceId = 'swisstopo-' + layerId;
      var mapLayerId = 'swisstopo-layer-' + layerId;
      var tileUrl;
      var maxZoom = 18;

      // Check if layer supports WMTS (has format specified)
      if (metadata.format) {
        // Use WMTS (faster, pre-rendered tiles)
        var tileFormat = metadata.format.replace('image/', '');
        var timestamp = 'current';
        if (metadata.timestamps && metadata.timestamps.length > 0) {
          timestamp = metadata.timestamps[0];
        }
        tileUrl = 'https://wmts.geo.admin.ch/1.0.0/' + layerId + '/default/' + timestamp + '/3857/{z}/{x}/{y}.' + tileFormat;

        if (metadata.maxScale) {
          maxZoom = Math.min(22, Math.max(0, Math.round(18 - Math.log2(metadata.maxScale / 500))));
        }
      } else {
        // Fall back to WMS (supports all layers with on-the-fly reprojection)
        tileUrl = 'https://wms.geo.admin.ch/?' +
          'SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap' +
          '&LAYERS=' + layerId +
          '&CRS=EPSG:3857' +
          '&BBOX={bbox-epsg-3857}' +
          '&WIDTH=256&HEIGHT=256' +
          '&FORMAT=image/png' +
          '&TRANSPARENT=true';
        maxZoom = 19; // WMS typically supports higher zoom
      }

      try {
        // Add raster source
        state.map.addSource(sourceId, {
          type: 'raster',
          tiles: [tileUrl],
          tileSize: 256,
          maxzoom: maxZoom,
          attribution: '&copy; <a href="https://www.swisstopo.admin.ch">swisstopo</a>'
        });

        // Find the layer to insert before (below highlight layer, parcels, and points)
        var beforeLayer = null;
        if (state.map.getLayer(identifyHighlightLayerId)) {
          beforeLayer = identifyHighlightLayerId;
        } else if (state.map.getLayer('parcels-fill')) {
          beforeLayer = 'parcels-fill';
        } else if (state.map.getLayer('portfolio-points')) {
          beforeLayer = 'portfolio-points';
        }

        // Add raster layer
        state.map.addLayer({
          id: mapLayerId,
          type: 'raster',
          source: sourceId,
          paint: {
            'raster-opacity': 0.7
          }
        }, beforeLayer);
      } catch (e) {
        console.error('Fehler beim Hinzufügen des Layers zur Karte:', e);
        if (!silent) showToast({ type: 'error', title: 'Fehler', message: 'Layer "' + (title || layerId) + '" konnte nicht zur Karte hinzugefügt werden.' });
        return;
      }

      // Track the layer (including tileUrl, maxZoom, and visibility for re-adding after style change)
      state.activeSwisstopoLayers.push({
        id: layerId,
        title: title || layerId,
        sourceId: sourceId,
        mapLayerId: mapLayerId,
        tileUrl: tileUrl,
        maxZoom: maxZoom,
        visible: true
      });

      // Update the UI and URL
      renderActiveLayersList();
      updateUrlWithLayers();

      if (!silent) showToast({ type: 'success', title: 'Layer hinzugefügt', message: '"' + (title || layerId) + '" wurde zur Karte hinzugefügt.' });
    })
    .catch(function(e) {
      // Clean up pending fetch reference
      delete state.pendingLayerFetches[layerId];

      // Ignore abort errors (user cancelled)
      if (e.name === 'AbortError') return;

      console.error('Fehler beim Hinzufügen des Layers:', e);
      if (!silent) showToast({ type: 'error', title: 'Fehler', message: 'Layer "' + (title || layerId) + '" konnte nicht geladen werden.' });
    });
}

export function removeSwisstopoLayer(layerId) {
  // Cancel any pending fetch for this layer
  if (state.pendingLayerFetches[layerId]) {
    state.pendingLayerFetches[layerId].abort();
    delete state.pendingLayerFetches[layerId];
  }

  var layerIndex = state.activeSwisstopoLayers.findIndex(function(l) { return l.id === layerId; });
  if (layerIndex === -1) return;

  var layer = state.activeSwisstopoLayers[layerIndex];

  try {
    if (state.map.getLayer(layer.mapLayerId)) {
      state.map.removeLayer(layer.mapLayerId);
    }
    if (state.map.getSource(layer.sourceId)) {
      state.map.removeSource(layer.sourceId);
    }
  } catch (e) {
    console.error('Fehler beim Entfernen des Layers:', e);
  }

  state.activeSwisstopoLayers.splice(layerIndex, 1);
  renderActiveLayersList();
  updateUrlWithLayers();

  showToast({ type: 'info', title: 'Layer entfernt', message: '"' + layer.title + '" wurde entfernt.' });
}

export function toggleSwisstopoLayerVisibility(layerId) {
  var layer = state.activeSwisstopoLayers.find(function(l) { return l.id === layerId; });
  if (!layer) return;

  // Check if map layer exists
  if (!state.map.getLayer(layer.mapLayerId)) {
    console.warn('Map layer not found:', layer.mapLayerId);
    return;
  }

  var visibility = state.map.getLayoutProperty(layer.mapLayerId, 'visibility');
  var newVisibility = visibility === 'none' ? 'visible' : 'none';
  state.map.setLayoutProperty(layer.mapLayerId, 'visibility', newVisibility);

  // Track visibility state for style change restoration
  layer.visible = newVisibility !== 'none';

  renderActiveLayersList();
}

export function renderActiveLayersList() {
  var container = document.getElementById('external-layers-list');
  if (!container) return;

  if (state.activeSwisstopoLayers.length === 0) {
    container.innerHTML = '<div class="active-layers-empty">Keine externen Karten aktiv. Suchen Sie nach Karten über das Suchfeld.</div>';
    return;
  }

  var html = '';
  state.activeSwisstopoLayers.forEach(function(layer) {
    // Check if map layer exists, fall back to tracked visibility state
    var isVisible;
    if (state.map.getLayer(layer.mapLayerId)) {
      var visibility = state.map.getLayoutProperty(layer.mapLayerId, 'visibility');
      isVisible = visibility !== 'none';
    } else {
      isVisible = layer.visible !== false;
    }
    var checkedAttr = isVisible ? 'checked' : '';
    var escapedId = escapeForJs(layer.id);

    html += '<div class="active-layer-item">' +
      '<button class="active-layer-remove" onclick="removeSwisstopoLayer(\'' + escapedId + '\')" title="Entfernen">' +
        '<span class="material-symbols-outlined">close</span>' +
      '</button>' +
      '<input type="checkbox" class="active-layer-checkbox" ' + checkedAttr + ' onchange="toggleSwisstopoLayerVisibility(\'' + escapedId + '\')" title="' + (isVisible ? 'Ausblenden' : 'Einblenden') + '">' +
      '<span class="active-layer-title">' + escapeHtml(layer.title) + '</span>' +
      '<button class="active-layer-info" onclick="showLayerInfo(\'' + escapedId + '\')" title="Layer-Informationen">' +
        '<span class="material-symbols-outlined">info</span>' +
      '</button>' +
    '</div>';
  });

  container.innerHTML = html;

  // Sync Geokatalog checkboxes with active layers
  updateGeokatalogCheckboxes();
}

export function readdSwisstopoLayers() {
  // Re-add all Swisstopo layers after a map style change
  if (state.activeSwisstopoLayers.length === 0) return;

  state.activeSwisstopoLayers.forEach(function(layer) {
    // Skip if source already exists (shouldn't happen, but safety check)
    if (state.map.getSource(layer.sourceId)) return;

    try {
      // Re-add raster source
      state.map.addSource(layer.sourceId, {
        type: 'raster',
        tiles: [layer.tileUrl],
        tileSize: 256,
        maxzoom: layer.maxZoom,
        attribution: '&copy; <a href="https://www.swisstopo.admin.ch">swisstopo</a>'
      });

      // Find the layer to insert before
      var beforeLayer = null;
      if (state.map.getLayer(identifyHighlightLayerId)) {
        beforeLayer = identifyHighlightLayerId;
      } else if (state.map.getLayer('parcels-fill')) {
        beforeLayer = 'parcels-fill';
      } else if (state.map.getLayer('portfolio-points')) {
        beforeLayer = 'portfolio-points';
      }

      // Re-add raster layer with preserved visibility state
      state.map.addLayer({
        id: layer.mapLayerId,
        type: 'raster',
        source: layer.sourceId,
        layout: {
          visibility: layer.visible !== false ? 'visible' : 'none'
        },
        paint: {
          'raster-opacity': 0.7
        }
      }, beforeLayer);
    } catch (e) {
      console.error('Fehler beim Wiederherstellen des Layers:', layer.id, e);
    }
  });

  // Update checkbox states in UI
  renderActiveLayersList();
}

export function updateUrlWithLayers() {
  var url = new URL(window.location);
  if (state.activeSwisstopoLayers.length > 0) {
    var layerIds = state.activeSwisstopoLayers.map(function(l) { return l.id; });
    url.searchParams.set('bgLayers', layerIds.join(','));
  } else {
    url.searchParams.delete('bgLayers');
  }
  window.history.replaceState({}, '', url);
}

export function loadLayersFromUrl() {
  var urlParams = new URLSearchParams(window.location.search);
  var bgLayers = urlParams.get('bgLayers');
  if (bgLayers) {
    var layerIds = bgLayers.split(',');
    // Limit to max 10 layers from URL to prevent abuse
    var maxLayers = Math.min(layerIds.length, 10);
    for (var i = 0; i < maxLayers; i++) {
      var layerId = layerIds[i].trim();
      if (layerId) {
        // Pass silent=true to suppress toasts when loading from URL
        // Layer ID validation happens inside addSwisstopoLayer
        addSwisstopoLayer(layerId, layerId, true);
      }
    }
  }
}

// ===== SWISSTOPO FEATURE IDENTIFICATION =====

export var identifyHighlightSourceId = 'swisstopo-identify-highlight';
export var identifyHighlightLayerId = 'swisstopo-identify-highlight-layer';
export var identifyHighlightOutlineLayerId = 'swisstopo-identify-highlight-outline';

export function initIdentifyHighlightLayer() {
  // Add empty source for highlighting identified features
  if (!state.map.getSource(identifyHighlightSourceId)) {
    state.map.addSource(identifyHighlightSourceId, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    // Find the layer to insert before (should be above Swisstopo layers, below parcels/points)
    var beforeLayer = null;
    if (state.map.getLayer('parcels-fill')) {
      beforeLayer = 'parcels-fill';
    } else if (state.map.getLayer('portfolio-points')) {
      beforeLayer = 'portfolio-points';
    }

    // Add fill layer for polygons
    state.map.addLayer({
      id: identifyHighlightLayerId,
      type: 'fill',
      source: identifyHighlightSourceId,
      paint: {
        'fill-color': '#ff6b00',
        'fill-opacity': 0.35
      }
    }, beforeLayer);

    // Add outline layer (above fill)
    state.map.addLayer({
      id: identifyHighlightOutlineLayerId,
      type: 'line',
      source: identifyHighlightSourceId,
      paint: {
        'line-color': '#ff6b00',
        'line-width': 3,
        'line-opacity': 0.9
      }
    }, beforeLayer);
  }
}

export function clearIdentifyHighlight() {
  if (state.map.getSource(identifyHighlightSourceId)) {
    state.map.getSource(identifyHighlightSourceId).setData({
      type: 'FeatureCollection',
      features: []
    });
  }
  if (state.identifiedFeaturePopup) {
    // Store reference and null it BEFORE removing to prevent infinite loop
    // (popup.remove() fires 'close' event which would call this function again)
    var popup = state.identifiedFeaturePopup;
    state.identifiedFeaturePopup = null;
    popup.remove();
  }
}

export function identifySwisstopoFeatures(lngLat) {
  // Only identify if there are active layers
  if (state.activeSwisstopoLayers.length === 0) return;

  // Get visible layer IDs
  var visibleLayers = state.activeSwisstopoLayers.filter(function(layer) {
    var visibility = state.map.getLayoutProperty(layer.mapLayerId, 'visibility');
    return visibility !== 'none';
  }).map(function(layer) {
    return layer.id;
  });

  if (visibleLayers.length === 0) return;

  // Build the identify URL
  // Use tolerance=0 for exact point-in-polygon intersection
  // Per API docs: tolerance=0 with mapExtent=0,0,0,0 and imageDisplay=0,0,0 does exact intersection
  var url = 'https://api3.geo.admin.ch/rest/services/all/MapServer/identify?' +
    'geometry=' + lngLat.lng + ',' + lngLat.lat +
    '&geometryType=esriGeometryPoint' +
    '&geometryFormat=geojson' +
    '&sr=4326' +
    '&layers=all:' + visibleLayers.join(',') +
    '&mapExtent=0,0,0,0' +
    '&imageDisplay=0,0,0' +
    '&tolerance=0' +
    '&returnGeometry=true' +
    '&lang=de';

  fetch(url)
    .then(function(response) {
      if (!response.ok) throw new Error('Identify request failed');
      return response.json();
    })
    .then(function(data) {
      if (data.results && data.results.length > 0) {
        showIdentifiedFeature(data.results[0], lngLat);
      } else {
        clearIdentifyHighlight();
      }
    })
    .catch(function(e) {
      console.error('Identify error:', e);
      clearIdentifyHighlight();
    });
}

export function showIdentifiedFeature(result, lngLat) {
  // Remove existing popup FIRST (before setting new geometry)
  // This prevents the old popup's close event from clearing our new geometry
  if (state.identifiedFeaturePopup) {
    var oldPopup = state.identifiedFeaturePopup;
    state.identifiedFeaturePopup = null;
    oldPopup.remove();
  }

  // Now highlight the geometry (after old popup is gone)
  if (result.geometry) {
    var feature = {
      type: 'Feature',
      geometry: result.geometry,
      properties: result.properties || {}
    };

    if (state.map.getSource(identifyHighlightSourceId)) {
      state.map.getSource(identifyHighlightSourceId).setData({
        type: 'FeatureCollection',
        features: [feature]
      });
    }
  }

  // Build popup content
  var props = result.properties || result.attributes || {};
  var layerName = result.layerName || result.layerBodId || 'Feature';

  var html = '<div class="identify-popup">';
  html += '<div class="identify-popup-header">' + escapeHtml(layerName) + '</div>';
  html += '<div class="identify-popup-content">';

  // Display properties (limit to first 8 for readability)
  var propCount = 0;
  for (var key in props) {
    if (props.hasOwnProperty(key) && propCount < 8) {
      var value = props[key];
      // Skip internal/technical fields
      if (key.startsWith('_') || key === 'id' || key === 'featureId') continue;
      // Skip null/undefined values
      if (value === null || value === undefined || value === '') continue;

      // Format the key (remove underscores, capitalize)
      var displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });

      html += '<div class="identify-prop">';
      html += '<span class="identify-prop-key">' + escapeHtml(displayKey) + ':</span> ';
      html += '<span class="identify-prop-value">' + escapeHtml(String(value)) + '</span>';
      html += '</div>';
      propCount++;
    }
  }

  if (propCount === 0) {
    html += '<div class="identify-prop"><em>Keine Attribute verfügbar</em></div>';
  }

  html += '</div></div>';

  // Create and show popup
  state.identifiedFeaturePopup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: false,
    maxWidth: '320px'
  })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(state.map);

  state.identifiedFeaturePopup.on('close', function() {
    clearIdentifyHighlight();
  });
}

// ===== LAYER INFO MODAL =====

var layerInfoModal = document.getElementById('layer-info-modal');
var layerInfoContent = document.getElementById('layer-info-content');
var layerInfoCloseBtn = layerInfoModal ? layerInfoModal.querySelector('.layer-info-modal-close') : null;

export function showLayerInfo(layerId) {
  if (!layerInfoModal || !layerInfoContent || !layerId) return;

  // Show modal with loading state
  layerInfoContent.innerHTML = '<div class="layer-info-loading">Lade Informationen...</div>';
  layerInfoModal.classList.add('show');

  // Fetch layer legend/info
  fetch('https://api3.geo.admin.ch/rest/services/api/MapServer/' + layerId + '/legend?lang=de')
    .then(function(response) {
      if (!response.ok) throw new Error('Layer-Informationen nicht verfügbar');
      return response.text();
    })
    .then(function(html) {
      // Sanitize API HTML: parse in a detached document, strip scripts and event handlers
      var doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('script, iframe, object, embed, form').forEach(function(el) { el.remove(); });
      doc.querySelectorAll('*').forEach(function(el) {
        Array.from(el.attributes).forEach(function(attr) {
          if (attr.name.startsWith('on') || attr.value.trim().toLowerCase().startsWith('javascript:')) {
            el.removeAttribute(attr.name);
          }
        });
      });
      var sanitized = doc.body ? doc.body.innerHTML : '';
      layerInfoContent.innerHTML = '<div class="layer-info-api-content">' + sanitized + '</div>';
    })
    .catch(function(error) {
      console.error('Fehler beim Laden der Layer-Informationen:', error);
      layerInfoContent.innerHTML = '<div class="layer-info-loading">Informationen konnten nicht geladen werden.</div>';
    });
}

export function hideLayerInfo() {
  if (layerInfoModal) {
    layerInfoModal.classList.remove('show');
  }
}

// Close modal on button click
if (layerInfoCloseBtn) {
  layerInfoCloseBtn.addEventListener('click', hideLayerInfo);
}

// Close modal on backdrop click
if (layerInfoModal) {
  layerInfoModal.addEventListener('click', function(e) {
    if (e.target === layerInfoModal) {
      hideLayerInfo();
    }
  });
}

// Close modal on Escape key (highest priority — stops propagation)
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && layerInfoModal && layerInfoModal.classList.contains('show')) {
    e.stopImmediatePropagation();
    hideLayerInfo();
  }
});

// Internal layer metadata
var internalLayerMeta = {
  buildings: {
    title: 'Gebäude (Bundesamt für Bauten und Logistik BBL)',
    description: 'Interner Datensatz des BBL-Immobilienportfolios. Enthält sämtliche Gebäude mit Standort, Nutzungstyp, Eigentumsverhältnissen, Baujahr und weiteren Attributen.',
    source: 'BBL Immobilienportfolio',
    geometryType: 'Point',
    format: 'GeoJSON',
    dataKey: 'portfolioData'
  },
  parcels: {
    title: 'Grundstücke (Bundesamt für Bauten und Logistik BBL)',
    description: 'Interner Datensatz der BBL-Parzellen. Enthält Grundstücksinformationen mit Flächenangaben, Nutzungszonen und Eigentumsverhältnissen.',
    source: 'BBL Parzellen',
    geometryType: 'Polygon',
    format: 'GeoJSON',
    dataKey: 'parcelData'
  }
};

export function buildLegendHTML(layerKey) {
  if (layerKey === 'buildings') {
    return '<div class="legend-footer"><span>' + t('print.legend') + '</span></div>' +
      '<div class="internal-legend">' +
      '<div class="internal-legend-item">' +
        '<span class="internal-legend-circle" style="background: ' + statusColors['Aktiv'] + ';"></span>' +
        '<span>' + t('print.legend.active') + '</span>' +
      '</div>' +
      '<div class="internal-legend-item">' +
        '<span class="internal-legend-circle" style="background: ' + statusColors['In Renovation'] + ';"></span>' +
        '<span>' + t('print.legend.renovation') + '</span>' +
      '</div>' +
      '<div class="internal-legend-item">' +
        '<span class="internal-legend-circle" style="background: ' + statusColors['In Planung'] + ';"></span>' +
        '<span>' + t('print.legend.planning') + '</span>' +
      '</div>' +
      '<div class="internal-legend-item">' +
        '<span class="internal-legend-circle" style="background: ' + statusColors['Verkauft'] + ';"></span>' +
        '<span>' + t('print.legend.inactive') + '</span>' +
      '</div>' +
      '</div>';
  }
  // Parcels: single color
  return '<div class="legend-footer"><span>' + t('print.legend') + '</span></div>' +
    '<div class="internal-legend">' +
    '<div class="internal-legend-item">' +
      '<span class="internal-legend-rect" style="background: rgba(25, 118, 210, 0.15); border: 2px solid #1976d2;"></span>' +
      '<span>' + t('info.title.parcel') + '</span>' +
    '</div>' +
    '</div>';
}

export function showInternalLayerInfo(layerKey) {
  if (!layerInfoModal || !layerInfoContent) return;

  var meta = internalLayerMeta[layerKey];
  if (!meta) return;

  var today = new Date();
  var datenstand = today.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });

  var html = '<div class="legend-container">' +
    '<div class="bod-title">' + escapeHtml(meta.title) + '</div>' +
    '<div class="legend-abstract">' + escapeHtml(meta.description) + '</div>' +
    buildLegendHTML(layerKey) +
    '<div class="legend-footer"><span>Informationen</span></div>' +
    '<table>' +
    '<tr><td>Quelle</td><td>' + escapeHtml(meta.source) + '</td></tr>' +
    '<tr><td>Format</td><td>' + escapeHtml(meta.format) + ' (' + escapeHtml(meta.geometryType) + ')</td></tr>' +
    '<tr><td>Metadaten</td><td><a href="#">Link zu Metadaten</a></td></tr>' +
    '<tr><td>Detailbeschreibung</td><td><a href="#">Link zur Detailbeschreibung</a></td></tr>' +
    '<tr><td>Datenbezug</td><td><a href="#">Link für Datenbezug</a></td></tr>' +
    '<tr><td>Thematisches Geoportal</td><td><a href="#">Link zum Fachportal</a></td></tr>' +
    '<tr><td>Datenstand</td><td>' + datenstand + '</td></tr>' +
    '</table>' +
    '</div>';

  layerInfoContent.innerHTML = html;
  layerInfoModal.classList.add('show');
}

// Global bindings for onclick handlers in HTML strings
window.removeSwisstopoLayer = removeSwisstopoLayer;
window.toggleSwisstopoLayerVisibility = toggleSwisstopoLayerVisibility;
window.showLayerInfo = showLayerInfo;
window.showInternalLayerInfo = showInternalLayerInfo;
