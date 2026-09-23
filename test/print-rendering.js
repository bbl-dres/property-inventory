// Exercise real offscreen WebGL tiles while recording PDF placement (no download): symbol sizes on
// paper match the screen, the preview crop is the printed extent, bearing follows MapLibre.
// Start a static server for the repository root on :8123 (or set BASE_URL), then: node test/print-rendering.js
const assert = require('node:assert/strict');
const { launchBrowser, openPage, navigate, evaluate, BASE, VIEWPORTS } = require('./visual');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Runs one print with the given form values and returns the recorded probe once the PDF is "saved"
async function printOnce(run, settings) {
  await run(`(async () => {
    Object.assign(printProbe, { images: [], maps: [], canvases: [], dots: [], warnings: [], saved: null });
    document.getElementById('print-orientation').value = '${settings.orientation}';
    document.getElementById('print-scale').value = '${settings.scale}';
    document.getElementById('print-dpi').value = '${settings.dpi}';
    document.getElementById('print-labels').checked = ${settings.labels};
    document.getElementById('print-generate-btn').click();
  })()`);
  let result;
  for (let attempt = 0; attempt < 120; attempt++) {
    await sleep(500);
    result = await run(`({saved:printProbe.saved,images:printProbe.images,dots:printProbe.dots,warnings:printProbe.warnings,
      maps:printProbe.maps.map(m=>({count:m.style.sources.buildings.data.features.length,preserved:m.canvasContextAttributes.preserveDrawingBuffer,
        pixelRatio:m.pixelRatio,bearing:m.bearing,pitch:m.pitch,maxCanvasSize:m.maxCanvasSize,hasObstacle:m.style.layers.some(l=>l.id==='buildings-label-obstacles')})),
      released:printProbe.canvases.every(c=>c.width===0&&c.height===0)})`);
    if (result.saved) break;
  }
  assert(result.saved, 'print completed: ' + JSON.stringify(settings));
  return result;
}

