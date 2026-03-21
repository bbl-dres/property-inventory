// Print PDF generation with high-resolution offscreen map rendering
// Supports tiled rendering for large paper sizes that exceed WebGL limits

import { state } from './state.js';
import { statusColors, paperSizes, mapStyles } from './config.js';
import { formatNum } from './utils.js';
import { t, getLocale } from './i18n.js';

// Maximum WebGL canvas dimension (conservative; most GPUs support 4096–16384)
var MAX_GL_SIZE = 4096;

// ===== PRINT DIMENSIONS & SCALE =====

export function getPrintDimensions(orientation) {
  var parts = orientation.split('-');  // e.g., 'landscape-a4'
  var dir = parts[0];
  var size = parts[1];
  var base = paperSizes[size] || paperSizes['a4'];
  if (dir === 'landscape') {
    return { width: base.height, height: base.width };
  }
  return { width: base.width, height: base.height };
}

export function getMapScale() {
  if (!state.map) return 25000;
  var center = state.map.getCenter();
  var zoom = state.map.getZoom();
  var metersPerPixel = 156543.03392 * Math.cos(center.lat * Math.PI / 180) / Math.pow(2, zoom);
  var pixelsPerMeter = 96 / 0.0254;
  return Math.round(metersPerPixel * pixelsPerMeter);
}

// ===== PRINT PREVIEW OVERLAY =====

export function createCoordinateGrid() {
  return '<svg width="100%" height="100%" style="position: absolute; top: 0; left: 0;">' +
    '<defs><pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">' +
    '<path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(0,0,0,0.15)" stroke-width="0.5"/>' +
    '</pattern></defs>' +
    '<rect width="100%" height="100%" fill="url(#grid)"/>' +
    '</svg>';
}

export function createPrintPreviewOverlay() {
  if (state.printPreviewOverlay) return;

  var mapEl = document.getElementById('map');
  if (!mapEl) return;

  state.printPreviewOverlay = document.createElement('div');
  state.printPreviewOverlay.className = 'print-preview-overlay';
  state.printPreviewOverlay.innerHTML =
    '<svg><defs><mask id="print-preview-mask">' +
    '<rect width="100%" height="100%" fill="white"/>' +
    '<rect id="print-crop-rect" fill="black"/>' +
    '</mask></defs>' +
    '<rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#print-preview-mask)"/>' +
    '</svg>' +
    '<div class="print-preview-crop"><div class="print-preview-label"></div></div>';
  mapEl.appendChild(state.printPreviewOverlay);
}

export function showPrintPreview() {
  createPrintPreviewOverlay();
  if (state.printPreviewOverlay) {
    state.printPreviewOverlay.classList.add('active');
    updatePrintPreview();
  }
}

export function hidePrintPreview() {
  if (state.printPreviewOverlay) {
    state.printPreviewOverlay.classList.remove('active');
  }
}

