import { state } from './state.js';
import { showToast } from './ui.js';

// ===== MEASURE DISTANCE FEATURE (Google Maps Style) =====

// Haversine formula to calculate distance between two points
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculate polygon area using Shoelace formula (in square meters)
function calculatePolygonArea(points) {
  if (points.length < 3) return 0;

  const n = points.length;
  let area = 0;

  // Convert to approximate meters (at the centroid latitude)
  const avgLat = points.reduce(function(sum, p) { return sum + p[1]; }, 0) / n;
  const latScale = 111320; // meters per degree latitude
  const lonScale = 111320 * Math.cos(avgLat * Math.PI / 180); // meters per degree longitude

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = points[i][0] * lonScale;
    const yi = points[i][1] * latScale;
    const xj = points[j][0] * lonScale;
    const yj = points[j][1] * latScale;
    area += xi * yj;
    area -= xj * yi;
  }

  return Math.abs(area / 2);
}

// Format distance for display
function formatDistance(meters) {
  if (meters >= 1000) {
    return (meters / 1000).toFixed(2) + ' km';
  }
  return Math.round(meters) + ' m';
}

// Format area for map measurement tool display
function formatMeasureArea(sqMeters) {
  if (sqMeters >= 1000000) {
    return (sqMeters / 1000000).toFixed(2) + ' km\u00B2';
  } else if (sqMeters >= 10000) {
    return (sqMeters / 10000).toFixed(2) + ' ha';
  }
  return Math.round(sqMeters) + ' m\u00B2';
}

// Create a marker element for measurement points
function createMeasureMarkerElement() {
  const el = document.createElement('div');
  el.className = 'measure-marker';
  return el;
}

// Create a label element for distance display on segments
function createDistanceLabel(distance) {
  const el = document.createElement('div');
  el.className = 'measure-label';
  el.textContent = formatDistance(distance);
  return el;
}

// Add a point to the measurement polyline
function addMeasurePoint(lngLat, index) {
  const measureState = state.measureState;
  const map = state.map;
  const point = [lngLat.lng, lngLat.lat];

  if (index === undefined) {
    measureState.points.push(point);
    index = measureState.points.length - 1;
  } else {
    measureState.points[index] = point;
  }

  // Create marker if new point
  if (index >= measureState.markers.length) {
    const markerEl = createMeasureMarkerElement();
    const marker = new maplibregl.Marker({
      element: markerEl,
      draggable: true,
      anchor: 'center'
    })
    .setLngLat(point)
    .addTo(map);

    // Store index on marker for reference
    marker._measureIndex = index;

    // Drag event to update point position
    marker.on('drag', function() {
      const newLngLat = marker.getLngLat();
      measureState.points[marker._measureIndex] = [newLngLat.lng, newLngLat.lat];
      updateMeasureLine();
      updateMeasureLabels();
      updateMeasureDisplay();
    });

    // Click on marker: close polygon if first point, delete otherwise
    markerEl.addEventListener('click', function(e) {
      e.stopPropagation();
      const clickedIndex = marker._measureIndex;

      // If clicking on first point with 3+ points, close polygon
      if (clickedIndex === 0 && measureState.points.length >= 3 && !measureState.isClosed) {
        measureState.isClosed = true;
        updateMeasureLine();
        updateMeasureLabels();
        updateMeasureDisplay();
        return;
      }

      // Otherwise delete the point
      removeMeasurePoint(clickedIndex);
    });

    measureState.markers.push(marker);
  } else {
    measureState.markers[index].setLngLat(point);
  }

  updateMeasureLine();
  updateMeasureLabels();
  updateMeasureDisplay();
}

// Remove a point from the measurement polyline
function removeMeasurePoint(index) {
  const measureState = state.measureState;

  if (measureState.points.length <= 1) {
    clearMeasurement();
    return;
  }

  // Remove point
  measureState.points.splice(index, 1);

  // Remove marker
  measureState.markers[index].remove();
  measureState.markers.splice(index, 1);

  // Update marker indices
  measureState.markers.forEach(function(m, i) {
    m._measureIndex = i;
  });

  // Check if polygon was closed and now isn't
  if (measureState.isClosed && measureState.points.length < 3) {
    measureState.isClosed = false;
  }

  updateMeasureLine();
  updateMeasureLabels();
  updateMeasureDisplay();
}

