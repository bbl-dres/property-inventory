// Prototype-local print math, independent of the DOM and PDF renderer.
import { metersPerPixel } from './geo.js';

export const MAX_PRINT_TILE_SIZE = 4096;

// Offset in MapLibre world pixels; unlike a metres-per-degree approximation this
// aligns neighbouring tiles exactly, including at high latitudes.
export function offsetMapCenter(center, dx, dy, zoom) {
  const worldSize = 512 * 2 ** zoom;
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, center.lat)) * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(Math.PI / 4 + latitude / 2)) / Math.PI) / 2;
  return {
    lng: center.lng + dx / worldSize * 360,
    lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + dy / worldSize)))) * 180 / Math.PI
  };
}

export function computePrintParams(paperMM, scale, dpi, center) {
  const canvasW = Math.round(paperMM.width / 25.4 * dpi);
  const canvasH = Math.round(paperMM.height / 25.4 * dpi);
  const zoom = Math.log2(metersPerPixel(center.lat, 0) / (scale * 0.0254 / dpi));
  const needsTiling = canvasW > MAX_PRINT_TILE_SIZE || canvasH > MAX_PRINT_TILE_SIZE;
  const tiles = [];
  for (let py = 0; py < canvasH; py += MAX_PRINT_TILE_SIZE) {
    for (let px = 0; px < canvasW; px += MAX_PRINT_TILE_SIZE) {
      const width = Math.min(MAX_PRINT_TILE_SIZE, canvasW - px);
      const height = Math.min(MAX_PRINT_TILE_SIZE, canvasH - py);
      tiles.push({ px, py, width, height, center: offsetMapCenter(center, px + width / 2 - canvasW / 2, py + height / 2 - canvasH / 2, zoom) });
    }
  }
  return { canvasW, canvasH, zoom, needsTiling, tiles };
}

export function computeCornerCoords(center, zoom, width, height) {
  return {
    nw: offsetMapCenter(center, -width / 2, -height / 2, zoom),
    ne: offsetMapCenter(center, width / 2, -height / 2, zoom),
    sw: offsetMapCenter(center, -width / 2, height / 2, zoom),
    se: offsetMapCenter(center, width / 2, height / 2, zoom)
  };
}

export function createPrintStyle(style, sourceData, includeLabels) {
  const cloned = JSON.parse(JSON.stringify(style));
  for (const [id, data] of Object.entries(sourceData)) {
    if (cloned.sources[id] && data) cloned.sources[id] = { type: 'geojson', data, cluster: false };
  }
  cloned.layers = cloned.layers.filter(layer => {
    const id = layer.id || '';
    // Runtime collision images are not part of the cloned style's sprite.
    return !['buildings-clusters', 'buildings-cluster-count', 'buildings-label-obstacles'].includes(id) &&
      !id.startsWith('measure-') && !id.startsWith('swisstopo-identify-') &&
      !id.includes('-selected') && !id.includes('-highlight') && !id.includes('-pulse');
  });
  for (const layer of cloned.layers) {
    const id = layer.id || '';
    if (layer.filter && JSON.stringify(layer.filter).includes('point_count')) delete layer.filter;
    if (sourceData[layer.source]) delete layer.minzoom;
    if (id === 'buildings-labels' || id === 'parcels-labels') {
      delete layer.minzoom;
      if (!includeLabels) layer.layout = { ...layer.layout, visibility: 'none' };
    }
  }
  return cloned;
}
