import { computePrintParams, computeCornerCoords, createPrintStyle, cropSizePx, niceScaleForViewport, snapToNiceScale, MAX_PRINT_TILE_SIZE } from './print-geometry.js';
// Print to PDF (shared): print preview overlay on the map, high-resolution offscreen rendering
// (tiled for large paper sizes that exceed WebGL limits) and PDF composition with jsPDF.
// The printed map is the web map at the chosen scale: the offscreen maps render the web zoom at
// dpi / 96 device pixels per CSS pixel, so labels and symbols keep their on-screen size.
// Needs the print form markup (print-orientation, print-scale, print-dpi, print-legend, print-title,
// print-labels, print-generate-btn, print-progress*) and window.jspdf.

import { formatNum } from './utils.js';
import { metersPerPixel } from './geo.js';
import { t, tf, getLocale } from './i18n.js';
import { showError } from './toast.js';
import { getActiveSwisstopoLayers } from './swisstopo.js';
import { getCurrentMapStyleName } from './basemaps.js';

const paperSizes = {
  'a0': { width: 841, height: 1189 },
  'a1': { width: 594, height: 841 },
  'a2': { width: 420, height: 594 },
  'a3': { width: 297, height: 420 },
  'a4': { width: 210, height: 297 },
  'a5': { width: 148, height: 210 }
};

let map = null;
let options = {};
let printPreviewOverlay = null;

// ===== PRINT DIMENSIONS & SCALE =====

// 'landscape-a4' -> { width: 297, height: 210, size: 'A4' } (mm)
export function getPrintDimensions(orientation) {
  const parts = String(orientation || 'landscape-a4').split('-');
  const dir = parts[0];
  const size = parts[1] || 'a4';
  const base = paperSizes[size] || paperSizes['a4'];
  const dims = dir === 'landscape' ? { width: base.height, height: base.width } : { width: base.width, height: base.height };
  dims.size = size.toUpperCase();
  return dims;
}

// Page layout in mm: margin, header (the web app's two-line title plus rule), legend block and footer
const PAGE_MARGIN = 10;
const HEADER_HEIGHT = 14;
const LEGEND_HEIGHT = 16;     // legend title and the status swatches
const LEGEND_LAYER_ROW = 3;   // per listed external layer, plus one heading row
const FOOTER_HEIGHT = 10;

// Height of the legend block: it grows with the external layers it lists (see drawLegend)
export function legendHeight(layerCount) {
  return LEGEND_HEIGHT + (layerCount > 0 ? LEGEND_LAYER_ROW * (layerCount + 1) : 0);
}

// Placement of the map image on the page (mm). The map is rendered with the aspect ratio of this
// area, not of the paper: header, legend and footer take part of the page, and an image rendered
// for the whole sheet would be squeezed into the remaining space (distorted map, wrong corner
// coordinates and scale bar). The preview crop and the PDF use the same layout.
export function getPrintLayout(dims, includeTitle, includeLegend, legendLayerCount) {
  const mapY = PAGE_MARGIN + (includeTitle ? HEADER_HEIGHT : 0);
  return {
    margin: PAGE_MARGIN,
    mapY: mapY,
    mapW: dims.width - PAGE_MARGIN * 2,
    mapH: dims.height - mapY - PAGE_MARGIN - (includeLegend ? legendHeight(legendLayerCount || 0) : 0) - FOOTER_HEIGHT
  };
}

function visibleExternalLayers() {
  return getActiveSwisstopoLayers().filter(function(l) { return l.visible; });
}

// Layout for the current form settings (the legend lists the visible external layers)
function currentLayout(dims) {
  const includeLegend = checked('print-legend', true);
  return getPrintLayout(dims, checked('print-title', true), includeLegend, includeLegend ? visibleExternalLayers().length : 0);
}