// Update the measurement line on the map
function updateMeasureLine() {
  const measureState = state.measureState;
  const map = state.map;
  const coordinates = measureState.points.slice();

  // Close polygon if needed
  if (measureState.isClosed && coordinates.length >= 3) {
    coordinates.push(coordinates[0]);
  }

  const geojsonData = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: coordinates.length >= 2 ? coordinates : [[0, 0], [0, 0]]
    }
  };

  const source = map.getSource(measureState.lineSourceId);
  if (source) {
    // Update data in-place — much cheaper than remove/add
    if (coordinates.length < 2) {
      // Hide by setting empty geometry
      map.setLayoutProperty(measureState.lineLayerId, 'visibility', 'none');
    } else {
      map.setLayoutProperty(measureState.lineLayerId, 'visibility', 'visible');
      source.setData(geojsonData);
    }
  } else {
    // First time: create source + layer
    if (coordinates.length < 2) return;

    map.addSource(measureState.lineSourceId, {
      type: 'geojson',
      data: geojsonData
    });

    map.addLayer({
      id: measureState.lineLayerId,
      type: 'line',
      source: measureState.lineSourceId,
      paint: {
        'line-color': '#000000',
        'line-width': 2
      }
    });
  }
}

// Update distance labels on segments
function updateMeasureLabels() {
  const measureState = state.measureState;
  const map = state.map;

  // Remove existing labels
  measureState.labelMarkers.forEach(function(m) { m.remove(); });
  measureState.labelMarkers = [];

  const points = measureState.points;
  if (points.length < 2) return;

  // Add label for each segment
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const distance = haversineDistance(p1[1], p1[0], p2[1], p2[0]);

    // Midpoint of segment
    const midLng = (p1[0] + p2[0]) / 2;
    const midLat = (p1[1] + p2[1]) / 2;

    const labelEl = createDistanceLabel(distance);
    const labelMarker = new maplibregl.Marker({
      element: labelEl,
      anchor: 'center'
    })
    .setLngLat([midLng, midLat])
    .addTo(map);

    measureState.labelMarkers.push(labelMarker);
  }

  // Add label for closing segment if polygon
  if (measureState.isClosed && points.length >= 3) {
    const pLast = points[points.length - 1];
    const pFirst = points[0];
    const closingDistance = haversineDistance(pLast[1], pLast[0], pFirst[1], pFirst[0]);

    const closingMidLng = (pLast[0] + pFirst[0]) / 2;
    const closingMidLat = (pLast[1] + pFirst[1]) / 2;

    const closingLabelEl = createDistanceLabel(closingDistance);
    const closingLabelMarker = new maplibregl.Marker({
      element: closingLabelEl,
      anchor: 'center'
    })
    .setLngLat([closingMidLng, closingMidLat])
    .addTo(map);

    measureState.labelMarkers.push(closingLabelMarker);
  }
}

// Update the measurement display panel
function updateMeasureDisplay() {
  const measureState = state.measureState;
  const measureTotalDistance = document.getElementById('measure-total-distance');
  const measureTotalArea = document.getElementById('measure-total-area');
  const measureAreaRow = document.getElementById('measure-area-row');
  const points = measureState.points;
  let totalDistance = 0;

  // Calculate total distance
  for (let i = 0; i < points.length - 1; i++) {
    totalDistance += haversineDistance(
      points[i][1], points[i][0],
      points[i + 1][1], points[i + 1][0]
    );
  }

  // Add closing distance if polygon
  if (measureState.isClosed && points.length >= 3) {
    totalDistance += haversineDistance(
      points[points.length - 1][1], points[points.length - 1][0],
      points[0][1], points[0][0]
    );
  }

  measureTotalDistance.textContent = formatDistance(totalDistance);

  // Calculate and show area if polygon
  if (measureState.isClosed && points.length >= 3) {
    const area = calculatePolygonArea(points);
    measureTotalArea.textContent = formatMeasureArea(area);
    measureAreaRow.style.display = 'flex';
  } else {
    measureAreaRow.style.display = 'none';
  }
}

