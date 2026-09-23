import { layerInfoButton, renderInternalInfoButtons } from './layer-info-button.js';
// swisstopo integration (shared): external WMS layers of the Geokatalog, feature identification,
// layer info modal, catalog tree and the "Thema wechseln" topic grid of map.geo.admin.ch.
// Needs the markup ids: external-layers-list, layer-info-modal, layer-info-content,
// geokatalog-accordion, geokatalog-tree, geokatalog-title, topic-modal, topic-grid
// (and optionally mobile-external-layers-list).

import { escapeHtml, formatDate } from './utils.js';
import { showToast } from './toast.js';
import { t, getLang, onLangChange } from './i18n.js';
import { onEscape } from './keys.js';
import { isMeasuring } from './measure.js';
import { DATA_LAYER_ANCHORS, findFirstLayerId } from './map-controls.js';

let map = null;
let internalLayers = {};          // app-specific metadata for the "Interne Karten" info modal
let internalDataDate = null;      // options.dataDate(key) -> ISO date of the loaded dataset
const activeSwisstopoLayers = []; // { id, title, sourceId, mapLayerId, tileUrl, maxZoom, visible }
let identifiedFeaturePopup = null;
let geokatalogLoaded = false;
let geokatalogLoading = false;
let geokatalogRequestId = 0;

export const identifyHighlightSourceId = 'swisstopo-identify-highlight';
export const identifyHighlightLayerId = 'swisstopo-identify-highlight-layer';
export const identifyHighlightOutlineLayerId = 'swisstopo-identify-highlight-outline';

const SWISSTOPO_ATTRIBUTION = '&copy; <a href="https://www.swisstopo.admin.ch">swisstopo</a>';

// ===== INIT =====

// options: { map, internalLayers: { key: { title, description, source, format, geometryType, legendHtml(),
//   links: { metadata, description, download, portal } } }, dataDate(key) }
export function initSwisstopo(options) {
  map = options.map;
  map.on('style.load', clearIdentifyHighlight);
  internalLayers = options.internalLayers || {};
  internalDataDate = options.dataDate || null;
  renderInternalInfoButtons();
  initLayerInfoModal();
  initTopicSwitch();
}

export function getActiveSwisstopoLayers() {
  return activeSwisstopoLayers;
}

export function hasActiveSwisstopoLayers() {
  return activeSwisstopoLayers.length > 0;
}

// ===== EXTERNAL LAYERS (WMS of wms.geo.admin.ch) =====

function wmsTileUrl(layerId) {
  return 'https://wms.geo.admin.ch/?' +
    'SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap' +
    '&LAYERS=' + layerId +
    '&CRS=EPSG:3857' +
    '&BBOX={bbox-epsg-3857}' +
    '&WIDTH=256&HEIGHT=256' +
    '&FORMAT=image/png' +
    '&TRANSPARENT=true';
}

// External layers sit below the application's data layers (and below the identify highlight)
function externalLayerAnchor() {
  return findFirstLayerId(map, DATA_LAYER_ANCHORS.concat([identifyHighlightLayerId]));
}

function addLayerToMap(layer) {
  map.addSource(layer.sourceId, {
    type: 'raster',
    tiles: [layer.tileUrl],
    tileSize: 256,
    maxzoom: layer.maxZoom,
    attribution: SWISSTOPO_ATTRIBUTION
  });
  map.addLayer({
    id: layer.mapLayerId,
    type: 'raster',
    source: layer.sourceId,
    layout: { visibility: layer.visible !== false ? 'visible' : 'none' },
    paint: { 'raster-opacity': 0.7 }
  }, externalLayerAnchor());
}

