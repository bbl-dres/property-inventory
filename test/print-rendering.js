// Exercise real offscreen WebGL tiles while recording PDF placement (no download).
const assert = require('node:assert/strict');
const { launchBrowser, openPage, navigate, evaluate, BASE, VIEWPORTS } = require('./visual');
(async () => {
  const { proc, cdp } = await launchBrowser();
  try {
    for (const prototype of ['prototype-simple', 'prototype-tabs']) {
      const page = await openPage(cdp, VIEWPORTS.desktop);
      const run = expression => evaluate(cdp, page.sessionId, expression);
      await navigate(cdp, page.sessionId, BASE + prototype + '/');
      await run(`(async () => {
        const state = (await import('./js/state.js')).state;
        state.filteredData = { type: 'FeatureCollection', features: [state.buildingsData.features[0]] };
        state.map.setStyle({version:8,sources:{buildings:{type:'geojson',data:state.buildingsData}},layers:[
          {id:'background',type:'background',paint:{'background-color':'#eef2f4'}},
          {id:'buildings-points',type:'circle',source:'buildings',paint:{'circle-color':'#34834b','circle-radius':8}}
        ]});
        await new Promise(resolve => state.map.once('idle', resolve));
        state.map.jumpTo({center:state.filteredData.features[0].geometry.coordinates,zoom:16,pitch:0,bearing:0});
        window.printProbe = { images: [], maps: [], canvases: [], saved: null };
        const OriginalMap = maplibregl.Map;
        maplibregl.Map = class extends OriginalMap {
          constructor(options) { super(options); printProbe.maps.push(options); }
        };
        const encode = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(...args) { printProbe.canvases.push(this); return encode.apply(this,args); };
        window.jspdf = { jsPDF: function() {
          return new Proxy({}, { get: (_, key) => key === 'addImage' ? (...args) => printProbe.images.push(args.slice(2)) :
            key === 'save' ? name => printProbe.saved = name : key === 'getTextWidth' ? () => 20 : () => {} });
        }};
        document.getElementById('print-orientation').value = 'landscape-a3';
        document.getElementById('print-scale').value = '10000';
        document.getElementById('print-dpi').value = '300';
        document.getElementById('print-labels').checked = false;
        document.getElementById('print-generate-btn').click();
      })()`);
      let result;
      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        result = await run(`({saved:printProbe.saved,images:printProbe.images,maps:printProbe.maps.map(m=>({count:m.style.sources.buildings.data.features.length,preserved:m.canvasContextAttributes.preserveDrawingBuffer})),released:printProbe.canvases.every(c=>c.width===0&&c.height===0)})`);
        if (result.saved) break;
      }
      assert(result.saved?.includes('A3-300dpi'), prototype + ': print completed');
      assert.equal(result.images.length, 2, 'two bounded tiles rather than one oversized canvas');
      const [left, right] = result.images;
      assert(Math.abs(left[0] + left[2] - right[0]) < 1e-7, 'tiles meet without gaps');
      assert(Math.abs(left[2] + right[2] - 400) < 1e-7, 'map occupies 400mm');
      assert.equal(left[1], right[1]); assert.equal(left[3], right[3]);
      assert(result.maps.every(map => map.count === 1 && map.preserved), 'print retains filters and only offscreen canvases preserve buffers');
      assert(result.released, 'tile buffers released after encoding');
      assert.deepEqual(page.errors, [], prototype + ': no browser errors');
      console.log('PASS ' + prototype + ': real tiled WebGL print, filtered features, PDF placement and canvas release');
      await cdp.send('Target.closeTarget', { targetId: page.targetId });
    }
  } finally { proc.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
