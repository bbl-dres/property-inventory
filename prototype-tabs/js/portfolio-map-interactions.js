// Prototype-local interaction policy; schema keys and application actions are explicit adapters.
// MapLibre retains layer listeners across style changes, so bind once per map.
const boundMaps = new WeakSet();

export function bindPortfolioInteractions(map, options) {
  if (boundMaps.has(map)) return;
  boundMaps.add(map);
  let clusterRequest = 0;
  map.on('movestart', () => { clusterRequest++; });
  map.on('style.load', () => { clusterRequest++; });

  function pointer(on) {
    map.getCanvas().style.cursor = options.isMeasuring() ? 'crosshair' : on ? 'pointer' : '';
  }
  function query(point, layers, tolerance = 0) {
    const available = layers.filter(id => map.getLayer(id));
    if (!available.length) return [];
    const bounds = tolerance ? [[point.x - tolerance, point.y - tolerance], [point.x + tolerance, point.y + tolerance]] : point;
    return map.queryRenderedFeatures(bounds, { layers: available });
  }

  map.on('click', 'buildings-clusters', async event => {
    if (options.isMeasuring()) return;
    const feature = query(event.point, ['buildings-clusters'])[0];
    const source = map.getSource('buildings');
    if (!feature || !source) return;
    const request = ++clusterRequest;
    try {
      const zoom = await source.getClusterExpansionZoom(feature.properties.cluster_id);
      if (request !== clusterRequest || map.getSource('buildings') !== source || options.isMeasuring() || !options.isActive()) return;
      options.flyTo({ center: feature.geometry.coordinates, zoom });
    } catch (error) {
      // A worker can discard a cluster while its source/style is being replaced.
      if (request === clusterRequest) console.warn('[map] cluster expansion unavailable:', error);
    }
  });
  for (const layer of ['buildings-clusters', 'buildings-points']) {
    map.on('mouseenter', layer, () => pointer(true));
    map.on('mouseleave', layer, () => pointer(false));
  }
  map.on('click', 'buildings-points', event => {
    const feature = event.features?.[0];
    if (options.isMeasuring() || !feature) return;
    clusterRequest++;
    options.selectBuilding(feature.properties[options.buildingId], false);
  });

  // Polygons: the pointer cursor is the only hover feedback. A hover fill would need a filter update on
  // every pointer move: mouseenter/mouseleave fire per layer, not per feature, so between adjacent polygons
  // (a land-cover partition) a highlight set on enter never moves on. The selection layers show the state.
  const polygons = [
    { source: 'parcels', id: options.parcelId, select: options.selectParcel, above: ['buildings-points', 'buildings-clusters', 'landcovers-fill'] },
    { source: 'landcovers', id: options.landCoverId, select: options.selectLandCover, above: ['buildings-points', 'buildings-clusters'] }
  ].filter(layer => layer.select);
  for (const layer of polygons) {
    map.on('mouseenter', layer.source + '-fill', () => pointer(true));
    map.on('mouseleave', layer.source + '-fill', () => pointer(false));
    map.on('click', layer.source + '-fill', event => {
      const feature = event.features?.[0];
      if (options.isMeasuring() || !feature || query(event.point, layer.above, 15).length) return;
      clusterRequest++;
      layer.select(feature.properties[layer.id]);
    });
  }
  map.on('click', event => {
    if (options.isMeasuring()) return;
    if (query(event.point, ['buildings-clusters', 'buildings-points', ...polygons.map(layer => layer.source + '-fill')]).length) {
      options.clearIdentify();
      return;
    }
    clusterRequest++;
    options.clearSelection();
    options.identify(event.lngLat);
  });
}
