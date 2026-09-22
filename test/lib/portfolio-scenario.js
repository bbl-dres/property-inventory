// Real exported portfolio integration: exercises photos, evidence and related records for every building.
module.exports = function(prototype) {
  const simple = prototype === 'prototype-simple';
  return {
    name: prototype + ': sourced portfolio, photos and cadastral details',
    boot: { prototype, url: 'http://localhost/' + prototype + '/' },
    allowedErrors: [],
    async run(ctx, check) {
      const { modules, document } = ctx;
      const state = modules.state.state;
      for (const feature of state.buildingsData.features) {
        const p = feature.properties;
        const ext = simple ? p : p.extensionData;
        const id = simple ? p.bbl_id : p.buildingId;
        const name = simple ? p.bbl_bez : p.name;
        modules.ui.showDetailView(id);
        check(name + ': correct image', document.getElementById('carousel-image').style.backgroundImage.includes(ext.photos[0].url));
        check(name + ': real interior and exterior', document.querySelectorAll('#carousel-dots .carousel-dot').length === 3);
        document.querySelectorAll('#carousel-dots .carousel-dot')[2].click();
        check(name + ': photo description switches', document.getElementById('carousel-image').getAttribute('aria-label') === ext.photos[2].alt);
        if (ext.provenance.cadastre) {
          check(name + ': EGID/EGRID displayed', document.getElementById('detail-egid').textContent === ext.provenance.cadastre.egid && document.getElementById('detail-egrid').textContent === ext.provenance.cadastre.egrid);
        }
        if (!simple) {
          document.querySelector('.detail-tab[data-tab="measurements"]').click();
          check(name + ': measurements render', document.querySelectorAll('#measurements-tbody tr[data-id]').length === 19);
          document.querySelector('.detail-tab[data-tab="documents"]').click();
          check(name + ': KBOB code visible', document.getElementById('documents-tbody').textContent.includes('B14005'));
          check(name + ': public publication is clickable', document.querySelectorAll('#documents-tbody a[href^="https://"]').length === 1);
          document.querySelector('.detail-tab[data-tab="contacts"]').click();
          const contacts = Array.from(document.querySelectorAll('#contacts-tbody a[href^="mailto:"]'));
          check(name + ': fictional contact addresses', contacts.length === 3 && contacts.every(a => a.href.endsWith('@example.invalid')));
        }
      }
    }
  };
};
