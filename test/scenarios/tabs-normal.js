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
    check('buildings loaded (14)', state.buildingsData && state.buildingsData.features.length === 14);
    check('parcels loaded (14)', state.parcelData && state.parcelData.features.length === 14);
    check('entity data loaded', state.allAreaMeasurements.length > 0 && state.allContracts.length > 0 && state.allCosts.length > 0);
    check('no lang parameter added to the URL', window.location.search.indexOf('lang=') === -1);
    check('basemap normalised in URL', window.location.search.indexOf('basemap=light') !== -1);
    check('list rows rendered', document.querySelectorAll('#list-body tr[data-id]').length === 14);
    check('parcel rows rendered', document.querySelectorAll('#parcels-body tr[data-parcel-id]').length === 14);
    check('table hidden by default', document.getElementById('table-panel').classList.contains('collapsed') && state.tableOpen === false);
    check('filter options with counts', document.querySelectorAll('#filter-status-options .filter-option').length === 1 && !!document.querySelector('#filter-teilportfolio-options .filter-option-count'));
    check('style switcher visible', document.getElementById('style-switcher').classList.contains('visible'));
    check('location tree not built while its panel is closed', document.getElementById('tree-panel-content').children.length === 0);

    // Map layers and handlers
    check('map sources added', !!map.getSource('buildings') && !!map.getSource('parcels'));
    check('cluster + point + selection layers', ['buildings-clusters', 'buildings-cluster-count', 'buildings-points', 'buildings-selected', 'buildings-selected-pulse', 'buildings-labels', 'parcels-fill', 'parcels-highlight', 'parcels-selected', 'parcels-selected-outline'].every(id => !!map.getLayer(id)));
    check('buildings source clustered', map.getSource('buildings').cluster === true && map.getSource('buildings').clusterMaxZoom === 14);
    check('cluster click handler bound', map.listenerCount('click', 'buildings-clusters') === 1);
    check('point click handler bound once', map.listenerCount('click', 'buildings-points') === 1);

    // Selection via the map (the table is synced once per selection)
    const buildingsTable = modules.list.tables.buildings;
    const origSyncTo = buildingsTable.syncTo;
    let syncCalls = 0;
    buildingsTable.syncTo = function() { syncCalls++; return origSyncTo.apply(this, arguments); };
    map.fire('click', { features: [{ properties: { buildingId: '1080/4840/AF' } }], point: { x: 1, y: 1 }, lngLat: { lng: 7.4, lat: 46.9 } }, 'buildings-points');
    await settle();
    buildingsTable.syncTo = origSyncTo;
    check('map click selects building', state.selectedBuildingId === '1080/4840/AF');
    check('table synced once per selection', syncCalls === 1);
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
    const cb = document.querySelector('#filter-land-options input[data-value="CH"]');
    cb.checked = true;
    cb.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
    check('filter applied', state.filteredData.features.length < 14 && state.filteredData.features.length > 0);
    check('filters do not push history', window.history.length === histBefore);
    check('map source filtered', map.getSource('buildings').data.features.length === state.filteredData.features.length);
    document.getElementById('drawer-reset-btn').click();
    await settle();
    check('reset restores all buildings', state.filteredData.features.length === 14 && !cb.checked);

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

    // Sorting: a header click sorts the table by that column, a second click reverses it; the
    // extensionData columns sort by their nested value
    const nameHeader = document.querySelector('#list-table th.col-name');
    const names = state.buildingsData.features.map(f => f.properties.name).sort((a, b) => a.localeCompare(b, 'de-CH', { numeric: true, sensitivity: 'base' }));
    const firstCell = cls => document.querySelector('#list-body tr td.' + cls).textContent;
    nameHeader.click();
    check('header click sorts ascending', firstCell('col-name') === names[0] && nameHeader.getAttribute('aria-sort') === 'ascending' && nameHeader.classList.contains('sort-asc'));
    nameHeader.click();
    check('second click sorts descending', firstCell('col-name') === names[names.length - 1] && nameHeader.getAttribute('aria-sort') === 'descending');
    document.querySelector('#list-table th.col-flaeche').click();
    const areas = state.buildingsData.features.map(f => (f.properties.extensionData || {}).netFloorArea).filter(v => v != null).sort((a, b) => a - b);
    check('nested numeric column sorts numerically', firstCell('col-flaeche').replace(/[^0-9]/g, '') === Number(areas[0]).toFixed(0) && document.querySelectorAll('#list-table th[aria-sort="ascending"]').length === 1);

    // "Keine" / "Alle" of the columns menu rebuild the column stylesheet
    const sheet = document.getElementById('column-visibility-style');
    document.getElementById('columns-toggle-none').click();
    check('"Keine" hides every building column', sheet.textContent.indexOf('.col-name{') !== -1 && sheet.textContent.indexOf('.col-flaeche{') !== -1);
    document.getElementById('columns-toggle-all').click();
    check('"Alle" shows every building column', sheet.textContent.indexOf('.col-name{') === -1 && sheet.textContent.indexOf('.col-flaeche{') === -1);

    // Detail view
    modules.ui.showDetailView('1080/4840/AF');
    await settle(50);
    check('detail view active', state.currentView === 'detail' && document.getElementById('detail-view').classList.contains('active'));
    check('detail populated', document.getElementById('detail-name').textContent === 'Bundeshaus West' && document.getElementById('detail-baujahr').textContent === '1857');
    check('address parsed', document.getElementById('detail-street').textContent === 'Bundesgasse' && document.getElementById('detail-plz').textContent === '3011');
    check('breadcrumb populated', document.getElementById('breadcrumb-name').textContent === 'Bundeshaus West');
    check('carousel dots rendered', document.querySelectorAll('#carousel-dots .carousel-dot').length === 3);
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
    check('gallery cards rendered', document.querySelectorAll('#gallery-grid .gallery-card').length === 14);

    // A filter applied while the gallery shows cannot zoom the hidden map: the zoom happens once,
    // when the map shows again; returning to an unchanged filter keeps the map position
    const camBefore = map.calls.fitBounds.length + map.calls.flyTo.length;
    cb.checked = true;
    cb.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
    check('no camera move while the map is hidden', map.calls.fitBounds.length + map.calls.flyTo.length === camBefore && state.pendingFilterZoom === true);
    document.querySelector('.view-toggle-btn[data-view="map"]').click();
    await settle(150);
    check('zoom to the filtered objects when the map shows', map.calls.fitBounds.length + map.calls.flyTo.length === camBefore + 1 && state.pendingFilterZoom === false);
    document.querySelector('.view-toggle-btn[data-view="gallery"]').click();
    await settle();
    document.querySelector('.view-toggle-btn[data-view="map"]').click();
    await settle(150);
    check('returning to an unchanged filter keeps the map position', map.calls.fitBounds.length + map.calls.flyTo.length === camBefore + 1);
    cb.checked = false;
    cb.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
    check('filter cleared again', state.filteredData.features.length === 14 && state.pendingFilterZoom === false);

    // Map view + basemap switch
    document.querySelector('.view-toggle-btn[data-view="map"]').click();
    await settle(150);
    map.fire('click', { features: [{ properties: { buildingId: '9900/9002/AA' } }], point: { x: 1, y: 1 }, lngLat: { lng: 7.4, lat: 46.9 } }, 'buildings-points');
    const flyBeforeStyle = map.calls.flyTo.length;
    document.querySelector('.style-option[data-style="voyager"]').click();
    await settle(50);
    check('setStyle called', map.calls.setStyle.length === 1);
    check('layers restored after style change', !!map.getSource('buildings') && !!map.getLayer('buildings-points') && !!map.getLayer('parcels-fill'));
    check('handlers still bound once', map.listenerCount('click', 'buildings-points') === 1);
    check('selection highlight restored', JSON.stringify(map.getLayer('buildings-selected').filter).indexOf('9900/9002/AA') !== -1);
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
    map.fire('click', { point: { x: 50, y: 50 }, lngLat: { lng: 7.5, lat: 46.95 } });
    const labelMarkers = () => fake.Marker.instances.filter(m => m._el.className === 'measure-label' && !m.removed);
    check('second point draws the line with one segment label', !!map.getLayer('measure-line') && labelMarkers().length === 1);
    // A basemap change drops the line source: the measurement in progress is redrawn
    document.querySelector('.style-option[data-style="dark-matter"]').click();
    await settle(50);
    check('measurement survives a basemap change', modules.measure.isMeasuring() && !!map.getSource('measure-line-source') && !!map.getLayer('measure-line') && labelMarkers().length === 1);
    modules.measure.clearMeasurement();
    check('measurement cleared', !modules.measure.isMeasuring() && !map.getSource('measure-line-source') && labelMarkers().length === 0);
    document.querySelector('.style-option[data-style="positron"]').click(); // back to Light (the share link below expects it)
    await settle(50);
    check('no measurement layer restored once cleared', !map.getSource('measure-line-source'));

    // Context menu: closes when the map moves under it or on a click elsewhere on the page
    const menu = document.getElementById('map-context-menu');
    map.fire('contextmenu', { point: { x: 20, y: 20 }, lngLat: { lng: 7.4, lat: 46.9 }, preventDefault() {} });
    check('context menu opens with the coordinates', menu.classList.contains('show') && document.getElementById('context-menu-coords-text').textContent === '46.90000, 7.40000');
    map.fire('movestart');
    check('context menu closes when the map moves', !menu.classList.contains('show'));
    map.fire('contextmenu', { point: { x: 20, y: 20 }, lngLat: { lng: 7.4, lat: 46.9 }, preventDefault() {} });
    document.getElementById('header').click();
    check('context menu closes on a click elsewhere', !menu.classList.contains('show'));

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
    check('export count for the current view', document.getElementById('export-count').textContent.indexOf('14 Objekte') === 0);
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


    // Location tree: country / region / city nodes set the Land / Region / Ort filters of the drawer,
    // WE nodes are folders, object rows select on the map; one level at a time, one open node per level
    document.getElementById('tree-panel-btn').click();
    await settle();
    check('tree panel opens; the button is a plain toggle', document.getElementById('tree-panel').classList.contains('open') && document.getElementById('tree-panel-btn').classList.contains('panel-open') && document.getElementById('tree-panel-btn').getAttribute('aria-expanded') === 'true');
    check('tree lists the countries with counts', document.querySelectorAll('#tree-panel-content > .tree > .tree-item').length === 9 && document.querySelector('#tree-panel-content .tree-count').textContent !== '');
    const rows = function(sel) { return document.querySelectorAll('#tree-panel-content .tree-row' + sel); };
    const fold = function(key) { document.querySelector('#tree-panel-content .tree-fold[data-fold="' + key + '"]').click(); };
    const row = function(key) { return document.querySelector('#tree-panel-content .tree-row[data-node="' + key + '"]'); };
    row('country:CH').click();
    await settle();
    check('country node sets the Land filter', state.activeFilters.land.length === 1 && state.activeFilters.land[0] === 'CH' && state.filteredData.features.length === 5 && /filter_land=CH/.test(window.location.search));
    await settle(200); // assets/countries/index.json and CH.geojson are fetched on the first use
    const outline = map.getLayer('country-highlight-line');
    const zoom = map.calls.fitBounds[map.calls.fitBounds.length - 1];
    check('country outlined on the map and zoomed to', !!map.getSource('countries') && map.getSource('countries').data.features.some(f => f.properties.key === 'CH' && f.geometry.coordinates[0].length > 500) && !!outline && JSON.stringify(outline.filter) === JSON.stringify(['==', ['get', 'key'], 'CH']) && !!zoom && zoom.bounds[0] > 5 && zoom.bounds[0] < 7 && zoom.bounds[3] > 47 && zoom.bounds[3] < 48);
    check('outline layers sit under the data layers', map._layers.findIndex(l => l.id === 'country-highlight-line') < map._layers.findIndex(l => l.id === 'buildings-points'));
    check('filter button counts it, the Standorte button carries no badge', !!document.querySelector('#filter-panel-btn .filter-count') && !document.querySelector('#tree-panel-btn .filter-count') && !document.getElementById('tree-panel-btn').classList.contains('has-active-filters') && /CH/.test(document.getElementById('filter-pills').textContent));
    check('drawer checkbox follows', !!document.querySelector('#filter-panel input[data-filter="land"][data-value="CH"]:checked'));
    check('selected node opens one level', rows('[data-node^="region:CH/"]').length === 2 && rows('[data-node^="city:"]').length === 0 && document.querySelector('#tree-panel-content .tree-node.is-active .tree-row').dataset.node === 'country:CH');
    fold('country:DE');
    check('one open country at a time', rows('[data-node^="region:DE/"]').length === 1 && rows('[data-node^="region:CH/"]').length === 0 && state.activeFilters.land[0] === 'CH');
    fold('country:CH');
    row('region:CH/Kanton%20Bern').click();
    await settle();
    await settle(200); // assets/regions/CH-BE.geojson is fetched on the first use
    const cantonZoom = map.calls.fitBounds[map.calls.fitBounds.length - 1];
    check('canton outlined and zoomed to (Bern)', JSON.stringify(map.getLayer('country-highlight-line').filter) === JSON.stringify(['==', ['get', 'key'], 'CH-BE']) && map.getSource('countries').data.features.some(f => f.properties.key === 'CH-BE') && cantonZoom.bounds[0] > 6.7 && cantonZoom.bounds[0] < 7.2 && cantonZoom.bounds[2] > 8.3 && cantonZoom.bounds[2] < 8.6);
    check('region node adds the Region filter', state.activeFilters.region.length === 1 && state.activeFilters.region[0] === 'Kanton Bern' && state.activeFilters.land[0] === 'CH' && state.filteredData.features.length === 4);
    check('country is on the path, region active, cities shown', document.querySelector('.tree-row[data-node="country:CH"]').closest('.tree-node').classList.contains('is-path') && row('region:CH/Kanton%20Bern').closest('.tree-node').classList.contains('is-active') && rows('[data-node="city:CH/Kanton%20Bern/Bern"]').length === 1 && rows('[data-node^="we:"]').length === 0);
    fold('city:CH/Kanton%20Bern/Bern');
    check('city opens its WE nodes', rows('[data-node^="we:CH/"]').length === 2);
    fold('region:CH/Kanton%20Z%C3%BCrich');
    check('one open region per country', rows('[data-node^="city:CH/"]').length === 1 && rows('[data-node^="we:"]').length === 0 && rows('[data-node="city:CH/Kanton%20Bern/Bern"]').length === 0);
    fold('region:CH/Kanton%20Bern');
    const weRow = Array.from(rows('')).find(r => r.textContent.indexOf('WE 4840') !== -1);
    check('reopened region remembers its open city', !!weRow);
    weRow.click();
    check('WE row is a folder: opens its objects, no filter', rows('[data-kind="building"]').length >= 1 && state.activeFilters.region.length === 1 && !document.querySelector('.tree-row[data-node^="we:"]').closest('.tree-node').classList.contains('is-active'));
    const leaf = document.querySelector('#tree-panel-content .tree-row[data-kind="building"]');
    leaf.click();
    await settle();
    check('object row selects the building on the map', state.selectedBuildingId === '1080/4840/AF' && document.querySelector('#tree-panel-content .tree-node.is-active .tree-row[data-kind="building"]') !== null);
    Array.from(rows('')).find(r => r.textContent.indexOf('WE 4840') !== -1).click();
    check('WE row again folds it', rows('[data-kind="building"]').length === 0);
    row('region:CH/Kanton%20Bern').click();
    await settle();
    check('selected region again removes its filter and folds', state.activeFilters.region.length === 0 && state.activeFilters.land[0] === 'CH' && rows('[data-node^="city:"]').length === 0 && row('country:CH').closest('.tree-node').classList.contains('is-active'));
    document.querySelector('#filter-pills .filter-pill-remove[data-filter-key="land"]').click();
    await settle();
    check('pill removes the filter; nothing highlighted', state.activeFilters.land.length === 0 && state.filteredData.features.length === state.buildingsData.features.length && !document.querySelector('#tree-panel-content .tree-node.is-active') && !/filter_land/.test(window.location.search) && JSON.stringify(map.getLayer('country-highlight-line').filter) === JSON.stringify(['==', ['get', 'key'], '']));
    // On the detail page a tree object row opens that object's page; a parcel opens its building's page
    modules.ui.showDetailView('1080/4840/AF');
    await settle();
    fold('country:DE'); fold('region:DE/Berlin'); fold('city:DE/Berlin/Berlin'); fold('we:DE/Berlin/Berlin/5210');
    document.querySelector('#tree-panel-content .tree-row[data-kind="building"][data-id="1080/5210/AA"]').click();
    await settle();
    const detailId = function() { const b = state.currentDetailBuilding; return b ? (b.properties.bbl_id || b.properties.buildingId) : null; };
    check('tree building row updates the detail page', state.currentView === 'detail' && detailId() === '1080/5210/AA' && /view=detail/.test(window.location.search) && /id=1080%2F5210%2FAA/.test(window.location.search) && state.selectedBuildingId === '1080/5210/AA');
    modules.ui.showDetailView('1080/4840/AF');
    await settle();
    document.querySelector('#tree-panel-content .tree-row[data-kind="parcel"][data-id="1080/5210/01"]').click();
    await settle();
    check('tree parcel row opens its building on the detail page', state.currentView === 'detail' && detailId() === '1080/5210/AA' && state.selectedParcelId === '1080/5210/01');
    modules.ui.switchView('map');
    await settle();

    // Resizable: dragging the grip on the right edge sets --tree-panel-width (clamped to the tokens)
    const grip = document.getElementById('tree-resize-handle');
    const ptr = function(type, x) { const ev = new window.MouseEvent(type, { bubbles: true, clientX: x, button: 0 }); (type === 'pointerdown' ? grip : document).dispatchEvent(ev); };
    // (jsdom has no layout: offsetWidth is 0, so only the clamped ends of the range are checked)
    ptr('pointerdown', 0); ptr('pointermove', 1000); ptr('pointerup', 1000);
    check('drag to the right widens the panel (clamped to the maximum)', document.documentElement.style.getPropertyValue('--tree-panel-width') === '600px' && !document.getElementById('tree-panel').classList.contains('resizing'));
    ptr('pointerdown', 1000); ptr('pointermove', 0); ptr('pointerup', 0);
    check('drag to the left narrows it (clamped to the minimum)', document.documentElement.style.getPropertyValue('--tree-panel-width') === '240px');
    check('both side panels carry the same grip next to them', document.getElementById('tree-panel').nextElementSibling === grip && document.getElementById('filter-resize-handle').nextElementSibling === document.getElementById('filter-panel') && grip.className === 'panel-resize-handle');
    // The drawer's grip drives --drawer-width the same way (dragging left = wider)
    const dgrip = document.getElementById('filter-resize-handle');
    const dptr = function(type, x) { const ev = new window.MouseEvent(type, { bubbles: true, clientX: x, button: 0 }); (type === 'pointerdown' ? dgrip : document).dispatchEvent(ev); };
    dptr('pointerdown', 1000); dptr('pointermove', 0); dptr('pointerup', 0);
    check('drawer grip widens the drawer (clamped to the maximum)', document.documentElement.style.getPropertyValue('--drawer-width') === '800px');
    check('drawer reset is a labelled button', /Zurücksetzen|Reset/.test(document.getElementById('drawer-reset-btn').textContent) && document.getElementById('drawer-reset-btn').classList.contains('btn-tertiary'));
    document.getElementById('tree-close-btn').click();
    check('tree panel closes; the button returns to its default state', !document.getElementById('tree-panel').classList.contains('open') && !document.getElementById('tree-panel-btn').classList.contains('panel-open'));

    // Tools panel folds when the opening table panel would overlap it (rects stubbed: jsdom has no layout)
    const toolsPanel = document.getElementById('accordion-panel');
    const tablePanel = document.getElementById('table-panel');
    const rectOf = function(top, bottom) { return function() { return { top: top, bottom: bottom, left: 0, right: 400, height: bottom - top, width: 400 }; }; };
    const origTools = toolsPanel.getBoundingClientRect, origTable = tablePanel.getBoundingClientRect;
    toolsPanel.getBoundingClientRect = rectOf(100, 700);
    tablePanel.getBoundingClientRect = rectOf(500, 900);
    check('tools panel open before the table', !toolsPanel.classList.contains('collapsed'));
    document.getElementById('tbl-toggle').click();
    await settle(400);
    check('tools panel folded by the colliding table', toolsPanel.classList.contains('collapsed') && document.getElementById('menu-toggle').getAttribute('aria-expanded') === 'false');
    document.getElementById('menu-toggle').click();
    check('the reader can open it again', !toolsPanel.classList.contains('collapsed'));
    toolsPanel.getBoundingClientRect = origTools;
    tablePanel.getBoundingClientRect = origTable;
    document.getElementById('tbl-toggle').click();
    await settle(400);

    // "Drucken" in the context menu unfolds a collapsed tools panel, then opens the print item
    document.getElementById('menu-toggle').click();
    check('tools panel folded by the toggle', toolsPanel.classList.contains('collapsed'));
    document.getElementById('context-menu-print').click();
    const printHeader = document.querySelector('.accordion-item[data-accordion="print"] .accordion-header');
    check('context menu "Drucken" unfolds the panel and opens the print item', !toolsPanel.classList.contains('collapsed') && printHeader.classList.contains('active') && !!document.querySelector('#map .print-preview-overlay.active'));
    printHeader.click();
    check('print preview hidden with the item', !document.querySelector('#map .print-preview-overlay.active'));

    // Map busy pill: not shown when every tile is loaded; shown for a slow load and hidden again as soon as
    // the map is ready (sourcedata) or after the watchdog, not only on 'idle'
    const busy = document.getElementById('map-busy');
    map.fire('dataloading');
    await settle(500);
    check('no "loading" pill when the tiles are loaded', !busy.classList.contains('show'));
    map._tilesLoaded = false;
    map.fire('dataloading');
    await settle(500);
    check('pill shown while tiles load', busy.classList.contains('show'));
    map._tilesLoaded = true;
    map.fire('sourcedata', { dataType: 'source' });
    check('pill hidden as soon as the map is ready', !busy.classList.contains('show'));

    // Logo = home: landing state (map view, no filters, no selection, drawer closed) — not the previous view
    document.querySelector('.view-toggle-btn[data-view="gallery"]').click();
    document.getElementById('filter-panel-btn').click();
    document.getElementById('tbl-toggle').click();
    await settle();
    const flyHomeBefore = map.calls.flyTo.length;
    document.getElementById('logo-area').click();
    await settle(400);
    check('logo returns to the map view', state.currentView === 'map' && document.getElementById('map-view').classList.contains('active'));
    check('logo clears filters and selection', state.filteredData.features.length === 14 && state.selectedBuildingId === null && state.selectedParcelId === null && !document.getElementById('info-panel').classList.contains('show'));
    check('logo closes the drawer and the table panel', !document.getElementById('filter-panel').classList.contains('open') && !state.tableOpen);
    check('logo cleans the URL', !/filter_|id=|parcelId=|view=detail|table=open/.test(window.location.search));
    check('logo flies to the initial extent', map.calls.flyTo.length === flyHomeBefore + 1);
  }
};