export function addSwisstopoLayer(layerId, title, silent) {
  if (!layerId) {
    if (!silent) showToast({ type: 'error', title: t('swisstopo.error'), message: t('swisstopo.error.invalidId') });
    return;
  }
  // Layer ids are alphanumeric with dots, hyphens and underscores (they end up in URLs and layer ids)
  if (!/^[a-zA-Z0-9._-]+$/.test(layerId)) {
    if (!silent) showToast({ type: 'error', title: t('swisstopo.error'), message: t('swisstopo.error.invalidId') });
    return;
  }
  if (activeSwisstopoLayers.some(function(l) { return l.id === layerId; })) {
    if (!silent) showToast({ type: 'info', title: t('swisstopo.notice'), message: t('swisstopo.layer.alreadyActive', { title: title || layerId }) });
    return;
  }

  const layer = {
    id: layerId,
    title: title || layerId,
    sourceId: 'swisstopo-' + layerId,
    mapLayerId: 'swisstopo-layer-' + layerId,
    tileUrl: wmsTileUrl(layerId),
    maxZoom: 19,
    visible: true
  };

  try {
    addLayerToMap(layer);
  } catch (e) {
    console.error('[swisstopo] failed to add layer:', e);
    if (!silent) showToast({ type: 'error', title: t('swisstopo.error'), message: t('swisstopo.layer.addFailed', { title: layer.title }) });
    return;
  }

  activeSwisstopoLayers.push(layer);
  renderActiveLayersList();
  updateUrlWithLayers();
  if (!silent) showToast({ type: 'success', title: t('swisstopo.layer.added'), message: t('swisstopo.layer.addedMessage', { title: layer.title }) });
}

export function removeSwisstopoLayer(layerId) {
  const index = activeSwisstopoLayers.findIndex(function(l) { return l.id === layerId; });
  if (index === -1) return;
  clearIdentifyHighlight();
  const layer = activeSwisstopoLayers[index];
  try {
    if (map.getLayer(layer.mapLayerId)) map.removeLayer(layer.mapLayerId);
    if (map.getSource(layer.sourceId)) map.removeSource(layer.sourceId);
  } catch (e) {
    console.error('[swisstopo] failed to remove layer:', e);
  }
  activeSwisstopoLayers.splice(index, 1);
  renderActiveLayersList();
  updateUrlWithLayers();
  showToast({ type: 'info', title: t('swisstopo.layer.removed'), message: t('swisstopo.layer.removedMessage', { title: layer.title }) });
}

export function toggleSwisstopoLayerVisibility(layerId) {
  const layer = activeSwisstopoLayers.find(function(l) { return l.id === layerId; });
  if (!layer) return;
  if (!map.getLayer(layer.mapLayerId)) {
    console.warn('[swisstopo] map layer not found:', layer.mapLayerId);
    return;
  }
  const newVisibility = map.getLayoutProperty(layer.mapLayerId, 'visibility') === 'none' ? 'visible' : 'none';
  clearIdentifyHighlight();
  map.setLayoutProperty(layer.mapLayerId, 'visibility', newVisibility);
  layer.visible = newVisibility !== 'none';
  renderActiveLayersList();
}

function isLayerVisible(layer) {
  if (map.getLayer(layer.mapLayerId)) {
    return map.getLayoutProperty(layer.mapLayerId, 'visibility') !== 'none';
  }
  return layer.visible !== false;
}

function layerItemHtml(layer, itemClass, titleClass, infoClass) {
  const visible = isLayerVisible(layer);
  const id = escapeHtml(layer.id);
  return '<div class="' + itemClass + '">' +
    '<button type="button" class="active-layer-remove" data-action="removeSwisstopoLayer" data-layer-id="' + id + '" title="' + escapeHtml(t('modal.close')) + '">' +
      '<span class="material-symbols-outlined">close</span>' +
    '</button>' +
    '<input type="checkbox" class="active-layer-checkbox" ' + (visible ? 'checked' : '') + ' data-action="toggleLayerVisibility" data-layer-id="' + id + '">' +
    '<span class="' + titleClass + '">' + escapeHtml(layer.title) + '</span>' +
    layerInfoButton({ layerId: layer.id, mobile: infoClass === 'mobile-layer-info' }) +
  '</div>';
}