// Scale denominator of the current view, in the web map's convention of 96 dpi CSS pixels
export function getMapScale() {
  if (!map) return 25000;
  const mpp = metersPerPixel(map.getCenter().lat, map.getZoom());
  return Math.round(mpp * 96 / 0.0254);
}

// The visible map less an inset that keeps the crop clear of the edges; null while the map has no size
const PREVIEW_INSET = 10;

function mapViewport() {
  const mapEl = document.getElementById('map');
  const rect = mapEl ? mapEl.getBoundingClientRect() : null;
  if (!rect || rect.width <= 2 * PREVIEW_INSET || rect.height <= 2 * PREVIEW_INSET) return null;
  return { width: rect.width - 2 * PREVIEW_INSET, height: rect.height - 2 * PREVIEW_INSET };
}

function scaleSelection() {
  const el = document.getElementById('print-scale');
  return el ? el.value : 'auto';
}

// "Automatisch" prints the current view: the largest round scale whose map area fits the visible
// map. Every other choice is exact, and the preview shows how much of the page lies outside the view.
export function resolvePrintScale(layout) {
  const value = scaleSelection();
  if (value !== 'auto') return parseInt(value, 10);
  if (!map) return 25000;
  const viewport = mapViewport();
  const mpp = metersPerPixel(map.getCenter().lat, map.getZoom());
  return viewport ? niceScaleForViewport({ width: layout.mapW, height: layout.mapH }, viewport, mpp) : snapToNiceScale(getMapScale());
}

// Zoom at which the map area of an explicit scale fills the visible map; null when nothing should move
function fittedZoom(onlyWhenLarger) {
  if (!map || scaleSelection() === 'auto') return null;
  const viewport = mapViewport();
  const orientationEl = document.getElementById('print-orientation');
  if (!viewport || !orientationEl) return null;
  const layout = currentLayout(getPrintDimensions(orientationEl.value));
  const crop = cropSizePx({ width: layout.mapW, height: layout.mapH }, resolvePrintScale(layout), metersPerPixel(map.getCenter().lat, map.getZoom()));
  const factor = Math.min(viewport.width / crop.width, viewport.height / crop.height);
  if ((onlyWhenLarger && factor >= 1) || Math.abs(Math.log2(factor)) < 0.01) return null;
  return map.getZoom() + Math.log2(factor);
}

// ===== PRINT PREVIEW OVERLAY =====

function createPrintPreviewOverlay() {
  if (printPreviewOverlay) return;
  const mapEl = document.getElementById('map');
  if (!mapEl) return;
  printPreviewOverlay = document.createElement('div');
  printPreviewOverlay.className = 'print-preview-overlay';
  printPreviewOverlay.innerHTML =
    '<svg><defs><mask id="print-preview-mask">' +
    '<rect width="100%" height="100%" fill="white"/>' +
    '<rect id="print-crop-rect" fill="black"/>' +
    '</mask></defs>' +
    '<rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#print-preview-mask)"/>' +
    '</svg>' +
    '<div class="print-preview-crop"></div><div class="print-preview-label"></div>';
  mapEl.appendChild(printPreviewOverlay);
}

// Opening the print item: paper maps are flat, so a tilted view eases back to 2D, and an explicit
// scale whose page is larger than the visible map zooms out until the page fits
export function showPrintPreview() {
  createPrintPreviewOverlay();
  if (!printPreviewOverlay) return;
  printPreviewOverlay.classList.add('active');
  if (map) {
    const camera = {};
    if (map.getPitch() > 0) camera.pitch = 0;
    const zoom = fittedZoom(true);
    if (zoom !== null) camera.zoom = zoom;
    if (Object.keys(camera).length) map.easeTo(Object.assign({ duration: 400 }, camera));
  }
  updatePrintPreview();
}

export function hidePrintPreview() {
  if (printPreviewOverlay) printPreviewOverlay.classList.remove('active');
}

