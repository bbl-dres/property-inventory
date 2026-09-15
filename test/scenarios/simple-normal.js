// prototype-simple: normal boot, views, selection, filters, basemap switch, measure guard, search
module.exports = {
  name: 'simple: normal boot and interactions',
  boot: { prototype: 'prototype-simple', url: 'http://localhost/prototype-simple/' },
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
    check('table row selects building', state.selectedBuildingId === '1080/4840/AF');
    check('info panel shown', document.getElementById('info-panel').classList.contains('show'));
    check('info panel escaped content', document.getElementById('info-body').innerHTML.indexOf('Bundeshaus West') !== -1);
    check('selection written to URL', window.location.search.indexOf('id=1080%2F4840%2FAF') !== -1 || window.location.search.indexOf('id=1080/4840/AF') !== -1);
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
    check('map selection kept in URL across views', window.location.search.indexOf('id=1080%2F4840%2FAF') !== -1);

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
    window.history.pushState({}, '', '/prototype-simple/?view=gallery');
    window.dispatchEvent(new window.PopStateEvent('popstate'));
    await settle();
    check('popstate switches to gallery', state.currentView === 'gallery');
    window.history.pushState({}, '', '/prototype-simple/?view=map');
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
    map.fire('click', { features: [{ properties: { bbl_id: '1080/4840/AF' } }], point: { x: 1, y: 1 }, lngLat: { lng: 7.4, lat: 46.9 } }, 'buildings-points');
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


    // Location tree: country / region / city nodes set the Land / Region / Ort filters of the drawer,
    // WE nodes are folders, object rows select on the map; one level at a time, one open node per level
    document.getElementById('tree-panel-btn').click();
    await settle();
    check('tree panel opens; the button is a plain toggle', document.getElementById('tree-panel').classList.contains('open') && document.getElementById('tree-panel-btn').classList.contains('panel-open') && document.getElementById('tree-panel-btn').getAttribute('aria-expanded') === 'true');
    check('tree lists the countries with counts', document.querySelectorAll('#tree-panel-content > .tree > .tree-item').length === 6 && document.querySelector('#tree-panel-content .tree-count').textContent !== '');
    const rows = function(sel) { return document.querySelectorAll('#tree-panel-content .tree-row' + sel); };
    const fold = function(key) { document.querySelector('#tree-panel-content .tree-fold[data-fold="' + key + '"]').click(); };
    const row = function(key) { return document.querySelector('#tree-panel-content .tree-row[data-node="' + key + '"]'); };
    row('country:CH').click();
    await settle();
    check('country node sets the Land filter', state.activeFilters.land.length === 1 && state.activeFilters.land[0] === 'CH' && state.filteredData.features.length === 6 && /filter_land=CH/.test(window.location.search));
    await settle(200); // assets/countries/index.json and CH.geojson are fetched on the first use
    const outline = map.getLayer('country-highlight-line');
    const zoom = map.calls.fitBounds[map.calls.fitBounds.length - 1];
    check('country outlined on the map and zoomed to', !!map.getSource('countries') && map.getSource('countries').data.features.some(f => f.properties.key === 'CH' && f.geometry.coordinates[0].length > 500) && !!outline && JSON.stringify(outline.filter) === JSON.stringify(['==', ['get', 'key'], 'CH']) && !!zoom && zoom.bounds[0] > 5 && zoom.bounds[0] < 7 && zoom.bounds[3] > 47 && zoom.bounds[3] < 48);
    check('outline layers sit under the data layers', map._layers.findIndex(l => l.id === 'country-highlight-fill') < map._layers.findIndex(l => l.id === 'buildings-points'));
    check('filter button counts it, the Standorte button carries no badge', !!document.querySelector('#filter-panel-btn .filter-count') && !document.querySelector('#tree-panel-btn .filter-count') && !document.getElementById('tree-panel-btn').classList.contains('has-active-filters') && /CH/.test(document.getElementById('filter-pills').textContent));
    check('drawer checkbox follows', !!document.querySelector('#filter-panel input[data-filter="land"][data-value="CH"]:checked'));
    check('selected node opens one level', rows('[data-node^="region:CH/"]').length === 5 && rows('[data-node^="city:"]').length === 0 && document.querySelector('#tree-panel-content .tree-node.is-active .tree-row').dataset.node === 'country:CH');
    fold('country:DE');
    check('one open country at a time', rows('[data-node^="region:DE/"]').length === 1 && rows('[data-node^="region:CH/"]').length === 0 && state.activeFilters.land[0] === 'CH');
    fold('country:CH');
    row('region:CH/BE').click();
    await settle();
    await settle(200); // assets/regions/CH-BE.geojson is fetched on the first use
    const cantonZoom = map.calls.fitBounds[map.calls.fitBounds.length - 1];
    check('canton outlined and zoomed to (Bern)', JSON.stringify(map.getLayer('country-highlight-line').filter) === JSON.stringify(['==', ['get', 'key'], 'CH-BE']) && map.getSource('countries').data.features.some(f => f.properties.key === 'CH-BE') && cantonZoom.bounds[0] > 6.7 && cantonZoom.bounds[0] < 7.2 && cantonZoom.bounds[2] > 8.3 && cantonZoom.bounds[2] < 8.6);
    check('region node adds the Region filter', state.activeFilters.region.length === 1 && state.activeFilters.region[0] === 'BE' && state.activeFilters.land[0] === 'CH' && state.filteredData.features.length === 2);
    check('country is on the path, region active, cities shown', document.querySelector('.tree-row[data-node="country:CH"]').closest('.tree-node').classList.contains('is-path') && row('region:CH/BE').closest('.tree-node').classList.contains('is-active') && rows('[data-node="city:CH/BE/Bern"]').length === 1 && rows('[data-node^="we:"]').length === 0);
    fold('city:CH/BE/Bern');
    check('city opens its WE nodes', rows('[data-node^="we:CH/"]').length === 2);
    fold('region:CH/ZH');
    check('one open region per country', rows('[data-node^="city:CH/"]').length === 1 && rows('[data-node^="we:"]').length === 0 && rows('[data-node="city:CH/BE/Bern"]').length === 0);
    fold('region:CH/BE');
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
    row('region:CH/BE').click();
    await settle();
    check('selected region again removes its filter and folds', state.activeFilters.region.length === 0 && state.activeFilters.land[0] === 'CH' && rows('[data-node^="city:"]').length === 0 && row('country:CH').closest('.tree-node').classList.contains('is-active'));
    document.querySelector('#filter-pills .filter-pill-remove[data-filter-key="land"]').click();
    await settle();
    check('pill removes the filter; nothing highlighted', state.activeFilters.land.length === 0 && state.filteredData.features.length === state.buildingsData.features.length && !document.querySelector('#tree-panel-content .tree-node.is-active') && !/filter_land/.test(window.location.search) && JSON.stringify(map.getLayer('country-highlight-line').filter) === JSON.stringify(['==', ['get', 'key'], '']));
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

    // Logo = home: landing state (map view, no filters, no selection, drawer and table closed)
    document.querySelector('.view-toggle-btn[data-view="gallery"]').click();
    document.getElementById('filter-panel-btn').click();
    document.getElementById('tbl-toggle').click();
    await settle();
    const flyHomeBefore = map.calls.flyTo.length;
    document.getElementById('logo-area').click();
    await settle(400);
    check('logo returns to the map view', state.currentView === 'map' && document.getElementById('map-view').classList.contains('active'));
    check('logo clears filters and selection', state.filteredData.features.length === state.buildingsData.features.length && state.selectedBuildingId === null && !document.getElementById('info-panel').classList.contains('show'));
    check('logo closes the drawer and the table panel', !document.getElementById('filter-panel').classList.contains('open') && !state.tableOpen);
    check('logo cleans the URL', !/filter_|id=|view=detail|table=open/.test(window.location.search));
    check('logo flies to the initial extent', map.calls.flyTo.length === flyHomeBefore + 1);
  }
};
