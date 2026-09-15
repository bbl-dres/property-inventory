// Measure tool (shared): Google-Maps-style multi-point polyline with distances and, once the
// polygon is closed, an area. Needs the #measure-distance-display markup and the map.

import { haversineDistance, calculatePolygonArea, formatDistance, formatMeasureArea } from './geo.js';
import { onEscape } from './keys.js';

let map = null;

const measureState = {
  active: false,
  points: [],           // [lng, lat]
  markers: [],          // MapLibre markers
  labelMarkers: [],     // label markers for the segment distances
  lineSourceId: 'measure-line-source',
  lineLayerId: 'measure-line',
  isClosed: false
};

export function isMeasuring() {
  return measureState.active;
}

function createMeasureMarkerElement() {
  const el = document.createElement('div');
  el.className = 'measure-marker';
  return el;
}

function createDistanceLabel(distance) {
  const el = document.createElement('div');
  el.className = 'measure-label';
  el.textContent = formatDistance(distance);
  return el;
}

function refresh() {
  updateMeasureLine();
  updateMeasureLabels();
  updateMeasureDisplay();
}

function addMeasurePoint(lngLat, index) {
  const point = [lngLat.lng, lngLat.lat];

  if (index === undefined) {
    measureState.points.push(point);
    index = measureState.points.length - 1;
  } else {
    measureState.points[index] = point;
  }

  if (index >= measureState.markers.length) {
    const markerEl = createMeasureMarkerElement();
    const marker = new maplibregl.Marker({ element: markerEl, draggable: true, anchor: 'center' })
      .setLngLat(point)
      .addTo(map);
    marker._measureIndex = index;

    marker.on('drag', function() {
      const newLngLat = marker.getLngLat();
      measureState.points[marker._measureIndex] = [newLngLat.lng, newLngLat.lat];
      refresh();
    });

    // Click on a marker: close the polygon if it is the first point, delete the point otherwise
    markerEl.addEventListener('click', function(e) {
      e.stopPropagation();
      const clickedIndex = marker._measureIndex;
      if (clickedIndex === 0 && measureState.points.length >= 3 && !measureState.isClosed) {
        measureState.isClosed = true;
        refresh();
        return;
      }
      removeMeasurePoint(clickedIndex);
    });

    measureState.markers.push(marker);
  } else {
    measureState.markers[index].setLngLat(point);
  }

  refresh();
}

function removeMeasurePoint(index) {
  if (measureState.points.length <= 1) {
    clearMeasurement();
    return;
  }
  measureState.points.splice(index, 1);
  measureState.markers[index].remove();
  measureState.markers.splice(index, 1);
  measureState.markers.forEach(function(m, i) { m._measureIndex = i; });
  if (measureState.isClosed && measureState.points.length < 3) measureState.isClosed = false;
  refresh();
}

function updateMeasureLine() {
  const coordinates = measureState.points.slice();
  if (measureState.isClosed && coordinates.length >= 3) coordinates.push(coordinates[0]);

  const geojsonData = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coordinates.length >= 2 ? coordinates : [[0, 0], [0, 0]] }
  };

  const source = map.getSource(measureState.lineSourceId);
  if (source) {
    // Update the data in place: much cheaper than remove/add
    if (coordinates.length < 2) {
      map.setLayoutProperty(measureState.lineLayerId, 'visibility', 'none');
    } else {
      map.setLayoutProperty(measureState.lineLayerId, 'visibility', 'visible');
      source.setData(geojsonData);
    }
    return;
  }
  if (coordinates.length < 2) return;
  map.addSource(measureState.lineSourceId, { type: 'geojson', data: geojsonData });
  map.addLayer({
    id: measureState.lineLayerId,
    type: 'line',
    source: measureState.lineSourceId,
    paint: { 'line-color': '#000000', 'line-width': 2 }
  });
}

