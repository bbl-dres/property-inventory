// Map: data layers (buildings, parcels, land covers), selection and the restore after a basemap change.
// Map creation, controls, style switcher, context menu and measure tool are common modules.

import { state } from './state.js';
import { statusColors, getStatusClassName, placeholderImages, parcelColor, landCoverColors, landCoverOutlineColor, internalLayerIds } from './config.js';
import { escapeHtml, cssUrl, formatNum } from './utils.js';
import { t } from './i18n.js';
import { getMapStyleUrl, getMapStyleOptions, initStyleSwitcher } from './basemaps.js';
import { createMap, addStandardControls, bindMapUrlSync, bindCoordinateDisplay, initMapStatusIndicators, smartFlyTo, revealSelectionOnMobile, is3DActive, show3DBuildings } from './map-controls.js';
import { getPolygonCentroid } from './geo.js';
import { isMeasuring, restoreMeasurement } from './measure.js';
import { identifySwisstopoFeatures, clearIdentifyHighlight, initIdentifyHighlightLayer, loadLayersFromUrl, readdSwisstopoLayers, hasActiveSwisstopoLayers } from './swisstopo.js';
import { renderLocationTree, syncCountryHighlight } from './location-tree.js';
import { syncTableToBuilding, syncTableToParcel, syncTableToLandCover } from './list.js';
import { getActiveFilterCount, updateMapFilter } from './filters.js';

// ===== MAP INITIALISATION =====

// True once the map fired its (single) 'load' event. map.loaded() is false again whenever tiles are
// streaming, e.g. after a pan, so it cannot tell whether the layers may be added when the data arrives.
let initialLoadDone = false;

export function hasMapLoaded() {
  return initialLoadDone;
}

export function initMap() {
  const map = createMap('map', getMapStyleUrl(), getMapStyleOptions());
  state.map = map;
  // Registered before anything can fire 'load': adds the data layers when the data arrived first;
  // the data loader adds them itself when the map was first (see applyLoadedData in app.js).
  map.once('load', function() {
    initialLoadDone = true;
    addMapLayers();
  });
  initMapStatusIndicators(map);
  addStandardControls(map);
  bindMapUrlSync(map, function() { return state.currentView !== 'detail'; });
  bindCoordinateDisplay(map, 'coordinates');
  initStyleSwitcher(map, restoreLayers);
  return map;
}

// ===== PULSE ANIMATION OF THE SELECTED BUILDING =====
// setInterval at ~20 fps instead of rAF at 60 fps: purely cosmetic

let pulseRadius = 24;
let pulseOpacity = 0.4;
let pulseDirection = 1;
let pulseIntervalId = null;

function pulseStep() {
  if (!state.selectedBuildingId) {
    stopPulseAnimation();
    return;
  }
  // Skip while the map is not visible (other view / background tab): every paint
  // property change triggers a full map re-render.
  if (document.hidden || state.currentView !== 'map') return;

  pulseRadius += 0.9 * pulseDirection;
  pulseOpacity -= 0.03 * pulseDirection;
  if (pulseRadius >= 32) pulseDirection = -1;
  else if (pulseRadius <= 24) pulseDirection = 1;

  if (state.map && state.map.getLayer('buildings-selected-pulse')) {
    state.map.setPaintProperty('buildings-selected-pulse', 'circle-radius', pulseRadius);
    state.map.setPaintProperty('buildings-selected-pulse', 'circle-stroke-opacity', Math.max(0.1, pulseOpacity));
  }
}

function startPulseAnimation() {
  if (pulseIntervalId !== null) return;
  pulseRadius = 24;
  pulseOpacity = 0.4;
  pulseDirection = 1;
  pulseIntervalId = setInterval(pulseStep, 50);
}

function stopPulseAnimation() {
  if (pulseIntervalId === null) return;
  clearInterval(pulseIntervalId);
  pulseIntervalId = null;
}

// ===== DATA LAYERS =====