// "Externe Karten" lists in the tools panel and, when present, in the mobile menu
export function renderActiveLayersList() {
  const container = document.getElementById('external-layers-list');
  const mobileContainer = document.getElementById('mobile-external-layers-list');
  if (container) {
    container.innerHTML = activeSwisstopoLayers.length === 0
      ? '<div class="active-layers-empty">' + t('swisstopo.noActiveLayers') + '</div>'
      : activeSwisstopoLayers.map(function(layer) {
          return layerItemHtml(layer, 'active-layer-item', 'active-layer-title', 'active-layer-info');
        }).join('');
  }
  if (mobileContainer) {
    mobileContainer.innerHTML = activeSwisstopoLayers.length === 0
      ? '<div class="mobile-external-empty">' + t('swisstopo.noActiveLayers') + '</div>'
      : activeSwisstopoLayers.map(function(layer) {
          return layerItemHtml(layer, 'mobile-layer-item', 'mobile-layer-title', 'mobile-layer-info');
        }).join('');
  }
  updateGeokatalogCheckboxes();
}

// Re-add all external layers after a basemap change (setStyle drops every custom source)
export function readdSwisstopoLayers() {
  activeSwisstopoLayers.forEach(function(layer) {
    if (map.getSource(layer.sourceId)) return;
    try {
      addLayerToMap(layer);
    } catch (e) {
      console.error('[swisstopo] failed to restore layer:', layer.id, e);
    }
  });
  renderActiveLayersList();
}

export function updateUrlWithLayers() {
  const url = new URL(window.location);
  if (activeSwisstopoLayers.length > 0) {
    url.searchParams.set('bgLayers', activeSwisstopoLayers.map(function(l) { return l.id; }).join(','));
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

  // Geokatalog topic; the catalog itself loads when the accordion opens
  const topic = urlParams.get('topic');
  if (topic && isValidTopicId(topic) && topic !== currentTopic) {
    currentTopic = topic;
    geokatalogLoaded = false;
    updateTopicHeader();
  }

  const bgLayers = urlParams.get('bgLayers');
  if (bgLayers) {
    // At most 10 layers from a URL; ids are validated in addSwisstopoLayer
    bgLayers.split(',').slice(0, 10).forEach(function(layerId) {
      layerId = layerId.trim();
      if (layerId) addSwisstopoLayer(layerId, layerId, true);
    });
  }
}

// ===== FEATURE IDENTIFICATION =====

export function initIdentifyHighlightLayer() {
  if (map.getSource(identifyHighlightSourceId)) return;
  map.addSource(identifyHighlightSourceId, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  });
  // Above the external layers and the ground polygons (land cover and parcels would cover it), below the
  // application's points and labels
  const beforeLayer = findFirstLayerId(map, ['buildings-clusters', 'buildings-points']);
  map.addLayer({
    id: identifyHighlightLayerId,
    type: 'fill',
    source: identifyHighlightSourceId,
    paint: { 'fill-color': '#ff6b00', 'fill-opacity': 0.35 }
  }, beforeLayer);
  map.addLayer({
    id: identifyHighlightOutlineLayerId,
    type: 'line',
    source: identifyHighlightSourceId,
    paint: { 'line-color': '#ff6b00', 'line-width': 3, 'line-opacity': 0.9 }
  }, beforeLayer);
}

export function clearIdentifyHighlight() {
  if (identifyController) {
    identifyController.abort();
    identifyController = null;
    if (map) map.getCanvas().style.cursor = isMeasuring() ? 'crosshair' : '';
  }
  const source = map?.getSource(identifyHighlightSourceId);
  if (source) source.setData({ type: 'FeatureCollection', features: [] });
  if (identifiedFeaturePopup) {
    // Null the reference BEFORE removing: popup.remove() fires 'close', which calls this function again
    const popup = identifiedFeaturePopup;
    identifiedFeaturePopup = null;
    popup.remove();
  }
}

let identifyController = null;

