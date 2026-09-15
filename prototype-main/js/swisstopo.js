// Swisstopo layer management, feature identification, and Geokatalog

import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { showToast } from './ui.js';
import { t, getLang, onLangChange } from './i18n.js';
import { statusColors } from './config.js';

// ===== SWISSTOPO LAYER MANAGEMENT =====

export function addSwisstopoLayer(layerId, title, silent) {
  if (!layerId) {
    if (!silent) showToast({ type: 'error', title: t('error.copy.title'), message: 'No layer ID' });
    return;
  }

  // Validate layer ID format (alphanumeric, dots, hyphens, underscores only)
  if (!/^[a-zA-Z0-9._-]+$/.test(layerId)) {
    if (!silent) showToast({ type: 'error', title: t('swisstopo.error'), message: t('swisstopo.error.invalidId') });
    return;
  }

  // Check if layer already added
  const existing = state.activeSwisstopoLayers.find(function(l) { return l.id === layerId; });
  if (existing) {
    if (!silent) showToast({ type: 'info', title: t('swisstopo.notice'), message: t('swisstopo.layer.alreadyActive', {title: title}) });
    return;
  }

  const sourceId = 'swisstopo-' + layerId;
  const mapLayerId = 'swisstopo-layer-' + layerId;
  const tileUrl = 'https://wms.geo.admin.ch/?' +
    'SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap' +
    '&LAYERS=' + layerId +
    '&CRS=EPSG:3857' +
    '&BBOX={bbox-epsg-3857}' +
    '&WIDTH=256&HEIGHT=256' +
    '&FORMAT=image/png' +
    '&TRANSPARENT=true';
  const maxZoom = 19;

  try {
    state.map.addSource(sourceId, {
      type: 'raster',
      tiles: [tileUrl],
      tileSize: 256,
      maxzoom: maxZoom,
      attribution: '&copy; <a href="https://www.swisstopo.admin.ch">swisstopo</a>'
    });

    let beforeLayer = null;
    if (state.map.getLayer(identifyHighlightLayerId)) {
      beforeLayer = identifyHighlightLayerId;
    } else if (state.map.getLayer('parcels-fill')) {
      beforeLayer = 'parcels-fill';
    } else if (state.map.getLayer('buildings-clusters')) {
      beforeLayer = 'buildings-clusters';
    } else if (state.map.getLayer('buildings-points')) {
      beforeLayer = 'buildings-points';
    }

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
    if (!silent) showToast({ type: 'error', title: t('swisstopo.error'), message: t('swisstopo.layer.addFailed', {title: title || layerId}) });
    return;
  }

  state.activeSwisstopoLayers.push({
    id: layerId,
    title: title || layerId,
    sourceId: sourceId,
    mapLayerId: mapLayerId,
    tileUrl: tileUrl,
    maxZoom: maxZoom,
    visible: true
  });

  renderActiveLayersList();
  updateUrlWithLayers();

  if (!silent) showToast({ type: 'success', title: t('swisstopo.layer.added'), message: t('swisstopo.layer.addedMessage', {title: title || layerId}) });
}

export function removeSwisstopoLayer(layerId) {
  const layerIndex = state.activeSwisstopoLayers.findIndex(function(l) { return l.id === layerId; });
  if (layerIndex === -1) return;

  const layer = state.activeSwisstopoLayers[layerIndex];

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

  showToast({ type: 'info', title: t('swisstopo.layer.removed'), message: t('swisstopo.layer.removedMessage', {title: layer.title}) });
}

export function toggleSwisstopoLayerVisibility(layerId) {
  const layer = state.activeSwisstopoLayers.find(function(l) { return l.id === layerId; });
  if (!layer) return;

  // Check if map layer exists
  if (!state.map.getLayer(layer.mapLayerId)) {
    console.warn('Map layer not found:', layer.mapLayerId);
    return;
  }

  const visibility = state.map.getLayoutProperty(layer.mapLayerId, 'visibility');
  const newVisibility = visibility === 'none' ? 'visible' : 'none';
  state.map.setLayoutProperty(layer.mapLayerId, 'visibility', newVisibility);

  // Track visibility state for style change restoration
  layer.visible = newVisibility !== 'none';

  renderActiveLayersList();
}

