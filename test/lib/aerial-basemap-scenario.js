const path = require('path');
const { pathToFileURL } = require('url');

module.exports = function(prototype) {
  return {
    name: prototype + ': labeled aerial, switching and URL history',
    boot: { prototype, url: 'http://localhost/' + prototype + '/?basemap=aerial-labels&lang=en&zoom=13&lng=7.44&lat=46.94' },
    async run({ window, document, map, modules, settle }, check) {
      const basemaps = modules.basemaps;
      check('deep link selects labeled aerial', basemaps.getCurrentMapStyle() === 'swissimage-labels');
      check('hybrid style loaded on initial creation', map.calls.setStyle[0] === basemaps.getMapStyleUrl());
      check('labeled aerial button active and translated', document.querySelector('[data-style="swissimage-labels"]').classList.contains('active') && document.querySelector('[data-style="swissimage-labels"] span').textContent === 'Hybrid');

      const reference = {
        version: 8, sprite: 'https://example.com/sprite', glyphs: 'https://example.com/fonts/{fontstack}/{range}.pbf',
        sources: { esri: { type: 'vector', url: 'https://example.com/VectorTileServer' } },
        layers: [
          { id: 'Road', type: 'line', source: 'esri', 'source-layer': 'Road' },
          { id: 'City', type: 'symbol', source: 'esri', 'source-layer': 'City', layout: { 'text-font': ['Arial Bold'], 'text-field': '{name}' } }
        ]
      };
      const aerial = basemaps.getMapStyleUrl('swissimage');
      const hybrid = basemaps.getMapStyleOptions().transformStyle(undefined, reference);
      check('same global and Swiss imagery below the reference', JSON.stringify(hybrid.layers.slice(0, 2)) === JSON.stringify(aerial.layers) && hybrid.sources.swissimage.tiles[0] === aerial.sources.swissimage.tiles[0] && hybrid.sources['world-imagery'].tiles[0] === aerial.sources['world-imagery'].tiles[0]);
      check('reference converted from ArcGIS metadata to tile template', !hybrid.sources.esri.url && hybrid.sources.esri.tiles[0].endsWith('/tile/{z}/{y}/{x}.pbf') && hybrid.sources.esri.maxzoom === 16);
      check('reference and property labels use available glyphs', hybrid.glyphs === aerial.glyphs && hybrid.layers[3].layout['text-font'][0] === 'Open Sans Bold' && hybrid.sprite === reference.sprite);
      check('plain aerial remains free of reference layers', !aerial.sources.esri && aerial.layers.length === 2 && reference.layers[1].layout['text-font'][0] === 'Arial Bold');

      const controls = await import(pathToFileURL(path.resolve(__dirname, '../../', prototype, 'js/map-controls.js')).href);
      check('hybrid reference is not used for OpenMapTiles extrusions', controls.findVectorSourceId(hybrid) === null);
      check('CARTO buildings still support extrusions', controls.findVectorSourceId({ sources: { carto: { type: 'vector' } }, layers: [{ source: 'carto', 'source-layer': 'building' }] }) === 'carto');

      const flyCount = map.calls.flyTo.length;
      document.querySelector('[data-style="swissimage"]').click();
      await settle();
      check('plain aerial selectable with original URL', basemaps.getCurrentBasemapUrlValue() === 'aerial' && new URL(window.location).searchParams.get('basemap') === 'aerial');
      check('property layers restored after switching', !!map.getLayer('buildings-points') && !!map.getLayer('parcels-fill'));
      document.querySelector('[data-style="swissimage-labels"]').click();
      await settle();
      check('hybrid selectable again with shareable URL', basemaps.getCurrentBasemapUrlValue() === 'aerial-labels' && new URL(window.location).searchParams.get('basemap') === 'aerial-labels');
      check('switching preserves camera', map.calls.flyTo.length === flyCount && new URL(window.location).searchParams.get('lng') === '7.44');

      for (const value of ['aerial', 'aerial-labels', 'invalid']) {
        window.history.pushState({}, '', '?basemap=' + value);
        window.dispatchEvent(new window.PopStateEvent('popstate'));
        await settle();
        check('history restores ' + value, basemaps.getCurrentBasemapUrlValue() === (value === 'invalid' ? 'light' : value));
      }
    }
  };
};