export function updatePrintPreview() {
  if (!state.printPreviewOverlay || !state.printPreviewOverlay.classList.contains('active')) return;
  if (!state.map) return;

  var mapEl = document.getElementById('map');
  if (!mapEl) return;

  var orientation = document.getElementById('print-orientation').value;
  var scaleOption = document.getElementById('print-scale').value;
  var printDims = getPrintDimensions(orientation);
  var printScale = scaleOption === 'auto' ? getMapScale() : parseInt(scaleOption);

  var groundWidthM = (printDims.width / 1000) * printScale;
  var groundHeightM = (printDims.height / 1000) * printScale;

  var center = state.map.getCenter();
  var metersPerPixel = 156543.03392 * Math.cos(center.lat * Math.PI / 180) / Math.pow(2, state.map.getZoom());

  var cropWidth = groundWidthM / metersPerPixel;
  var cropHeight = groundHeightM / metersPerPixel;

  var mapRect = mapEl.getBoundingClientRect();
  var maxW = mapRect.width - 20;
  var maxH = mapRect.height - 20;
  if (cropWidth > maxW || cropHeight > maxH) {
    var shrink = Math.min(maxW / cropWidth, maxH / cropHeight);
    cropWidth *= shrink;
    cropHeight *= shrink;
  }

  var cropX = (mapRect.width - cropWidth) / 2;
  var cropY = (mapRect.height - cropHeight) / 2;

  var maskRect = state.printPreviewOverlay.querySelector('#print-crop-rect');
  if (maskRect) {
    maskRect.setAttribute('x', cropX);
    maskRect.setAttribute('y', cropY);
    maskRect.setAttribute('width', cropWidth);
    maskRect.setAttribute('height', cropHeight);
  }

  var cropBorder = state.printPreviewOverlay.querySelector('.print-preview-crop');
  if (cropBorder) {
    cropBorder.style.left = cropX + 'px';
    cropBorder.style.top = cropY + 'px';
    cropBorder.style.width = cropWidth + 'px';
    cropBorder.style.height = cropHeight + 'px';
  }

  var labelEl = state.printPreviewOverlay.querySelector('.print-preview-label');
  if (labelEl) {
    var formatLabel = orientation.includes('a3') ? 'A3' : 'A4';
    var orientLabel = orientation.includes('landscape') ? t('print.landscape') : t('print.portrait');
    var formattedScale = formatNum(printScale, 0);
    labelEl.textContent = formatLabel + ' ' + orientLabel + ' \u2014 1:' + formattedScale;
  }
}

// ===== HIGH-RESOLUTION RENDERING =====

/**
 * Compute all parameters needed for high-res print rendering.
 * @param {Object} paperMM - { width, height } in mm
 * @param {number} scale - map scale denominator (e.g., 25000)
 * @param {number} dpi - target DPI (e.g., 300)
 * @param {number} lat - center latitude in degrees
 * @returns {{ canvasW, canvasH, zoom, needsTiling, tileGrid }}
 */
function computePrintParams(paperMM, scale, dpi, lat) {
  // Canvas pixel dimensions for the paper at target DPI
  var canvasW = Math.round((paperMM.width / 25.4) * dpi);
  var canvasH = Math.round((paperMM.height / 25.4) * dpi);

  // Compute the MapLibre zoom level:
  // At the target scale and DPI, one pixel on the canvas represents:
  //   metersPerPixel = scale * (0.0254 / dpi)
  // MapLibre's formula: metersPerPixel = 156543.03392 * cos(lat) / 2^zoom
  // So: zoom = log2(156543.03392 * cos(lat) / metersPerPixel)
  var latRad = lat * Math.PI / 180;
  var metersPerDot = scale * (0.0254 / dpi);
  var zoom = Math.log2(156543.03392 * Math.cos(latRad) / metersPerDot);

  // Determine if tiling is needed
  var needsTiling = canvasW > MAX_GL_SIZE || canvasH > MAX_GL_SIZE;

  var tileGrid = null;
  if (needsTiling) {
    tileGrid = computeTileGrid(canvasW, canvasH, zoom, lat, state.map.getCenter());
  }

  return { canvasW: canvasW, canvasH: canvasH, zoom: zoom, needsTiling: needsTiling, tileGrid: tileGrid };
}

/**
 * Compute a grid of tiles to cover the full print extent.
 */
function computeTileGrid(canvasW, canvasH, zoom, lat, center) {
  var tileSize = MAX_GL_SIZE;
  var cols = Math.ceil(canvasW / tileSize);
  var rows = Math.ceil(canvasH / tileSize);

  var latRad = lat * Math.PI / 180;
  var metersPerPixel = 156543.03392 * Math.cos(latRad) / Math.pow(2, zoom);

  // Total extent in meters
  var totalWidthM = canvasW * metersPerPixel;
  var totalHeightM = canvasH * metersPerPixel;

  // Convert center to meters (approximate Web Mercator)
  var centerLng = center.lng;
  var centerLat = center.lat;
  var metersPerDegreeLng = 111320 * Math.cos(latRad);
  var metersPerDegreeLat = 110574;

  var tiles = [];
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      // Tile pixel bounds within the full canvas
      var px = c * tileSize;
      var py = r * tileSize;
      var tw = Math.min(tileSize, canvasW - px);
      var th = Math.min(tileSize, canvasH - py);

      // Tile center in pixels relative to full canvas center
      var tileCenterPxX = px + tw / 2 - canvasW / 2;
      var tileCenterPxY = py + th / 2 - canvasH / 2;

      // Convert pixel offset to lng/lat offset
      var offsetM_X = tileCenterPxX * metersPerPixel;
      var offsetM_Y = -tileCenterPxY * metersPerPixel; // Y is flipped

      var tileLng = centerLng + offsetM_X / metersPerDegreeLng;
      var tileLat = centerLat + offsetM_Y / metersPerDegreeLat;

      tiles.push({
        row: r, col: c,
        px: px, py: py,
        width: tw, height: th,
        center: { lng: tileLng, lat: tileLat }
      });
    }
  }

  return { tiles: tiles, cols: cols, rows: rows, tileSize: tileSize };
}