(async () => {
  const { proc, cdp } = await launchBrowser();
  try {
    for (const prototype of ['prototype-simple', 'prototype-tabs']) {
      const page = await openPage(cdp, VIEWPORTS.desktop);
      const run = expression => evaluate(cdp, page.sessionId, expression);
      await navigate(cdp, page.sessionId, BASE + prototype + '/');
      await run(`(async () => {
        const state = (await import('./js/state.js')).state;
        window.printGeometry = await import('./js/print-geometry.js');
        window.printModule = await import('./js/print.js');
        state.filteredData = { type: 'FeatureCollection', features: [state.buildingsData.features[0]] };
        state.map.jumpTo({center:state.filteredData.features[0].geometry.coordinates,zoom:16,pitch:0,bearing:0});
        window.printProbe = { images: [], maps: [], canvases: [], dots: [], warnings: [], saved: null };
        const OriginalMap = maplibregl.Map;
        maplibregl.Map = class extends OriginalMap {
          constructor(options) { super(options); printProbe.maps.push(options); }
        };
        const warn = console.warn;
        console.warn = function(...args) { printProbe.warnings.push(args.map(String).join(' ')); return warn.apply(this, args); };
        const encode = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(...args) {
          printProbe.canvases.push(this);
          // Bounding box of the green test dot in this tile (device pixels)
          const px = this.getContext('2d').getImageData(0, 0, this.width, this.height).data;
          let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
          for (let i = 0; i < px.length; i += 4) {
            if (px[i] < 90 && px[i + 1] > 100 && px[i + 2] < 110) {
              const x = (i / 4) % this.width, y = Math.floor(i / 4 / this.width);
              if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
          if (maxX >= 0) printProbe.dots.push({ w: maxX - minX + 1, h: maxY - minY + 1 });
          return encode.apply(this, args);
        };
        window.jspdf = { jsPDF: function() {
          return new Proxy({}, { get: (_, key) => key === 'addImage' ? (...args) => printProbe.images.push(args.slice(1)) :
            key === 'save' ? name => printProbe.saved = name : key === 'getTextWidth' ? () => 20 : () => {} });
        }};
      })()`);

      // 1. The live style with labels: the runtime collision image reaches the offscreen maps, one lossless tile
      const live = await printOnce(run, { orientation: 'landscape-a4', scale: '10000', dpi: '150', labels: true });
      assert(live.saved.includes('A4-150dpi') && live.images.length === 1 && live.images[0][0] === 'PNG', prototype + ': A4 at 150 dpi is one lossless tile');
      assert(live.maps.every(map => map.hasObstacle), 'label collision obstacles stay in the print style');
      assert(!live.warnings.some(w => /could not be loaded|styleimagemissing|building-label-obstacle/.test(w)), 'no missing-image warnings: ' + live.warnings.join(' | '));

      // 2. A simple style with a known dot, the view turned by 30 degrees: two bounded tiles, bearing honoured,
      //    a 16 CSS px dot measures 50 device px at 300 dpi
      await run(`(async () => {
        const state = (await import('./js/state.js')).state;
        state.map.setStyle({version:8,sources:{buildings:{type:'geojson',data:state.buildingsData}},layers:[
          {id:'background',type:'background',paint:{'background-color':'#eef2f4'}},
          {id:'buildings-points',type:'circle',source:'buildings',paint:{'circle-color':'#34834b','circle-radius':8}}
        ]});
        await new Promise(resolve => state.map.once('idle', resolve));
        state.map.jumpTo({center:state.filteredData.features[0].geometry.coordinates,zoom:16,pitch:0,bearing:30});
      })()`);
      const turned = await printOnce(run, { orientation: 'landscape-a3', scale: '10000', dpi: '300', labels: false });
      assert(turned.saved.includes('A3-300dpi'), prototype + ': A3 print completed');
      assert.equal(turned.images.length, 2, 'two bounded tiles rather than one oversized canvas');
      const [left, right] = turned.images; // [format, x, y, width, height]
      assert.equal(left[0], 'JPEG', 'a 13 megapixel page is encoded as JPEG');
      assert(Math.abs(left[1] + left[3] - right[1]) < 1e-7, 'tiles meet without gaps');
      assert(Math.abs(left[3] + right[3] - 400) < 1e-7, 'map occupies 400mm');
      assert.equal(left[2], right[2]); assert.equal(left[4], right[4]);
      assert(turned.maps.every(map => map.count === 1 && map.preserved), 'print retains filters and only offscreen canvases preserve buffers');
      assert(turned.maps.every(map => Math.abs(map.pixelRatio - 3.125) < 1e-9 && map.bearing === 30 && map.pitch === 0 && map.maxCanvasSize[0] === 4096),
        'offscreen maps render the web zoom at 300/96 device pixels per CSS pixel with the view bearing');
      assert(turned.dots.length === 1 && Math.abs(turned.dots[0].w - 50) <= 5 && Math.abs(turned.dots[0].h - 50) <= 5,
        'a 16 CSS px dot prints as 50 device px at 300 dpi: ' + JSON.stringify(turned.dots));
      assert(turned.released, 'tile buffers released after encoding');

      // 3. The same dot at 150 dpi measures 25 device px: symbol size follows the resolution, not the scale
      const coarse = await printOnce(run, { orientation: 'landscape-a4', scale: '2500', dpi: '150', labels: false });
      assert(coarse.dots.length === 1 && Math.abs(coarse.dots[0].w - 25) <= 4, 'a 16 CSS px dot prints as 25 device px at 150 dpi: ' + JSON.stringify(coarse.dots));

      // 4. The preview crop is the printed extent; offsetMapCenter matches map.unproject under a bearing
      const parity = await run(`(async () => {
        const state = (await import('./js/state.js')).state;
        const map = state.map;
        document.getElementById('print-orientation').value = 'landscape-a3';
        document.getElementById('print-scale').value = '10000';
        document.querySelector('.accordion-item[data-accordion="print"] .accordion-header').click();
        await new Promise(r => setTimeout(r, 900));
        const crop = document.querySelector('.print-preview-crop');
        const layout = printModule.getPrintLayout(printModule.getPrintDimensions('landscape-a3'), true, true, 0);
        const params = printGeometry.computePrintParams({ width: layout.mapW, height: layout.mapH }, 10000, 300, map.getCenter(), { bearing: map.getBearing() });
        const onScreen = 2 ** (map.getZoom() - params.zoom);
        const c = map.getCenter(); const p = map.project([c.lng, c.lat]);
        const live = map.unproject([p.x + 100, p.y + 40]);
        const formula = printGeometry.offsetMapCenter(c, 100, 40, map.getZoom(), map.getBearing());
        const mapRect = document.getElementById('map').getBoundingClientRect();
        return { crop: parseFloat(crop.style.width), expected: params.cssW * onScreen, cropH: parseFloat(crop.style.height), expectedH: params.cssH * onScreen,
          fits: parseFloat(crop.style.width) <= mapRect.width && parseFloat(crop.style.height) <= mapRect.height,
          live: [live.lng, live.lat], formula: [formula.lng, formula.lat], label: document.querySelector('.print-preview-label').textContent,
          overflowClass: document.querySelector('.print-preview-overlay').classList.contains('overflow') };
      })()`);
      assert(Math.abs(parity.crop - parity.expected) < 1.5 && Math.abs(parity.cropH - parity.expectedH) < 1.5, 'preview crop equals the printed extent: ' + JSON.stringify(parity));
      assert(parity.fits && !parity.overflowClass, 'opening the print item fitted the explicit scale to the view');
      assert(Math.abs(parity.live[0] - parity.formula[0]) < 1e-7 && Math.abs(parity.live[1] - parity.formula[1]) < 1e-7, 'offsetMapCenter matches map.unproject under bearing');
      assert(/1:10'000/.test(parity.label), 'badge shows the scale: ' + parity.label);

      assert.deepEqual(page.errors, [], prototype + ': no browser errors');
      console.log('PASS ' + prototype + ': real WebGL prints at both resolutions, symbol sizes, bearing, tiling and preview parity');
      await cdp.send('Target.closeTarget', { targetId: page.targetId });
    }
  } finally { proc.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