function addLandCoverLayers(map) {
  map.addSource('landcovers', { type: 'geojson', data: state.landCoverData });
  const matchExpr = ['match', ['get', 'av_type']];
  Object.keys(landCoverColors).forEach(function(type) { matchExpr.push(type, landCoverColors[type]); });
  matchExpr.push(landCoverColors['Gebaeude']);

  map.addLayer({
    id: 'landcovers-fill', type: 'fill', source: 'landcovers', minzoom: 14,
    paint: { 'fill-color': matchExpr, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 0.25] }
  });
  map.addLayer({
    id: 'landcovers-outline', type: 'line', source: 'landcovers', minzoom: 14,
    paint: { 'line-color': landCoverOutlineColor, 'line-width': 1.5, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 0.7] }
  });
  map.addLayer({
    id: 'landcovers-highlight', type: 'fill', source: 'landcovers', minzoom: 14,
    filter: ['==', ['get', 'objectid'], -1],
    paint: { 'fill-color': landCoverColors['Gebaeude'], 'fill-opacity': 0.4 }
  });
  // No minzoom on the selection layers: a selection should always be visible
  map.addLayer({
    id: 'landcovers-selected', type: 'fill', source: 'landcovers',
    filter: ['==', ['get', 'objectid'], -1],
    paint: { 'fill-color': landCoverColors['Gebaeude'], 'fill-opacity': 0.5 }
  });
  map.addLayer({
    id: 'landcovers-selected-outline', type: 'line', source: 'landcovers',
    filter: ['==', ['get', 'objectid'], -1],
    paint: { 'line-color': landCoverOutlineColor, 'line-width': 3, 'line-opacity': 1 }
  });
}

function addParcelLayers(map) {
  map.addSource('parcels', { type: 'geojson', data: state.parcelData });
  // Visible from zoom 12 (plot-level detail)
  map.addLayer({
    id: 'parcels-fill', type: 'fill', source: 'parcels', minzoom: 12,
    paint: { 'fill-color': parcelColor, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 13, 0.15] }
  });
  map.addLayer({
    id: 'parcels-outline', type: 'line', source: 'parcels', minzoom: 12,
    paint: { 'line-color': parcelColor, 'line-width': 2, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 13, 0.8] }
  });
  map.addLayer({
    id: 'parcels-highlight', type: 'fill', source: 'parcels', minzoom: 12,
    filter: ['==', ['get', 'bbl_id'], ''],
    paint: { 'fill-color': parcelColor, 'fill-opacity': 0.35 }
  });
  map.addLayer({
    id: 'parcels-selected', type: 'fill', source: 'parcels',
    filter: ['==', ['get', 'bbl_id'], ''],
    paint: { 'fill-color': parcelColor, 'fill-opacity': 0.45 }
  });
  map.addLayer({
    id: 'parcels-selected-outline', type: 'line', source: 'parcels',
    filter: ['==', ['get', 'bbl_id'], ''],
    paint: { 'line-color': parcelColor, 'line-width': 3, 'line-opacity': 1 }
  });
}

function addBuildingLayers(map) {
  map.addSource('buildings', {
    type: 'geojson',
    data: state.buildingsData,
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 50
  });

  // Cluster circles sized by point count
  map.addLayer({
    id: 'buildings-clusters', type: 'circle', source: 'buildings', filter: ['has', 'point_count'],
    paint: {
      'circle-color': ['step', ['get', 'point_count'], '#42A5F5', 10, '#1976d2', 50, '#0D47A1'],
      'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 50, 32],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff'
    }
  });
  map.addLayer({
    id: 'buildings-cluster-count', type: 'symbol', source: 'buildings', filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Open Sans Bold', 'Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': true },
    paint: { 'text-color': '#ffffff' }
  });

  const colorExpr = ['match', ['get', 'bbl_stat']];
  Object.keys(statusColors).forEach(function(status) { colorExpr.push(status, statusColors[status]); });
  colorExpr.push('#6C757D');

  map.addLayer({
    id: 'buildings-points', type: 'circle', source: 'buildings', filter: ['!', ['has', 'point_count']],
    paint: { 'circle-radius': 10, 'circle-color': colorExpr, 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' }
  });
  map.addLayer({
    id: 'buildings-selected', type: 'circle', source: 'buildings',
    filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'bbl_id'], '']],
    paint: { 'circle-radius': 18, 'circle-color': 'transparent', 'circle-stroke-width': 3, 'circle-stroke-color': '#c00', 'circle-stroke-opacity': 0.9 }
  });
  map.addLayer({
    id: 'buildings-selected-pulse', type: 'circle', source: 'buildings',
    filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'bbl_id'], '']],
    paint: { 'circle-radius': 24, 'circle-color': 'transparent', 'circle-stroke-width': 2, 'circle-stroke-color': '#c00', 'circle-stroke-opacity': 0.4 }
  });
  map.addLayer({
    id: 'buildings-labels', type: 'symbol', source: 'buildings', filter: ['!', ['has', 'point_count']], minzoom: 16,
    layout: { 'text-field': ['get', 'bbl_id'], 'text-font': ['Open Sans Bold', 'Noto Sans Bold'], 'text-size': 13, 'text-anchor': 'bottom', 'text-offset': [0, -1.5], 'text-allow-overlap': false },
    paint: { 'text-color': '#1a1a1a', 'text-halo-color': '#ffffff', 'text-halo-width': 2 }
  });
}

