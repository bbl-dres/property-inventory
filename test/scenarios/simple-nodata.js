// prototype-simple: data load failure shows a retry; retry loads the data without duplicating listeners
module.exports = {
  name: 'simple: data load failure and retry',
  boot: {
    prototype: 'prototype-simple',
    url: 'http://localhost/prototype-simple/',
    fetch: { 'data/buildings.geojson': { status: 500 } }
  },
  allowedErrors: [/data load failed/],
  async run(ctx, check) {
    const { window, document, map, modules, settle } = ctx;
    const state = modules.state.state;

    check('overlay hidden after failure', document.getElementById('loading-overlay').classList.contains('hidden'));
    check('boot signalled despite failure', window.__appBooted === true);
    const toast = document.querySelector('#toast-container .toast-error');
    check('error toast with retry', !!toast && !!toast.querySelector('.toast-action-btn.primary'));
    check('no data yet', state.buildingsData === null);

    // Retry with working data
    ctx.setFetch({});
    toast.querySelector('.toast-action-btn.primary').click();
    await settle(80);
    check('data loaded after retry', state.buildingsData && state.buildingsData.features.length === 11);
    check('rows rendered after retry', document.querySelectorAll('#list-body tr').length === 11);
    check('map layers added once', map._layers.filter(l => l.id === 'buildings-points').length === 1);

    // Listeners were registered once: one click toggles the table exactly once
    document.getElementById('tbl-toggle').click();
    check('table toggle registered once', state.tableOpen === true && !document.getElementById('table-panel').classList.contains('collapsed'));
    const cb = document.querySelector('#filter-status-options input[type="checkbox"]');
    cb.checked = true;
    cb.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
    check('filter change handled once', state.activeFilters.status.length === 1);
  }
};