export function identifySwisstopoFeatures(lngLat) {
  clearIdentifyHighlight();
  const visibleLayers = activeSwisstopoLayers.filter(isLayerVisible).map(function(l) { return l.id; });
  if (visibleLayers.length === 0) return;

  // tolerance=0 with mapExtent=0,0,0,0 and imageDisplay=0,0,0 does an exact point-in-polygon intersection
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
    '&lang=' + encodeURIComponent(getLang());

  // A newer click supersedes a pending request (responses could otherwise arrive out of order)
  identifyController = new AbortController();
  const signal = identifyController.signal;

  // Busy cursor while the request is pending (typically 0.5 to 2 s)
  const canvas = map.getCanvas();
  canvas.style.cursor = 'progress';

  fetch(url, { signal: signal })
    .then(function(response) {
      if (!response.ok) throw new Error('Identify request failed (HTTP ' + response.status + ')');
      return response.json();
    })
    .then(function(data) {
      if (signal.aborted) return;
      if (data.results && data.results.length > 0) {
        showIdentifiedFeature(data.results[0], lngLat);
      } else {
        clearIdentifyHighlight();
      }
    })
    .catch(function(e) {
      if (signal.aborted || e.name === 'AbortError') return;
      console.error('[swisstopo] identify error:', e);
      clearIdentifyHighlight();
      showToast({ type: 'warning', title: t('swisstopo.error'), message: t('swisstopo.identify.failed'), duration: 5000 });
    })
    .finally(function() {
      if (!signal.aborted) {
        identifyController = null;
        canvas.style.cursor = isMeasuring() ? 'crosshair' : '';
      }
    });
}

function showIdentifiedFeature(result, lngLat) {
  // Remove the old popup first: its close event would otherwise clear the new geometry
  if (identifiedFeaturePopup) {
    const oldPopup = identifiedFeaturePopup;
    identifiedFeaturePopup = null;
    oldPopup.remove();
  }

  if (result.geometry && map.getSource(identifyHighlightSourceId)) {
    map.getSource(identifyHighlightSourceId).setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: result.geometry, properties: result.properties || {} }]
    });
  }

  const props = result.properties || result.attributes || {};
  const layerName = result.layerName || result.layerBodId || 'Feature';

  let html = '<div class="identify-popup">';
  html += '<div class="identify-popup-header">' + escapeHtml(layerName) + '</div>';
  html += '<div class="identify-popup-content">';

  // First 8 non-technical, non-empty attributes
  let propCount = 0;
  Object.keys(props).forEach(function(key) {
    if (propCount >= 8) return;
    const value = props[key];
    if (key.startsWith('_') || key === 'id' || key === 'featureId') return;
    if (value === null || value === undefined || value === '') return;
    const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
    html += '<div class="identify-prop">' +
      '<span class="identify-prop-key">' + escapeHtml(displayKey) + ':</span> ' +
      '<span class="identify-prop-value">' + escapeHtml(String(value)) + '</span>' +
      '</div>';
    propCount++;
  });
  if (propCount === 0) html += '<div class="identify-prop"><em>' + t('swisstopo.identify.noAttributes') + '</em></div>';
  html += '</div></div>';

  identifiedFeaturePopup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '320px' })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(map);
  identifiedFeaturePopup.on('close', clearIdentifyHighlight);
}

// ===== LAYER INFO MODAL =====

function layerInfoModal() { return document.getElementById('layer-info-modal'); }
function layerInfoContent() { return document.getElementById('layer-info-content'); }

// The modal shows one layer at a time: a response that arrives after another layer was requested
// (or after the modal was closed) is dropped.
let layerInfoRequestId = 0;