// The crop is the exact map area of the page at the chosen scale, centred on the map, and is never
// scaled down: when it reaches beyond the map the badge says so.
export function updatePrintPreview() {
  if (!printPreviewOverlay || !printPreviewOverlay.classList.contains('active') || !map) return;
  const mapEl = document.getElementById('map');
  const orientationEl = document.getElementById('print-orientation');
  if (!mapEl || !orientationEl) return;

  const orientation = orientationEl.value;
  const printDims = getPrintDimensions(orientation);
  const layout = currentLayout(printDims);
  const printScale = resolvePrintScale(layout);
  const mpp = metersPerPixel(map.getCenter().lat, map.getZoom());
  const crop = cropSizePx({ width: layout.mapW, height: layout.mapH }, printScale, mpp);

  const mapRect = mapEl.getBoundingClientRect();
  const cropX = (mapRect.width - crop.width) / 2;
  const cropY = (mapRect.height - crop.height) / 2;
  const overflow = crop.width > mapRect.width || crop.height > mapRect.height;
  const tilted = map.getPitch() > 0;

  const maskRect = printPreviewOverlay.querySelector('#print-crop-rect');
  if (maskRect) {
    maskRect.setAttribute('x', cropX);
    maskRect.setAttribute('y', cropY);
    maskRect.setAttribute('width', crop.width);
    maskRect.setAttribute('height', crop.height);
  }

  const cropBorder = printPreviewOverlay.querySelector('.print-preview-crop');
  if (cropBorder) {
    cropBorder.style.left = cropX + 'px';
    cropBorder.style.top = cropY + 'px';
    cropBorder.style.width = crop.width + 'px';
    cropBorder.style.height = crop.height + 'px';
  }

  const labelEl = printPreviewOverlay.querySelector('.print-preview-label');
  if (labelEl) {
    const orientLabel = orientation.indexOf('landscape') === 0 ? t('print.landscape') : t('print.portrait');
    const notes = [];
    if (overflow) notes.push(t('print.preview.overflow'));
    if (tilted) notes.push(t('print.preview.pitch'));
    labelEl.textContent = printDims.size + ' ' + orientLabel + ' — 1:' + formatNum(printScale, 0) + (notes.length ? ' · ' + notes.join(' · ') : '');
    // Above the crop; inside the map when the crop starts beyond its top edge
    labelEl.style.top = Math.max(8, cropY - labelEl.offsetHeight - 8) + 'px';
  }
  printPreviewOverlay.classList.toggle('overflow', overflow);
  printPreviewOverlay.classList.toggle('warning', overflow || tilted);
}

// ===== HIGH-RESOLUTION RENDERING =====

// Largest offscreen canvas this GPU renders, capped at MAX_PRINT_TILE_SIZE (probed once)
let tileLimit = null;

function printTileLimit() {
  if (tileLimit) return tileLimit;
  tileLimit = MAX_PRINT_TILE_SIZE;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      const max = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
      if (max > 0) tileLimit = Math.min(MAX_PRINT_TILE_SIZE, max);
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
  } catch (e) { /* keep the default */ }
  return tileLimit;
}

