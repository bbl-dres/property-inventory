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
      check('map area excludes header, legend and footer', full.mapY === 21 && full.mapW === 277 && full.mapH === 153);
      check('map area without title and legend', bare.mapY === 10 && bare.mapH === 180);
      check('map area is not the paper ratio', Math.abs(full.mapW / full.mapH - a4.width / a4.height) > 0.2);
    }
  };
};