// Legend/info of a Geokatalog layer. The API returns HTML: it is parsed in a detached document
// and stripped of scripts, frames, forms, external resources and event handlers before insertion.
export function showLayerInfo(layerId) {
  const modal = layerInfoModal();
  const content = layerInfoContent();
  if (!modal || !content || !layerId) return;
  const requestId = ++layerInfoRequestId;

  content.innerHTML = '<div class="loading-row"><span class="spinner inline-spinner" aria-hidden="true"></span><span>' + t('swisstopo.loadingInfo') + '</span></div>';
  modal.classList.add('show');

  fetch('https://api3.geo.admin.ch/rest/services/api/MapServer/' + encodeURIComponent(layerId) + '/legend?lang=' + encodeURIComponent(getLang()))
    .then(function(response) {
      if (!response.ok) throw new Error('Layer info unavailable (HTTP ' + response.status + ')');
      return response.text();
    })
    .then(function(html) {
      if (requestId !== layerInfoRequestId) return;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('script, iframe, object, embed, form, link, meta, base').forEach(function(el) { el.remove(); });
      doc.querySelectorAll('*').forEach(function(el) {
        Array.from(el.attributes).forEach(function(attr) {
          if (attr.name.startsWith('on') || attr.value.trim().toLowerCase().startsWith('javascript:')) {
            el.removeAttribute(attr.name);
          }
        });
      });
      content.innerHTML = '<div class="layer-info-api-content">' + (doc.body ? doc.body.innerHTML : '') + '</div>';
    })
    .catch(function(error) {
      if (requestId !== layerInfoRequestId) return;
      console.error('[swisstopo] layer info failed:', error);
      content.innerHTML = '<div class="loading-row">' + t('swisstopo.loadInfoFailed') + '</div>';
    });
}

export function hideLayerInfo() {
  layerInfoRequestId++;
  const modal = layerInfoModal();
  if (modal) modal.classList.remove('show');
}

// A link row of the internal layer info; the placeholder stays where a dataset has no link
function infoLink(url, labelKey) {
  if (!url) return '<span class="placeholder-link">' + t('swisstopo.info.placeholder') + '</span>';
  let host = url;
  try { host = new URL(url, window.location.href).hostname.replace(/^www\./, ''); } catch (e) { /* relative link */ }
  const external = /^https?:/i.test(url);
  return '<a href="' + escapeHtml(url) + '"' + (external ? ' target="_blank" rel="noopener"' : '') + '>' + escapeHtml(t(labelKey, { host: host })) + '</a>';
}

// Info modal for the application's own datasets ("Interne Karten")
export function showInternalLayerInfo(layerKey) {
  const modal = layerInfoModal();
  const content = layerInfoContent();
  const meta = internalLayers[layerKey];
  if (!modal || !content || !meta) return;
  layerInfoRequestId++; // a pending Geokatalog response must not replace this content

  const links = meta.links || {};
  const dataDate = internalDataDate ? internalDataDate(layerKey) : null;
  const datenstand = formatDate(dataDate) || formatDate(new Date().toISOString());
  content.innerHTML = '<div class="legend-container">' +
    '<div class="bod-title">' + escapeHtml(meta.title) + '</div>' +
    '<div class="legend-abstract">' + escapeHtml(meta.description) + '</div>' +
    (meta.legendHtml ? meta.legendHtml() : '') +
    '<div class="legend-footer"><span>' + t('swisstopo.info.title') + '</span></div>' +
    '<table>' +
    '<tr><td>' + t('swisstopo.info.source') + '</td><td>' + escapeHtml(meta.source) + '</td></tr>' +
    '<tr><td>' + t('swisstopo.info.format') + '</td><td>' + escapeHtml(meta.format) + ' (' + escapeHtml(meta.geometryType) + ')</td></tr>' +
    '<tr><td>' + t('swisstopo.info.metadata') + '</td><td>' + infoLink(links.metadata, 'swisstopo.info.link.metadata') + '</td></tr>' +
    '<tr><td>' + t('swisstopo.info.description') + '</td><td>' + infoLink(links.description, 'swisstopo.info.link.description') + '</td></tr>' +
    '<tr><td>' + t('swisstopo.info.download') + '</td><td>' + infoLink(links.download, 'swisstopo.info.link.download') + '</td></tr>' +
    '<tr><td>' + t('swisstopo.info.portal') + '</td><td>' + infoLink(links.portal, 'swisstopo.info.link.portal') + '</td></tr>' +
    '<tr><td>' + t('swisstopo.info.date') + '</td><td>' + datenstand + '</td></tr>' +
    '</table>' +
    '</div>';
  modal.classList.add('show');
}