export function addMapLayers() {
  if (!state.buildingsData) return;
  const map = state.map;
  if (map.getSource('buildings')) return; // already added

  if (state.landCoverData && state.landCoverData.features) addLandCoverLayers(map);
  if (state.parcelData && state.parcelData.features) addParcelLayers(map);
  addBuildingLayers(map);

  // The "Interne Karten" checkboxes are the source of truth for visibility (also after a basemap change)
  applyInternalLayerVisibility();

  // Filters may be active from the URL
  if (state.filteredData && getActiveFilterCount() > 0) updateMapFilter();

  bindMapInteractions();
  restoreSelectionFromUrl();
  initIdentifyHighlightLayer();
  loadLayersFromUrl();
  syncCountryHighlight(); // outline of the country chosen in the location tree (gone after a style change)
}

// ===== INTERNAL LAYER VISIBILITY =====

export function setInternalLayerVisibility(layerKey, visible) {
  const ids = internalLayerIds[layerKey];
  if (!ids || !state.map) return;
  ids.forEach(function(id) {
    if (state.map.getLayer(id)) state.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  });
}

export function applyInternalLayerVisibility() {
  Object.keys(internalLayerIds).forEach(function(layerKey) {
    const toggle = document.getElementById('layer-toggle-' + layerKey);
    setInternalLayerVisibility(layerKey, !toggle || toggle.checked);
  });
}

// ===== MAP INTERACTIONS =====
// Bound exactly once. MapLibre keeps layer event listeners across setStyle(), while
// addMapLayers() runs again after every style change.
let interactionsBound = false;

