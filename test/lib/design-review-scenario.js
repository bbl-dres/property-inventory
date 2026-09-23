const path = require('path');
const { pathToFileURL } = require('url');

module.exports = function(prototype) {
  const simple = prototype === 'prototype-simple';
  return {
    name: prototype + ': detail navigation, maps and panel regressions',
    boot: { prototype },
    async run({document,window,modules,map,settle,fake},check) {
      const state = modules.state.state;
      const id = b => b.properties[simple ? 'bbl_id' : 'buildingId'];
      modules.filters.toggleSmartDrawer(true);
      check('portfolio filter opens', document.getElementById('filter-panel').classList.contains('open'));
      const buildings = state.buildingsData.features;
      modules.ui.showDetailView(id(buildings[0]), 'invalid-tab');
      check('detail closes and disables filter', !document.getElementById('filter-panel').classList.contains('open') && document.getElementById('filter-panel-btn').disabled);
      modules.filters.toggleSmartDrawer(true);
      check('detail rejects programmatic filter opening', !document.getElementById('filter-panel').classList.contains('open'));
      check('invalid detail tab falls back to overview', document.querySelector('.tab-content.active').dataset.content === 'overview' && !new URL(window.location).searchParams.has('tab'));
      const key = (el,k) => el.dispatchEvent(new window.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));
      const first = document.querySelector('.detail-tab'); first.focus(); key(first,'ArrowRight');
      check('arrow key selects and focuses next tab', document.activeElement.dataset.tab === 'measurements' && document.querySelector('.tab-content.active').dataset.content === 'measurements');
      key(document.activeElement,'End');
      check('End selects last tab', document.activeElement === [...document.querySelectorAll('.detail-tab')].at(-1));
      key(document.activeElement,'Home');
      check('Home selects first tab', document.activeElement === first);
      check('tabs reference named panels', [...document.querySelectorAll('.detail-tab')].every(t => document.getElementById(t.getAttribute('aria-controls'))?.getAttribute('aria-labelledby') === t.id));
      for (const building of [buildings[0],buildings[1]]) {
        modules.ui.showDetailView(id(building));
        const link = document.getElementById('mini-map-address');
        check('Google Maps link follows '+id(building), new URL(link.href).searchParams.get('query') === building.geometry.coordinates[1]+','+building.geometry.coordinates[0] && link.target === '_blank' && link.rel.includes('noopener'));
      }
      // Mini map: the home button returns to the building view
      const miniMap = fake.Map.instances.find(m => m._container && m._container.id === 'mini-map');
      const homeBtn = document.querySelector('#mini-map .map-home-btn');
      // (the zoom buttons come from MapLibre's own NavigationControl, a stub in the fake; the browser suites cover them)
      check('mini map has a labelled home control', !!miniMap && !!homeBtn && homeBtn.title.length > 0 && homeBtn.getAttribute('aria-label') === homeBtn.title);
      miniMap.jumpTo({ center: [0, 0], zoom: 3, pitch: 0, bearing: 90 });
      homeBtn.click();
      const home = miniMap.calls.flyTo.at(-1);
      const target = buildings[1].geometry.coordinates;
      check('mini map home flies back to the tilted building view', !!home && home.zoom === 17 && home.pitch === 50 && home.bearing === -17 && home.center[0] === target[0] && home.center[1] === target[1]);
      // Address table (identical in both prototypes): marker column without a label, stacked-layout labels translated live
      const { setLang } = await import(pathToFileURL(path.resolve(__dirname, '../../' + prototype + '/js/i18n.js')).href);
      const addressCells = () => [...document.querySelectorAll('.address-table tbody td')];
      const addressHeads = () => [...document.querySelectorAll('.address-table thead th')].map(th => th.textContent.trim());
      check('address marker cell carries no row label', addressCells()[0].classList.contains('address-marker-cell') && !addressCells()[0].hasAttribute('data-label') && !!addressCells()[0].querySelector('.address-marker'));
      await setLang('fr');
      check('address row labels follow the translated headers', addressHeads()[1] !== 'Land' && addressCells().slice(1).every((td, i) => td.dataset.label === addressHeads()[i + 1]));
      await setLang('de');
      check('address row labels return with the language', addressCells().slice(1).every((td, i) => td.dataset.label === addressHeads()[i + 1]) && addressCells()[1].dataset.label === 'Land');
      modules.ui.switchView('map');
      check('return restores filter button', !document.getElementById('filter-panel-btn').disabled);
      modules.map.selectBuilding(id(buildings[1]));
      check('info labels retain full hover hints', [...document.querySelectorAll('#info-body .info-label')].every(l => l.title === l.textContent));
      check('one label per parcel', map.getSource('parcel-labels').data.features.length === state.parcelData.features.length);
      check('parcel labels share building zoom and have larger type', map.getLayer('parcels-labels').minzoom === map.getLayer('buildings-labels').minzoom && map.getLayoutProperty('parcels-labels','text-size') > map.getLayoutProperty('buildings-labels','text-size'));
      check('map labels keep one line and reserve collision space', ['parcels-labels','buildings-labels'].every(layer => map.getLayoutProperty(layer,'text-max-width') >= 100 && !map.getLayoutProperty(layer,'text-allow-overlap') && !map.getLayoutProperty(layer,'text-ignore-placement')));
      check('building labels stay above points; only parcels move', map.getLayoutProperty('buildings-labels','text-anchor') === 'bottom' && !map.getLayoutProperty('buildings-labels','text-variable-anchor') && map.getLayoutProperty('parcels-labels','text-variable-anchor-offset').length > 2);
      const toggle = document.getElementById('layer-toggle-parcels');
      toggle.checked = false; toggle.dispatchEvent(new window.Event('change'));
      check('parcel toggle hides labels', map.getLayoutProperty('parcels-labels','visibility') === 'none');
      document.querySelector('[data-style="swissimage"]').click(); await settle();
      check('labels restored but stay hidden after basemap change', !!map.getSource('parcel-labels') && map.getLayoutProperty('parcels-labels','visibility') === 'none');
      toggle.checked = true; toggle.dispatchEvent(new window.Event('change'));
      check('parcel toggle restores labels', map.getLayoutProperty('parcels-labels','visibility') === 'visible');
      const buildingToggle = document.getElementById('layer-toggle-buildings');
      buildingToggle.checked = false; buildingToggle.dispatchEvent(new window.Event('change'));
      check('hidden buildings do not reserve label space', map.getLayoutProperty('buildings-label-obstacles','visibility') === 'none');
      modules.swisstopo.addSwisstopoLayer('ch.test.info', 'Test layer', true);
      const internalInfo = document.querySelector('[data-action="showInternalLayerInfo"]');
      const externalInfo = document.querySelector('#external-layers-list [data-action="showLayerInfo"]');
      check('internal/external info controls use identical markup and tokens', internalInfo.className === externalInfo.className && internalInfo.innerHTML === externalInfo.innerHTML && internalInfo.getAttribute('aria-label') === externalInfo.getAttribute('aria-label'));
      // Layer info of the internal datasets: official links, the data date of the loaded data, the official legend
      const info = () => document.getElementById('layer-info-content');
      const href = part => [...info().querySelectorAll('a[href]')].some(a => a.href.indexOf(part) !== -1);
      modules.swisstopo.showInternalLayerInfo('landcovers');
      check('land cover info links to geocat, the cadastre manual, geodienste.ch and cadastre.ch', href('geocat.ch/datahub/dataset/d929eef4') && href('cadastre-manual.admin.ch') && href('geodienste.ch/services/av') && href('cadastre.ch/de') && !info().querySelector('.placeholder-link'));
      check('land cover info shows the retrieval date of the official data', info().textContent.indexOf('23.09.2026') !== -1);
      check('land cover legend lists the 26 official types in six groups', info().querySelectorAll('.internal-legend-item').length === 26 && info().querySelectorAll('.internal-legend-group').length === 6 && [...info().querySelectorAll('.internal-legend-rect')][0].getAttribute('style').indexOf('#FFC8C8') !== -1);
      modules.swisstopo.showInternalLayerInfo('buildings');
      check('building info links to the I14Y register service, BFS, housing-stat and the geoportal', href('i14y.admin.ch/de/catalog/dataservices/60f54f01') && href('bfs.admin.ch') && href('housing-stat.ch') && href('map.geo.admin.ch') && info().textContent.indexOf('22.09.2026') !== -1);
      check('external links open in a new tab', [...info().querySelectorAll('a[href^="http"]')].every(a => a.target === '_blank' && a.rel.indexOf('noopener') !== -1));
      modules.swisstopo.hideLayerInfo();
    }
  };
};