function initLayerInfoModal() {
  const modal = layerInfoModal();
  if (!modal) return;
  const closeBtn = modal.querySelector('.layer-info-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', hideLayerInfo);
  modal.addEventListener('click', function(e) {
    if (e.target === modal) hideLayerInfo();
  });
  onEscape(function() {
    if (!modal.classList.contains('show')) return false;
    hideLayerInfo();
    return true;
  }, 90);
}

// ===== GEOKATALOG =====

// Sync the catalog checkboxes with the active layers
function updateGeokatalogCheckboxes() {
  document.querySelectorAll('.node-checkbox[data-layer-id]').forEach(function(checkbox) {
    const layerId = checkbox.getAttribute('data-layer-id');
    checkbox.checked = activeSwisstopoLayers.some(function(l) { return l.id === layerId; });
  });
}

export function loadGeokatalog() {
  if (geokatalogLoaded || geokatalogLoading) return;
  const treeContainer = document.getElementById('geokatalog-tree');
  if (!treeContainer) return;
  geokatalogLoading = true;
  const requestId = ++geokatalogRequestId;

  treeContainer.innerHTML = '<div class="loading-row"><span class="spinner inline-spinner" aria-hidden="true"></span><span>' + t('loading.catalog') + '</span></div>';

  // Catalog of the current topic ("Thema wechseln"); "ech" is the complete Geokatalog
  fetch('https://api3.geo.admin.ch/rest/services/' + encodeURIComponent(currentTopic) + '/CatalogServer?lang=' + encodeURIComponent(getLang()))
    .then(function(response) {
      if (!response.ok) throw new Error('API unavailable (HTTP ' + response.status + ')');
      return response.json();
    })
    .then(function(data) {
      if (requestId !== geokatalogRequestId) return; // a newer topic was requested meanwhile
      geokatalogLoaded = true;
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
      console.error('[swisstopo] catalog failed:', error);
      treeContainer.innerHTML = '<div class="geokatalog-error">' + t('swisstopo.catalog.failed') +
        '<br><button type="button" class="geokatalog-retry" data-action="retryGeokatalog">' + t('error.retry') + '</button></div>';
    })
    .finally(function() {
      if (requestId === geokatalogRequestId) geokatalogLoading = false;
    });
}

// One delegated click handler for the whole catalog tree (several hundred nodes)
let catalogEventsBound = false;

function initCatalogTreeEvents(container) {
  if (catalogEventsBound) return;
  catalogEventsBound = true;

  container.addEventListener('click', function(e) {
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
      const layerId = node.getAttribute('data-layer-id');
      if (!layerId) return;
      const layerTitle = node.getAttribute('data-layer-title') || layerId;
      const checkboxEl = node.querySelector('.node-checkbox');
      const isActive = activeSwisstopoLayers.some(function(l) { return l.id === layerId; });
      if (isActive) {
        removeSwisstopoLayer(layerId);
        if (checkboxEl) checkboxEl.checked = false;
      } else {
        addSwisstopoLayer(layerId, layerTitle, false);
        if (checkboxEl) checkboxEl.checked = true;
      }
    } else {
      const itemEl = node.parentElement;
      if (itemEl) itemEl.classList.toggle('expanded');
      node.classList.toggle('expanded');
    }
  });
}