// Render one tile (interior plus bleed) in an offscreen MapLibre map at the print pixel ratio and
// resolve with a canvas of the interior. The map renders the web zoom, so every symbol keeps its size.
function renderOffscreenTile(style, tile, params) {
  return new Promise(function(resolve, reject) {
    const width = tile.width + 2 * params.bleed;
    const height = tile.height + 2 * params.bleed;
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-99999px;top:-99999px;width:' + width + 'px;height:' + height + 'px;visibility:hidden;overflow:hidden;';
    document.body.appendChild(container);

    let timeoutId;
    let offMap;

    function cleanup() {
      clearTimeout(timeoutId);
      if (offMap) {
        try { offMap.remove(); } catch (e) { /* ignore */ }
      }
      if (container.parentNode) container.parentNode.removeChild(container);
    }

    try {
      offMap = new maplibregl.Map({
        container: container,
        style: style,
        center: [tile.center.lng, tile.center.lat],
        zoom: params.zoom,
        bearing: params.bearing,
        pitch: 0,
        pixelRatio: params.pixelRatio,
        maxCanvasSize: [params.tileLimit, params.tileLimit],
        crossSourceCollisions: true,
        interactive: false,
        fadeDuration: 0,
        canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
        attributionControl: false
      });

      // Images the application added at runtime (label collision obstacles) are not part of the style JSON
      offMap.on('styleimagemissing', function(e) {
        const image = map && typeof map.getImage === 'function' ? map.getImage(e.id) : null;
        if (image && !offMap.hasImage(e.id)) offMap.addImage(e.id, image.data, { pixelRatio: image.pixelRatio, sdf: image.sdf });
      });

      timeoutId = setTimeout(function() {
        cleanup();
        reject(new Error('timeout'));
      }, 60000);

      // Idle = all tiles loaded and rendered; copy the interior so the map can be destroyed
      offMap.once('idle', function() {
        try {
          const canvas = offMap.getCanvas();
          const sx = Math.round(params.bleed * params.pixelRatio);
          const sy = Math.round(params.bleed * params.pixelRatio);
          const copy = document.createElement('canvas');
          copy.width = Math.min(canvas.width - sx, Math.round(tile.width * params.pixelRatio));
          copy.height = Math.min(canvas.height - sy, Math.round(tile.height * params.pixelRatio));
          copy.getContext('2d').drawImage(canvas, sx, sy, copy.width, copy.height, 0, 0, copy.width, copy.height);
          cleanup();
          resolve(copy);
        } catch (e) {
          cleanup();
          reject(e);
        }
      });

      // Only style-level errors abort. Single tile failures (raster tiles outside a source's
      // coverage, one flaky WMS response) are expected and must not cancel the print.
      offMap.on('error', function(e) {
        if (e && (e.tile || e.sourceId)) return;
        cleanup();
        reject((e && e.error) || e);
      });
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}

// Encode and place one bounded tile at a time. Do not allocate a full A0/600dpi
// canvas (hundreds of millions of pixels) just to feed it back into the PDF.
async function renderHighResMap(params, style, onProgress, onTile) {
  for (const [index, tile] of params.tiles.entries()) {
    onProgress(t('print.rendering.tile', { current: index + 1, total: params.tiles.length }), (index + 1) / params.tiles.length);
    const canvas = await renderOffscreenTile(style, tile, params);
    try { onTile(canvas, tile); }
    finally { canvas.width = 0; canvas.height = 0; }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

// ===== PDF COMPOSITION =====

// Lossless pages keep halos and thin outlines crisp; larger pages use JPEG to keep the file size sane
const LOSSLESS_MAX_PIXELS = 6e6;

function drawScaleBar(pdf, x, y, scale) {
  // A "nice" ground distance for a bar of about 40 mm
  const targetBarMM = 40;
  const groundDistanceM = (targetBarMM / 1000) * scale;
  const niceDistances = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  let niceDistance = niceDistances[0];
  for (let i = 0; i < niceDistances.length; i++) {
    if (niceDistances[i] <= groundDistanceM) niceDistance = niceDistances[i]; else break;
  }

  const barLengthMM = (niceDistance / scale) * 1000;
  const segments = 4;
  const segmentMM = barLengthMM / segments;
  const barHeight = 2.5;

  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(x - 1, y - 4, barLengthMM + 12, barHeight + 8, 1, 1, 'F');

  for (let s = 0; s < segments; s++) {
    if (s % 2 === 0) pdf.setFillColor(30, 30, 30); else pdf.setFillColor(255, 255, 255);
    pdf.rect(x + s * segmentMM, y, segmentMM, barHeight, 'FD');
  }

  pdf.setDrawColor(30, 30, 30);
  pdf.setLineWidth(0.2);
  pdf.rect(x, y, barLengthMM, barHeight, 'S');

  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(30, 30, 30);
  pdf.text('0', x, y + barHeight + 3);
  const distLabel = niceDistance >= 1000 ? (niceDistance / 1000) + ' km' : niceDistance + ' m';
  pdf.text(distLabel, x + barLengthMM, y + barHeight + 3, { align: 'right' });

  pdf.setFontSize(5.5);
  pdf.setTextColor(100);
  pdf.text('1:' + formatNum(scale, 0), x + barLengthMM / 2, y + barHeight + 6, { align: 'center' });
}

// The needle points north: with a bearing the page is turned, so the needle turns by the same angle
function drawNorthArrow(pdf, cx, cy, bearing) {
  const r = 5;
  const angle = (bearing || 0) * Math.PI / 180;
  // Offsets from the centre (y downwards), turned counter-clockwise by the bearing
  const at = function(x, y) {
    return [cx + x * Math.cos(angle) + y * Math.sin(angle), cy - x * Math.sin(angle) + y * Math.cos(angle)];
  };
  pdf.setFillColor(255, 255, 255);
  pdf.circle(cx, cy, r, 'F');
  pdf.setDrawColor(150);
  pdf.setLineWidth(0.3);
  pdf.circle(cx, cy, r, 'S');

  const halfW = 1.8;
  const tip = at(0, -r + 1.5);
  const baseL = at(-halfW, 0.5);
  const baseR = at(halfW, 0.5);
  const bottom = at(0, r - 1.5);
  pdf.setFillColor(30, 30, 30);
  pdf.triangle(tip[0], tip[1], baseL[0], baseL[1], baseR[0], baseR[1], 'F');
  pdf.setFillColor(180, 180, 180);
  pdf.triangle(bottom[0], bottom[1], baseL[0], baseL[1], baseR[0], baseR[1], 'F');

  const label = at(0, -r - 1.5);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(30, 30, 30);
  pdf.text('N', label[0], label[1], { align: 'center' });
}

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

// Status labels in the interface language (print.legend.<code>), the German catalogue label as fallback
function legendLabel(item) {
  return item.code ? tf('print.legend.' + String(item.code).toLowerCase(), item.label) : item.label;
}

function drawLegend(pdf, x, y) {
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(30);
  pdf.text(t('print.legend'), x, y);
  y += 4;
  pdf.setFont('helvetica', 'normal');

  const items = options.legendItems ? options.legendItems() : [];
  let lx = x;
  items.forEach(function(item) {
    const rgb = hexToRgb(item.color);
    const label = legendLabel(item);
    pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
    pdf.circle(lx + 1.5, y - 1, 1.5, 'F');
    pdf.setTextColor(50);
    pdf.setFontSize(6.5);
    pdf.text(label, lx + 4.5, y);
    lx += pdf.getTextWidth(label) + 10;
  });
  y += 4;

  // One row per visible external layer; getPrintLayout reserves the same height (legendHeight)
  const visibleLayers = visibleExternalLayers();
  if (visibleLayers.length > 0) {
    pdf.setFontSize(6.5);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(30);
    pdf.text(t('print.layers') + ':', x, y);
    y += LEGEND_LAYER_ROW;
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(80);
    visibleLayers.forEach(function(layer) {
      pdf.text('• ' + layer.title, x + 2, y);
      y += LEGEND_LAYER_ROW;
    });
  }
  return y;
}

function formatCoord(lat, lng) {
  return lat.toFixed(5) + '° / ' + lng.toFixed(5) + '°';
}

// ===== PROGRESS UI =====

function showProgress(message, fraction) {
  const el = document.getElementById('print-progress');
  const fill = document.getElementById('print-progress-fill');
  const text = document.getElementById('print-progress-text');
  if (!el) return;
  el.style.display = 'block';
  if (fill) fill.style.width = Math.round(fraction * 100) + '%';
  if (text) text.textContent = message;
}

function hideProgress() {
  const el = document.getElementById('print-progress');
  if (el) el.style.display = 'none';
}

// ===== MAIN PDF GENERATION =====

function checked(id, fallback) {
  const el = document.getElementById(id);
  return el ? el.checked : fallback;
}

async function doGeneratePDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) throw new Error(t('print.error.library'));

  const orientation = document.getElementById('print-orientation').value;
  const includeLegend = checked('print-legend', true);
  const includeTitle = checked('print-title', true);
  const includeLabels = checked('print-labels', true);
  const dpiEl = document.getElementById('print-dpi');
  const dpi = parseInt(dpiEl ? dpiEl.value : '300', 10);

  const dims = getPrintDimensions(orientation);
  const layout = getPrintLayout(dims, includeTitle, includeLegend, includeLegend ? visibleExternalLayers().length : 0);
  const printScale = resolvePrintScale(layout);
  const isLandscape = orientation.indexOf('landscape') === 0;
  const center = map.getCenter();

  // Render the map for the area it will occupy on the page (see getPrintLayout), with the view's bearing
  const params = computePrintParams({ width: layout.mapW, height: layout.mapH }, printScale, dpi, center, { bearing: map.getBearing(), tileLimit: printTileLimit() });
  showProgress(t('print.rendering'), 0.05);
  const style = createPrintStyle(map.getStyle(), options.getSources ? options.getSources() : {}, includeLabels);
  const pdf = new window.jspdf.jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [dims.width, dims.height]
  });
  const lossless = params.canvasW * params.canvasH <= LOSSLESS_MAX_PIXELS;
  await renderHighResMap(params, style, showProgress, (canvas, tile) => {
    pdf.addImage(canvas.toDataURL(lossless ? 'image/png' : 'image/jpeg', 0.92), lossless ? 'PNG' : 'JPEG',
      layout.margin + tile.x / params.cssW * layout.mapW,
      layout.mapY + tile.y / params.cssH * layout.mapH,
      tile.width / params.cssW * layout.mapW,
      tile.height / params.cssH * layout.mapH);
  });
  showProgress(t('print.composing'), 0.9);

  const pw = dims.width;
  const ph = dims.height;
  const m = layout.margin;
  let y = m;

  // Header (HEADER_HEIGHT mm, see getPrintLayout): the web app's logo, organisation above product name
  if (includeTitle) {
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0);
    pdf.text(t('app.logo.org'), m, y + 4.5);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(60);
    pdf.text(t('app.logo.subtitle'), m, y + 8.5);
    pdf.setTextColor(100);
    const dateStr = new Date().toLocaleDateString(getLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
    pdf.text(t('print.date', { date: dateStr }), pw - m, y + 4.5, { align: 'right' });
    // Prototype notice (fictional data), centred in the header
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(183, 28, 28);
    pdf.text(t('print.prototype.note').toUpperCase(), pw / 2, y + 4.5, { align: 'center' });
    y += 11;
    pdf.setDrawColor(50);
    pdf.setLineWidth(0.5);
    pdf.line(m, y, pw - m, y);
    y += 3;
    pdf.setTextColor(0);
  }

  // Map image: the tiles were rendered with exactly this aspect ratio
  const mapAreaW = layout.mapW;
  const mapAreaH = layout.mapH;
  const mapY = layout.mapY;
  pdf.setDrawColor(150);
  pdf.setLineWidth(0.3);
  pdf.rect(m, mapY, mapAreaW, mapAreaH);

  // Corner coordinates of the printed area (turned with the page when the view has a bearing)
  const corners = computeCornerCoords(center, params.zoom, params.cssW, params.cssH, params.bearing);
  pdf.setFontSize(5);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(80);
  const coordBgW = 28;
  const coordBgH = 4;
  pdf.setFillColor(255, 255, 255);
  pdf.rect(m + 1, mapY + 1, coordBgW, coordBgH, 'F');
  pdf.text(formatCoord(corners.nw.lat, corners.nw.lng), m + 2, mapY + 3.5);
  const neText = formatCoord(corners.ne.lat, corners.ne.lng);
  const neW = pdf.getTextWidth(neText) + 2;
  pdf.rect(m + mapAreaW - neW - 1, mapY + 1, neW + 1, coordBgH, 'F');
  pdf.text(neText, m + mapAreaW - 1, mapY + 3.5, { align: 'right' });
  pdf.rect(m + 1, mapY + mapAreaH - coordBgH - 1, coordBgW, coordBgH, 'F');
  pdf.text(formatCoord(corners.sw.lat, corners.sw.lng), m + 2, mapY + mapAreaH - 1.5);
  const seText = formatCoord(corners.se.lat, corners.se.lng);
  const seW = pdf.getTextWidth(seText) + 2;
  pdf.rect(m + mapAreaW - seW - 1, mapY + mapAreaH - coordBgH - 1, seW + 1, coordBgH, 'F');
  pdf.text(seText, m + mapAreaW - 1, mapY + mapAreaH - 1.5, { align: 'right' });

  drawScaleBar(pdf, m + 4, mapY + mapAreaH - 12, printScale);
  drawNorthArrow(pdf, m + mapAreaW - 8, mapY + 8, params.bearing);
  y = mapY + mapAreaH + 3;

  if (includeLegend) y = drawLegend(pdf, m, y + 2) + 2;

  // Footer
  pdf.setDrawColor(200);
  pdf.setLineWidth(0.2);
  pdf.line(m, ph - m - 5, pw - m, ph - m - 5);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(150);
  pdf.text(t('print.source') + '  |  ' + t('print.prototype.note'), m, ph - m - 1);
  const centerText = t('print.basemap') + ': ' + getCurrentMapStyleName() + '  |  ' + t('print.center') + ': ' + center.lat.toFixed(5) + ', ' + center.lng.toFixed(5);
  pdf.text(centerText, pw / 2, ph - m - 1, { align: 'center' });
  pdf.text(t('print.copyright', { year: new Date().getFullYear() }), pw - m, ph - m - 1, { align: 'right' });

  pdf.save('BBL-Karte-' + dims.size + '-' + dpi + 'dpi-' + new Date().toISOString().slice(0, 10) + '.pdf');
}

// A new format, scale or page option fits the visible map to the page. "Automatisch" follows the
// view instead, so only explicit scales move the map.
function onPrintSettingChange() {
  if (map && printPreviewOverlay && printPreviewOverlay.classList.contains('active')) {
    const zoom = fittedZoom(false);
    if (zoom !== null) map.easeTo({ zoom: zoom, duration: 400 });
  }
  updatePrintPreview();
}

// mapInstance: the MapLibre map
// opts: { getSources: () => ({ sourceId: geojson }), legendItems: () => [{ code, color, label }] }
export function initPrintWidget(mapInstance, opts) {
  map = mapInstance;
  options = opts || {};

  // Format, scale and the title/legend options change the map area of the page (preview crop)
  ['print-orientation', 'print-scale', 'print-title', 'print-legend'].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', onPrintSettingChange);
  });
  map.on('moveend', updatePrintPreview);
  map.on('zoomend', updatePrintPreview);
  window.addEventListener('resize', updatePrintPreview);

  const generateBtn = document.getElementById('print-generate-btn');
  if (!generateBtn) return;
  generateBtn.addEventListener('click', async function() {
    const btn = this;
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner inline-spinner" aria-hidden="true"></span>' + t('print.generating');
    try {
      await doGeneratePDF();
    } catch (e) {
      console.error('[print] PDF error:', e);
      showError(
        t('print.error.title'),
        e.message === 'timeout' ? t('print.error.timeout') : t('error.pdf', { message: e.message })
      );
    }
    hideProgress();
    btn.innerHTML = originalHTML;
    btn.disabled = false;
  });
}
