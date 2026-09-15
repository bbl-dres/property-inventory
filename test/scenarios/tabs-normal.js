// prototype-tabs: normal boot, table panel, selection, detail tabs, filters, basemap switch, search with KI, export
module.exports = {
  name: 'tabs: normal boot and interactions',
  boot: { prototype: 'prototype-tabs', url: 'http://localhost/prototype-tabs/' },
  allowedErrors: [],
  async run(ctx, check) {
    const { window, document, map, modules, settle, fake } = ctx;
    const state = modules.state.state;

    // Boot
    check('app signals boot', window.__appBooted === true);
    check('loading overlay hidden', document.getElementById('loading-overlay').classList.contains('hidden'));
    check('buildings loaded (10)', state.buildingsData && state.buildingsData.features.length === 10);
    check('parcels loaded (10)', state.parcelData && state.parcelData.features.length === 10);
    check('entity data loaded', state.allAreaMeasurements.length > 0 && state.allContracts.length > 0 && state.allCosts.length > 0);
    check('no lang parameter added to the URL', window.location.search.indexOf('lang=') === -1);
    check('basemap normalised in URL', window.location.search.indexOf('basemap=light') !== -1);
    check('list rows rendered', document.querySelectorAll('#list-body tr[data-id]').length === 10);
    check('parcel rows rendered', document.querySelectorAll('#parcels-body tr[data-parcel-id]').length === 10);
    check('table hidden by default', document.getElementById('table-panel').classList.contains('collapsed') && state.tableOpen === false);
    check('filter options with counts', document.querySelectorAll('#filter-status-options .filter-option').length === 3 && !!document.querySelector('#filter-teilportfolio-options .filter-option-count'));
    check('style switcher visible', document.getElementById('style-switcher').classList.contains('visible'));

    // Map layers and handlers
    check('map sources added', !!map.getSource('buildings') && !!map.getSource('parcels'));
    check('cluster + point + selection layers', ['buildings-clusters', 'buildings-cluster-count', 'buildings-points', 'buildings-selected', 'buildings-selected-pulse', 'buildings-labels', 'parcels-fill', 'parcels-highlight', 'parcels-selected', 'parcels-selected-outline'].every(id => !!map.getLayer(id)));
    check('buildings source clustered', map.getSource('buildings').cluster === true && map.getSource('buildings').clusterMaxZoom === 14);
    check('cluster click handler bound', map.listenerCount('click', 'buildings-clusters') === 1);
    check('point click handler bound once', map.listenerCount('click', 'buildings-points') === 1);

    // Selection via the map
    map.fire('click', { features: [{ properties: { buildingId: '1080/4840/AF' } }], point: { x: 1, y: 1 }, lngLat: { lng: 7.4, lat: 46.9 } }, 'buildings-points');
    await settle();
    check('map click selects building', state.selectedBuildingId === '1080/4840/AF');
    check('info panel shown with preview', document.getElementById('info-panel').classList.contains('show') && document.getElementById('info-panel').classList.contains('has-preview'));
    check('info panel content', document.getElementById('info-body').innerHTML.indexOf('Bundeshaus West') !== -1);
    check('selection in URL', window.location.search.indexOf('id=1080%2F4840%2FAF') !== -1);
    check('selection highlight filter', JSON.stringify(map.getLayer('buildings-selected').filter).indexOf('1080/4840/AF') !== -1);

    // Parcel selection keeps a separate highlight layer
    map.fire('click', { features: [{ properties: { parcelId: '1080/4840/01' } }], point: { x: 1, y: 1 }, lngLat: { lng: 7.4, lat: 46.9 } }, 'parcels-fill');
    await settle();
    check('parcel selected', state.selectedParcelId === '1080/4840/01' && state.selectedBuildingId === null);
    check('parcel selection highlighted', JSON.stringify(map.getLayer('parcels-selected').filter).indexOf('1080/4840/01') !== -1);
    check('parcel in URL', window.location.search.indexOf('parcelId=1080%2F4840%2F01') !== -1);
    map.fire('mouseleave', {}, 'parcels-fill');
    check('hover reset does not clear the selection', JSON.stringify(map.getLayer('parcels-selected').filter).indexOf('1080/4840/01') !== -1);

    // Info panel close clears everything
    document.getElementById('info-close').click();
    check('close clears selection and URL', state.selectedParcelId === null && window.location.search.indexOf('parcelId=') === -1 && !document.getElementById('info-panel').classList.contains('show'));

    // Filters use replaceState
    const histBefore = window.history.length;
    const cb = document.querySelector('#filter-status-options input[type="checkbox"]');
    cb.checked = true;
    cb.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
    check('filter applied', state.filteredData.features.length < 10 && state.filteredData.features.length > 0);
    check('filters do not push history', window.history.length === histBefore);
    check('map source filtered', map.getSource('buildings').data.features.length === state.filteredData.features.length);
    document.getElementById('drawer-reset-btn').click();
    await settle();
    check('reset restores all buildings', state.filteredData.features.length === 10 && !cb.checked);

    // Table panel under the map: toggle opens it, a row selects the object on the map
    document.getElementById('tbl-toggle').click();
    await settle();
    check('table toggle opens the panel', state.tableOpen === true && !document.getElementById('table-panel').classList.contains('collapsed') && /table=open/.test(window.location.search));
    document.querySelector('#list-body tr[data-id]').click();
    await settle(50);
    check('row selects the building on the map', state.selectedBuildingId === '1080/4840/AF' && document.getElementById('info-panel').classList.contains('show'));
    check('row highlighted', document.querySelector('#list-body tr.row-active') !== null);
    document.querySelector('.table-tab[data-table-tab="parcels"]').click();
    check('parcels tab switches the table', state.activeTableTab === 'parcels' && document.getElementById('parcels-table-content').classList.contains('active') && /tableTab=parcels/.test(window.location.search));
    document.querySelector('#parcels-body tr[data-parcel-id]').click();
    await settle(50);
    check('parcel row selects the parcel', state.selectedParcelId === '1080/4840/01' && state.selectedBuildingId === null);
    document.querySelector('.table-tab[data-table-tab="buildings"]').click();
    document.getElementById('tbl-toggle').click();
    check('table toggle closes the panel', state.tableOpen === false && document.getElementById('table-panel').classList.contains('collapsed'));

    // Detail view
    modules.ui.showDetailView('1080/4840/AF');
    await settle(50);
    check('detail view active', state.currentView === 'detail' && document.getElementById('detail-view').classList.contains('active'));
    check('detail populated', document.getElementById('detail-name').textContent === 'Bundeshaus West' && document.getElementById('detail-baujahr').textContent === '1902');
    check('address parsed', document.getElementById('detail-street').textContent === 'Bundesplatz' && document.getElementById('detail-plz').textContent === '3003');
    check('breadcrumb populated', document.getElementById('breadcrumb-name').textContent === 'Bundeshaus West');
    check('carousel dots rendered', document.querySelectorAll('#carousel-dots .carousel-dot').length === 4);
    check('mini map created', fake.Map.instances.length === 2);

    // Entity tabs render their tables
    document.querySelector('.detail-tab[data-tab="measurements"]').click();
    check('measurements tab active', document.querySelector('.tab-content[data-content="measurements"]').classList.contains('active'));
    check('measurements rows rendered', document.querySelectorAll('#measurements-tbody tr[data-id]').length > 0);
    check('tab in URL', /tab=measurements/.test(window.location.search));
    document.querySelector('.detail-tab[data-tab="contracts"]').click();
    check('contracts rows rendered with status badge', document.querySelectorAll('#contracts-tbody tr[data-id]').length > 0 && !!document.querySelector('#contracts-tbody .status-badge'));
    document.querySelector('.detail-tab[data-tab="contacts"]').click();
    check('contacts rows rendered with links', !!document.querySelector('#contacts-tbody a[href^="mailto:"]'));
    const filterInput = document.getElementById('contacts-filter');
    filterInput.value = 'zzzz-no-match';
    filterInput.dispatchEvent(new window.Event('input'));
    check('entity table filter empty state', !!document.querySelector('#contacts-tbody .table-empty-state'));
    filterInput.value = '';
    filterInput.dispatchEvent(new window.Event('input'));

    // Second detail view reuses the mini map
    modules.ui.showDetailView('1080/5210/AA');
    await settle(50);
    check('mini map reused', fake.Map.instances.length === 2 && fake.Map.instances[1].calls.jumpTo.length === 1);
    check('entity tables reloaded for the new building', document.querySelectorAll('#measurements-tbody tr[data-id]').length > 0 || !!document.querySelector('#measurements-tbody .table-empty-state'));

    // Back returns to the map
    document.getElementById('btn-back').click();
    await settle();
    check('back returns to the map', state.currentView === 'map');

    // Gallery
    document.querySelector('.view-toggle-btn[data-view="gallery"]').click();
    await settle();
    check('gallery cards rendered', document.querySelectorAll('#gallery-grid .gallery-card').length === 10);

    // Map view + basemap switch
    document.querySelector('.view-toggle-btn[data-view="map"]').click();
    await settle(150);
    map.fire('click', { features: [{ properties: { buildingId: '1080/3120/AB' } }], point: { x: 1, y: 1 }, lngLat: { lng: 7.4, lat: 46.9 } }, 'buildings-points');
    const flyBeforeStyle = map.calls.flyTo.length;
    document.querySelector('.style-option[data-style="voyager"]').click();
    await settle(50);
    check('setStyle called', map.calls.setStyle.length === 1);
    check('layers restored after style change', !!map.getSource('buildings') && !!map.getLayer('buildings-points') && !!map.getLayer('parcels-fill'));
    check('handlers still bound once', map.listenerCount('click', 'buildings-points') === 1);
    check('selection highlight restored', JSON.stringify(map.getLayer('buildings-selected').filter).indexOf('1080/3120/AB') !== -1);
    check('no fly-to on style change', map.calls.flyTo.length === flyBeforeStyle);
    check('basemap in URL, not in localStorage', window.location.search.indexOf('basemap=standard') !== -1 && window.localStorage.getItem('mapStyle') === null);

    // Internal layer toggle survives a style change
    const toggle = document.getElementById('layer-toggle-parcels');
    toggle.checked = false;
    toggle.dispatchEvent(new window.Event('change'));
    check('parcels hidden by toggle', map.getLayoutProperty('parcels-fill', 'visibility') === 'none');
    document.querySelector('.style-option[data-style="positron"]').click();
    await settle(50);
    check('parcels stay hidden after style change', map.getLayoutProperty('parcels-fill', 'visibility') === 'none');

    // Measure tool guard
    modules.measure.startMeasurement();
    const selectedBefore = state.selectedBuildingId;
    map.fire('click', { features: [{ properties: { buildingId: '1080/4840/AF' } }], point: { x: 1, y: 1 }, lngLat: { lng: 7.4, lat: 46.9 } }, 'buildings-points');
    map.fire('click', { point: { x: 1, y: 1 }, lngLat: { lng: 7.4, lat: 46.9 } });
    check('selection unchanged while measuring', state.selectedBuildingId === selectedBefore);
    check('measure point added', fake.Marker.instances.some(m => m.options.draggable));
    modules.measure.clearMeasurement();

    // Search: KI suggestion, objects (buildings and parcels), external results escaped
    ctx.setFetch({
      'https://api3.geo.admin.ch/rest/services/ech/SearchServer?type=layers': { results: [{ attrs: { label: 'Bauzonen <i>Schweiz</i>', layer: 'ch.are.bauzonen', title: 'Bauzonen' } }] }
    });
    const input = document.getElementById('search-input');
    input.value = 'Bern';
    input.dispatchEvent(new window.Event('input'));
    await settle(400);
    check('search results shown', document.getElementById('search-results').classList.contains('active'));
    check('KI suggestion rendered', !!document.getElementById('search-ai-item') && document.getElementById('search-ai-answer').hidden === true);
    check('building results', document.querySelectorAll('#search-results [data-action="searchLocal"]').length >= 1);
    check('parcel results', document.querySelectorAll('#search-results [data-action="searchParcel"]').length >= 1);
    check('external labels stripped', document.getElementById('search-results').innerHTML.indexOf('<i>') === -1);
    document.getElementById('search-ai-item').click();
    check('KI answer revealed with chips', document.getElementById('search-ai-answer').hidden === false && !!document.querySelector('#search-ai-answer .search-answer-link'));
    document.querySelector('#search-ai-answer .search-answer-link').click();
    await settle();
    check('answer chip selects the building', state.selectedBuildingId !== null && state.currentView === 'map');
    input.value = 'Bern';
    input.dispatchEvent(new window.Event('input'));
    await settle(400);
    document.querySelector('#search-results [data-action="searchLayer"]').click();
    await settle();
    check('layer result adds an external layer', modules.swisstopo.getActiveSwisstopoLayers().length === 1 && !!map.getLayer('swisstopo-layer-ch.are.bauzonen'));
    check('external layer listed', document.querySelectorAll('#external-layers-list .active-layer-item').length === 1);
    document.querySelector('#external-layers-list [data-action="removeSwisstopoLayer"]').click();
    await settle();
    check('external layer removed', modules.swisstopo.getActiveSwisstopoLayers().length === 0);

    // Share accordion fills the link; export panel counts and exports features
    document.querySelector('.accordion-item[data-accordion="share"] .accordion-header').click();
    check('share link filled', /basemap=light/.test(document.getElementById('share-link-input').value));
    document.querySelector('.accordion-item[data-accordion="export"] .accordion-header').click();
    check('export count for the current view', document.getElementById('export-count').textContent.indexOf('10 Objekte') === 0);
    const selection = document.getElementById('export-data-selection');
    selection.value = 'selected';
    selection.dispatchEvent(new window.Event('change'));
    check('export count for the selected object', document.getElementById('export-count').textContent.indexOf('1 Objekt ') === 0);
    selection.value = 'all';
    selection.dispatchEvent(new window.Event('change'));
    document.querySelector('.export-format-card[data-format="csv"]').click();
    const origClick = window.HTMLAnchorElement.prototype.click;
    let downloads = 0;
    window.HTMLAnchorElement.prototype.click = function() { if (this.download) downloads++; else origClick.call(this); };
    document.getElementById('export-btn').click();
    await settle(400);
    window.HTMLAnchorElement.prototype.click = origClick;
    check('export panel downloads a file', downloads === 1);
    check('export success toast', !!document.querySelector('#toast-container .toast-success'));

    // Language selector: same control as main, but this prototype only warns
    document.getElementById('lang-btn').click();
    check('language dropdown opens', document.getElementById('lang-dropdown').classList.contains('open'));
    document.querySelector('.lang-option[data-lang="en"]').click();
    check('language choice warns instead of switching', !document.getElementById('lang-dropdown').classList.contains('open') && !!document.querySelector('#toast-container .toast-warning') && document.documentElement.lang === 'de');

    // Measure accordion button starts the tool
    document.querySelector('[data-action="toggleMeasure"]').click();
    check('measure button starts the tool', modules.measure.isMeasuring());
    modules.measure.clearMeasurement();

    // Logo = home: landing state (map view, no filters, no selection, drawer closed) — not the previous view
    document.querySelector('.view-toggle-btn[data-view="gallery"]').click();
    document.getElementById('filter-panel-btn').click();
    document.getElementById('tbl-toggle').click();
    await settle();
    const flyHomeBefore = map.calls.flyTo.length;
    document.getElementById('logo-area').click();
    await settle(400);
    check('logo returns to the map view', state.currentView === 'map' && document.getElementById('map-view').classList.contains('active'));
    check('logo clears filters and selection', state.filteredData.features.length === 10 && state.selectedBuildingId === null && state.selectedParcelId === null && !document.getElementById('info-panel').classList.contains('show'));
    check('logo closes the drawer and the table panel', !document.getElementById('filter-panel').classList.contains('open') && !state.tableOpen);
    check('logo cleans the URL', !/filter_|id=|parcelId=|view=detail|table=open/.test(window.location.search));
    check('logo flies to the initial extent', map.calls.flyTo.length === flyHomeBefore + 1);
  }
};
