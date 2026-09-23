// Pure print maths of both prototypes: scale, resolution, tiling, bearing, preview parity, print style.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '..');
(async () => {
  let checked = 0;
  for (const prototype of ['prototype-simple', 'prototype-tabs']) {
    const load = name => import(pathToFileURL(path.join(ROOT, prototype, 'js', name + '.js')).href);
    const { computePrintParams, computeCornerCoords, offsetMapCenter, createPrintStyle, cropSizePx, printZoom,
      snapToNiceScale, niceScaleForViewport, MAX_PRINT_TILE_SIZE, PRINT_TILE_BLEED } = await load('print-geometry');
    const { metersPerPixel } = await load('geo');
    assert(Math.abs(metersPerPixel(0, 0) - 40075016.68557849 / 512) < 1e-6);

    // The print zoom is the web zoom of the scale: exact at the centre and independent of the resolution,
    // which only sets how many device pixels render one CSS pixel
    for (const lat of [0, 46.9, 75, -60]) {
      const center = { lng: 7.4, lat };
      for (const dpi of [150, 300]) {
        const params = computePrintParams({ width: 1169, height: 754 }, 25000, dpi, center); // A0 landscape map area
        assert(Math.abs(params.zoom - printZoom(25000, lat)) < 1e-3, 'the print zoom is the web zoom of the scale');
        assert(Math.abs(metersPerPixel(lat, params.zoom) * params.cssW - 1.169 * 25000) < 1e-6, 'the sheet covers exactly its width at the nominal scale');
        assert(Math.abs(params.pixelRatio - dpi / 96) < 1e-12);
        assert.equal(params.bleed, PRINT_TILE_BLEED);
        assert(params.needsTiling);
        // Tiles cover the CSS pixel area exactly; every rendered canvas (interior plus bleed) fits the device limit
        assert.equal(params.tiles.reduce((sum, tile) => sum + tile.width * tile.height, 0), params.cssW * params.cssH);
        assert(params.tiles.every(tile => (tile.width + 2 * params.bleed) * params.pixelRatio <= MAX_PRINT_TILE_SIZE + 1e-9 &&
          (tile.height + 2 * params.bleed) * params.pixelRatio <= MAX_PRINT_TILE_SIZE + 1e-9));
        // Shared edges of independently rendered tiles coincide in geography
        const first = params.tiles[0], next = params.tiles[1];
        const a = offsetMapCenter(first.center, first.width / 2, 0, params.zoom);
        const b = offsetMapCenter(next.center, -next.width / 2, 0, params.zoom);
        assert(Math.abs(a.lng - b.lng) < 1e-9 && Math.abs(a.lat - b.lat) < 1e-9);
        const below = params.tiles.find(tile => tile.x === 0 && tile.y === first.height);
        const c = offsetMapCenter(first.center, 0, first.height / 2, params.zoom);
        const d = offsetMapCenter(below.center, 0, -below.height / 2, params.zoom);
        assert(Math.abs(c.lng - d.lng) < 1e-9 && Math.abs(c.lat - d.lat) < 1e-9);
        const corners = computeCornerCoords(center, params.zoom, params.cssW, params.cssH);
        assert(corners.nw.lat > lat && corners.sw.lat < lat && corners.nw.lng < center.lng && corners.se.lng > center.lng);
        checked++;
      }
    }

    // Preview parity: the crop on screen is the printed area, at every format, resolution and scale
    const zoomWeb = 16, lat = 46.946;
    const mppWeb = metersPerPixel(lat, zoomWeb);
    for (const [w, h] of [[277, 153], [400, 236], [1169, 754]]) for (const dpi of [150, 300]) for (const scale of [1000, 2500, 25000]) {
      const params = computePrintParams({ width: w, height: h }, scale, dpi, { lng: 7.44, lat });
      const crop = cropSizePx({ width: w, height: h }, scale, mppWeb);
      const onScreen = 2 ** (zoomWeb - params.zoom);
      assert(Math.abs(crop.width - params.cssW * onScreen) < 1e-6, 'crop ' + crop.width + ' vs printed extent ' + params.cssW * onScreen);
      // The height keeps its own half-pixel rounding of the CSS size (below 0.1 % of the crop)
      assert(Math.abs(crop.height - params.cssH * onScreen) < Math.max(1, crop.height * 1e-3));
      checked++;
    }

    // Bearing follows MapLibre: the compass direction "bearing" points up, so a step to the right on screen
    // heads bearing + 90 degrees (verified against map.unproject in test/print-rendering.js)
    const c0 = { lng: 7.44, lat: 46.95 };
    const east = offsetMapCenter(c0, 100, 0, 15, 0), south = offsetMapCenter(c0, 0, 100, 15, 0);
    const right90 = offsetMapCenter(c0, 100, 0, 15, 90), down90 = offsetMapCenter(c0, 0, 100, 15, 90);
    assert(Math.abs(right90.lat - south.lat) < 1e-9 && Math.abs(right90.lng - c0.lng) < 1e-9, 'bearing 90: right is south');
    assert(Math.abs(down90.lng - (2 * c0.lng - east.lng)) < 1e-9 && Math.abs(down90.lat - c0.lat) < 1e-9, 'bearing 90: down is west');
    const right30 = offsetMapCenter(c0, 100, 0, 15, 30);
    assert(right30.lng > c0.lng && right30.lat < c0.lat, 'bearing 30: right heads east-south-east');
    const rotated = computePrintParams({ width: 400, height: 236 }, 10000, 300, c0, { bearing: 30 });
    assert.equal(rotated.bearing, 30);
    const turned = computeCornerCoords(c0, rotated.zoom, rotated.cssW, rotated.cssH, 30);
    const plain = computeCornerCoords(c0, rotated.zoom, rotated.cssW, rotated.cssH, 0);
    assert(Math.abs(turned.nw.lat - plain.nw.lat) > 1e-4, 'turned corners differ from north-up corners');
    const span = (p, q) => Math.hypot((p.lng - q.lng) * Math.cos(c0.lat * Math.PI / 180), p.lat - q.lat);
    assert(Math.abs(span(turned.nw, turned.se) - span(plain.nw, plain.se)) < 1e-6, 'the rotation preserves the page diagonal');
    // Tile seams stay exact under a bearing
    const seamA = offsetMapCenter(rotated.tiles[0].center, rotated.tiles[0].width / 2, 0, rotated.zoom, 30);
    const seamB = offsetMapCenter(rotated.tiles[1].center, -rotated.tiles[1].width / 2, 0, rotated.zoom, 30);
    assert(Math.abs(seamA.lng - seamB.lng) < 1e-9 && Math.abs(seamA.lat - seamB.lat) < 1e-9);

    // Automatic scale: round denominators; the largest one whose page fits the view
    assert.equal(snapToNiceScale(3082), 2500);
    assert.equal(snapToNiceScale(25000), 25000);
    assert.equal(snapToNiceScale(24999), 20000);
    assert.equal(snapToNiceScale(999), 500);
    assert.equal(snapToNiceScale(3), 10);
    const viewport = { width: 1180, height: 580 }, a4 = { width: 277, height: 153 };
    const fitted = niceScaleForViewport(a4, viewport, mppWeb);
    const fittedCrop = cropSizePx(a4, fitted, mppWeb);
    assert(fittedCrop.width <= viewport.width && fittedCrop.height <= viewport.height, 'the automatic page fits the view');
    const larger = cropSizePx(a4, fitted * 2, mppWeb);
    assert(larger.width > viewport.width || larger.height > viewport.height, 'the next round scale would not fit');

    // A smaller GPU limit shrinks the tiles and keeps the bleed within the canvas
    const small = computePrintParams(a4, 5000, 300, c0, { tileLimit: 1024 });
    assert(small.tiles.length > 1 && small.bleed > 0);
    assert(small.tiles.every(tile => (tile.width + 2 * small.bleed) * small.pixelRatio <= 1024 + 1e-9));

    // Print style: the web map's own rules minus interactive layers; labels and their collision obstacles
    // print at every scale when requested; zoom rules of the data layers stay
    const original = { version: 8, sources: { buildings: { type: 'geojson', cluster: true } }, layers: [
      { id: 'buildings-label-obstacles', type: 'symbol', source: 'buildings', minzoom: 15, layout: { 'icon-size': ['case', true, 1.57, 1] } },
      { id: 'buildings-selected', type: 'circle' },
      { id: 'buildings-clusters', type: 'circle', filter: ['has', 'point_count'] },
      { id: 'buildings-points', source: 'buildings', filter: ['!', ['has', 'point_count']] },
      { id: 'parcels-fill', source: 'parcels', minzoom: 12 },
      { id: 'buildings-labels', minzoom: 15.5, layout: {} },
      { id: 'parcels-labels', minzoom: 15.5, layout: {} }
    ] };
    const data = { type: 'FeatureCollection', features: [] };
    const hidden = createPrintStyle(original, { buildings: data }, false);
    assert.deepEqual(hidden.layers.map(layer => layer.id), ['buildings-label-obstacles', 'buildings-points', 'parcels-fill', 'buildings-labels', 'parcels-labels']);
    assert(hidden.layers.filter(layer => /labels$|obstacles$/.test(layer.id)).every(layer => layer.layout.visibility === 'none' && layer.minzoom === undefined));
    assert.equal(hidden.layers[0].layout['icon-size'], 1, 'no selection ring on paper');
    assert.equal(hidden.sources.buildings.data, data);
    assert.equal(hidden.sources.buildings.cluster, false);
    assert(!hidden.layers[1].filter);
    assert.equal(hidden.layers.find(layer => layer.id === 'parcels-fill').minzoom, 12, 'zoom rules of the data layers stay');
    assert(original.sources.buildings.cluster && original.layers.length === 7 && original.layers[5].minzoom === 15.5, 'the live style is untouched');
    const visible = createPrintStyle(original, {}, true);
    assert(visible.layers.filter(layer => /labels$|obstacles$/.test(layer.id)).every(layer => layer.minzoom === undefined && layer.layout.visibility !== 'none'));
  }
  console.log('PASS print scale, resolution, tile coverage and seams at ' + checked + ' combinations, bearing, preview parity, automatic scale and print styles');
})().catch(error => { console.error(error); process.exitCode = 1; });
