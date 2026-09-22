const { pathToFileURL } = require('node:url');
const path = require('node:path');

module.exports = function(prototype) {
  const simple = prototype === 'prototype-simple';
  return {
    name: prototype + ': map, request and table regression review',
    boot: { prototype },
    async run({ modules, map, document, window, settle, setFetch, fake }, check) {
      const state = modules.state.state;
      const cluster = { properties: { cluster_id: 7 }, geometry: { coordinates: [7.4, 46.9] } };
      map.queryResult = (_, options) => options.layers.includes('buildings-clusters') ? [cluster] : [];
      const before = map.calls.flyTo.length;
      map.fire('click', { point: { x: 10, y: 10 } }, 'buildings-clusters');
      await settle();
      check('cluster expands using bundled promise API', map.calls.flyTo.length === before + 1 && map.calls.flyTo.at(-1).zoom === 12);
      const source = map.getSource('buildings');
      const requests = [];
      source.getClusterExpansionZoom = () => new Promise(resolve => requests.push(resolve));
      const beforeRace = map.calls.flyTo.length;
      map.fire('click', { point: { x: 10, y: 10 } }, 'buildings-clusters');
      map.fire('click', { point: { x: 10, y: 10 } }, 'buildings-clusters');
      requests[1](14); await settle(); requests[0](10); await settle();
      check('older cluster response cannot override newer zoom', map.calls.flyTo.length === beforeRace + 1 && map.calls.flyTo.at(-1).zoom === 14);
      map.fire('click', { point: { x: 10, y: 10 } }, 'buildings-clusters');
      map.fire('movestart'); requests[2](11); await settle();
      check('manual map movement invalidates pending cluster zoom', map.calls.flyTo.length === beforeRace + 1);
      map.queryResult = null;

      modules.swisstopo.addSwisstopoLayer('ch.test.review', 'Test', true);
      let resolveIdentify;
      setFetch({ 'https://api3.geo.admin.ch/rest/services/all/MapServer/identify': () => new Promise(resolve => { resolveIdentify = resolve; }) });
      modules.swisstopo.identifySwisstopoFeatures({ lng: 7.4, lat: 46.9 });
      const popups = fake.Popup.instances.length;
      modules.swisstopo.clearIdentifyHighlight();
      resolveIdentify({ results: [{ geometry: state.parcelData.features[0].geometry, properties: { name: 'stale' } }] });
      await settle();
      check('cleared identify request cannot restore popup', fake.Popup.instances.length === popups && map.getSource('swisstopo-identify-highlight').data.features.length === 0);
      check('clearing identify resets busy cursor', map.getCanvas().style.cursor !== 'progress');

      const oldUrl = window.location.href;
      window.history.replaceState({}, '', '?filter_land=50%25');
      let decoded;
      try { decoded = modules.filters.getFiltersFromURL().land; } catch { decoded = null; }
      check('literal percent in filter URL does not crash', decoded?.[0] === '50%');
      const values = { land: ['a,b', '50%', 'Zürich'] };
      modules.filters.setFiltersInURL(values);
      check('filter URL round trips escaped separators and text', JSON.stringify(modules.filters.getFiltersFromURL().land) === JSON.stringify(values.land));
      window.history.replaceState({}, '', oldUrl);

      const parcel = state.parcelData.features[0];
      const original = parcel.geometry;
      parcel.geometry = { type: 'MultiPolygon', coordinates: [original.coordinates] };
      let camera;
      try { modules.map.selectParcel(parcel.properties[simple ? 'bbl_id' : 'parcelId'], true); camera = map.calls.flyTo.at(-1)?.center; } catch {}
      check('MultiPolygon selection has finite interior camera target', camera?.length === 2 && camera.every(Number.isFinite));
      parcel.geometry = original;

      const load = name => import(pathToFileURL(path.resolve(prototype, 'js', name + '.js')).href);
      const controls = await load('map-controls');
      window.history.replaceState({}, '', '?lat=Infinity&lng=7&zoom=12&pitch=Infinity&bearing=Infinity');
      check('non-finite URL values fall back to valid map view', controls.readMapViewFromUrl().center.every(Number.isFinite) && controls.readMapViewFromUrl().pitch === 0 && controls.readMapViewFromUrl().bearing === 0);
      window.history.replaceState({}, '', '?lat=46&lng=7&zoom=999&pitch=999');
      check('URL camera values respect renderer limits', controls.readMapViewFromUrl().zoom === 22 && controls.readMapViewFromUrl().pitch === 60);
      window.history.replaceState({}, '', oldUrl);
      check('interactive map does not retain a print drawing buffer', map.options.canvasContextAttributes.preserveDrawingBuffer === false);
      const tableUI = await load('table');
      const host = document.createElement('div');
      host.innerHTML = '<input id="review-search"><button id="review-clear"></button>';
      document.body.append(host);
      let term = '';
      tableUI.initTableSearch('review-search', 'review-clear', value => { term = value; });
      const input = host.querySelector('input'); input.value = 'Berlin'; input.dispatchEvent(new window.Event('input'));
      host.querySelector('button').click();
      await settle(250);
      check('clearing table search cancels queued term', term === '');

      const { createDataTable, setTableHiddenColumns } = await load('data-table');
      host.innerHTML = '<div id="review-feature"><table><tbody id="review-feature-body"></tbody></table></div><div><table><tbody id="review-detail-body"></tbody></table></div><button class="review-action"></button>';
      const records = [{ id: 'one', name: 'Alpha' }, { id: 'two', name: 'Beta' }];
      const config = { columns: [{ key: 'name', className: 'col-name', width: 'name' }], getRows: () => records, getRowId: row => row.id };
      const featureTable = createDataTable({ ...config, tbodyId: 'review-feature-body' });
      const detailTable = createDataTable({ ...config, tbodyId: 'review-detail-body', rowIdAttr: 'data-record', selection: { selectAllId: 'review-all', checkboxClass: 'review-row', actionClass: 'review-action' } });
      featureTable.init(); detailTable.init(); featureTable.render(); detailTable.render();
      setTableHiddenColumns(['col-name'], '#review-feature');
      check('feature visibility does not remove detail column width', !!document.querySelector('#review-detail-body').closest('table').querySelector('col[data-column="name"]'));
      const all = document.getElementById('review-all'); all.checked = true; all.dispatchEvent(new window.Event('change', { bubbles: true }));
      check('select all respects configured row ID attribute', detailTable.getSelectedRows().length === 2);
      records.length = 0; detailTable.render();
      check('removed rows do not leave enabled selection actions', document.querySelector('.review-action').disabled);
      setTableHiddenColumns([], '');
      host.remove();
    }
  };
};
