// prototype-main: ?view=detail opens the detail page directly; gallery deep link
module.exports = {
  name: 'main: deep links to detail and gallery',
  boot: { prototype: 'prototype-main', url: 'http://localhost/prototype-main/?view=detail&id=1080%2F4840%2FAF' },
  async run(ctx, check) {
    const { window, document, modules, settle, fake } = ctx;
    const state = modules.state.state;
    check('detail view opened from URL', state.currentView === 'detail' && document.getElementById('detail-view').classList.contains('active'));
    check('detail content populated', document.getElementById('detail-id').textContent === '1080/4840/AF');
    check('body scroll mode', document.body.classList.contains('detail-active'));
    check('mini map created', fake.Map.instances.length === 2);
    check('style switcher hidden', !document.getElementById('style-switcher').classList.contains('visible'));

    // Breadcrumb country link filters the map by country
    document.getElementById('breadcrumb-country-link').click();
    await settle(150);
    check('breadcrumb applies country filter and shows the map', state.currentView === 'map' && state.activeFilters.land.length === 1);
    check('country filter checkbox checked', !!document.querySelector('#filter-land-options input:checked'));
  }
};