// Check if a click is near the first point (to close polygon)
function isNearFirstPoint(lngLat) {
  const measureState = state.measureState;
  const map = state.map;

  if (measureState.points.length < 3) return false;

  const firstPoint = measureState.points[0];
  const distance = haversineDistance(lngLat.lat, lngLat.lng, firstPoint[1], firstPoint[0]);

  // Within visible pixel distance
  const pixelDistance = map.project(lngLat).dist(map.project({ lng: firstPoint[0], lat: firstPoint[1] }));

  return pixelDistance < 15;
}

// Start measurement mode
function startMeasurement() {
  const measureState = state.measureState;
  const map = state.map;
  const measureDistanceDisplay = document.getElementById('measure-distance-display');
  const measureTotalDistance = document.getElementById('measure-total-distance');
  const measureAreaRow = document.getElementById('measure-area-row');

  measureState.active = true;
  measureState.points = [];
  measureState.markers = [];
  measureState.labelMarkers = [];
  measureState.isClosed = false;

  measureDistanceDisplay.classList.add('show');
  measureTotalDistance.textContent = '0 m';
  measureAreaRow.style.display = 'none';

  map.getCanvas().style.cursor = 'crosshair';
}

// Clear all measurement
function clearMeasurement() {
  const measureState = state.measureState;
  const map = state.map;
  const measureDistanceDisplay = document.getElementById('measure-distance-display');

  measureState.active = false;
  measureState.isClosed = false;

  // Remove all markers
  measureState.markers.forEach(function(m) { m.remove(); });
  measureState.markers = [];

  // Remove all labels
  measureState.labelMarkers.forEach(function(m) { m.remove(); });
  measureState.labelMarkers = [];

  // Clear points
  measureState.points = [];

  // Remove line layer
  if (map.getLayer(measureState.lineLayerId)) {
    map.removeLayer(measureState.lineLayerId);
  }
  if (map.getSource(measureState.lineSourceId)) {
    map.removeSource(measureState.lineSourceId);
  }

  measureDistanceDisplay.classList.remove('show');
  map.getCanvas().style.cursor = '';
}

// Initialize measurement: set up map click handler and UI bindings
function initMeasure() {
  const map = state.map;
  const measureDistanceClose = document.getElementById('measure-distance-close');
  const contextMenuMeasure = document.getElementById('context-menu-measure');

  // Context menu - toggle measurement (start or clear)
  contextMenuMeasure.addEventListener('click', function() {
    // Hide context menu via DOM directly (avoids circular import)
    const contextMenu = document.getElementById('map-context-menu');
    if (contextMenu) contextMenu.classList.remove('show');

    if (state.measureState.active) {
      clearMeasurement();
    } else {
      startMeasurement();
    }
  });

  // Close button on measurement display
  measureDistanceClose.addEventListener('click', function() {
    clearMeasurement();
  });

  // Map click handler for measurement mode
  map.on('click', function(e) {
    // Hide context menu via DOM directly
    const contextMenu = document.getElementById('map-context-menu');
    if (contextMenu) contextMenu.classList.remove('show');

    if (!state.measureState.active) return;

    // Check if clicking near first point to close polygon
    if (isNearFirstPoint(e.lngLat) && !state.measureState.isClosed) {
      state.measureState.isClosed = true;
      updateMeasureLine();
      updateMeasureLabels();
      updateMeasureDisplay();
      return;
    }

    // Don't add points if polygon is already closed
    if (state.measureState.isClosed) return;

    // Add new point
    addMeasurePoint(e.lngLat);
  });
}

export {
  initMeasure,
  startMeasurement,
  clearMeasurement,
  haversineDistance,
  calculatePolygonArea,
  formatDistance,
  formatMeasureArea
};
