// prototype-main: optional datasets missing -> warning, app keeps working with buildings only
module.exports = {
  name: 'main: partial data (parcels and land covers missing)',
  boot: {
    prototype: 'prototype-main',
    url: 'http://localhost/prototype-main/?table=open&tableTab=parcels',
    fetch: { 'data/parcels.geojson': { status: 404 }, 'data/landcovers.geojson': { status: 404 } }
  },
  allowedErrors: [],
  async run(ctx, check) {
    const { document, map, modules } = ctx;
    const state = modules.state.state;
    check('buildings loaded', state.buildingsData && state.buildingsData.features.length === 11);
    check('parcels null', state.parcelData === null && state.landCoverData === null);
    check('warning toast shown', !!document.querySelector('#toast-container .toast-warning'));
    check('building layers present, parcel layers absent', !!map.getLayer('buildings-points') && !map.getLayer('parcels-fill') && !map.getLayer('landcovers-fill'));
    check('parcels tab renders safely', state.activeTableTab === 'parcels' && document.querySelectorAll('#parcels-body tr[data-parcel-id]').length === 0 && !!document.querySelector('#parcels-body .table-empty-cell'));
    document.querySelector('.table-tab[data-table-tab="landcovers"]').click();
    check('land covers tab renders safely', document.querySelectorAll('#landcovers-body tr[data-landcover-id]').length === 0);
  }
};
