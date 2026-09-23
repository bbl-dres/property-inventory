// Prototype-local print math, independent of the DOM and PDF renderer.
//
// The printed map is the web map: the offscreen renderer draws the web zoom of the chosen scale
// at dpi / 96 device pixels per CSS pixel, so labels, symbols, halos and line widths keep the
// physical size they have on a 96 dpi screen and the ground scale stays exact.
import { metersPerPixel } from './geo.js';

export const SCREEN_DPI = 96;             // CSS pixel density the web map's symbol sizes are designed for
export const MAX_PRINT_TILE_SIZE = 4096;  // device pixels per offscreen canvas (MapLibre's default maxCanvasSize)
export const PRINT_TILE_BLEED = 128;      // CSS pixels rendered beyond every tile edge and cropped away
const NICE_MANTISSAS = [1, 2, 2.5, 5];

// Ground metres per CSS pixel at a nominal scale, the web map's own convention.
export function metersPerCssPixel(scale) {
  return scale * 0.0254 / SCREEN_DPI;
}

// The zoom at which the web map shows the given scale at this latitude. It does not depend on the
// print resolution: resolution only changes how many device pixels render one CSS pixel.
export function printZoom(scale, lat) {
  return Math.log2(metersPerPixel(lat, 0) / metersPerCssPixel(scale));
}

// Screen offset (x to the right, y downwards, CSS pixels) from the centre, converted to a coordinate.
// With a bearing the compass direction "bearing" points up, so a step to the right on screen heads
// bearing + 90 degrees. Offsets are applied in MapLibre world pixels: unlike a metres-per-degree
// approximation this aligns neighbouring tiles exactly, including at high latitudes.
export function offsetMapCenter(center, dx, dy, zoom, bearing = 0) {
  const angle = bearing * Math.PI / 180;
  const worldX = dx * Math.cos(angle) - dy * Math.sin(angle);
  const worldY = dx * Math.sin(angle) + dy * Math.cos(angle);
  const worldSize = 512 * 2 ** zoom;
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, center.lat)) * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(Math.PI / 4 + latitude / 2)) / Math.PI) / 2;
  return {
    lng: center.lng + worldX / worldSize * 360,
    lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + worldY / worldSize)))) * 180 / Math.PI
  };
}

// Size of the paper's map area on screen (CSS pixels) at the web map's current metres per pixel.
export function cropSizePx(mapMM, scale, mppWeb) {
  return { width: mapMM.width / 1000 * scale / mppWeb, height: mapMM.height / 1000 * scale / mppWeb };
}

// Largest cartographic scale denominator (1, 2, 2.5, 5 × 10^n) that does not exceed the value.
export function snapToNiceScale(scale) {
  let best = 10;
  for (let exponent = 1; exponent <= 8; exponent++) {
    for (const mantissa of NICE_MANTISSAS) {
      const candidate = Math.round(mantissa * 10 ** exponent);
      if (candidate <= scale && candidate > best) best = candidate;
    }
  }
  return best;
}

// Largest nice scale whose map area fits the viewport (CSS pixels) at the web map's metres per pixel.
export function niceScaleForViewport(mapMM, viewport, mppWeb) {
  const limit = Math.min(viewport.width / mapMM.width, viewport.height / mapMM.height) * mppWeb * 1000;
  return snapToNiceScale(limit);
}

// mapMM: the map area on the page. Tiles are defined in CSS pixels; every tile is rendered with a
// bleed on each side so that symbols near a seam see the same neighbours from both sides, and the
// rendered canvas (interior plus bleed, times the pixel ratio) stays within the device limit.
export function computePrintParams(mapMM, scale, dpi, center, options = {}) {
  const bearing = options.bearing || 0;
  const pixelRatio = dpi / SCREEN_DPI;
  const tileLimit = options.tileLimit || MAX_PRINT_TILE_SIZE;
  const tileCss = Math.floor(tileLimit / pixelRatio);
  const bleed = Math.max(0, Math.min(options.bleed ?? PRINT_TILE_BLEED, Math.floor((tileCss - 64) / 2)));
  const interior = tileCss - 2 * bleed;
  const cssW = Math.round(mapMM.width / 25.4 * SCREEN_DPI);
  const cssH = Math.round(mapMM.height / 25.4 * SCREEN_DPI);
  // Map containers have whole CSS pixels: fold the rounding of the width into the zoom so the sheet
  // covers exactly mapMM.width / 1000 × scale metres and the preview crop equals the printed extent.
  const zoom = printZoom(scale, center.lat) + Math.log2(cssW / (mapMM.width / 25.4 * SCREEN_DPI));
  const tiles = [];
  for (let y = 0; y < cssH; y += interior) {
    for (let x = 0; x < cssW; x += interior) {
      const width = Math.min(interior, cssW - x);
      const height = Math.min(interior, cssH - y);
      tiles.push({ x, y, width, height, center: offsetMapCenter(center, x + width / 2 - cssW / 2, y + height / 2 - cssH / 2, zoom, bearing) });
    }
  }
  return {
    pixelRatio, zoom, bearing, bleed, tileLimit, cssW, cssH,
    canvasW: Math.round(cssW * pixelRatio), canvasH: Math.round(cssH * pixelRatio),
    needsTiling: tiles.length > 1, tiles
  };
}

// Corners of the printed map area (CSS pixel size), in reading order of the page.
export function computeCornerCoords(center, zoom, width, height, bearing = 0) {
  return {
    nw: offsetMapCenter(center, -width / 2, -height / 2, zoom, bearing),
    ne: offsetMapCenter(center, width / 2, -height / 2, zoom, bearing),
    sw: offsetMapCenter(center, -width / 2, height / 2, zoom, bearing),
    se: offsetMapCenter(center, width / 2, height / 2, zoom, bearing)
  };
}

const LABEL_LAYERS = ['buildings-labels', 'parcels-labels', 'buildings-label-obstacles'];

export function createPrintStyle(style, sourceData, includeLabels) {
  const cloned = JSON.parse(JSON.stringify(style));
  for (const [id, data] of Object.entries(sourceData)) {
    if (cloned.sources[id] && data) cloned.sources[id] = { type: 'geojson', data, cluster: false };
  }
  cloned.layers = cloned.layers.filter(layer => {
    const id = layer.id || '';
    // Clusters are an interactive affordance; selection, hover and measuring belong to the screen.
    return !['buildings-clusters', 'buildings-cluster-count'].includes(id) &&
      !id.startsWith('measure-') && !id.startsWith('swisstopo-identify-') &&
      !id.includes('-selected') && !id.includes('-highlight') && !id.includes('-pulse');
  });
  for (const layer of cloned.layers) {
    const id = layer.id || '';
    if (layer.filter && JSON.stringify(layer.filter).includes('point_count')) delete layer.filter;
    // Every other zoom rule stays: the print zoom is the web zoom of the chosen scale. Labels are the
    // exception and print at any scale when requested; their collision obstacles follow them.
    if (LABEL_LAYERS.includes(id)) {
      delete layer.minzoom;
      if (!includeLabels) layer.layout = { ...layer.layout, visibility: 'none' };
    }
    // No selection ring on paper: the obstacle keeps the unselected size for every building.
    if (id === 'buildings-label-obstacles') layer.layout = { ...layer.layout, 'icon-size': 1 };
  }
  return cloned;
}