function bindMapInteractions() {
  if (interactionsBound) return;
  interactionsBound = true;
  const map = state.map;

  // Hover cursor helper: keeps the crosshair while the measure tool is active
  function setPointerCursor(on) {
    map.getCanvas().style.cursor = isMeasuring() ? 'crosshair' : (on ? 'pointer' : '');
  }

  function queryAround(point, layers) {
    const bbox = [[point.x - 15, point.y - 15], [point.x + 15, point.y + 15]];
    return map.queryRenderedFeatures(bbox, { layers: layers.filter(function(l) { return map.getLayer(l); }) });
  }

  // Clusters: click to zoom in
  map.on('click', 'buildings-clusters', function(e) {
    if (isMeasuring()) return;
    const features = map.queryRenderedFeatures(e.point, { layers: ['buildings-clusters'] });
    if (!features.length) return;
    map.getSource('buildings').getClusterExpansionZoom(features[0].properties.cluster_id, function(err, zoom) {
      if (err) return;
      smartFlyTo(map, { center: features[0].geometry.coordinates, zoom: zoom });
    });
  });
  map.on('mouseenter', 'buildings-clusters', function() { setPointerCursor(true); });
  map.on('mouseleave', 'buildings-clusters', function() { setPointerCursor(false); });

  // Buildings
  map.on('mouseenter', 'buildings-points', function() { setPointerCursor(true); });
  map.on('mouseleave', 'buildings-points', function() { setPointerCursor(false); });
  map.on('click', 'buildings-points', function(e) {
    if (isMeasuring()) return;
    selectBuilding(e.features[0].properties.bbl_id, false);
  });

  // Parcels yield to buildings, clusters and land covers (parcels are the bottom layer)
  if (state.parcelData && state.parcelData.features) {
    map.on('mouseenter', 'parcels-fill', function(e) {
      setPointerCursor(true);
      if (e.features.length > 0) map.setFilter('parcels-highlight', ['==', ['get', 'bbl_id'], e.features[0].properties.bbl_id]);
    });
    map.on('mouseleave', 'parcels-fill', function() {
      setPointerCursor(false);
      map.setFilter('parcels-highlight', ['==', ['get', 'bbl_id'], '']);
    });
    map.on('click', 'parcels-fill', function(e) {
      if (isMeasuring()) return;
      if (queryAround(e.point, ['buildings-points', 'buildings-clusters', 'landcovers-fill']).length > 0) return;
      selectParcel(e.features[0].properties.bbl_id);
    });
  }

  // Land covers yield only to buildings and clusters
  if (state.landCoverData && state.landCoverData.features) {
    map.on('mouseenter', 'landcovers-fill', function(e) {
      setPointerCursor(true);
      if (e.features.length > 0) map.setFilter('landcovers-highlight', ['==', ['get', 'objectid'], e.features[0].properties.objectid]);
    });
    map.on('mouseleave', 'landcovers-fill', function() {
      setPointerCursor(false);
      map.setFilter('landcovers-highlight', ['==', ['get', 'objectid'], -1]);
    });
    map.on('click', 'landcovers-fill', function(e) {
      if (isMeasuring()) return;
      if (queryAround(e.point, ['buildings-points', 'buildings-clusters']).length > 0) return;
      selectLandCover(e.features[0].properties.objectid);
    });
  }

  // Click on the map (not on a feature): deselect, then identify features of the external layers
  map.on('click', function(e) {
    if (isMeasuring()) return; // the measure tool owns map clicks
    const layers = ['buildings-clusters', 'buildings-points', 'parcels-fill', 'landcovers-fill'].filter(function(l) { return map.getLayer(l); });
    const hits = map.queryRenderedFeatures(e.point, { layers: layers });
    if (hits.length > 0) {
      clearIdentifyHighlight(); // a portfolio feature was selected
      return;
    }
    clearSelection();
    if (hasActiveSwisstopoLayers()) identifySwisstopoFeatures(e.lngLat);
  });
}

// ===== URL SELECTION RESTORE (first load only) =====

let urlSelectionRestored = false;
// Captured at module load: the view restore may rewrite the URL before the map has loaded
const initialUrlParams = new URLSearchParams(window.location.search);

function restoreSelectionFromUrl() {
  if (urlSelectionRestored) return;
  urlSelectionRestored = true;
  const urlParams = initialUrlParams;
  const urlBuildingId = urlParams.get('id');
  const urlParcelId = urlParams.get('parcelId');
  const urlLandCoverId = urlParams.get('landCoverId');
  if (urlBuildingId) {
    if (state.buildingIndex.has(urlBuildingId)) selectBuilding(urlBuildingId, true);
  } else if (urlParcelId) {
    if (state.parcelIndex.has(urlParcelId)) selectParcel(urlParcelId, true);
  } else if (urlLandCoverId) {
    const lcId = parseInt(urlLandCoverId, 10);
    if (state.landCoverIndex.has(lcId)) selectLandCover(lcId, true);
  }
}

// ===== SELECTION =====

function infoRow(labelKey, valueHtml, secondary) {
  return '<div class="info-row' + (secondary ? ' info-row-secondary' : '') + '"><span class="info-label">' + t(labelKey) + '</span><span class="info-value">' + valueHtml + '</span></div>';
}

function showInfoPanel(titleKey, bodyHtml, previewImageUrl) {
  document.getElementById('info-header-title').textContent = t(titleKey);
  const panel = document.getElementById('info-panel');
  const preview = document.getElementById('info-preview-image');
  // A class (not an inline display) so the stylesheet can still hide the image on short viewports
  panel.classList.toggle('has-preview', !!previewImageUrl);
  if (preview && previewImageUrl) preview.style.backgroundImage = cssUrl(previewImageUrl);
  document.getElementById('info-body').innerHTML = bodyHtml;
  panel.classList.add('show');
}

