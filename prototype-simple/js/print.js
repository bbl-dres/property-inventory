import { computePrintParams, computeCornerCoords, createPrintStyle } from './print-geometry.js';
// Print to PDF (shared): print preview overlay on the map, high-resolution offscreen rendering
// (tiled for large paper sizes that exceed WebGL limits) and PDF composition with jsPDF.
// Needs the print form markup (print-orientation, print-scale, print-dpi, print-legend, print-title,
// print-labels, print-generate-btn, print-progress*) and window.jspdf.

import { formatNum } from './utils.js';
import { metersPerPixel } from './geo.js';
import { t, getLocale } from './i18n.js';
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

// Page layout in mm: margin, header (title row plus rule), legend block and footer
const PAGE_MARGIN = 10;
const HEADER_HEIGHT = 11;
const LEGEND_HEIGHT = 16;
const FOOTER_HEIGHT = 10;

// Placement of the map image on the page (mm). The map is rendered with the aspect ratio of this
// area, not of the paper: header, legend and footer take part of the page, and an image rendered
// for the whole sheet would be squeezed into the remaining space (distorted map, wrong corner
// coordinates and scale bar). The preview crop and the PDF use the same layout.
export function getPrintLayout(dims, includeTitle, includeLegend) {
  const mapY = PAGE_MARGIN + (includeTitle ? HEADER_HEIGHT : 0);
  return {
    margin: PAGE_MARGIN,
    mapY: mapY,
    mapW: dims.width - PAGE_MARGIN * 2,
    mapH: dims.height - mapY - PAGE_MARGIN - (includeLegend ? LEGEND_HEIGHT : 0) - FOOTER_HEIGHT
  };
}

// Approximate map scale denominator of the current view (96 dpi screen)
export function getMapScale() {
  if (!map) return 25000;
  const mpp = metersPerPixel(map.getCenter().lat, map.getZoom());
  const pixelsPerMeter = 96 / 0.0254;
  return Math.round(mpp * pixelsPerMeter);
}

function readPrintScale() {
  const scaleOption = document.getElementById('print-scale');
  const value = scaleOption ? scaleOption.value : 'auto';
  return value === 'auto' ? getMapScale() : parseInt(value, 10);
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
    '<div class="print-preview-crop"><div class="print-preview-label"></div></div>';
  mapEl.appendChild(printPreviewOverlay);
}

export function showPrintPreview() {
  createPrintPreviewOverlay();
  if (printPreviewOverlay) {
    printPreviewOverlay.classList.add('active');
    updatePrintPreview();
  }
}

export function hidePrintPreview() {
  if (printPreviewOverlay) printPreviewOverlay.classList.remove('active');
}

export function updatePrintPreview() {
  if (!printPreviewOverlay || !printPreviewOverlay.classList.contains('active') || !map) return;
  const mapEl = document.getElementById('map');
  const orientationEl = document.getElementById('print-orientation');
  if (!mapEl || !orientationEl) return;

  const orientation = orientationEl.value;
  const printDims = getPrintDimensions(orientation);
  const printScale = readPrintScale();
  const layout = getPrintLayout(printDims, checked('print-title', true), checked('print-legend', true));

  // The crop shows the map area of the page (without header, legend and footer)
  const groundWidthM = (layout.mapW / 1000) * printScale;
  const groundHeightM = (layout.mapH / 1000) * printScale;
  const mpp = metersPerPixel(map.getCenter().lat, map.getZoom());

  let cropWidth = groundWidthM / mpp;
  let cropHeight = groundHeightM / mpp;

  const mapRect = mapEl.getBoundingClientRect();
  const maxW = mapRect.width - 20;
  const maxH = mapRect.height - 20;
  if (cropWidth > maxW || cropHeight > maxH) {
    const shrink = Math.min(maxW / cropWidth, maxH / cropHeight);
    cropWidth *= shrink;
    cropHeight *= shrink;
  }

  const cropX = (mapRect.width - cropWidth) / 2;
  const cropY = (mapRect.height - cropHeight) / 2;

  const maskRect = printPreviewOverlay.querySelector('#print-crop-rect');
  if (maskRect) {
    maskRect.setAttribute('x', cropX);
    maskRect.setAttribute('y', cropY);
    maskRect.setAttribute('width', cropWidth);
    maskRect.setAttribute('height', cropHeight);
  }

  const cropBorder = printPreviewOverlay.querySelector('.print-preview-crop');
  if (cropBorder) {
    cropBorder.style.left = cropX + 'px';
    cropBorder.style.top = cropY + 'px';
    cropBorder.style.width = cropWidth + 'px';
    cropBorder.style.height = cropHeight + 'px';
  }

  const labelEl = printPreviewOverlay.querySelector('.print-preview-label');
  if (labelEl) {
    const orientLabel = orientation.indexOf('landscape') === 0 ? t('print.landscape') : t('print.portrait');
    labelEl.textContent = printDims.size + ' ' + orientLabel + ' — 1:' + formatNum(printScale, 0);
  }
}

// ===== HIGH-RESOLUTION RENDERING =====

