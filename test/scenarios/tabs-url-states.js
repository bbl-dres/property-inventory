// prototype-tabs: URL parameters restore view, selection, filters, basemap and external layers
module.exports = {
  name: 'tabs: URL state restore (view, selection, filter, detail)',
  boot: {
    prototype: 'prototype-tabs',
    url: 'http://localhost/prototype-tabs/?view=list&id=BBL-001&filter_status=In%20Betrieb&basemap=dark&topic=swisstopo&bgLayers=ch.are.bauzonen'
  },
  async run(ctx, check) {
    const { window, document, map, modules, settle } = ctx;
    const state = modules.state.state;

    check('list view from URL', state.currentView === 'list' && document.getElementById('list-view').classList.contains('active'));
    check('selection restored', state.selectedBuildingId === 'BBL-001' && document.getElementById('info-panel').classList.contains('show'));
    check('one fly-to for the restored selection', map.calls.flyTo.length === 1);
    check('filter restored', state.activeFilters.status.length === 1 && state.filteredData.features.length < 10);
    check('filter checkbox checked', !!document.querySelector('#filter-status-options input[data-value="In Betrieb"]:checked'));
    check('filter badge', !!document.querySelector('#filter-panel-btn .filter-count'));
    check('list rows filtered', document.querySelectorAll('#list-body tr[data-id]').length === state.filteredData.features.length);
    check('dark basemap', modules.basemaps.getCurrentMapStyle() === 'dark-matter');
    check('topic from URL', modules.swisstopo.getCurrentTopic() === 'swisstopo');
    check('external layer restored', modules.swisstopo.getActiveSwisstopoLayers().length === 1);

    // Direct detail link with an entity tab
    window.history.pushState({}, '', '/prototype-tabs/?view=detail&id=BBL-002&tab=contracts');
    window.dispatchEvent(new window.PopStateEvent('popstate'));
    await settle(50);
    check('detail view from history', state.currentView === 'detail' && document.querySelector('.detail-tab[data-tab="contracts"]').classList.contains('active'));
    check('contracts table rendered', document.querySelectorAll('#contracts-tbody tr').length > 0);
    check('style switcher hidden in detail', !document.getElementById('style-switcher').classList.contains('visible'));

    // Breadcrumb region link filters and returns to the previous (list) view
    document.getElementById('breadcrumb-region-link').click();
    await settle(150);
    check('breadcrumb applies region filter', state.activeFilters.region.length === 1 && state.currentView === 'list');
  }
};