function hideInfoPanel() {
  document.getElementById('info-panel').classList.remove('show');
}

function setSelection(buildingId, parcelId, landCoverId) {
  state.selectedBuildingId = buildingId;
  state.selectedParcelId = parcelId;
  state.selectedLandCoverId = landCoverId;
  updateSelectedBuilding();
  updateSelectedParcel();
  updateSelectedLandCover();
  updateUrlWithSelection();
  renderLocationTree();
}

export function clearSelection() {
  setSelection(null, null, null);
  hideInfoPanel();
}

export function selectBuilding(buildingId, flyToBuilding) {
  const building = state.buildingIndex.get(buildingId);
  if (!building) return;
  const props = building.properties;
  setSelection(buildingId, null, null);

  const images = props.img_url || [];
  const html =
    infoRow('info.label.id', escapeHtml(props.bbl_id)) +
    infoRow('info.label.name', escapeHtml(props.bbl_bez)) +
    infoRow('info.label.location', escapeHtml(props.adr_ort) + ', ' + escapeHtml(props.adr_land)) +
    infoRow('info.label.address', escapeHtml(props.adr_conct), true) +
    infoRow('info.label.area_ngf', formatNum(props.garea_ngf || 0, 0) + ' m²', true) +
    infoRow('info.label.year', escapeHtml(props.bbl_bjahr || '—'), true) +
    infoRow('info.label.responsible', escapeHtml(props.bbl_ovtw || '—'), true) +
    infoRow('info.label.status', '<span class="badge status-badge ' + getStatusClassName(props.bbl_stat) + '">' + escapeHtml(props.bbl_stat) + '</span>') +
    '<div class="info-footer">' +
      '<button type="button" class="info-detail-link" data-action="showDetailView" data-id="' + escapeHtml(props.bbl_id) + '">' +
        '<span class="material-symbols-outlined">open_in_new</span>' + t('info.details') +
      '</button>' +
    '</div>';
  showInfoPanel('info.title.building', html, images[0] || placeholderImages[0]);

  syncTableToBuilding(buildingId);

  if (flyToBuilding) {
    smartFlyTo(state.map, { center: building.geometry.coordinates, zoom: 16 });
  } else if (building.geometry && building.geometry.coordinates) {
    revealSelectionOnMobile(state.map, building.geometry.coordinates);
  }
}

export function selectParcel(parcelId, flyToParcel) {
  const parcel = state.parcelIndex.get(parcelId);
  if (!parcel) return;
  const props = parcel.properties;
  setSelection(null, parcelId, null);

  const html =
    infoRow('info.label.id', escapeHtml(props.bbl_id || '—')) +
    infoRow('info.label.name', escapeHtml(props.bbl_bez || '—')) +
    infoRow('info.label.location', escapeHtml(props.bfs_gem || props.adr_ort || '—') + ', ' + escapeHtml(props.adr_reg || '—')) +
    infoRow('info.label.plot', escapeHtml(props.av_nr || '—'), true) +
    infoRow('info.label.area', formatNum(props.larea_gsf || 0, 0) + ' m²', true) +
    infoRow('info.label.zone', escapeHtml(props.av_zbez || '—'), true) +
    infoRow('info.label.ownership', escapeHtml(props.bbl_eigen || '—'), true);
  showInfoPanel('info.title.parcel', html, null);

  syncTableToParcel(parcelId);

  if (parcel.geometry && parcel.geometry.coordinates) {
    const center = getPolygonCentroid(parcel.geometry.coordinates);
    if (flyToParcel) smartFlyTo(state.map, { center: center, zoom: 16 });
    else revealSelectionOnMobile(state.map, center);
  }
}

