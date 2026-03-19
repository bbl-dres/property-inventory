// Print PDF generation, print preview overlay, and print dimensions

import { state } from './state.js';
import { statusColors, paperSizes } from './config.js';
import { formatNum } from './utils.js';
import { t, getLocale } from './i18n.js';

export function getPrintDimensions(orientation) {
  const parts = orientation.split('-');  // e.g., 'landscape-a4'
  const dir = parts[0];
  const size = parts[1];
  const base = paperSizes[size] || paperSizes['a4'];
  if (dir === 'landscape') {
    return { width: base.height, height: base.width };
  }
  return { width: base.width, height: base.height };
}

export function getMapScale() {
  if (!state.map) return 25000;
  const center = state.map.getCenter();
  const zoom = state.map.getZoom();
  const metersPerPixel = 156543.03392 * Math.cos(center.lat * Math.PI / 180) / Math.pow(2, zoom);
  const pixelsPerMeter = 96 / 0.0254;
  return Math.round(metersPerPixel * pixelsPerMeter);
}

export function createCoordinateGrid() {
  // Create a simple SVG grid overlay
  return '<svg width="100%" height="100%" style="position: absolute; top: 0; left: 0;">' +
    '<defs><pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">' +
    '<path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(0,0,0,0.15)" stroke-width="0.5"/>' +
    '</pattern></defs>' +
    '<rect width="100%" height="100%" fill="url(#grid)"/>' +
    '</svg>';
}

export function createPrintPreviewOverlay() {
  if (state.printPreviewOverlay) return;

  // Append to #map (the actual map canvas container), not #map-view
  const mapEl = document.getElementById('map');
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

  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  const orientation = document.getElementById('print-orientation').value;
  const scaleOption = document.getElementById('print-scale').value;
  const printDims = getPrintDimensions(orientation);

  // Determine print scale
  const printScale = scaleOption === 'auto' ? getMapScale() : parseInt(scaleOption);

  // Calculate ground extent of the printed page (in meters)
  // Paper dimensions are in mm; scale converts to meters on the ground
  const groundWidthM = (printDims.width / 1000) * printScale;   // e.g., 297mm at 1:25000 = 7425m
  const groundHeightM = (printDims.height / 1000) * printScale;

  // Convert ground meters to screen pixels at current zoom
  const center = state.map.getCenter();
  const metersPerPixel = 156543.03392 * Math.cos(center.lat * Math.PI / 180) / Math.pow(2, state.map.getZoom());

  let cropWidth = groundWidthM / metersPerPixel;
  let cropHeight = groundHeightM / metersPerPixel;

  // Clamp to map container size (don't exceed visible area)
  const mapRect = mapEl.getBoundingClientRect();
  const maxW = mapRect.width - 20;
  const maxH = mapRect.height - 20;
  if (cropWidth > maxW || cropHeight > maxH) {
    const shrink = Math.min(maxW / cropWidth, maxH / cropHeight);
    cropWidth *= shrink;
    cropHeight *= shrink;
  }

  // Center the crop area in the map
  const cropX = (mapRect.width - cropWidth) / 2;
  const cropY = (mapRect.height - cropHeight) / 2;

  // Update SVG mask rectangle
  const maskRect = state.printPreviewOverlay.querySelector('#print-crop-rect');
  if (maskRect) {
    maskRect.setAttribute('x', cropX);
    maskRect.setAttribute('y', cropY);
    maskRect.setAttribute('width', cropWidth);
    maskRect.setAttribute('height', cropHeight);
  }

  // Update crop border element
  const cropBorder = state.printPreviewOverlay.querySelector('.print-preview-crop');
  if (cropBorder) {
    cropBorder.style.left = cropX + 'px';
    cropBorder.style.top = cropY + 'px';
    cropBorder.style.width = cropWidth + 'px';
    cropBorder.style.height = cropHeight + 'px';
  }

  // Update label
  const labelEl = state.printPreviewOverlay.querySelector('.print-preview-label');
  if (labelEl) {
    const formatLabel = orientation.includes('a3') ? 'A3' : 'A4';
    const orientLabel = orientation.includes('landscape') ? t('print.landscape') : t('print.portrait');
    const formattedScale = formatNum(printScale, 0);
    labelEl.textContent = formatLabel + ' ' + orientLabel + ' \u2014 1:' + formattedScale;
  }
}