function addSegmentLabel(p1, p2) {
  const distance = haversineDistance(p1[1], p1[0], p2[1], p2[0]);
  const labelMarker = new maplibregl.Marker({ element: createDistanceLabel(distance), anchor: 'center' })
    .setLngLat([(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2])
    .addTo(map);
  measureState.labelMarkers.push(labelMarker);
}

function updateMeasureLabels() {
  measureState.labelMarkers.forEach(function(m) { m.remove(); });
  measureState.labelMarkers = [];
  const points = measureState.points;
  if (points.length < 2) return;
  for (let i = 0; i < points.length - 1; i++) addSegmentLabel(points[i], points[i + 1]);
  if (measureState.isClosed && points.length >= 3) addSegmentLabel(points[points.length - 1], points[0]);
}

function totalDistance() {
  const points = measureState.points;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineDistance(points[i][1], points[i][0], points[i + 1][1], points[i + 1][0]);
  }
  if (measureState.isClosed && points.length >= 3) {
    total += haversineDistance(points[points.length - 1][1], points[points.length - 1][0], points[0][1], points[0][0]);
  }
  return total;
}

function updateMeasureDisplay() {
  const totalEl = document.getElementById('measure-total-distance');
  const areaEl = document.getElementById('measure-total-area');
  const areaRow = document.getElementById('measure-area-row');
  if (totalEl) totalEl.textContent = formatDistance(totalDistance());
  const closed = measureState.isClosed && measureState.points.length >= 3;
  if (closed && areaEl) areaEl.textContent = formatMeasureArea(calculatePolygonArea(measureState.points));
  if (areaRow) areaRow.style.display = closed ? 'flex' : 'none';
}

// Clicking within 15 px of the first point closes the polygon
function isNearFirstPoint(lngLat) {
  if (measureState.points.length < 3) return false;
  const firstPoint = measureState.points[0];
  const pixelDistance = map.project(lngLat).dist(map.project({ lng: firstPoint[0], lat: firstPoint[1] }));
  return pixelDistance < 15;
}

export function startMeasurement() {
  measureState.active = true;
  measureState.points = [];
  measureState.markers = [];
  measureState.labelMarkers = [];
  measureState.isClosed = false;

  const display = document.getElementById('measure-distance-display');
  if (display) display.classList.add('show');
  updateMeasureDisplay();
  map.getCanvas().style.cursor = 'crosshair';
}

export function clearMeasurement() {
  measureState.active = false;
  measureState.isClosed = false;
  measureState.markers.forEach(function(m) { m.remove(); });
  measureState.markers = [];
  measureState.labelMarkers.forEach(function(m) { m.remove(); });
  measureState.labelMarkers = [];
  measureState.points = [];

  if (map.getLayer(measureState.lineLayerId)) map.removeLayer(measureState.lineLayerId);
  if (map.getSource(measureState.lineSourceId)) map.removeSource(measureState.lineSourceId);

  const display = document.getElementById('measure-distance-display');
  if (display) display.classList.remove('show');
  map.getCanvas().style.cursor = '';
}

export function toggleMeasurement() {
  if (measureState.active) clearMeasurement(); else startMeasurement();
}

// Binds the close button and the map click handler. Selection handlers of the application must
// return early while isMeasuring() so a click adds a point instead of selecting an object.
export function initMeasure(mapInstance) {
  map = mapInstance;

  const closeBtn = document.getElementById('measure-distance-close');
  if (closeBtn) closeBtn.addEventListener('click', clearMeasurement);

  // Escape ends the measurement (after the context menu, before search and panels)
  onEscape(function() {
    if (!measureState.active) return false;
    clearMeasurement();
    return true;
  }, 70);

  map.on('click', function(e) {
    if (!measureState.active) return;
    if (isNearFirstPoint(e.lngLat) && !measureState.isClosed) {
      measureState.isClosed = true;
      refresh();
      return;
    }
    if (measureState.isClosed) return; // a closed polygon takes no further points
    addMeasurePoint(e.lngLat);
  });
}
