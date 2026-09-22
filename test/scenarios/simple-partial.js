// prototype-simple: optional datasets missing -> warning, app keeps working with buildings only
module.exports = {
  name: 'simple: partial data (parcels and land covers missing)',
  boot: {
    prototype: 'prototype-simple',
    url: 'http://localhost/prototype-simple/?table=open&tableTab=parcels',
    fetch: { 'data/parcels.geojson': { status: 404 }, 'data/landcovers.geojson': { status: 404 } }
  },
  allowedErrors: [],
  async run(ctx, check) {
    const { document, map, modules } = ctx;
    const state = modules.state.state;
    check('buildings loaded', state.buildingsData && state.buildingsData.features.length === 14);
    check('parcels null', state.parcelData === null && state.landCoverData === null);
    check('warning toast shown', !!document.querySelector('#toast-container .toast-warning'));
    check('building layers present, parcel layers absent', !!map.getLayer('buildings-points') && !map.getLayer('parcels-fill') && !map.getLayer('landcovers-fill'));
    check('parcels tab renders safely', state.activeTableTab === 'parcels' && document.querySelectorAll('#parcels-body tr[data-parcel-id]').length === 0 && !!document.querySelector('#parcels-body .table-empty-cell'));
    document.querySelector('.table-tab[data-table-tab="landcovers"]').click();
    check('land covers tab renders safely', document.querySelectorAll('#landcovers-body tr[data-landcover-id]').length === 0);
  }
};
