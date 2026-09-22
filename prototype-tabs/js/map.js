import { addParcelLayers, addBuildingLayers, addBuildingLabels } from './portfolio-map-layers.js';
import { bindPortfolioInteractions } from './portfolio-map-interactions.js';
import { addParcelLabels, parcelLabelPoint, addBuildingLabelObstacles, updateBuildingLabelObstacles } from './parcel-labels.js';
// Map: data layers (buildings, parcels), selection and the restore after a basemap change.
// Map creation, controls, style switcher, context menu and measure tool are common modules.

import { state } from './state.js';
import { statusColors, getStatusClassName, placeholderImages, parcelColor, internalLayerIds } from './config.js';
import { escapeHtml, cssUrl, formatNum, extractYear } from './utils.js';
import { t } from './i18n.js';
import { getMapStyleUrl, getMapStyleOptions, initStyleSwitcher } from './basemaps.js';
import { createMap, addStandardControls, bindMapUrlSync, bindCoordinateDisplay, initMapStatusIndicators, smartFlyTo, revealSelectionOnMobile, is3DActive, show3DBuildings } from './map-controls.js';
import { isMeasuring, restoreMeasurement } from './measure.js';
import { identifySwisstopoFeatures, clearIdentifyHighlight, initIdentifyHighlightLayer, loadLayersFromUrl, readdSwisstopoLayers, hasActiveSwisstopoLayers } from './swisstopo.js';
import { getActiveFilterCount, updateMapFilter } from './filters.js';
import { renderLocationTree, syncCountryHighlight } from './location-tree.js';
import { syncTableToBuilding, syncTableToParcel } from './list.js';

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

