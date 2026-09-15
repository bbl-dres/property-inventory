// prototype-main: normal boot, views, selection, filters, basemap switch, measure guard, search
module.exports = {
  name: 'main: normal boot and interactions',
  boot: { prototype: 'prototype-main', url: 'http://localhost/prototype-main/' },
  allowedErrors: [],
  async run(ctx, check) {
    const { window, document, map, modules, settle, fake } = ctx;
    const state = modules.state.state;

    // Boot
    check('app signals boot', window.__appBooted === true);
    check('loading overlay hidden', document.getElementById('loading-overlay').classList.contains('hidden'));
    check('prototype banner present', !!document.getElementById('prototype-banner'));
    check('title translated', document.title === 'Liegenschaften Inventar BBL');
    check('buildings loaded (11)', state.buildingsData && state.buildingsData.features.length === 11);
    check('indexes built', state.buildingIndex.size === 11 && state.parcelIndex.size === 10 && state.landCoverIndex.size === 12);

    // Tables and filters
    check('11 building rows rendered', document.querySelectorAll('#list-body tr').length === 11);
    check('parcel rows rendered', document.querySelectorAll('#parcels-body tr').length === 10);
    check('land cover rows rendered', document.querySelectorAll('#landcovers-body tr').length === 12);
    const statusOptions = document.querySelectorAll('#filter-status-options .filter-option');
    check('status filter options rendered with counts', statusOptions.length === 2 && !!document.querySelector('#filter-status-options .filter-option-count'));
    check('column visibility stylesheet generated', !!document.getElementById('column-visibility-style'));
    check('table hidden by default', document.getElementById('table-panel').classList.contains('collapsed') && state.tableOpen === false);
    check('style switcher visible in map view', document.getElementById('style-switcher').classList.contains('visible'));
    check('URL normalised (lang, basemap)', window.location.search.indexOf('lang=de') !== -1 && window.location.search.indexOf('basemap=light') !== -1);

    // Map layers and handlers
    check('map sources added', !!map.getSource('buildings') && !!map.getSource('parcels') && !!map.getSource('landcovers'));
    check('cluster + point + selection layers', ['buildings-clusters', 'buildings-points', 'buildings-selected', 'buildings-selected-pulse', 'buildings-labels', 'parcels-fill', 'landcovers-fill'].every(id => !!map.getLayer(id)));
    check('identify highlight layer below data layers', map._layers.findIndex(l => l.id === 'swisstopo-identify-highlight-layer') < map._layers.findIndex(l => l.id === 'landcovers-fill'));
    check('point click handler bound once', map.listenerCount('click', 'buildings-points') === 1);
    const flyBefore = map.calls.flyTo.length;

    // Selection via the table row
    document.querySelector('#list-body tr[data-id]').click();
    await settle();
    check('table row selects building', state.selectedBuildingId === '1000/4840/AF');
    check('info panel shown', document.getElementById('info-panel').classList.contains('show'));
    check('info panel escaped content', document.getElementById('info-body').innerHTML.indexOf('Bundeshaus West') !== -1);
    check('selection written to URL', window.location.search.indexOf('id=1000%2F4840%2FAF') !== -1 || window.location.search.indexOf('id=1000/4840/AF') !== -1);
    check('row selection flies to the building', map.calls.flyTo.length === flyBefore + 1);
    check('row highlighted', document.querySelector('#list-body tr.row-active') !== null);

    // Filters use replaceState (no history growth) and update the map source
    const histBefore = window.history.length;
    const cb = document.querySelector('#filter-status-options input[type="checkbox"]');
    cb.checked = true;
    cb.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
    check('filter applied', state.filteredData.features.length < 11 && state.filteredData.features.length > 0);
    check('filter pill rendered', document.querySelectorAll('#filter-pills .filter-pill').length === 1);
    check('filter in URL', window.location.search.indexOf('filter_status=') !== -1);
    check('filters do not push history', window.history.length === histBefore);
    check('map source data filtered', map.getSource('buildings').data.features.length === state.filteredData.features.length);
    document.querySelector('#filter-pills .filter-pill-remove').click();
    await settle();
    check('pill removal resets filter', state.filteredData.features.length === 11 && cb.checked === false);

    // Gallery view and back
    document.querySelector('.view-toggle-btn[data-view="gallery"]').click();
    await settle();
    check('gallery active', document.getElementById('gallery-view').classList.contains('active') && state.currentView === 'gallery');
    check('gallery cards rendered', document.querySelectorAll('#gallery-grid .gallery-card').length === 11);
    check('style switcher hidden outside map', !document.getElementById('style-switcher').classList.contains('visible'));
    check('gallery view in URL', window.location.search.indexOf('view=gallery') !== -1);
    check('map selection kept in URL across views', window.location.search.indexOf('id=1000%2F4840%2FAF') !== -1);

    // Detail view from a gallery card
    document.querySelector('#gallery-grid .gallery-card').click();
    await settle(50);
    check('detail active', document.getElementById('detail-view').classList.contains('active') && state.currentView === 'detail');
    check('detail populated', document.getElementById('detail-name').textContent === 'Bundeshaus West');
    check('detail status badge', !!document.querySelector('#detail-status .status-badge'));
    check('carousel dots rendered', document.querySelectorAll('#carousel-dots .carousel-dot').length === 3);
    check('mini map created', fake.Map.instances.length === 2);
    check('detail in URL', /view=detail/.test(window.location.search));
    document.querySelector('.detail-tab[data-tab="measurements"]').click();
    check('measurements tab active', document.querySelector('.tab-content[data-content="measurements"]').classList.contains('active') && /tab=measurements/.test(window.location.search));

    // Second detail view reuses the mini map
    const secondId = state.buildingsData.features[1].properties.bbl_id;
    modules.ui.showDetailView(secondId);
    await settle(50);
    check('mini map reused', fake.Map.instances.length === 2 && fake.Map.instances[1].calls.jumpTo.length === 1);
    check('detail switched to second building', document.getElementById('detail-id').textContent === secondId);

    // Back button returns to the previous (gallery) view
    document.getElementById('btn-back').click();
    await settle();
    check('back returns to gallery', state.currentView === 'gallery');

    // popstate: go to the map via history
    document.querySelector('.view-toggle-btn[data-view="map"]').click();
    await settle(150);
    check('map view again', state.currentView === 'map');
    window.history.pushState({}, '', '/prototype-main/?view=gallery');
    window.dispatchEvent(new window.PopStateEvent('popstate'));
    await settle();
    check('popstate switches to gallery', state.currentView === 'gallery');
    window.history.pushState({}, '', '/prototype-main/?view=map');
    window.dispatchEvent(new window.PopStateEvent('popstate'));
    await settle(150);
    check('popstate switches to map', state.currentView === 'map');

    // Basemap switch: layers rebuilt once, handlers not duplicated, no re-fly
    const flyBeforeStyle = map.calls.flyTo.length;
    document.querySelector('.style-option[data-style="dark-matter"]').click();
    await settle(50);
    check('setStyle called', map.calls.setStyle.length === 1);
    check('layers restored after style change', !!map.getSource('buildings') && !!map.getLayer('buildings-points'));
    check('handlers still bound once', map.listenerCount('click', 'buildings-points') === 1);
    check('selection highlight restored', JSON.stringify(map.getLayer('buildings-selected').filter).indexOf(state.selectedBuildingId) !== -1);
    check('no fly-to on style change', map.calls.flyTo.length === flyBeforeStyle);
    check('basemap in URL', window.location.search.indexOf('basemap=dark') !== -1);

    // Internal layer toggle survives a style change
    const toggle = document.getElementById('layer-toggle-parcels');
    toggle.checked = false;
    toggle.dispatchEvent(new window.Event('change'));
    check('parcels hidden by toggle', map.getLayoutProperty('parcels-fill', 'visibility') === 'none');
    document.querySelector('.style-option[data-style="positron"]').click();
    await settle(50);
    check('parcels stay hidden after style change', map.getLayoutProperty('parcels-fill', 'visibility') === 'none');

    // Measure tool: map clicks add points instead of selecting
    modules.measure.startMeasurement();
    check('measuring', modules.measure.isMeasuring() && map.getCanvas().style.cursor === 'crosshair');
    const selectedBefore = state.selectedBuildingId;
    map.fire('click', { features: [{ properties: { bbl_id: '1000/4840/AF' } }], point: { x: 1, y: 1 }, lngLat: { lng: 7.4, lat: 46.9 } }, 'buildings-points');
    map.fire('click', { point: { x: 1, y: 1 }, lngLat: { lng: 7.4, lat: 46.9 } });
    check('selection unchanged while measuring', state.selectedBuildingId === selectedBefore);
    check('measure point added', fake.Marker.instances.some(m => m.options.draggable));
    modules.measure.clearMeasurement();
    check('measurement cleared', !modules.measure.isMeasuring());

    // Empty map click clears the selection
    map.fire('click', { point: { x: 1, y: 1 }, lngLat: { lng: 7.4, lat: 46.9 } });
    check('map click clears selection', state.selectedBuildingId === null && !document.getElementById('info-panel').classList.contains('show'));

    // Search: local results, escaped, delegated click
    ctx.setFetch({
      'https://api3.geo.admin.ch/rest/services/ech/SearchServer?type=locations': { results: [{ attrs: { label: '<b>Bern</b> (BE)', lat: 46.9, lon: 7.4, origin: 'gg25', geom_st_box2d: 'BOX(7.3 46.8,7.5 47.0)' } }] },
      'https://api3.geo.admin.ch/rest/services/ech/SearchServer?type=layers': { results: [{ attrs: { label: 'Bauzonen <i>Schweiz</i>', layer: 'ch.are.bauzonen', title: 'Bauzonen' } }] }
    });
    const input = document.getElementById('search-input');
    input.value = 'Bundes';
    input.dispatchEvent(new window.Event('input'));
    await settle(400);
    check('search results shown', document.getElementById('search-results').classList.contains('active'));
    check('local search hits', document.querySelectorAll('#search-results [data-action="searchLocal"]').length >= 1);
    check('external labels stripped and escaped', document.getElementById('search-results').innerHTML.indexOf('<i>') === -1 && document.getElementById('search-results').innerHTML.indexOf('Bern') !== -1);
    check('layer result with info button', !!document.querySelector('#search-results [data-action="searchLayer"] [data-action="showLayerInfo"]'));
    document.querySelector('#search-results [data-action="searchLocation"]').click();
    await settle();
    check('location result fits bounds and drops a marker', map.calls.fitBounds.length >= 1 && !!state.searchMarker);
    document.querySelector('#search-results') && (input.value = 'Bundes', input.dispatchEvent(new window.Event('input')));
    await settle(400);
    document.querySelector('#search-results [data-action="searchLayer"]').click();
    await settle();
    check('layer result adds an external layer', modules.swisstopo.getActiveSwisstopoLayers().length === 1 && !!map.getLayer('swisstopo-layer-ch.are.bauzonen'));
    check('external layer listed', document.querySelectorAll('#external-layers-list .active-layer-item').length === 1);
    check('external layer in URL', window.location.search.indexOf('bgLayers=ch.are.bauzonen') !== -1);
    document.querySelector('#external-layers-list [data-action="removeSwisstopoLayer"]').click();
    await settle();
    check('external layer removed', modules.swisstopo.getActiveSwisstopoLayers().length === 0 && !map.getLayer('swisstopo-layer-ch.are.bauzonen'));

    // Language switch re-renders JS content
    document.querySelector('.lang-option[data-lang="en"]').click();
    await settle();
    check('language switched', document.documentElement.lang === 'en' && /lang=en/.test(window.location.search));
    check('table header re-rendered in English', document.querySelector('#list-table-header-row th').textContent.indexOf('ID') !== -1);
  }
};
