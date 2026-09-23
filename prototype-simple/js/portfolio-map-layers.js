// Prototype-local MapLibre layer definitions. Data and schema keys are passed by each prototype.
export const MAP_LABEL_MIN_ZOOM = 15;

// Display-only expression: omit SAP Buchungskreis, retaining WE/Objekt and zeros.
export function buildingMapLabel(idProperty) {
  return ['let', 'id', ['to-string', ['get', idProperty]],
    ['slice', ['var', 'id'], ['+', ['index-of', '/', ['var', 'id']], 1]]];
}

// beforeId: ground data goes under the basemap labels and the 3D buildings (map-controls.js groundLayerAnchor)
export function addParcelLayers(map, data, idProperty, parcelColor, beforeId) {
  map.addSource('parcels', { type: 'geojson', data });
  // Parcels appear from zoom 12 and fade in until 13 (same stack as prototype-simple)
  map.addLayer({
    id: 'parcels-fill', type: 'fill', source: 'parcels', minzoom: 12,
    paint: { 'fill-color': parcelColor, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 13, 0.15] }
  }, beforeId);
  map.addLayer({
    id: 'parcels-outline', type: 'line', source: 'parcels', minzoom: 12,
    paint: { 'line-color': parcelColor, 'line-width': 2, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 13, 0.8] }
  }, beforeId);
  // Selection layers (no hover fill: the pointer cursor is the hover feedback, see portfolio-map-interactions.js)
  map.addLayer({
    id: 'parcels-selected', type: 'fill', source: 'parcels',
    filter: ['==', ['get', idProperty], ''],
    paint: { 'fill-color': parcelColor, 'fill-opacity': 0.45 }
  }, beforeId);
  map.addLayer({
    id: 'parcels-selected-outline', type: 'line', source: 'parcels',
    filter: ['==', ['get', idProperty], ''],
    paint: { 'line-color': parcelColor, 'line-width': 3, 'line-opacity': 1 }
  }, beforeId);
}

export function addBuildingLayers(map, data, idProperty, statusProperty, statusColors) {
  map.addSource('buildings', {
    type: 'geojson',
    data,
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

  const colorExpr = ['match', ['get', statusProperty]];
  Object.keys(statusColors).forEach(function(status) { colorExpr.push(status, statusColors[status]); });
  colorExpr.push('#6C757D');

  map.addLayer({
    id: 'buildings-points', type: 'circle', source: 'buildings', filter: ['!', ['has', 'point_count']],
    paint: { 'circle-radius': 10, 'circle-color': colorExpr, 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' }
  });
  map.addLayer({
    id: 'buildings-selected', type: 'circle', source: 'buildings',
    filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', idProperty], '']],
    paint: { 'circle-radius': 18, 'circle-color': 'transparent', 'circle-stroke-width': 3, 'circle-stroke-color': '#c00', 'circle-stroke-opacity': 0.9 }
  });
  map.addLayer({
    id: 'buildings-selected-pulse', type: 'circle', source: 'buildings',
    filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', idProperty], '']],
    paint: { 'circle-radius': 24, 'circle-color': 'transparent', 'circle-stroke-width': 2, 'circle-stroke-color': '#c00', 'circle-stroke-opacity': 0.4 }
  });
}

export function addBuildingLabels(map, idProperty) {
  map.addLayer({
    id: 'buildings-labels', type: 'symbol', source: 'buildings', filter: ['!', ['has', 'point_count']], minzoom: MAP_LABEL_MIN_ZOOM,
    layout: { 'text-field': buildingMapLabel(idProperty), 'text-font': ['Open Sans Bold', 'Noto Sans Bold'], 'text-size': 13,
      // Clear the marker collision box plus text padding in both selection states.
      // Keeping one offset also prevents the label jumping when its dot is selected.
      'text-max-width': 1000, 'text-anchor': 'bottom', 'text-offset': [0, -2.25],
      'text-pitch-alignment': 'viewport', 'text-rotation-alignment': 'viewport',
      'text-justify': 'auto', 'text-allow-overlap': false, 'text-ignore-placement': false, 'text-padding': 4 },
    paint: { 'text-color': '#1a1a1a', 'text-halo-color': '#ffffff', 'text-halo-width': 2 }
  });
}

