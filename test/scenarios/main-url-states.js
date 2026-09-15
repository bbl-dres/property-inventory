// prototype-main: URL parameters restore selection, table, filters and the detail view
module.exports = {
  name: 'main: URL state restore (selection, table, filter, detail)',
  boot: {
    prototype: 'prototype-main',
    url: 'http://localhost/prototype-main/?id=1080%2F4840%2FAF&table=open&filter_status=Aktiv&tableTab=parcels&basemap=aerial&topic=swisstopo&bgLayers=ch.are.bauzonen'
  },
  async run(ctx, check) {
    const { window, document, map, modules, settle } = ctx;
    const state = modules.state.state;

    check('map view kept for plain ?id=', state.currentView === 'map' && !document.getElementById('detail-view').classList.contains('active'));
    check('selection restored from URL', state.selectedBuildingId === '1080/4840/AF' && document.getElementById('info-panel').classList.contains('show'));
    check('one fly-to for the restored selection', map.calls.flyTo.length === 1);
    check('table open from URL', state.tableOpen === true && !document.getElementById('table-panel').classList.contains('collapsed'));
    check('selection switches the table to buildings tab', state.activeTableTab === 'buildings');
    check('filter restored from URL', state.activeFilters.status.length === 1 && state.filteredData.features.length < 11);
    check('filter checkbox checked', !!document.querySelector('#filter-status-options input[data-value="Aktiv"]:checked'));
    check('filter badge on header button', !!document.querySelector('#filter-panel-btn .filter-count'));
    check('aerial basemap from URL', modules.basemaps.getCurrentMapStyle() === 'swissimage' && document.querySelector('.style-option[data-style="swissimage"]').classList.contains('active'));
    check('topic from URL', modules.swisstopo.getCurrentTopic() === 'swisstopo' && document.getElementById('geokatalog-title').textContent === 'swisstopo');
    check('external layer restored from URL', modules.swisstopo.getActiveSwisstopoLayers().length === 1 && !!map.getLayer('swisstopo-layer-ch.are.bauzonen'));

    // Table toggle works on first click (state and DOM agree)
    document.getElementById('tbl-toggle').click();
    check('table toggle closes on first click', state.tableOpen === false && document.getElementById('table-panel').classList.contains('collapsed'));

    // Direct detail link
    window.history.pushState({}, '', '/prototype-main/?view=detail&id=1080%2F4840%2FAF&tab=measurements');
    window.dispatchEvent(new window.PopStateEvent('popstate'));
    await settle(50);
    check('detail view from history', state.currentView === 'detail' && document.querySelector('.detail-tab[data-tab="measurements"]').classList.contains('active'));
  }
};