function renderCatalogTree(items, container) {
  items.forEach(function(item) {
    const itemEl = document.createElement('div');
    itemEl.className = 'catalog-item';
    const hasChildren = item.children && item.children.length > 0;

    const nodeEl = document.createElement('div');
    nodeEl.className = 'catalog-node' + (hasChildren ? '' : ' leaf');

    if (hasChildren) {
      const arrowEl = document.createElement('span');
      arrowEl.className = 'node-arrow';
      arrowEl.innerHTML = '<span class="material-symbols-outlined">chevron_right</span>';
      nodeEl.appendChild(arrowEl);
    } else {
      const checkboxEl = document.createElement('input');
      checkboxEl.type = 'checkbox';
      checkboxEl.className = 'node-checkbox';
      if (item.layerBodId) {
        checkboxEl.setAttribute('data-layer-id', item.layerBodId);
        checkboxEl.checked = activeSwisstopoLayers.some(function(l) { return l.id === item.layerBodId; });
      }
      nodeEl.appendChild(checkboxEl);
    }

    const labelEl = document.createElement('span');
    labelEl.className = 'node-label';
    labelEl.textContent = item.label || item.category || t('swisstopo.catalog.unknown');
    nodeEl.appendChild(labelEl);

    if (!hasChildren && item.layerBodId) {
      const infoEl = document.createElement('span');
      infoEl.className = 'node-info';
      infoEl.innerHTML = '<span class="material-symbols-outlined">info</span>';
      infoEl.setAttribute('data-layer-id', item.layerBodId);
      nodeEl.appendChild(infoEl);
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

// ===== THEMA WECHSELN (topics of map.geo.admin.ch) =====
// The Geokatalog is one of ~30 topics of api3.geo.admin.ch; a topic groups the catalog layers by
// federal office or theme. Names (i18n "topic.*") and the sprite (shared/assets/topics.png) are
// borrowed from geoadmin/web-mapviewer; the chosen topic is kept in the URL (?topic=...).
const DEFAULT_TOPIC = 'ech';
let currentTopic = DEFAULT_TOPIC;
let topicList = null; // topic ids from the API, cached for the session

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
  const topicModal = document.getElementById('topic-modal');
  const topicGrid = document.getElementById('topic-grid');
  if (!topicModal || !topicGrid) return;
  topicModal.classList.add('show');
  if (topicList) {
    renderTopicGrid();
    return;
  }
  topicGrid.innerHTML = '<div class="loading-row"><span class="spinner inline-spinner" aria-hidden="true"></span><span>' + t('topic.loading') + '</span></div>';
  fetch('https://api3.geo.admin.ch/rest/services')
    .then(function(response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(function(data) {
      const ids = (data.topics || []).map(function(topic) { return topic.id; }).filter(isValidTopicId);
      if (ids.length === 0) throw new Error('No topics');
      topicList = ids;
      renderTopicGrid();
    })
    .catch(function(error) {
      console.error('[swisstopo] topics failed:', error);
      topicGrid.innerHTML = '<div class="geokatalog-error">' + t('topic.failed') + '</div>';
    });
}

function closeTopicModal() {
  const topicModal = document.getElementById('topic-modal');
  if (topicModal) topicModal.classList.remove('show');
}

function renderTopicGrid() {
  const topicGrid = document.getElementById('topic-grid');
  if (!topicGrid || !topicList) return;
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
  geokatalogLoaded = false;
  geokatalogLoading = false;
  geokatalogRequestId++;
  const header = document.querySelector('#geokatalog-accordion .accordion-header');
  if (header && !header.classList.contains('active')) {
    header.click(); // opens the accordion, which loads the catalog
  } else {
    loadGeokatalog();
  }
}

function initTopicSwitch() {
  const topicModal = document.getElementById('topic-modal');
  const topicGrid = document.getElementById('topic-grid');
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
    onEscape(function() {
      if (!topicModal.classList.contains('show')) return false;
      closeTopicModal();
      return true;
    }, 90);
  }
  // The header label, the grid and the layer lists are rendered from JS: refresh them after a language change
  onLangChange(function() {
    renderInternalInfoButtons();
    updateTopicHeader();
    if (topicList && topicModal && topicModal.classList.contains('show')) renderTopicGrid();
    renderActiveLayersList();
  });
  updateTopicHeader();
}

// ===== ACTIONS (for the applications' data-action delegation) =====

export const swisstopoClickActions = {
  removeSwisstopoLayer: function(el) { removeSwisstopoLayer(el.dataset.layerId); },
  showLayerInfo: function(el) { showLayerInfo(el.dataset.layerId); },
  showInternalLayerInfo: function(el) { showInternalLayerInfo(el.dataset.layerKey); },
  retryGeokatalog: function() { loadGeokatalog(); },
  switchTopic: function() { openTopicModal(); }
};

export const swisstopoChangeActions = {
  toggleLayerVisibility: function(el) { toggleSwisstopoLayerVisibility(el.dataset.layerId); }
};