export function generatePrintPDF() {
  const orientation = document.getElementById('print-orientation').value;
  const scale = document.getElementById('print-scale').value;
  const includeLegend = document.getElementById('print-legend').checked;
  const includeGrid = document.getElementById('print-grid').checked;

  const btn = document.getElementById('print-pdf-btn');
  const originalText = btn.textContent;
  btn.textContent = t('print.generating');
  btn.disabled = true;

  // Get print dimensions based on orientation
  const printDimensions = getPrintDimensions(orientation);

  // Create print container
  const printContainer = document.createElement('div');
  printContainer.id = 'print-container';
  printContainer.style.cssText = 'position: fixed; top: 0; left: 0; width: ' + printDimensions.width + 'mm; height: ' + printDimensions.height + 'mm; background: white; z-index: 10000; padding: 10mm; box-sizing: border-box;';

  // Create header
  const header = document.createElement('div');
  header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 5mm; padding-bottom: 3mm; border-bottom: 1px solid #ccc;';
  header.innerHTML = '<div style="font-size: 14pt; font-weight: bold;">' + t('share.title') + '</div><div style="font-size: 10pt; color: #666;">' + new Date().toLocaleDateString(getLocale()) + '</div>';
  printContainer.appendChild(header);

  // Create map container
  const mapContainer = document.createElement('div');
  let mapHeight = printDimensions.height - 40; // Account for header and footer
  if (includeLegend) mapHeight -= 25; // Reserve space for legend
  mapContainer.style.cssText = 'width: 100%; height: ' + mapHeight + 'mm; border: 1px solid #ccc; position: relative; overflow: hidden;';

  // Clone map canvas
  if (state.map) {
    const mapCanvas = state.map.getCanvas();
    const clonedCanvas = document.createElement('canvas');
    clonedCanvas.width = mapCanvas.width;
    clonedCanvas.height = mapCanvas.height;
    const ctx = clonedCanvas.getContext('2d');
    ctx.drawImage(mapCanvas, 0, 0);
    clonedCanvas.style.cssText = 'width: 100%; height: 100%; object-fit: contain;';
    mapContainer.appendChild(clonedCanvas);

    // Add coordinate grid overlay if requested
    if (includeGrid) {
      const gridOverlay = document.createElement('div');
      gridOverlay.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;';
      gridOverlay.innerHTML = createCoordinateGrid();
      mapContainer.appendChild(gridOverlay);
    }

    // Add scale bar
    const scaleBar = document.createElement('div');
    scaleBar.style.cssText = 'position: absolute; bottom: 5mm; left: 5mm; background: rgba(255,255,255,0.9); padding: 2mm 3mm; border-radius: 2px; font-size: 8pt;';
    const currentScale = scale === 'auto' ? Math.round(getMapScale()) : parseInt(scale);
    scaleBar.textContent = t('print.scale', {scale: currentScale.toLocaleString(getLocale())});
    mapContainer.appendChild(scaleBar);

    // Add north arrow
    const northArrow = document.createElement('div');
    northArrow.style.cssText = 'position: absolute; top: 5mm; right: 5mm; background: rgba(255,255,255,0.9); padding: 2mm; border-radius: 2px; text-align: center;';
    northArrow.innerHTML = '<div style="font-size: 16pt;">\u2191</div><div style="font-size: 8pt;">N</div>';
    mapContainer.appendChild(northArrow);
  }
  printContainer.appendChild(mapContainer);

  // Add legend if requested
  if (includeLegend) {
    const legend = document.createElement('div');
    legend.style.cssText = 'margin-top: 5mm; padding: 3mm; border: 1px solid #ccc; font-size: 9pt;';
    legend.innerHTML = '<div style="font-weight: bold; margin-bottom: 2mm;">' + t('print.legend') + '</div>' +
      '<div style="display: flex; gap: 10mm; flex-wrap: wrap;">' +
      '<span><span style="display: inline-block; width: 10px; height: 10px; background: ' + statusColors['Aktiv'] + '; border-radius: 50%; margin-right: 2mm;"></span>' + t('print.legend.active') + '</span>' +
      '<span><span style="display: inline-block; width: 10px; height: 10px; background: ' + statusColors['In Renovation'] + '; border-radius: 50%; margin-right: 2mm;"></span>' + t('print.legend.renovation') + '</span>' +
      '<span><span style="display: inline-block; width: 10px; height: 10px; background: ' + statusColors['In Planung'] + '; border-radius: 50%; margin-right: 2mm;"></span>' + t('print.legend.planning') + '</span>' +
      '<span><span style="display: inline-block; width: 10px; height: 10px; background: ' + statusColors['Verkauft'] + '; border-radius: 50%; margin-right: 2mm;"></span>' + t('print.legend.inactive') + '</span>' +
      '</div>';
    printContainer.appendChild(legend);
  }

  // Add footer
  const footer = document.createElement('div');
  footer.style.cssText = 'margin-top: 3mm; padding-top: 3mm; border-top: 1px solid #ccc; font-size: 8pt; color: #666; display: flex; justify-content: space-between;';
  footer.innerHTML = '<span>' + t('print.source') + '</span><span>' + t('print.copyright', {year: new Date().getFullYear()}) + '</span>';
  printContainer.appendChild(footer);

  document.body.appendChild(printContainer);

  // Create print-specific styles
  const printStyles = document.createElement('style');
  printStyles.id = 'print-styles';
  printStyles.textContent = '@media print { body > *:not(#print-container) { display: none !important; } #print-container { position: static !important; } @page { size: ' + (orientation.includes('landscape') ? 'landscape' : 'portrait') + '; margin: 0; } }';
  document.head.appendChild(printStyles);

  // Trigger print dialog
  setTimeout(function() {
    window.print();

    // Cleanup after print dialog closes
    setTimeout(function() {
      document.body.removeChild(printContainer);
      document.head.removeChild(printStyles);
      btn.textContent = originalText;
      btn.disabled = false;
    }, 500);
  }, 100);
}

