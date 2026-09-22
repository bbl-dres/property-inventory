module.exports = function(prototype) {
  let mobile = true;
  return {
    name: prototype + ': mobile location accordion and desktop tree',
    boot: {
      prototype,
      mediaMatches: query => mobile && (query.includes('max-width') || query.includes('pointer: coarse')),
      beforeImport: ({ window }) => { window.innerWidth = 390; window.innerHeight = 844; }
    },
    async run({ document, window, modules, settle }, check) {
      const state = modules.state.state;
      const host = document.getElementById('tree-panel-content');
      const panel = document.getElementById('tree-panel');
      const menu = document.getElementById('accordion-panel');
      const header = document.getElementById('mobile-tree-btn');
      const content = document.getElementById('mobile-tree-content');
      const hamburger = document.getElementById('hamburger-btn');
      check('phone tree is mounted once inside the menu', host.parentElement === content && document.querySelectorAll('#tree-panel-content').length === 1);
      check('closed accordion remains lazy', header.getAttribute('aria-expanded') === 'false' && !host.children.length);
      hamburger.click(); header.click();
      await settle();
      check('accordion opens in place and keeps menu open', header.getAttribute('aria-expanded') === 'true' && content.classList.contains('show') && !menu.classList.contains('collapsed'));
      check('no separate tree sheet or inert background', !panel.classList.contains('open') && !panel.hasAttribute('aria-modal') && !document.getElementById('header').hasAttribute('inert'));
      check('countries rendered with accessible tree label', host.querySelectorAll(':scope > .tree > .tree-item').length === 9 && host.getAttribute('aria-labelledby') === header.id);
      host.querySelector('[data-node="country:CH"]').click();
      check('country selection filters without closing the menu', state.activeFilters.land[0] === 'CH' && !menu.classList.contains('collapsed'));
      host.querySelector('.tree-row[data-node^="region:CH/"]').click();
      host.querySelector('.tree-row[data-node^="city:CH/"]').click();
      host.querySelector('.tree-row[data-node^="we:CH/"]').click();
      const building = host.querySelector('.tree-row[data-kind="building"]');
      const id = building.dataset.id;
      building.focus(); building.click();
      check('building selection closes menu and restores focus', state.selectedBuildingId === id && menu.classList.contains('collapsed') && document.activeElement === hamburger);
      hamburger.click();
      check('reopening retains expanded branch and selected building', header.classList.contains('active') && !!host.querySelector('.tree-row[data-kind="building"][aria-selected="true"]'));
      const parcel = host.querySelector('.tree-row[data-kind="parcel"]');
      const parcelId = parcel.dataset.id;
      parcel.click();
      check('parcel selection also closes menu', state.selectedParcelId === parcelId && menu.classList.contains('collapsed'));
      hamburger.click();
      document.querySelector('[data-accordion="layers"] .accordion-header').click();
      check('other accordion closes locations', !content.classList.contains('show') && header.getAttribute('aria-expanded') === 'false');
      header.click();
      check('opening locations closes other accordion', !document.querySelector('[data-accordion="layers"] .accordion-content').classList.contains('show') && !!host.querySelector('[data-kind="parcel"]'));
      const first = host.querySelector('[role="treeitem"]');
      first.focus(); first.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      check('tree keyboard navigation still works', host.contains(document.activeElement) && document.activeElement !== first);
      document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      check('Escape closes phone menu', menu.classList.contains('collapsed') && document.activeElement === hamburger);

      modules.ui.showDetailView(id);
      hamburger.click();
      host.querySelector('.tree-row[data-kind="building"]').click();
      check('tree selection also works in detail view', state.currentView === 'detail' && menu.classList.contains('collapsed'));
      mobile = false; window.innerWidth = 1440;
      window.dispatchEvent(new window.Event('resize')); await settle();
      check('desktop returns the same tree to the side panel', host.parentElement === panel && host.getAttribute('aria-labelledby') === 'tree-panel-title');
      document.getElementById('tree-panel-btn').click();
      check('desktop tree keeps its regular toggle', panel.classList.contains('open') && document.getElementById('tree-panel-btn').getAttribute('aria-expanded') === 'true');
      mobile = true; window.innerWidth = 390;
      window.dispatchEvent(new window.Event('resize')); await settle();
      check('return to mobile never activates the dormant desktop sheet', host.parentElement === content && !panel.hasAttribute('aria-modal') && !document.getElementById('header').hasAttribute('inert'));
      mobile = false; window.innerWidth = 1440;
      window.dispatchEvent(new window.Event('resize')); await settle();
      check('desktop open state survives phone layout', host.parentElement === panel && panel.classList.contains('open'));
    }
  };
};
