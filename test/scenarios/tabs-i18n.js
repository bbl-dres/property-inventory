const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

module.exports = {
  name: 'tabs: four languages, live translation and preserved state',
  boot: { prototype: 'prototype-tabs', url: 'http://localhost/prototype-tabs/?lang=fr&table=open&filter_land=CH' },
  async run(ctx, check) {
    const { document, window, modules, map, settle } = ctx;
    const state = modules.state.state;
    const load = name => import(pathToFileURL(path.resolve(__dirname, '../../prototype-tabs/js/' + name + '.js')).href);
    const { t, setLang } = await load('i18n');
    const { suggestAiQuestion } = await load('assistant');
    const dictionary = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../prototype-tabs/data/i18n.json'), 'utf8'));
    const langs = ['de', 'fr', 'it', 'en'];
    const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
    check('all dictionary entries contain all four languages and matching parameters', Object.values(dictionary).every(entry =>
      langs.every(lang => typeof entry[lang] === 'string' && entry[lang].length && placeholders(entry[lang]) === placeholders(entry.de))));
    check('all DOM translation keys resolve', [...document.querySelectorAll('*')].every(el => [...el.attributes]
      .filter(attr => /^data-i18n(?:-|$)/.test(attr.name)).every(attr => dictionary[attr.value])));
    check('French deep link applies before rendering', document.documentElement.lang === 'fr' && document.querySelector('.detail-tab[data-tab="costs"]').textContent === 'Coûts');
    check('desktop and mobile language indicators match URL', document.getElementById('lang-current').textContent === 'FR' && document.querySelector('.mobile-lang-pill.active').dataset.lang === 'fr');

    const building = state.buildingsData.features.find(f => f.properties.name.includes('Fellerstrasse'));
    modules.map.selectBuilding(building.properties.buildingId, false);
    const camera = JSON.stringify(map.getCenter());
    await setLang('it');
    check('open info panel translates in place', document.querySelector('#info-body .info-label[data-i18n="info.label.name"]').textContent === t('info.label.name'));
    check('map camera and selected object survive language changes', JSON.stringify(map.getCenter()) === camera && state.selectedBuildingId === building.properties.buildingId);
    check('existing filter and URL parameters survive language changes', new URL(window.location).searchParams.get('filter_land') === 'CH' && new URL(window.location).searchParams.get('table') === 'open');

    modules.ui.showDetailView(building.properties.buildingId, 'costs');
    const { carouselNext } = await load('carousel');
    carouselNext();
    const photo = document.getElementById('carousel-image').style.backgroundImage;
    const instanceCount = ctx.fake.Map.instances.length;
    const filter = document.getElementById('costs-filter');
    filter.value = 'BKP'; filter.dispatchEvent(new window.Event('input', { bubbles: true }));
    const first = document.querySelector('#costs-tbody input[type="checkbox"]');
    first.click();
    document.querySelector('#costs-table th[data-sort="betrag"] button').click();
    const selectedId = document.querySelector('#costs-tbody tr.selected').dataset.id;
    const order = () => [...document.querySelectorAll('#costs-tbody tr[data-id]')].map(el => el.dataset.id).join(',');
    const sortedOrder = order();
    for (const lang of langs) {
      document.querySelector('.lang-option[data-lang="' + lang + '"]').click();
      check(lang + ': URL and HTML language update', document.documentElement.lang === lang && new URL(window.location).searchParams.get('lang') === lang);
      check(lang + ': cost headers translate', document.querySelector('#costs-table .table-column-label').textContent === dictionary['field.costGroup'][lang]);
      check(lang + ': row selection, filter and sort persist', document.querySelector('#costs-tbody tr.selected')?.dataset.id === selectedId && filter.value === 'BKP' && order() === sortedOrder);
      check(lang + ': source data stays intact', document.getElementById('detail-name').textContent === building.properties.name);
      check(lang + ': photo and map instances persist', document.getElementById('carousel-image').style.backgroundImage === photo && ctx.fake.Map.instances.length === instanceCount);
      check(lang + ': responsive address labels translate', document.getElementById('detail-city').dataset.label === dictionary['field.city'][lang]);
      check(lang + ': mini-map link hint translates', document.getElementById('mini-map-address').title === dictionary['miniMap.openGoogle'][lang]);
      for (const tab of ['measurements','documents','contacts','contracts','assets']) {
        document.querySelector('.detail-tab[data-tab="' + tab + '"]').click();
        check(lang + ': ' + tab + ' headers resolve', [...document.querySelectorAll('#' + tab + '-table .table-column-label')]
          .every(el => Object.values(dictionary).some(entry => entry[lang] === el.textContent)));
      }
      document.querySelector('.detail-tab[data-tab="costs"]').click();
    }
    document.querySelector('.mobile-lang-pill[data-lang="fr"]').click();
    check('mobile language selector updates the desktop control too', document.getElementById('lang-current').textContent === 'FR');
    document.querySelector('.detail-tab[data-tab="documents"]').click();
    document.querySelector('#documents-tbody tr[data-id]').click();
    check('document preview controls are translated', document.querySelector('#document-preview [data-doc-action="close"]').title === dictionary['preview.close'].fr);
    check('preview content keeps its source language', document.querySelector('.media-preview-pages').textContent.includes('Demovorschau'));
    document.querySelector('#document-preview [data-doc-action="close"]').click();
    document.querySelector('.detail-tab[data-tab="overview"]').click();
    document.getElementById('carousel-image').click();
    check('image preview uses the same translated controls', document.querySelector('#lightbox [data-doc-action="previous"]').title === dictionary['image.previous'].fr);
    document.querySelector('#lightbox [data-doc-action="close"]').click();
    check('French question templates work', suggestAiQuestion('surface portefeuille', []).answerHtml.includes('Le portefeuille'));
    await setLang('it');
    check('Italian question templates work', suggestAiQuestion('superficie portafoglio', []).answerHtml.includes('Il portafoglio'));
    await setLang('en');
    check('English question templates work', suggestAiQuestion('portfolio area', []).answerHtml.includes('The portfolio'));
    const malicious = { properties: { ...building.properties, name: '<img src=x onerror=alert(1)>' } };
    check('translated answers still escape data', !suggestAiQuestion('<img', [malicious]).answerHtml.includes('<img src=x'));

    modules.ui.switchView('map');
    document.getElementById('tree-panel-btn').click();
    await setLang('de');
    const germanTree = document.getElementById('tree-panel-content').textContent;
    await setLang('en');
    check('open tree translates country names', germanTree.includes('Schweiz') && document.getElementById('tree-panel-content').textContent.includes('Switzerland'));
    document.querySelector('.table-tab[data-table-tab="parcels"]').click();
    const search = document.getElementById('list-search-input');
    search.value = 'Bern'; search.dispatchEvent(new window.Event('input', { bubbles: true }));
    await setLang('fr');
    check('parcel table search context survives switching', search.value === 'Bern' && search.placeholder === t('table.search.parcels') && state.activeTableTab === 'parcels');
    modules.ui.switchView('gallery');
    await setLang('en');
    check('gallery accessibility labels update', document.querySelector('.gallery-image').getAttribute('aria-label').startsWith('Image of'));
    await setLang('xx');
    check('unsupported language falls back to German', document.documentElement.lang === 'de' && document.getElementById('lang-current').textContent === 'DE');
    await settle();
  }
};
