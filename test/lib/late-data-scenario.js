// Shared by simple-late-data.js and tabs-late-data.js: the map finishes loading before the data,
// and by the time the data arrives the map is busy again (tiles streaming after a pan), so
// map.loaded() is false although the single 'load' event has already fired. The data layers must
// still be added. The same scenario checks that a slow external search cannot paint stale results
// over a cleared search field, and the print layout that keeps the map's aspect ratio.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');

module.exports = function(prototype) {
  let releaseBuildings;
  const buildingsLater = new Promise(function(resolve) { releaseBuildings = resolve; });
  const buildings = JSON.parse(fs.readFileSync(path.join(ROOT, prototype, 'data', 'buildings.geojson'), 'utf8'));
  const expectedCount = buildings.features.length;
  const idOf = f => f.properties.bbl_id || f.properties.buildingId;

  return {
    name: prototype + ': data arriving after the map loaded, stale search results, print layout',
    boot: {
      prototype: prototype,
      url: 'http://localhost/' + prototype + '/',
      skipMapLoad: true,
      fetch: { 'data/buildings.geojson': function() { return buildingsLater; } }
    },
    async run(ctx, check) {
      const { window, document, map, modules, settle } = ctx;
      const state = modules.state.state;

      check('data still pending while the map loads', state.buildingsData === null && !document.getElementById('loading-overlay').classList.contains('hidden'));
      // A basemap like CARTO's: geometry, an early label, more geometry, flat buildings, a final label block
      map.addSource('carto', { type: 'vector', url: 'https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json' });
      [{ id: 'water', type: 'fill' }, { id: 'waterway-name', type: 'symbol' }, { id: 'roads', type: 'line' },
        { id: 'building', type: 'fill', source: 'carto', 'source-layer': 'building' }, { id: 'place-labels', type: 'symbol' }].forEach(function(layer) { map.addLayer(layer); });
      map.triggerLoad();            // basemap done: the one and only 'load' event
      map._loaded = false;          // a pan starts tile requests: map.loaded() is false again
      check('map.loaded() false after the load event', map.loaded() === false);

      releaseBuildings(buildings);
      await settle(80);
      check('data loaded (' + expectedCount + ')', state.buildingsData && state.buildingsData.features.length === expectedCount);
      check('overlay hidden', document.getElementById('loading-overlay').classList.contains('hidden'));
      check('data layers added although map.loaded() is false', !!map.getSource('buildings') && !!map.getLayer('buildings-points') && !!map.getLayer('buildings-clusters'));
      check('handlers bound once', map.listenerCount('click', 'buildings-points') === 1);
      check('rows rendered', document.querySelectorAll('#list-body tr[data-id]').length === expectedCount);

      // Layer order for the 3D view: ground data under the basemap's final label block, the application's
      // points and labels on top; the 3D buildings go between the ground data and the basemap labels
      const index = function(id) { return map._layers.findIndex(function(l) { return l.id === id; }); };
      check('ground data under the basemap labels, points and labels on top', index('parcels-fill') > index('roads') && index('parcels-fill') < index('place-labels') && index('place-labels') < index('buildings-points') && index('buildings-labels') > index('buildings-points') && (!map.getLayer('landcovers-fill') || index('landcovers-fill') < index('parcels-fill')));
      const btn3d = document.querySelector('.map-3d-btn');
      btn3d.click();
      check('3D toggle tilts the view and extrudes between the ground data and the basemap labels', map.getPitch() === 60 && !!map.getLayer('3d-buildings') && index('3d-buildings') > index('parcels-fill') && index('3d-buildings') < index('place-labels') && map.getLayoutProperty('building', 'visibility') === 'none' && btn3d.getAttribute('aria-pressed') === 'true' && /3d=1/.test(window.location.search) && /pitch=60/.test(window.location.search));
      map.flyTo({ center: [7.44, 46.95], zoom: 16, pitch: 0, bearing: 30 });
      check('a rotated flat view keeps its bearing in the URL', /bearing=30/.test(window.location.search) && !/pitch=/.test(window.location.search));
      const controls = await import(pathToFileURL(path.join(ROOT, prototype, 'js', 'map-controls.js')).href);
      controls.flyHome(map);
      check('home resets tilt and rotation', map.getPitch() === 0 && map.getBearing() === 0 && !/bearing=/.test(window.location.search));
      btn3d.click();
      check('3D toggle off restores the flat buildings and the URL', !/3d=1/.test(window.location.search) && map.getLayoutProperty('3d-buildings', 'visibility') === 'none' && map.getLayoutProperty('building', 'visibility') === 'visible' && btn3d.getAttribute('aria-pressed') === 'false');

      // A selection works on the freshly added layers
      const first = idOf(state.buildingsData.features[0]);
      modules.map.selectBuilding(first, true);
      check('selection highlights on the added layers', JSON.stringify(map.getLayer('buildings-selected').filter).indexOf(first) !== -1);
      modules.map.clearSelection();

      // Stale search: the location request of the first search is slow; the field is cleared
      // before it answers, so its results must not appear
      let releaseSearch;
      const searchLater = new Promise(function(resolve) { releaseSearch = resolve; });
      ctx.setFetch({ 'https://api3.geo.admin.ch/rest/services/ech/SearchServer?type=locations': function() { return searchLater; } });
      const input = document.getElementById('search-input');
      const results = document.getElementById('search-results');
      input.value = 'Bern';
      input.dispatchEvent(new window.Event('input'));
      await settle(400);
      check('search waiting for the slow external request', !results.classList.contains('active') || results.querySelectorAll('[data-action="searchLocation"]').length === 0);
      input.value = '';
      input.dispatchEvent(new window.Event('input'));
      releaseSearch({ results: [{ attrs: { label: 'Bern (BE)', lat: 46.9, lon: 7.4, origin: 'gg25' } }] });
      await settle(60);
      check('no stale results over the cleared field', results.querySelectorAll('[data-action="searchLocation"]').length === 0 && results.querySelectorAll('[data-action="searchLocal"]').length === 0);
      check('spinner off after the cancelled search', document.getElementById('search-spinner').style.display === 'none');

      // A search that is superseded by a newer one only renders the newer term
      let releaseFirst;
      const firstLater = new Promise(function(resolve) { releaseFirst = resolve; });
      let calls = 0;
      ctx.setFetch({ 'https://api3.geo.admin.ch/rest/services/ech/SearchServer?type=locations': function() { calls++; return calls === 1 ? firstLater : { results: [] }; } });
      input.value = 'Zür';
      input.dispatchEvent(new window.Event('input'));
      await settle(400);
      input.value = 'Bundes';
      input.dispatchEvent(new window.Event('input'));
      await settle(400);
      releaseFirst({ results: [{ attrs: { label: 'Zürich (ZH)', lat: 47.4, lon: 8.5, origin: 'gg25' } }] });
      await settle(60);
      check('superseded search does not overwrite the newer results', results.innerHTML.indexOf('Zürich (ZH)') === -1 && results.querySelectorAll('[data-action="searchLocal"]').length >= 1);
      modules.search.clearSearch();

      // Print layout: the map image keeps the aspect ratio of the area it occupies on the page
      const print = await import(pathToFileURL(path.join(ROOT, prototype, 'js', 'print.js')).href);
      const a4 = print.getPrintDimensions('landscape-a4');
      const full = print.getPrintLayout(a4, true, true);
      const bare = print.getPrintLayout(a4, false, false);
      check('map area excludes header, legend and footer', full.mapY === 24 && full.mapW === 277 && full.mapH === 150);
      check('map area without title and legend', bare.mapY === 10 && bare.mapH === 180);
      check('map area is not the paper ratio', Math.abs(full.mapW / full.mapH - a4.width / a4.height) > 0.2);
      check('legend block grows with the listed external layers', print.legendHeight(0) === 16 && print.legendHeight(2) === 25 && print.getPrintLayout(a4, true, true, 2).mapH === 141);

      // Print preview: the crop is the exact printed area and never shrinks; "Automatisch" is the current
      // view at a round scale; explicit scales fit the view once and then follow the user's zoom
      const i18n = await import(pathToFileURL(path.join(ROOT, prototype, 'js', 'i18n.js')).href);
      const mapEl = document.getElementById('map');
      const originalRect = mapEl.getBoundingClientRect;
      mapEl.getBoundingClientRect = function() { return { x: 0, y: 0, left: 0, top: 0, width: 1200, height: 600, right: 1200, bottom: 600 }; };
      map.flyTo({ center: [7.44, 46.95], zoom: 16 });
      const printHeader = document.querySelector('.accordion-item[data-accordion="print"] .accordion-header');
      const scaleEl = document.getElementById('print-scale');
      printHeader.click();
      await settle();
      const overlay = document.querySelector('#map .print-preview-overlay');
      const crop = overlay.querySelector('.print-preview-crop');
      const label = overlay.querySelector('.print-preview-label');
      const cropW = function() { return parseFloat(crop.style.width); };
      const cropH = function() { return parseFloat(crop.style.height); };
      check('automatic scale is a round denominator whose page fits the view', overlay.classList.contains('active') && /1:2'500/.test(label.textContent) && cropW() <= 1180 && cropH() <= 580 && !overlay.classList.contains('overflow'));
      const easeBefore = map.calls.easeTo.length;
      scaleEl.value = '25000';
      scaleEl.dispatchEvent(new window.Event('change'));
      await settle();
      check('an explicit scale zooms the map so the page fills the view', map.calls.easeTo.length === easeBefore + 1 && map.getZoom() < 16 && cropW() <= 1181 && cropH() <= 581 && Math.min(1180 / cropW(), 580 / cropH()) < 1.02 && /1:25'000/.test(label.textContent));
      map.flyTo({ center: [7.44, 46.95], zoom: map.getZoom() + 2 });
      await settle();
      check('zooming in keeps the true crop size and flags the overflow', cropW() > 1200 && overlay.classList.contains('overflow') && label.textContent.indexOf(i18n.t('print.preview.overflow')) !== -1);
      map.flyTo({ center: [7.44, 46.95], zoom: map.getZoom(), pitch: 45 });
      await settle();
      check('a tilted view is flagged as printed flat', overlay.classList.contains('warning') && label.textContent.indexOf(i18n.t('print.preview.pitch')) !== -1);
      printHeader.click();
      await settle();
      check('closing the print item hides the preview', !overlay.classList.contains('active'));
      printHeader.click();
      await settle();
      const lastEase = map.calls.easeTo[map.calls.easeTo.length - 1];
      check('opening the print item eases to 2D and fits the page in one move', !!lastEase && lastEase.pitch === 0 && typeof lastEase.zoom === 'number' && map.getPitch() === 0 && !overlay.classList.contains('overflow') && !overlay.classList.contains('warning'));
      printHeader.click();
      await settle();
      scaleEl.value = 'auto';
      scaleEl.dispatchEvent(new window.Event('change'));
      mapEl.getBoundingClientRect = originalRect;
    }
  };
};