export function initPrintWidget() {
  // Print preview: orientation change and map move update the overlay
  const printOrientationEl = document.getElementById('print-orientation');
  if (printOrientationEl) {
    printOrientationEl.addEventListener('change', updatePrintPreview);
  }
  const printScaleEl = document.getElementById('print-scale');
  if (printScaleEl) {
    printScaleEl.addEventListener('change', updatePrintPreview);
  }
  if (state.map) {
    state.map.on('moveend', updatePrintPreview);
    state.map.on('zoomend', updatePrintPreview);
  }

  // Generate PDF and download directly using jsPDF
  const printGenerateBtn = document.getElementById('print-generate-btn');
  if (printGenerateBtn) {
    printGenerateBtn.addEventListener('click', function() {
      const btn = this;
      const originalHTML = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> ' + t('print.generating');

      const orientation = document.getElementById('print-orientation').value;
      const scaleOption = document.getElementById('print-scale').value;
      const includeLegend = document.getElementById('print-legend').checked;
      const includeTitle = document.getElementById('print-title').checked;
      const dims = getPrintDimensions(orientation);
      const printScale = scaleOption === 'auto' ? getMapScale() : parseInt(scaleOption);
      const isLandscape = orientation.startsWith('landscape');
      const sizeLabel = orientation.split('-')[1].toUpperCase(); // A4, A3, etc.

      setTimeout(function() {
        try {
          // Capture map canvas crop
          const mapCanvas = state.map.getCanvas();
          const srcW = mapCanvas.width;
          const srcH = mapCanvas.height;

          const center = state.map.getCenter();
          const metersPerPixel = 156543.03392 * Math.cos(center.lat * Math.PI / 180) / Math.pow(2, state.map.getZoom());
          const groundW = (dims.width / 1000) * printScale;
          const groundH = (dims.height / 1000) * printScale;
          const cropPxW = groundW / metersPerPixel;
          const cropPxH = groundH / metersPerPixel;

          const dpr = window.devicePixelRatio || 1;
          const cropSrcW = Math.min(cropPxW * dpr, srcW);
          const cropSrcH = Math.min(cropPxH * dpr, srcH);
          const cropSrcX = (srcW - cropSrcW) / 2;
          const cropSrcY = (srcH - cropSrcH) / 2;

          // Create hi-res canvas for the map image
          const mapImgCanvas = document.createElement('canvas');
          mapImgCanvas.width = Math.round(cropSrcW);
          mapImgCanvas.height = Math.round(cropSrcH);
          const mctx = mapImgCanvas.getContext('2d');
          mctx.drawImage(mapCanvas, cropSrcX, cropSrcY, cropSrcW, cropSrcH, 0, 0, mapImgCanvas.width, mapImgCanvas.height);
          const mapDataUrl = mapImgCanvas.toDataURL('image/jpeg', 0.92);

          // Create PDF with jsPDF
          const jsPDF = window.jspdf.jsPDF;
          const pdf = new jsPDF({
            orientation: isLandscape ? 'landscape' : 'portrait',
            unit: 'mm',
            format: [dims.width, dims.height]
          });

          const pw = dims.width;   // page width mm
          const ph = dims.height;  // page height mm
          const m = 10;            // margin mm

          let y = m; // current y position

          // Header
          if (includeTitle) {
            pdf.setFontSize(14);
            pdf.setFont('helvetica', 'bold');
            pdf.text(t('share.title'), m, y + 5);
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(100);
            const dateStr = new Date().toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
            pdf.text(dateStr, pw - m, y + 5, { align: 'right' });
            y += 8;
            pdf.setDrawColor(50);
            pdf.setLineWidth(0.5);
            pdf.line(m, y, pw - m, y);
            y += 3;
            pdf.setTextColor(0);
          }

          // Map image
          const mapAreaW = pw - m * 2;
          const legendSpace = includeLegend ? 8 : 0;
          const footerSpace = 8;
          const mapAreaH = ph - y - m - legendSpace - footerSpace;
          pdf.addImage(mapDataUrl, 'JPEG', m, y, mapAreaW, mapAreaH);

          // Map border
          pdf.setDrawColor(180);
          pdf.setLineWidth(0.3);
          pdf.rect(m, y, mapAreaW, mapAreaH);

          // Scale bar (bottom-left inside map)
          const scaleText = t('print.scale', {scale: formatNum(printScale, 0)});
          pdf.setFillColor(255, 255, 255);
          pdf.setFontSize(7);
          const stw = pdf.getTextWidth(scaleText);
          pdf.rect(m + 3, y + mapAreaH - 7, stw + 4, 5, 'F');
          pdf.setTextColor(50);
          pdf.text(scaleText, m + 5, y + mapAreaH - 3.5);

          // North arrow (top-right inside map)
          const naX = m + mapAreaW - 6;
          const naY = y + 6;
          pdf.setFillColor(255, 255, 255);
          pdf.circle(naX, naY, 4, 'F');
          pdf.setDrawColor(180);
          pdf.circle(naX, naY, 4, 'S');
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(50);
          pdf.text('N', naX, naY + 1, { align: 'center' });

          y += mapAreaH + 3;

          // Legend
          if (includeLegend) {
            pdf.setFontSize(7);
            pdf.setFont('helvetica', 'normal');
            const legItems = [
              { r: 46, g: 125, b: 50, label: t('print.legend.active') },
              { r: 0, g: 152, b: 255, label: t('print.legend.renovation') },
              { r: 243, g: 150, b: 33, label: t('print.legend.planning') },
              { r: 158, g: 158, b: 158, label: t('print.legend.inactive') }
            ];
            let lx = m;
            legItems.forEach(function(item) {
              pdf.setFillColor(item.r, item.g, item.b);
              pdf.circle(lx + 2, y + 1.5, 1.8, 'F');
              pdf.setTextColor(50);
              pdf.text(item.label, lx + 5, y + 2.5);
              lx += pdf.getTextWidth(item.label) + 12;
            });
            y += 5;
          }

          // Footer
          pdf.setDrawColor(200);
          pdf.setLineWidth(0.2);
          pdf.line(m, ph - m - 4, pw - m, ph - m - 4);
          pdf.setFontSize(6);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(150);
          pdf.text(t('print.source'), m, ph - m);
          pdf.text(t('print.copyright', {year: new Date().getFullYear()}), pw - m, ph - m, { align: 'right' });

          // Download
          const filename = 'BBL-Karte-' + sizeLabel + '-' + new Date().toISOString().slice(0, 10) + '.pdf';
          pdf.save(filename);

        } catch (e) {
          console.error('PDF error:', e);
          alert(t('error.pdf', {message: e.message}));
        }

        btn.innerHTML = originalHTML;
        btn.disabled = false;
      }, 200);
    });
  }
}