// Render a single offscreen MapLibre map and return a canvas
function renderOffscreenTile(style, center, zoom, width, height) {
  return new Promise(function(resolve, reject) {
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
        center: [center.lng, center.lat],
        zoom: zoom,
        bearing: 0,
        pitch: 0,
        interactive: false,
        fadeDuration: 0,
        pixelRatio: 1,
        canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
        attributionControl: false
      });

      timeoutId = setTimeout(function() {
        cleanup();
        reject(new Error('timeout'));
      }, 60000);

      // Idle = all tiles loaded and rendered; copy the canvas so the map can be destroyed
      offMap.once('idle', function() {
        try {
          const canvas = offMap.getCanvas();
          const copy = document.createElement('canvas');
          copy.width = canvas.width;
          copy.height = canvas.height;
          copy.getContext('2d').drawImage(canvas, 0, 0);
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
    const canvas = await renderOffscreenTile(style, tile.center, params.zoom, tile.width, tile.height);
    try { onTile(canvas, tile); }
    finally { canvas.width = 0; canvas.height = 0; }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

// ===== PDF COMPOSITION =====

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

function drawNorthArrow(pdf, cx, cy) {
  const r = 5;
  pdf.setFillColor(255, 255, 255);
  pdf.circle(cx, cy, r, 'F');
  pdf.setDrawColor(150);
  pdf.setLineWidth(0.3);
  pdf.circle(cx, cy, r, 'S');

  const tipY = cy - r + 1.5;
  const baseY = cy + 0.5;
  const halfW = 1.8;
  pdf.setFillColor(30, 30, 30);
  pdf.lines([[-(halfW), baseY - tipY], [halfW * 2, 0], [0, 0]], cx, tipY, [1, 1], 'F', true);

  const botY = cy + r - 1.5;
  pdf.setFillColor(180, 180, 180);
  pdf.lines([[-(halfW), -(botY - baseY)], [halfW * 2, 0], [0, 0]], cx, botY, [1, 1], 'F', true);

  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(30, 30, 30);
  pdf.text('N', cx, cy - r - 1.5, { align: 'center' });
}

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
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
    pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
    pdf.circle(lx + 1.5, y - 1, 1.5, 'F');
    pdf.setTextColor(50);
    pdf.setFontSize(6.5);
    pdf.text(item.label, lx + 4.5, y);
    lx += pdf.getTextWidth(item.label) + 10;
  });
  y += 4;

  const visibleLayers = getActiveSwisstopoLayers().filter(function(l) { return l.visible; });
  if (visibleLayers.length > 0) {
    pdf.setFontSize(6.5);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(30);
    pdf.text(t('print.layers') + ':', x, y);
    y += 3;
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(80);
    visibleLayers.forEach(function(layer) {
      pdf.text('• ' + layer.title, x + 2, y);
      y += 3;
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
  const printScale = readPrintScale();
  const isLandscape = orientation.indexOf('landscape') === 0;
  const center = map.getCenter();
  const layout = getPrintLayout(dims, includeTitle, includeLegend);

  // Render the map for the area it will occupy on the page (see getPrintLayout)
  const params = computePrintParams({ width: layout.mapW, height: layout.mapH }, printScale, dpi, center);
  showProgress(t('print.rendering'), 0.05);
  const style = createPrintStyle(map.getStyle(), options.getSources ? options.getSources() : {}, includeLabels);
  const pdf = new window.jspdf.jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [dims.width, dims.height]
  });
  await renderHighResMap(params, style, showProgress, (canvas, tile) => {
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG',
      layout.margin + tile.px / params.canvasW * layout.mapW,
      layout.mapY + tile.py / params.canvasH * layout.mapH,
      tile.width / params.canvasW * layout.mapW,
      tile.height / params.canvasH * layout.mapH);
  });
  showProgress(t('print.composing'), 0.9);

  const pw = dims.width;
  const ph = dims.height;
  const m = layout.margin;
  let y = m;

  // Header (HEADER_HEIGHT mm, see getPrintLayout)
  if (includeTitle) {
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(t('share.title'), m, y + 5);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100);
    const dateStr = new Date().toLocaleDateString(getLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
    pdf.text(t('print.date', { date: dateStr }), pw - m, y + 5, { align: 'right' });
    // Prototype notice (fictional data), centred in the header
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(183, 28, 28);
    pdf.text(t('print.prototype.note').toUpperCase(), pw / 2, y + 5, { align: 'center' });
    y += 8;
    pdf.setDrawColor(50);
    pdf.setLineWidth(0.5);
    pdf.line(m, y, pw - m, y);
    y += 3;
    pdf.setTextColor(0);
  }

  // Map image: the canvas was rendered with exactly this aspect ratio
  const mapAreaW = layout.mapW;
  const mapAreaH = layout.mapH;
  const mapY = layout.mapY;
  pdf.setDrawColor(150);
  pdf.setLineWidth(0.3);
  pdf.rect(m, mapY, mapAreaW, mapAreaH);

  // Corner coordinates
  const corners = computeCornerCoords(center, params.zoom, params.canvasW, params.canvasH);
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
  drawNorthArrow(pdf, m + mapAreaW - 8, mapY + 8);
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

// mapInstance: the MapLibre map
// opts: { getSources: () => ({ sourceId: geojson }), legendItems: () => [{ color, label }] }
export function initPrintWidget(mapInstance, opts) {
  map = mapInstance;
  options = opts || {};

  // Format, scale and the title/legend options change the map area of the page (preview crop)
  ['print-orientation', 'print-scale', 'print-title', 'print-legend'].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updatePrintPreview);
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
