// prototype-tabs: optional datasets missing -> warning, app keeps working with buildings only
module.exports = {
  name: 'tabs: partial data (parcels and contracts missing)',
  boot: {
    prototype: 'prototype-tabs',
    url: 'http://localhost/prototype-tabs/?view=detail&id=1080%2F4840%2FAF&tab=contracts',
    fetch: { 'data/parcels.geojson': { status: 404 }, 'data/contracts.json': { status: 404 } }
  },
  allowedErrors: [],
  async run(ctx, check) {
    const { document, map, modules } = ctx;
    const state = modules.state.state;
    check('buildings loaded', state.buildingsData && state.buildingsData.features.length === 10);
    check('parcels null, contracts empty', state.parcelData === null && state.allContracts.length === 0);
    check('warning toast shown', !!document.querySelector('#toast-container .toast-warning'));
    check('building layers present, parcel layers absent', !!map.getLayer('buildings-points') && !map.getLayer('parcels-fill'));
    check('parcel table empty without data', document.querySelectorAll('#parcels-body tr[data-parcel-id]').length === 0);
    check('detail view with empty contracts table', state.currentView === 'detail' && !!document.querySelector('#contracts-tbody .table-empty-state'));
    document.querySelector('.detail-tab[data-tab="costs"]').click();
    check('costs table still renders', document.querySelectorAll('#costs-tbody tr[data-id]').length > 0);
  }
};
