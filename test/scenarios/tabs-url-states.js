// prototype-tabs: URL parameters restore view, selection, filters, basemap and external layers
module.exports = {
  name: 'tabs: URL state restore (selection, table, filter, detail)',
  boot: {
    prototype: 'prototype-tabs',
    url: 'http://localhost/prototype-tabs/?id=1080%2F4840%2FAF&table=open&filter_land=CH&filter_status=In%20Betrieb&basemap=dark&topic=swisstopo&bgLayers=ch.are.bauzonen'
  },
  async run(ctx, check) {
    const { window, document, map, modules, settle } = ctx;
    const state = modules.state.state;

    check('map view with the table open from URL', state.currentView === 'map' && state.tableOpen === true && !document.getElementById('table-panel').classList.contains('collapsed'));
    check('table row synced with the restored selection', !!document.querySelector('#list-body tr.row-active[data-id="1080/4840/AF"]'));
    check('selection restored', state.selectedBuildingId === '1080/4840/AF' && document.getElementById('info-panel').classList.contains('show'));
    check('one fly-to for the restored selection', map.calls.flyTo.length === 1);
    check('filter restored', state.activeFilters.status.length === 1 && state.filteredData.features.length === 5);
    check('filter checkbox checked', !!document.querySelector('#filter-status-options input[data-value="In Betrieb"]:checked'));
    check('filter badge', !!document.querySelector('#filter-panel-btn .filter-count'));
    check('list rows filtered', document.querySelectorAll('#list-body tr[data-id]').length === state.filteredData.features.length);
    check('dark basemap', modules.basemaps.getCurrentMapStyle() === 'dark-matter');
    check('topic from URL', modules.swisstopo.getCurrentTopic() === 'swisstopo');
    check('external layer restored', modules.swisstopo.getActiveSwisstopoLayers().length === 1);

    // Direct detail link with an entity tab
    window.history.pushState({}, '', '/prototype-tabs/?view=detail&id=1080%2F5210%2FAA&tab=contracts');
    window.dispatchEvent(new window.PopStateEvent('popstate'));
    await settle(50);
    check('detail view from history', state.currentView === 'detail' && document.querySelector('.detail-tab[data-tab="contracts"]').classList.contains('active'));
    check('contracts table rendered', document.querySelectorAll('#contracts-tbody tr').length > 0);
    check('style switcher hidden in detail', !document.getElementById('style-switcher').classList.contains('visible'));

    // Breadcrumb region link filters and returns to the map
    document.getElementById('breadcrumb-region-link').click();
    await settle(150);
    check('breadcrumb applies region filter', state.activeFilters.region.length === 1 && state.currentView === 'map');
  }
};