/**
 * Clone the current map style, injecting GeoJSON data inline.
 * For print, clustering is disabled and label minzoom can be removed.
 */
function cloneMapStyle(includeLabels) {
  var style = state.map.getStyle();

  // Deep clone
  var cloned = JSON.parse(JSON.stringify(style));

  // Patch GeoJSON sources with actual data (getStyle() may not include loaded features)
  if (cloned.sources['buildings'] && state.buildingsData) {
    cloned.sources['buildings'] = {
      type: 'geojson',
      data: state.buildingsData,
      cluster: false  // No clustering for print — show all individual points
    };
  }
  if (cloned.sources['parcels'] && state.parcelData) {
    cloned.sources['parcels'] = {
      type: 'geojson',
      data: state.parcelData
    };
  }
  if (cloned.sources['landcovers'] && state.landCoverData) {
    cloned.sources['landcovers'] = {
      type: 'geojson',
      data: state.landCoverData
    };
  }

  // Since clustering is off, remove cluster-dependent layers and filters
  cloned.layers = cloned.layers.filter(function(layer) {
    // Remove cluster layers (they won't work without cluster: true)
    if (layer.id === 'buildings-clusters' || layer.id === 'buildings-cluster-count') return false;
    return true;
  });

  // Update building point/label layers to not filter on point_count
  cloned.layers.forEach(function(layer) {
    if (layer.source === 'buildings' && layer.filter) {
      // Remove point_count filters since clustering is off
      if (JSON.stringify(layer.filter).indexOf('point_count') !== -1) {
        // For layers that filter ['!', ['has', 'point_count']], just remove the filter
        // since without clustering there's never a point_count property
        delete layer.filter;
      }
    }

    // If labels requested, remove minzoom restriction on building labels
    if (includeLabels && layer.id === 'buildings-labels' && layer.minzoom) {
      delete layer.minzoom;
    }

    // Remove minzoom on data layers so they render at any print zoom
    if (layer.source === 'parcels' || layer.source === 'landcovers') {
      if (layer.minzoom) delete layer.minzoom;
      // Also flatten opacity interpolations that depend on zoom
    }

    // Remove selection/highlight layers (not useful in print)
    // We keep them to avoid source reference issues, but set visibility to none
    if (layer.id && (layer.id.indexOf('-selected') !== -1 || layer.id.indexOf('-highlight') !== -1 || layer.id.indexOf('-pulse') !== -1)) {
      if (!layer.layout) layer.layout = {};
      layer.layout.visibility = 'none';
    }
  });

  // Remove measure layers if present
  cloned.layers = cloned.layers.filter(function(layer) {
    return !layer.id || layer.id.indexOf('measure-') === -1;
  });

  // Remove identify highlight layers
  cloned.layers = cloned.layers.filter(function(layer) {
    return !layer.id || layer.id.indexOf('identify-') === -1;
  });

  return cloned;
}

/**
 * Render a single offscreen MapLibre map and return a canvas.
 * @returns {Promise<HTMLCanvasElement>}
 */