export function renderActiveLayersList() {
  const container = document.getElementById('external-layers-list');
  if (!container) return;

  if (state.activeSwisstopoLayers.length === 0) {
    container.innerHTML = '<div class="active-layers-empty">' + t('swisstopo.noActiveLayers') + '</div>';
    return;
  }

  let html = '';
  state.activeSwisstopoLayers.forEach(function(layer) {
    // Check if map layer exists, fall back to tracked visibility state
    let isVisible;
    if (state.map.getLayer(layer.mapLayerId)) {
      const visibility = state.map.getLayoutProperty(layer.mapLayerId, 'visibility');
      isVisible = visibility !== 'none';
    } else {
      isVisible = layer.visible !== false;
    }
    const checkedAttr = isVisible ? 'checked' : '';

    html += '<div class="active-layer-item">' +
      '<button class="active-layer-remove" data-action="removeSwisstopoLayer" data-layer-id="' + escapeHtml(layer.id) + '" title="Entfernen">' +
        '<span class="material-symbols-outlined">close</span>' +
      '</button>' +
      '<input type="checkbox" class="active-layer-checkbox" ' + checkedAttr + ' data-action="toggleLayerVisibility" data-layer-id="' + escapeHtml(layer.id) + '" title="' + (isVisible ? 'Ausblenden' : 'Einblenden') + '">' +
      '<span class="active-layer-title">' + escapeHtml(layer.title) + '</span>' +
      '<button class="active-layer-info" data-action="showLayerInfo" data-layer-id="' + escapeHtml(layer.id) + '" title="Layer-Informationen">' +
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
      let beforeLayer = null;
      if (state.map.getLayer(identifyHighlightLayerId)) {
        beforeLayer = identifyHighlightLayerId;
      } else if (state.map.getLayer('landcovers-fill')) {
        beforeLayer = 'landcovers-fill';
      } else if (state.map.getLayer('parcels-fill')) {
        beforeLayer = 'parcels-fill';
      } else if (state.map.getLayer('buildings-clusters')) {
        beforeLayer = 'buildings-clusters';
      } else if (state.map.getLayer('buildings-points')) {
        beforeLayer = 'buildings-points';
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
  const url = new URL(window.location);
  if (state.activeSwisstopoLayers.length > 0) {
    const layerIds = state.activeSwisstopoLayers.map(function(l) { return l.id; });
    url.searchParams.set('bgLayers', layerIds.join(','));
  } else {
    url.searchParams.delete('bgLayers');
  }
  // Geokatalog topic ("Thema wechseln"); the default topic needs no parameter
  if (currentTopic !== DEFAULT_TOPIC) {
    url.searchParams.set('topic', currentTopic);
  } else {
    url.searchParams.delete('topic');
  }
  window.history.replaceState({}, '', url);
}

export function loadLayersFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);

  // Geokatalog topic ("Thema wechseln"); the catalog itself loads when the accordion opens
  const topic = urlParams.get('topic');
  if (topic && isValidTopicId(topic) && topic !== currentTopic) {
    currentTopic = topic;
    state.geokatalogLoaded = false;
    updateTopicHeader();
  }

  const bgLayers = urlParams.get('bgLayers');
  if (bgLayers) {
    const layerIds = bgLayers.split(',');
    // Limit to max 10 layers from URL to prevent abuse
    const maxLayers = Math.min(layerIds.length, 10);
    for (let i = 0; i < maxLayers; i++) {
      const layerId = layerIds[i].trim();
      if (layerId) {
        // Pass silent=true to suppress toasts when loading from URL
        // Layer ID validation happens inside addSwisstopoLayer
        addSwisstopoLayer(layerId, layerId, true);
      }
    }
  }
}

// ===== SWISSTOPO FEATURE IDENTIFICATION =====

export const identifyHighlightSourceId = 'swisstopo-identify-highlight';
export const identifyHighlightLayerId = 'swisstopo-identify-highlight-layer';
export const identifyHighlightOutlineLayerId = 'swisstopo-identify-highlight-outline';

export function initIdentifyHighlightLayer() {
  // Add empty source for highlighting identified features
  if (!state.map.getSource(identifyHighlightSourceId)) {
    state.map.addSource(identifyHighlightSourceId, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    // Find the layer to insert before (should be above Swisstopo layers, below landcovers/parcels/points)
    let beforeLayer = null;
    if (state.map.getLayer('landcovers-fill')) {
      beforeLayer = 'landcovers-fill';
    } else if (state.map.getLayer('parcels-fill')) {
      beforeLayer = 'parcels-fill';
    } else if (state.map.getLayer('buildings-clusters')) {
      beforeLayer = 'buildings-clusters';
    } else if (state.map.getLayer('buildings-points')) {
      beforeLayer = 'buildings-points';
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
    const popup = state.identifiedFeaturePopup;
    state.identifiedFeaturePopup = null;
    popup.remove();
  }
}

let identifyController = null;

export function identifySwisstopoFeatures(lngLat) {
  // Only identify if there are active layers
  if (state.activeSwisstopoLayers.length === 0) return;

  // Get visible layer IDs
  const visibleLayers = state.activeSwisstopoLayers.filter(function(layer) {
    const visibility = state.map.getLayoutProperty(layer.mapLayerId, 'visibility');
    return visibility !== 'none';
  }).map(function(layer) {
    return layer.id;
  });

  if (visibleLayers.length === 0) return;

  // Build the identify URL
  // Use tolerance=0 for exact point-in-polygon intersection
  // Per API docs: tolerance=0 with mapExtent=0,0,0,0 and imageDisplay=0,0,0 does exact intersection
  const url = 'https://api3.geo.admin.ch/rest/services/all/MapServer/identify?' +
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

  // A newer click supersedes a pending request (responses could otherwise arrive out of order)
  if (identifyController) identifyController.abort();
  identifyController = new AbortController();
  const signal = identifyController.signal;

  // Busy cursor while the request is pending (typically 0.5 to 2 s)
  const canvas = state.map.getCanvas();
  canvas.style.cursor = 'progress';

  fetch(url, { signal: signal })
    .then(function(response) {
      if (!response.ok) throw new Error('Identify request failed (HTTP ' + response.status + ')');
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
      if (e.name === 'AbortError') return;
      console.error('Identify error:', e);
      clearIdentifyHighlight();
      showToast({ type: 'warning', title: t('swisstopo.error'), message: t('swisstopo.identify.failed'), duration: 5000 });
    })
    .finally(function() {
      if (!signal.aborted) canvas.style.cursor = state.measureState.active ? 'crosshair' : '';
    });
}

export function showIdentifiedFeature(result, lngLat) {
  // Remove existing popup FIRST (before setting new geometry)
  // This prevents the old popup's close event from clearing our new geometry
  if (state.identifiedFeaturePopup) {
    const oldPopup = state.identifiedFeaturePopup;
    state.identifiedFeaturePopup = null;
    oldPopup.remove();
  }

  // Now highlight the geometry (after old popup is gone)
  if (result.geometry) {
    const feature = {
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
  const props = result.properties || result.attributes || {};
  const layerName = result.layerName || result.layerBodId || 'Feature';

  let html = '<div class="identify-popup">';
  html += '<div class="identify-popup-header">' + escapeHtml(layerName) + '</div>';
  html += '<div class="identify-popup-content">';

  // Display properties (limit to first 8 for readability)
  let propCount = 0;
  for (const key in props) {
    if (props.hasOwnProperty(key) && propCount < 8) {
      const value = props[key];
      // Skip internal/technical fields
      if (key.startsWith('_') || key === 'id' || key === 'featureId') continue;
      // Skip null/undefined values
      if (value === null || value === undefined || value === '') continue;

      // Format the key (remove underscores, capitalize)
      const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });

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

const layerInfoModal = document.getElementById('layer-info-modal');
const layerInfoContent = document.getElementById('layer-info-content');
const layerInfoCloseBtn = layerInfoModal ? layerInfoModal.querySelector('.layer-info-modal-close') : null;

export function showLayerInfo(layerId) {
  if (!layerInfoModal || !layerInfoContent || !layerId) return;

  // Show modal with loading state
  layerInfoContent.innerHTML = '<div class="layer-info-loading"><span class="spinner inline-spinner" aria-hidden="true"></span><span>' + t('swisstopo.loadingInfo') + '</span></div>';
  layerInfoModal.classList.add('show');

  // Fetch layer legend/info
  fetch('https://api3.geo.admin.ch/rest/services/api/MapServer/' + layerId + '/legend?lang=de')
    .then(function(response) {
      if (!response.ok) throw new Error('Layer-Informationen nicht verfügbar');
      return response.text();
    })
    .then(function(html) {
      // Sanitize API HTML: parse in a detached document, strip scripts and event handlers
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('script, iframe, object, embed, form').forEach(function(el) { el.remove(); });
      doc.querySelectorAll('*').forEach(function(el) {
        Array.from(el.attributes).forEach(function(attr) {
          if (attr.name.startsWith('on') || attr.value.trim().toLowerCase().startsWith('javascript:')) {
            el.removeAttribute(attr.name);
          }
        });
      });
      const sanitized = doc.body ? doc.body.innerHTML : '';
      layerInfoContent.innerHTML = '<div class="layer-info-api-content">' + sanitized + '</div>';
    })
    .catch(function(error) {
      console.error('Fehler beim Laden der Layer-Informationen:', error);
      layerInfoContent.innerHTML = '<div class="layer-info-loading">' + t('swisstopo.loadInfoFailed') + '</div>';
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
const internalLayerMeta = {
  buildings: {
    title: 'Gebäude (Bundesamt für Bauten und Logistik BBL)',
    description: 'Interner Datensatz des BBL-Immobilienportfolios. Enthält sämtliche Gebäude mit Standort, Nutzungstyp, Eigentumsverhältnissen, Baujahr und weiteren Attributen.',
    source: 'BBL Immobilienportfolio',
    geometryType: 'Point',
    format: 'GeoJSON',
    dataKey: 'buildingsData'
  },
  parcels: {
    title: 'Grundstücke (Bundesamt für Bauten und Logistik BBL)',
    description: 'Interner Datensatz der BBL-Parzellen. Enthält Grundstücksinformationen mit Flächenangaben, Nutzungszonen und Eigentumsverhältnissen.',
    source: 'BBL Parzellen',
    geometryType: 'Polygon',
    format: 'GeoJSON',
    dataKey: 'parcelData'
  },
  landcovers: {
    title: 'Bodenabdeckung (Bundesamt für Bauten und Logistik BBL)',
    description: 'Gebäudefussabdrücke und Bodenabdeckungsflächen aus der amtlichen Vermessung der Schweiz. Verknüpft mit Gebäuden und Grundstücken über EGID/EGRID.',
    source: 'BBL / Amtliche Vermessung',
    geometryType: 'Polygon',
    format: 'GeoJSON',
    dataKey: 'landCoverData'
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
  if (layerKey === 'landcovers') {
    return '<div class="legend-footer"><span>' + t('print.legend') + '</span></div>' +
      '<div class="internal-legend">' +
      '<div class="internal-legend-item">' +
        '<span class="internal-legend-rect" style="background: rgba(139, 195, 74, 0.25); border: 2px solid #689F38;"></span>' +
        '<span>Gebaeude</span>' +
      '</div>' +
      '<div class="internal-legend-item">' +
        '<span class="internal-legend-rect" style="background: rgba(158, 158, 158, 0.25); border: 2px solid #9E9E9E;"></span>' +
        '<span>befestigt</span>' +
      '</div>' +
      '<div class="internal-legend-item">' +
        '<span class="internal-legend-rect" style="background: rgba(102, 187, 106, 0.25); border: 2px solid #66BB6A;"></span>' +
        '<span>humusiert</span>' +
      '</div>' +
      '<div class="internal-legend-item">' +
        '<span class="internal-legend-rect" style="background: rgba(66, 165, 245, 0.25); border: 2px solid #42A5F5;"></span>' +
        '<span>Gewaesser</span>' +
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

  const meta = internalLayerMeta[layerKey];
  if (!meta) return;

  const today = new Date();
  const datenstand = today.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const html = '<div class="legend-container">' +
    '<div class="bod-title">' + escapeHtml(meta.title) + '</div>' +
    '<div class="legend-abstract">' + escapeHtml(meta.description) + '</div>' +
    buildLegendHTML(layerKey) +
    '<div class="legend-footer"><span>Informationen</span></div>' +
    '<table>' +
    '<tr><td>Quelle</td><td>' + escapeHtml(meta.source) + '</td></tr>' +
    '<tr><td>Format</td><td>' + escapeHtml(meta.format) + ' (' + escapeHtml(meta.geometryType) + ')</td></tr>' +
    '<tr><td>Metadaten</td><td><span class="placeholder-link">Link zu Metadaten (Platzhalter)</span></td></tr>' +
    '<tr><td>Detailbeschreibung</td><td><span class="placeholder-link">Link zur Detailbeschreibung (Platzhalter)</span></td></tr>' +
    '<tr><td>Datenbezug</td><td><span class="placeholder-link">Link für Datenbezug (Platzhalter)</span></td></tr>' +
    '<tr><td>Thematisches Geoportal</td><td><span class="placeholder-link">Link zum Fachportal (Platzhalter)</span></td></tr>' +
    '<tr><td>Datenstand</td><td>' + datenstand + '</td></tr>' +
    '</table>' +
    '</div>';

  layerInfoContent.innerHTML = html;
  layerInfoModal.classList.add('show');
}

// ===== GEOKATALOG =====

// Sync Geokatalog checkboxes with active layers
export function updateGeokatalogCheckboxes() {
  const checkboxes = document.querySelectorAll('.node-checkbox[data-layer-id]');
  checkboxes.forEach(function(checkbox) {
    const layerId = checkbox.getAttribute('data-layer-id');
    const isActive = state.activeSwisstopoLayers.some(function(l) { return l.id === layerId; });
    checkbox.checked = isActive;
  });
}

let geokatalogLoading = false;
let geokatalogRequestId = 0;

export function loadGeokatalog() {
  if (state.geokatalogLoaded || geokatalogLoading) return;
  geokatalogLoading = true;
  const requestId = ++geokatalogRequestId;

  const treeContainer = document.getElementById('geokatalog-tree');
  treeContainer.innerHTML = '<div class="geokatalog-loading"><span class="spinner inline-spinner" aria-hidden="true"></span><span>' + t('loading.catalog') + '</span></div>';

  // Catalog of the current topic ("Thema wechseln"); "ech" is the complete Geokatalog
  fetch('https://api3.geo.admin.ch/rest/services/' + encodeURIComponent(currentTopic) + '/CatalogServer?lang=' + encodeURIComponent(getLang()))
    .then(function(response) {
      if (!response.ok) throw new Error('API nicht erreichbar (HTTP ' + response.status + ')');
      return response.json();
    })
    .then(function(data) {
      if (requestId !== geokatalogRequestId) return; // a newer topic was requested meanwhile
      state.geokatalogLoaded = true;
      treeContainer.innerHTML = '';

      if (data.results && data.results.root && data.results.root.children) {
        initCatalogTreeEvents(treeContainer);
        renderCatalogTree(data.results.root.children, treeContainer);
      } else {
        treeContainer.innerHTML = '<div class="geokatalog-error">' + t('swisstopo.catalog.empty') + '</div>';
      }
    })
    .catch(function(error) {
      if (requestId !== geokatalogRequestId) return;
      console.error('Geokatalog Fehler:', error);
      treeContainer.innerHTML = '<div class="geokatalog-error">' + t('swisstopo.catalog.failed') +
        '<br><button type="button" class="geokatalog-retry" data-action="retryGeokatalog">' + t('error.retry') + '</button></div>';
    })
    .finally(function() {
      if (requestId === geokatalogRequestId) geokatalogLoading = false;
    });
}

// ===== THEMA WECHSELN (topics of map.geo.admin.ch) =====
// The Geokatalog is one of ~30 topics of api3.geo.admin.ch; a topic groups the catalog layers by
// federal office or theme. Names (data/i18n.json, "topic.*") and the sprite (assets/topics.png) are
// borrowed from geoadmin/web-mapviewer; the chosen topic is kept in the URL (?topic=...).
const DEFAULT_TOPIC = 'ech';
let currentTopic = DEFAULT_TOPIC;
let topicList = null; // topic ids from the API, cached for the session

const topicModal = document.getElementById('topic-modal');
const topicGrid = document.getElementById('topic-grid');

export function getCurrentTopic() {
  return currentTopic;
}

function isValidTopicId(id) {
  return typeof id === 'string' && /^[a-z0-9_-]+$/i.test(id);
}

function topicLabel(id) {
  const key = 'topic.' + id;
  const label = t(key);
  return label === key ? id : label;
}

// The accordion header shows the topic name ("Geokatalog" for the default topic)
function updateTopicHeader() {
  const title = document.getElementById('geokatalog-title');
  if (title) title.textContent = topicLabel(currentTopic);
}

export function openTopicModal() {
  if (!topicModal || !topicGrid) return;
  topicModal.classList.add('show');
  if (topicList) {
    renderTopicGrid();
    return;
  }
  topicGrid.innerHTML = '<div class="layer-info-loading"><span class="spinner inline-spinner" aria-hidden="true"></span><span>' + t('topic.loading') + '</span></div>';
  fetch('https://api3.geo.admin.ch/rest/services')
    .then(function(response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(function(data) {
      const ids = (data.topics || []).map(function(topic) { return topic.id; }).filter(isValidTopicId);
      if (ids.length === 0) throw new Error('Keine Themen');
      topicList = ids;
      renderTopicGrid();
    })
    .catch(function(error) {
      console.error('Themen Fehler:', error);
      topicGrid.innerHTML = '<div class="geokatalog-error">' + t('topic.failed') + '</div>';
    });
}

function closeTopicModal() {
  if (topicModal) topicModal.classList.remove('show');
}

function renderTopicGrid() {
  topicGrid.innerHTML = topicList.map(function(id) {
    const active = id === currentTopic;
    return '<button type="button" class="topic-card' + (active ? ' active' : '') + '" data-topic="' + escapeHtml(id) + '" aria-pressed="' + active + '">' +
      '<span class="topic-card-name">' + escapeHtml(topicLabel(id)) + '</span>' +
      '<span class="topic-sprite topic-sprite-' + escapeHtml(id) + '" aria-hidden="true"></span>' +
      '</button>';
  }).join('');
}

function selectTopic(id) {
  closeTopicModal();
  if (!isValidTopicId(id) || id === currentTopic) return;
  currentTopic = id;
  updateTopicHeader();
  updateUrlWithLayers();

  // Reload the catalog tree for the new topic (an in-flight request is invalidated by the counter);
  // open the accordion if it is closed
  state.geokatalogLoaded = false;
  geokatalogLoading = false;
  geokatalogRequestId++;
  const header = document.querySelector('#geokatalog-accordion .accordion-header');
  if (header && !header.classList.contains('active')) {
    header.click(); // opens the accordion, which loads the catalog
  } else {
    loadGeokatalog();
  }
}

export function initTopicSwitch() {
  if (topicGrid) {
    topicGrid.addEventListener('click', function(e) {
      const card = e.target.closest('.topic-card');
      if (card) selectTopic(card.getAttribute('data-topic'));
    });
  }
  if (topicModal) {
    const closeBtn = topicModal.querySelector('.topic-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeTopicModal);
    topicModal.addEventListener('click', function(e) {
      if (e.target === topicModal) closeTopicModal();
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && topicModal.classList.contains('show')) {
        e.stopImmediatePropagation();
        closeTopicModal();
      }
    });
  }
  // The header label and the grid are rendered from JS: refresh them after a language change
  onLangChange(function() {
    updateTopicHeader();
    if (topicList && topicModal && topicModal.classList.contains('show')) renderTopicGrid();
  });
  updateTopicHeader();
}

// One delegated click handler for the whole catalog tree (the swisstopo catalog has
// several hundred nodes; one listener per node was needless work and memory).
let catalogEventsBound = false;

function initCatalogTreeEvents(container) {
  if (catalogEventsBound) return;
  catalogEventsBound = true;

  container.addEventListener('click', function(e) {
    // Info icon: layer info modal
    const info = e.target.closest('.node-info');
    if (info) {
      e.stopPropagation();
      const lid = info.getAttribute('data-layer-id');
      if (lid) showLayerInfo(lid);
      return;
    }

    const node = e.target.closest('.catalog-node');
    if (!node || !container.contains(node)) return;
    e.stopPropagation();

    if (node.classList.contains('leaf')) {
      // Leaf node toggles the layer
      const layerId = node.getAttribute('data-layer-id');
      if (!layerId) return;
      const layerTitle = node.getAttribute('data-layer-title') || layerId;
      const checkboxEl = node.querySelector('.node-checkbox');
      const isActive = state.activeSwisstopoLayers.some(function(l) { return l.id === layerId; });

      if (isActive) {
        removeSwisstopoLayer(layerId);
        if (checkboxEl) checkboxEl.checked = false;
      } else {
        addSwisstopoLayer(layerId, layerTitle, false);
        if (checkboxEl) checkboxEl.checked = true;
      }
    } else {
      // Category node expands/collapses its children
      const itemEl = node.parentElement;
      if (itemEl) itemEl.classList.toggle('expanded');
      node.classList.toggle('expanded');
    }
  });
}

export function renderCatalogTree(items, container) {
  items.forEach(function(item) {
    const itemEl = document.createElement('div');
    itemEl.className = 'catalog-item';

    const hasChildren = item.children && item.children.length > 0;

    const nodeEl = document.createElement('div');
    nodeEl.className = 'catalog-node' + (hasChildren ? '' : ' leaf');

    if (hasChildren) {
      // Category node with arrow
      const arrowEl = document.createElement('span');
      arrowEl.className = 'node-arrow';
      arrowEl.innerHTML = '<span class="material-symbols-outlined">chevron_right</span>';
      nodeEl.appendChild(arrowEl);
    } else {
      // Leaf node with checkbox (native input for reliable checked state)
      const checkboxEl = document.createElement('input');
      checkboxEl.type = 'checkbox';
      checkboxEl.className = 'node-checkbox';
      // Store layer ID for later reference
      if (item.layerBodId) {
        checkboxEl.setAttribute('data-layer-id', item.layerBodId);
        // Check if layer is already active
        const isActive = state.activeSwisstopoLayers.some(function(l) { return l.id === item.layerBodId; });
        if (isActive) {
          checkboxEl.checked = true;
        }
      }
      nodeEl.appendChild(checkboxEl);
    }

    const labelEl = document.createElement('span');
    labelEl.className = 'node-label';
    labelEl.textContent = item.label || item.category || 'Unbekannt';
    nodeEl.appendChild(labelEl);

    // Add info icon to leaf nodes (click handled by the delegated tree listener)
    if (!hasChildren && item.layerBodId) {
      const infoEl = document.createElement('span');
      infoEl.className = 'node-info';
      infoEl.innerHTML = '<span class="material-symbols-outlined">info</span>';
      infoEl.setAttribute('data-layer-id', item.layerBodId);
      nodeEl.appendChild(infoEl);

      // Leaf data for the delegated click handler
      nodeEl.setAttribute('data-layer-id', item.layerBodId);
      nodeEl.setAttribute('data-layer-title', item.label || item.category || item.layerBodId);
    }

    itemEl.appendChild(nodeEl);

    if (hasChildren) {
      const childrenEl = document.createElement('div');
      childrenEl.className = 'catalog-children';
      renderCatalogTree(item.children, childrenEl);
      itemEl.appendChild(childrenEl);
    }

    container.appendChild(itemEl);
  });
}
