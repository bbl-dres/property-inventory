const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  let checked = 0;
  for (const prototype of ['prototype-simple', 'prototype-tabs']) {
    const load = name => import(pathToFileURL(path.resolve(prototype, 'js', name + '.js')));
    const { computePrintParams, computeCornerCoords, offsetMapCenter, createPrintStyle, MAX_PRINT_TILE_SIZE } = await load('print-geometry');
    const { metersPerPixel } = await load('geo');
    assert(Math.abs(metersPerPixel(0, 0) - 40075016.68557849 / 512) < 1e-6);
    for (const lat of [0, 46.9, 75, -60]) {
      const center = { lng: 7.4, lat };
      const params = computePrintParams({ width: 821, height: 1142 }, 25000, 600, center);
      assert(params.needsTiling);
      assert(Math.abs(metersPerPixel(lat, params.zoom) - 25000 * .0254 / 600) < 1e-8);
      assert.equal(params.tiles.reduce((sum, tile) => sum + tile.width * tile.height, 0), params.canvasW * params.canvasH);
      assert(params.tiles.every(tile => tile.width <= MAX_PRINT_TILE_SIZE && tile.height <= MAX_PRINT_TILE_SIZE));
      // Shared edges of independently rendered tiles must coincide in geography.
      const first = params.tiles[0], next = params.tiles[1];
      const a = offsetMapCenter(first.center, first.width / 2, 0, params.zoom);
      const b = offsetMapCenter(next.center, -next.width / 2, 0, params.zoom);
      assert(Math.abs(a.lng - b.lng) < 1e-9 && Math.abs(a.lat - b.lat) < 1e-9);
      const below = params.tiles.find(tile => tile.px === 0 && tile.py === MAX_PRINT_TILE_SIZE);
      const c = offsetMapCenter(first.center, 0, first.height / 2, params.zoom);
      const d = offsetMapCenter(below.center, 0, -below.height / 2, params.zoom);
      assert(Math.abs(c.lng - d.lng) < 1e-9 && Math.abs(c.lat - d.lat) < 1e-9);
      const corners = computeCornerCoords(center, params.zoom, params.canvasW, params.canvasH);
      assert(corners.nw.lat > lat && corners.sw.lat < lat && corners.nw.lng < center.lng && corners.se.lng > center.lng);
      checked++;
    }
    const original = { version: 8, sources: { buildings: { type: 'geojson', cluster: true } }, layers: [
      { id: 'buildings-label-obstacles', type: 'symbol' },
      { id: 'buildings-selected', type: 'circle' },
      { id: 'buildings-points', source: 'buildings', filter: ['!', ['has', 'point_count']] },
      { id: 'buildings-labels', minzoom: 15.5, layout: {} },
      { id: 'parcels-labels', minzoom: 15.5, layout: {} }
    ] };
    const data = { type: 'FeatureCollection', features: [] };
    const hidden = createPrintStyle(original, { buildings: data }, false);
    assert.equal(hidden.layers.length, 3);
    assert(hidden.layers.filter(layer => layer.id.endsWith('labels')).every(layer => layer.layout.visibility === 'none'));
    assert.equal(hidden.sources.buildings.data, data);
    assert(!hidden.layers[0].filter);
    assert(original.sources.buildings.cluster && original.layers.length === 5 && original.layers[3].minzoom === 15.5);
    const visible = createPrintStyle(original, {}, true);
    assert(visible.layers.filter(layer => layer.id.endsWith('labels')).every(layer => layer.minzoom === undefined && layer.layout.visibility !== 'none'));
  }
  console.log('PASS print scale, tile coverage and seams at ' + checked + ' locations, label controls and non-mutating print styles');
})().catch(error => { console.error(error); process.exitCode = 1; });