function renderOffscreenTile(style, center, zoom, width, height) {
  return new Promise(function(resolve, reject) {
    // Create hidden container
    var container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-99999px;top:-99999px;width:' + width + 'px;height:' + height + 'px;visibility:hidden;overflow:hidden;';
    document.body.appendChild(container);

    var timeoutId;
    var offMap;

    function cleanup() {
      clearTimeout(timeoutId);
      if (offMap) {
        try { offMap.remove(); } catch (e) { /* ignore */ }
      }
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
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

      // Timeout after 60 seconds
      timeoutId = setTimeout(function() {
        cleanup();
        reject(new Error('timeout'));
      }, 60000);

      // Wait for idle (all tiles loaded and rendered)
      offMap.once('idle', function() {
        try {
          var canvas = offMap.getCanvas();
          // Copy to a new canvas so we can destroy the map
          var copy = document.createElement('canvas');
          copy.width = canvas.width;
          copy.height = canvas.height;
          var ctx = copy.getContext('2d');
          ctx.drawImage(canvas, 0, 0);
          cleanup();
          resolve(copy);
        } catch (e) {
          cleanup();
          reject(e);
        }
      });

      offMap.once('error', function(e) {
        cleanup();
        reject(e.error || e);
      });
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}

/**
 * Render the map at high resolution, using tiling if needed.
 * @param {Function} onProgress - callback(message, fraction)
 * @returns {Promise<HTMLCanvasElement>}
 */
async function renderHighResMap(params, style, center, onProgress) {
  if (!params.needsTiling) {
    // Single-tile render
    onProgress(t('print.rendering'), 0.1);
    var canvas = await renderOffscreenTile(style, center, params.zoom, params.canvasW, params.canvasH);
    onProgress(t('print.rendering'), 1.0);
    return canvas;
  }

  // Tiled render
  var grid = params.tileGrid;
  var totalTiles = grid.tiles.length;
  var finalCanvas = document.createElement('canvas');
  finalCanvas.width = params.canvasW;
  finalCanvas.height = params.canvasH;
  var ctx = finalCanvas.getContext('2d');

  for (var i = 0; i < totalTiles; i++) {
    var tile = grid.tiles[i];
    onProgress(t('print.rendering.tile', { current: i + 1, total: totalTiles }), (i + 1) / totalTiles);

    var tileCanvas = await renderOffscreenTile(style, tile.center, params.zoom, tile.width, tile.height);
    ctx.drawImage(tileCanvas, tile.px, tile.py);

    // Small delay between tiles to let the GPU/browser recover
    await new Promise(function(r) { setTimeout(r, 100); });
  }

  return finalCanvas;
}

// ===== PDF COMPOSITION =====

/**
 * Draw a graphical scale bar on the PDF.
 * @param {jsPDF} pdf
 * @param {number} x - left edge mm
 * @param {number} y - top edge mm
 * @param {number} scale - map scale denominator
 */
function drawScaleBar(pdf, x, y, scale) {
  // Determine a "nice" ground distance for the scale bar
  // Target bar length: ~40mm on paper
  var targetBarMM = 40;
  var groundDistanceM = (targetBarMM / 1000) * scale; // meters on ground

  // Round to a nice number
  var niceDistances = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  var niceDistance = niceDistances[0];
  for (var i = 0; i < niceDistances.length; i++) {
    if (niceDistances[i] <= groundDistanceM) {
      niceDistance = niceDistances[i];
    } else {
      break;
    }
  }

  // Actual bar length on paper
  var barLengthMM = (niceDistance / scale) * 1000;
  var segments = 4;
  var segmentMM = barLengthMM / segments;
  var barHeight = 2.5;

  // Background
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(x - 1, y - 4, barLengthMM + 12, barHeight + 8, 1, 1, 'F');

  // Draw alternating segments
  for (var s = 0; s < segments; s++) {
    if (s % 2 === 0) {
      pdf.setFillColor(30, 30, 30);
    } else {
      pdf.setFillColor(255, 255, 255);
    }
    pdf.rect(x + s * segmentMM, y, segmentMM, barHeight, 'FD');
  }

  // Border around the whole bar
  pdf.setDrawColor(30, 30, 30);
  pdf.setLineWidth(0.2);
  pdf.rect(x, y, barLengthMM, barHeight, 'S');

  // Labels
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(30, 30, 30);
  pdf.text('0', x, y + barHeight + 3);

  var distLabel;
  if (niceDistance >= 1000) {
    distLabel = (niceDistance / 1000) + ' km';
  } else {
    distLabel = niceDistance + ' m';
  }
  pdf.text(distLabel, x + barLengthMM, y + barHeight + 3, { align: 'right' });

  // Scale text below
  pdf.setFontSize(5.5);
  pdf.setTextColor(100);
  var scaleText = '1:' + formatNum(scale, 0);
  pdf.text(scaleText, x + barLengthMM / 2, y + barHeight + 6, { align: 'center' });
}

/**
 * Draw a north arrow on the PDF.
 */
function drawNorthArrow(pdf, cx, cy) {
  var r = 5;

  // White circle background
  pdf.setFillColor(255, 255, 255);
  pdf.circle(cx, cy, r, 'F');
  pdf.setDrawColor(150);
  pdf.setLineWidth(0.3);
  pdf.circle(cx, cy, r, 'S');

  // North arrow using simple line-based triangles
  // Dark north-pointing triangle
  pdf.setFillColor(30, 30, 30);
  var tipY = cy - r + 1.5;
  var baseY = cy + 0.5;
  var halfW = 1.8;
  // Draw filled polygon: tip -> base-left -> base-right -> close
  pdf.lines(
    [[-(halfW), baseY - tipY], [halfW * 2, 0], [0, 0]],
    cx, tipY, [1, 1], 'F', true
  );

  // Light south-pointing triangle
  pdf.setFillColor(180, 180, 180);
  var botY = cy + r - 1.5;
  pdf.lines(
    [[-(halfW), -(botY - baseY)], [halfW * 2, 0], [0, 0]],
    cx, botY, [1, 1], 'F', true
  );

  // N label
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(30, 30, 30);
  pdf.text('N', cx, cy - r - 1.5, { align: 'center' });
}

/**
 * Draw the legend on the PDF.
 */
function drawLegend(pdf, x, y, maxWidth) {
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(30);
  pdf.text(t('print.legend'), x, y);
  y += 4;

  pdf.setFont('helvetica', 'normal');

  // Status colors
  var legItems = [
    { color: statusColors['Aktiv'], label: t('print.legend.active') },
    { color: statusColors['In Renovation'], label: t('print.legend.renovation') },
    { color: statusColors['In Planung'], label: t('print.legend.planning') },
    { color: statusColors['Verkauft'], label: t('print.legend.inactive') }
  ];

  var lx = x;
  legItems.forEach(function(item) {
    // Parse hex color to RGB
    var hex = item.color.replace('#', '');
    var r = parseInt(hex.substring(0, 2), 16);
    var g = parseInt(hex.substring(2, 4), 16);
    var b = parseInt(hex.substring(4, 6), 16);

    pdf.setFillColor(r, g, b);
    pdf.circle(lx + 1.5, y - 1, 1.5, 'F');
    pdf.setTextColor(50);
    pdf.setFontSize(6.5);
    pdf.text(item.label, lx + 4.5, y);
    lx += pdf.getTextWidth(item.label) + 10;
  });

  y += 4;

  // Active swisstopo layers
  if (state.activeSwisstopoLayers.length > 0) {
    var visibleLayers = state.activeSwisstopoLayers.filter(function(l) { return l.visible; });
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
  }

  return y;
}

/**
 * Compute corner coordinates for the print extent.
 */
function computeCornerCoords(center, zoom, canvasW, canvasH) {
  var latRad = center.lat * Math.PI / 180;
  var metersPerPixel = 156543.03392 * Math.cos(latRad) / Math.pow(2, zoom);
  var metersPerDegreeLng = 111320 * Math.cos(latRad);
  var metersPerDegreeLat = 110574;

  var halfW = (canvasW / 2) * metersPerPixel;
  var halfH = (canvasH / 2) * metersPerPixel;

  var dLng = halfW / metersPerDegreeLng;
  var dLat = halfH / metersPerDegreeLat;

  return {
    nw: { lat: center.lat + dLat, lng: center.lng - dLng },
    ne: { lat: center.lat + dLat, lng: center.lng + dLng },
    sw: { lat: center.lat - dLat, lng: center.lng - dLng },
    se: { lat: center.lat - dLat, lng: center.lng + dLng }
  };
}

function formatCoord(lat, lng) {
  return lat.toFixed(5) + '° / ' + lng.toFixed(5) + '°';
}

// ===== PROGRESS UI =====

function showProgress(message, fraction) {
  var el = document.getElementById('print-progress');
  var fill = document.getElementById('print-progress-fill');
  var text = document.getElementById('print-progress-text');
  if (!el) return;

  el.style.display = 'block';
  if (fill) fill.style.width = Math.round(fraction * 100) + '%';
  if (text) text.textContent = message;
}

function hideProgress() {
  var el = document.getElementById('print-progress');
  if (el) el.style.display = 'none';
}

// ===== MAIN PDF GENERATION =====

export function generatePrintPDF() {
  // This is now only used by the old print-pdf-btn, if it still exists
  // The new flow uses the async version in initPrintWidget
}

export function initPrintWidget() {
  // Print preview: orientation change and map move update the overlay
  var printOrientationEl = document.getElementById('print-orientation');
  if (printOrientationEl) {
    printOrientationEl.addEventListener('change', updatePrintPreview);
  }
  var printScaleEl = document.getElementById('print-scale');
  if (printScaleEl) {
    printScaleEl.addEventListener('change', updatePrintPreview);
  }
  if (state.map) {
    state.map.on('moveend', updatePrintPreview);
    state.map.on('zoomend', updatePrintPreview);
  }

  // Generate PDF button
  var printGenerateBtn = document.getElementById('print-generate-btn');
  if (printGenerateBtn) {
    printGenerateBtn.addEventListener('click', async function() {
      var btn = this;
      var originalHTML = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> ' + t('print.generating');

      try {
        await doGeneratePDF();
      } catch (e) {
        console.error('PDF error:', e);
        if (e.message === 'timeout') {
          alert(t('print.error.timeout'));
        } else {
          alert(t('error.pdf', { message: e.message }));
        }
      }

      hideProgress();
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    });
  }
}

async function doGeneratePDF() {
  var orientation = document.getElementById('print-orientation').value;
  var scaleOption = document.getElementById('print-scale').value;
  var includeLegend = document.getElementById('print-legend').checked;
  var includeTitle = document.getElementById('print-title').checked;
  var includeLabels = document.getElementById('print-labels') ? document.getElementById('print-labels').checked : true;
  var dpi = parseInt(document.getElementById('print-dpi') ? document.getElementById('print-dpi').value : '300');

  var dims = getPrintDimensions(orientation);
  var printScale = scaleOption === 'auto' ? getMapScale() : parseInt(scaleOption);
  var isLandscape = orientation.startsWith('landscape');
  var sizeLabel = orientation.split('-')[1].toUpperCase();
  var center = state.map.getCenter();

  // Step 1: Compute render parameters
  var params = computePrintParams(dims, printScale, dpi, center.lat);

  // Step 2: Clone the current map style
  showProgress(t('print.rendering'), 0.05);
  var style = cloneMapStyle(includeLabels);

  // Step 3: Render the map at high resolution
  var mapCanvas = await renderHighResMap(params, style, center, showProgress);

  // Step 4: Compose the PDF
  showProgress(t('print.composing'), 0.9);

  // Small delay to let the UI update
  await new Promise(function(r) { setTimeout(r, 50); });

  var mapDataUrl = mapCanvas.toDataURL('image/jpeg', 0.92);

  var jsPDF = window.jspdf.jsPDF;
  var pdf = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [dims.width, dims.height]
  });

  var pw = dims.width;
  var ph = dims.height;
  var m = 10; // margin mm
  var y = m;

  // === HEADER ===
  if (includeTitle) {
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(t('share.title'), m, y + 5);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100);
    var dateStr = new Date().toLocaleDateString(getLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
    pdf.text(t('print.date', { date: dateStr }), pw - m, y + 5, { align: 'right' });
    y += 8;
    pdf.setDrawColor(50);
    pdf.setLineWidth(0.5);
    pdf.line(m, y, pw - m, y);
    y += 3;
    pdf.setTextColor(0);
  }

  // === MAP IMAGE ===
  var legendSpace = includeLegend ? 16 : 0;
  var footerSpace = 10;
  var mapAreaW = pw - m * 2;
  var mapAreaH = ph - y - m - legendSpace - footerSpace;
  var mapY = y;

  pdf.addImage(mapDataUrl, 'JPEG', m, mapY, mapAreaW, mapAreaH);

  // Map border
  pdf.setDrawColor(150);
  pdf.setLineWidth(0.3);
  pdf.rect(m, mapY, mapAreaW, mapAreaH);

  // === CORNER COORDINATES ===
  var corners = computeCornerCoords(center, params.zoom, params.canvasW, params.canvasH);
  pdf.setFontSize(5);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(80);

  // NW corner
  var coordBgW = 28;
  var coordBgH = 4;
  pdf.setFillColor(255, 255, 255);
  pdf.rect(m + 1, mapY + 1, coordBgW, coordBgH, 'F');
  pdf.text(formatCoord(corners.nw.lat, corners.nw.lng), m + 2, mapY + 3.5);

  // NE corner
  var neText = formatCoord(corners.ne.lat, corners.ne.lng);
  var neW = pdf.getTextWidth(neText) + 2;
  pdf.setFillColor(255, 255, 255);
  pdf.rect(m + mapAreaW - neW - 1, mapY + 1, neW + 1, coordBgH, 'F');
  pdf.text(neText, m + mapAreaW - 1, mapY + 3.5, { align: 'right' });

  // SW corner
  pdf.setFillColor(255, 255, 255);
  pdf.rect(m + 1, mapY + mapAreaH - coordBgH - 1, coordBgW, coordBgH, 'F');
  pdf.text(formatCoord(corners.sw.lat, corners.sw.lng), m + 2, mapY + mapAreaH - 1.5);

  // SE corner
  var seText = formatCoord(corners.se.lat, corners.se.lng);
  var seW = pdf.getTextWidth(seText) + 2;
  pdf.setFillColor(255, 255, 255);
  pdf.rect(m + mapAreaW - seW - 1, mapY + mapAreaH - coordBgH - 1, seW + 1, coordBgH, 'F');
  pdf.text(seText, m + mapAreaW - 1, mapY + mapAreaH - 1.5, { align: 'right' });

  // === SCALE BAR (bottom-left inside map) ===
  drawScaleBar(pdf, m + 4, mapY + mapAreaH - 12, printScale);

  // === NORTH ARROW (top-right inside map) ===
  drawNorthArrow(pdf, m + mapAreaW - 8, mapY + 8);

  y = mapY + mapAreaH + 3;

  // === LEGEND ===
  if (includeLegend) {
    y = drawLegend(pdf, m, y + 2, pw - m * 2);
    y += 2;
  }

  // === FOOTER ===
  pdf.setDrawColor(200);
  pdf.setLineWidth(0.2);
  pdf.line(m, ph - m - 5, pw - m, ph - m - 5);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(150);

  // Left: source
  pdf.text(t('print.source'), m, ph - m - 1);

  // Center: basemap name + center coordinates
  var basemapName = mapStyles[state.currentMapStyle] ? mapStyles[state.currentMapStyle].name : state.currentMapStyle;
  var centerText = t('print.basemap') + ': ' + basemapName + '  |  ' + t('print.center') + ': ' + center.lat.toFixed(5) + ', ' + center.lng.toFixed(5);
  pdf.text(centerText, pw / 2, ph - m - 1, { align: 'center' });

  // Right: copyright
  pdf.text(t('print.copyright', { year: new Date().getFullYear() }), pw - m, ph - m - 1, { align: 'right' });

  // === DOWNLOAD ===
  var filename = 'BBL-Karte-' + sizeLabel + '-' + dpi + 'dpi-' + new Date().toISOString().slice(0, 10) + '.pdf';
  pdf.save(filename);
}