export function selectLandCover(objectid, flyToLandCover) {
  const lc = state.landCoverIndex.get(objectid);
  if (!lc) return;
  const props = lc.properties;
  setSelection(null, null, objectid);

  const html =
    infoRow('info.label.parcel_id', escapeHtml(props.bbl_id)) +
    infoRow('info.label.type', escapeHtml(props.av_type || '—')) +
    infoRow('info.label.area', props.lc_area != null ? formatNum(props.lc_area, 0) + ' m²' : '—') +
    (props.geb_id ? infoRow('info.label.building_id', escapeHtml(props.geb_id), true) : '') +
    (props.av_egid ? '<div class="info-row info-row-secondary"><span class="info-label">EGID</span><span class="info-value">' + escapeHtml(props.av_egid) + '</span></div>' : '') +
    '<div class="info-row info-row-secondary"><span class="info-label">EGRID</span><span class="info-value">' + escapeHtml(props.av_egrid || '—') + '</span></div>' +
    '<div class="info-row info-row-secondary"><span class="info-label">AV Status</span><span class="info-value">' + escapeHtml(props.av_stat || '—') + '</span></div>';
  showInfoPanel('info.title.landcover', html, null);

  syncTableToLandCover(objectid);

  if (lc.geometry && lc.geometry.coordinates) {
    const center = getPolygonCentroid(lc.geometry.coordinates);
    if (flyToLandCover) smartFlyTo(state.map, { center: center, zoom: 17 });
    else revealSelectionOnMobile(state.map, center);
  }
}

// Selection highlight layers (cluster-aware filters for buildings)
export function updateSelectedBuilding() {
  const map = state.map;
  const id = state.selectedBuildingId || '';
  ['buildings-selected', 'buildings-selected-pulse'].forEach(function(layer) {
    if (map && map.getLayer(layer)) map.setFilter(layer, ['all', ['!', ['has', 'point_count']], ['==', ['get', 'bbl_id'], id]]);
  });
  if (state.selectedBuildingId) startPulseAnimation(); else stopPulseAnimation();
}

export function updateSelectedParcel() {
  const map = state.map;
  const id = state.selectedParcelId || '';
  ['parcels-selected', 'parcels-selected-outline'].forEach(function(layer) {
    if (map && map.getLayer(layer)) map.setFilter(layer, ['==', ['get', 'bbl_id'], id]);
  });
}

export function updateSelectedLandCover() {
  const map = state.map;
  const id = state.selectedLandCoverId != null ? state.selectedLandCoverId : -1;
  ['landcovers-selected', 'landcovers-selected-outline'].forEach(function(layer) {
    if (map && map.getLayer(layer)) map.setFilter(layer, ['==', ['get', 'objectid'], id]);
  });
}

export function updateUrlWithSelection() {
  const url = new URL(window.location);
  if (state.selectedBuildingId) url.searchParams.set('id', state.selectedBuildingId); else url.searchParams.delete('id');
  if (state.selectedParcelId) url.searchParams.set('parcelId', state.selectedParcelId); else url.searchParams.delete('parcelId');
  if (state.selectedLandCoverId != null) url.searchParams.set('landCoverId', state.selectedLandCoverId); else url.searchParams.delete('landCoverId');
  window.history.replaceState({}, '', url);
}

// Zoom to the selected object (info panel button)
export function zoomToSelection() {
  if (state.selectedBuildingId) {
    const building = state.buildingIndex.get(state.selectedBuildingId);
    if (building && building.geometry) smartFlyTo(state.map, { center: building.geometry.coordinates, zoom: 16 });
  } else if (state.selectedParcelId) {
    const parcel = state.parcelIndex.get(state.selectedParcelId);
    if (parcel && parcel.geometry) smartFlyTo(state.map, { center: getPolygonCentroid(parcel.geometry.coordinates), zoom: 16 });
  } else if (state.selectedLandCoverId != null) {
    const lc = state.landCoverIndex.get(state.selectedLandCoverId);
    if (lc && lc.geometry) smartFlyTo(state.map, { center: getPolygonCentroid(lc.geometry.coordinates), zoom: 17 });
  }
}

// ===== RESTORE AFTER A BASEMAP CHANGE =====
// setStyle() drops every custom source and layer: re-add the data layers (without re-zooming to
// active filters or the selected object), the selection highlight, 3D buildings and external layers.
function restoreLayers() {
  if (state.buildingsData) {
    state.skipFilterZoom = true;
    try {
      addMapLayers();
    } finally {
      state.skipFilterZoom = false;
    }
    updateSelectedBuilding();
    updateSelectedParcel();
    updateSelectedLandCover();
  }
  if (is3DActive()) show3DBuildings(state.map);
  readdSwisstopoLayers();
  restoreMeasurement();
}