export function addMapLayers() {
  if (!state.buildingsData) return;
  const map = state.map;
  if (map.getSource('buildings')) return; // already added

  if (state.parcelData && state.parcelData.features) addParcelLayers(map, state.parcelData, 'parcelId', parcelColor);
  addBuildingLayers(map, state.buildingsData, 'buildingId', 'status', statusColors);
  if (state.parcelData?.features) addParcelLabels(map, state.parcelData, 'parcelId');
  addBuildingLabels(map, 'buildingId');
  addBuildingLabelObstacles(map);
  updateBuildingLabelObstacles(map, 'buildingId', state.selectedBuildingId);

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
function bindMapInteractions() {
  bindPortfolioInteractions(state.map, {
    buildingId: 'buildingId', parcelId: 'parcelId',
    isMeasuring, isActive: () => state.currentView === 'map',
    flyTo: options => smartFlyTo(state.map, options),
    selectBuilding, selectParcel,
    clearSelection, clearIdentify: clearIdentifyHighlight,
    identify: position => { if (hasActiveSwisstopoLayers()) identifySwisstopoFeatures(position); }
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
  if (urlBuildingId) {
    if (state.buildingIndex.has(urlBuildingId)) selectBuilding(urlBuildingId, true);
  } else if (urlParcelId) {
    if (state.parcelIndex.has(urlParcelId)) selectParcel(urlParcelId, true);
  }
}

// ===== SELECTION =====

function infoRow(labelKey, valueHtml, secondary) {
  return '<div class="info-row' + (secondary ? ' info-row-secondary' : '') + '"><span class="info-label" title="' + escapeHtml(t(labelKey)) + '">' + escapeHtml(t(labelKey)) + '</span><span class="info-value">' + valueHtml + '</span></div>';
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

function setSelection(buildingId, parcelId) {
  clearIdentifyHighlight();
  state.selectedBuildingId = buildingId;
  state.selectedParcelId = parcelId;
  updateSelectedBuilding();
  updateSelectedParcel();
  updateUrlWithSelection();
  renderLocationTree();
}

export function clearSelection() {
  setSelection(null, null);
  hideInfoPanel();
}

export function selectBuilding(buildingId, flyToBuilding) {
  const building = state.buildingIndex.get(buildingId);
  if (!building) return;
  const props = building.properties;
  const ext = props.extensionData || {};
  setSelection(buildingId, null);

  // Use the same researched photograph as the gallery and detail view.
  const photos = (props.extensionData || {}).photos || [];
  const imageUrl = photos.length ? photos[0].url : placeholderImages[0];

  const html =
    infoRow('info.label.id', escapeHtml(props.buildingId)) +
    infoRow('info.label.name', escapeHtml(props.name)) +
    infoRow('info.label.location', escapeHtml(props.city) + ', ' + escapeHtml(props.country)) +
    infoRow('info.label.address', escapeHtml(props.streetName), true) +
    infoRow('info.label.area_ngf', formatNum(ext.netFloorArea || 0, 0) + ' m²', true) +
    infoRow('info.label.year', escapeHtml(extractYear(props.constructionYear) || '—'), true) +
    infoRow('info.label.responsible', escapeHtml(ext.responsiblePerson || '—'), true) +
    infoRow('info.label.status', '<span class="badge status-badge ' + getStatusClassName(props.status) + '">' + escapeHtml(props.status) + '</span>') +
    '<div class="info-footer">' +
      '<button type="button" class="info-detail-link" data-action="showDetailView" data-id="' + escapeHtml(props.buildingId) + '">' +
        '<span class="material-symbols-outlined">open_in_new</span>' + t('info.details') +
      '</button>' +
    '</div>';
  showInfoPanel('info.title.building', html, imageUrl);
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
  setSelection(null, parcelId);

  const html =
    infoRow('info.label.id', escapeHtml(props.parcelId || '—')) +
    infoRow('info.label.name', escapeHtml(props.name || '—')) +
    infoRow('info.label.location', escapeHtml(props.municipality || '—') + ', ' + escapeHtml(props.canton || '—')) +
    infoRow('info.label.plot', escapeHtml(props.plotNumber || '—'), true) +
    infoRow('info.label.area', formatNum(props.area || 0, 0) + ' m²', true) +
    infoRow('info.label.zone', escapeHtml(props.landUseZone || '—'), true) +
    infoRow('info.label.ownership', escapeHtml(props.ownershipType || '—'), true);
  showInfoPanel('info.title.parcel', html, null);
  syncTableToParcel(parcelId);

  if (parcel.geometry && parcel.geometry.coordinates) {
    const center = parcelLabelPoint(parcel.geometry);
    if (!center) return;
    if (flyToParcel) smartFlyTo(state.map, { center: center, zoom: 16 });
    else revealSelectionOnMobile(state.map, center);
  }
}

// Selection highlight layers (cluster-aware filters for buildings)
export function updateSelectedBuilding() {
  const map = state.map;
  updateBuildingLabelObstacles(map, 'buildingId', state.selectedBuildingId);
  const id = state.selectedBuildingId || '';
  ['buildings-selected', 'buildings-selected-pulse'].forEach(function(layer) {
    if (map && map.getLayer(layer)) map.setFilter(layer, ['all', ['!', ['has', 'point_count']], ['==', ['get', 'buildingId'], id]]);
  });
  if (state.selectedBuildingId) startPulseAnimation(); else stopPulseAnimation();
}

export function updateSelectedParcel() {
  const map = state.map;
  const id = state.selectedParcelId || '';
  ['parcels-selected', 'parcels-selected-outline'].forEach(function(layer) {
    if (map && map.getLayer(layer)) map.setFilter(layer, ['==', ['get', 'parcelId'], id]);
  });
}

export function updateUrlWithSelection() {
  const url = new URL(window.location);
  if (state.selectedBuildingId) url.searchParams.set('id', state.selectedBuildingId); else url.searchParams.delete('id');
  if (state.selectedParcelId) url.searchParams.set('parcelId', state.selectedParcelId); else url.searchParams.delete('parcelId');
  window.history.replaceState({}, '', url);
}

// Zoom to the selected object (info panel button)
export function zoomToSelection() {
  if (state.selectedBuildingId) {
    const building = state.buildingIndex.get(state.selectedBuildingId);
    if (building && building.geometry) smartFlyTo(state.map, { center: building.geometry.coordinates, zoom: 16 });
  } else if (state.selectedParcelId) {
    const parcel = state.parcelIndex.get(state.selectedParcelId);
    if (parcelLabelPoint(parcel?.geometry)) smartFlyTo(state.map, { center: parcelLabelPoint(parcel.geometry), zoom: 16 });
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
  }
  if (is3DActive()) show3DBuildings(state.map);
  readdSwisstopoLayers();
  restoreMeasurement();
}
