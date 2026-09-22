module.exports = function(prototype) {
  const simple = prototype === 'prototype-simple';
  return {
    name: prototype + ': detail navigation, maps and panel regressions',
    boot: { prototype },
    async run({document,window,modules,map,settle},check) {
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
      if (simple) {
        const section = document.querySelector('.tab-content.active .detail-overline');
        key(section,' ');
        check('section keyboard collapses with announced state', section.classList.contains('collapsed') && section.getAttribute('aria-expanded') === 'false');
        key(section,'Enter');
        check('section keyboard expands', !section.classList.contains('collapsed') && section.getAttribute('aria-expanded') === 'true');
        check('document list retains its existing ID', !!document.getElementById('detail-documents')?.children.length);
      }
      for (const building of [buildings[0],buildings[1]]) {
        modules.ui.showDetailView(id(building));
        const link = document.getElementById('mini-map-address');
        check('Google Maps link follows '+id(building), new URL(link.href).searchParams.get('query') === building.geometry.coordinates[1]+','+building.geometry.coordinates[0] && link.target === '_blank' && link.rel.includes('noopener'));
      }
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
    }
  };
};
