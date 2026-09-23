const path = require('node:path');
const { pathToFileURL } = require('node:url');

module.exports = function(prototype) {
  const simple = prototype === 'prototype-simple';
  return {
    name: prototype + ': document preview and modal lifecycle',
    boot: { prototype },
    allowedErrors: [],
    async run(ctx, check) {
      const { modules, document, window } = ctx;
      const state = modules.state.state;
      const building = state.buildingsData.features[0];
      const id = simple ? building.properties.bbl_id : building.properties.buildingId;
      const documents = simple ? building.properties.demoRelatedRecords.documents : state.allDocuments.filter(d => d.buildingIds.includes(id));
      const sorted = documents.slice().sort((a,b) => a.name.localeCompare(b.name, 'de'));
      const mock = documents.find(d => d.documentTypeCode === 'B14005');
      const source = documents.find(d => d.url);
      const key = value => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
      const dialog = () => document.getElementById('document-preview');
      const action = name => dialog().querySelector('[data-doc-action="' + name + '"]');
      modules.ui.showDetailView(id);
      if (!simple) modules.ui.activateTab('documents');
      const opener = document.querySelector('[data-preview-document="' + mock.documentId + '"]');
      opener.focus(); opener.click();
      check('mock title opens local preview with two pages', dialog()?.getAttribute('aria-modal') === 'true' && dialog().querySelectorAll('.document-sheet').length === 2);
      const sheets = dialog().querySelectorAll('.document-sheet');
      check('area pages include this building’s SIA and RICS records', sheets[0].querySelectorAll('tbody tr').length === 9 && sheets[1].querySelectorAll('tbody tr').length === 3);
      check('preview is explicitly a demo and includes the building', dialog().textContent.includes('Demovorschau') && dialog().textContent.includes(simple ? building.properties.bbl_bez : building.properties.name));
      check('mock record does not expose an original link', dialog().querySelector('[data-doc-source]').hidden);
      check('mock download and demo upload are disabled', action('download-unavailable').disabled && action('upload').disabled);
      check('background is inert and scrolling locked', document.getElementById('header').hasAttribute('inert') && document.body.style.overflow === 'hidden');
      const pages = dialog().querySelector('.media-preview-pages');
      const before = Number(pages.style.getPropertyValue('--document-scale'));
      action('zoom-in').click();
      check('zoom changes the entire sheet scale', Number(pages.style.getPropertyValue('--document-scale')) > before);
      for (let i=0; i<20; i++) action('zoom-in').click();
      check('zoom has an upper bound and disables its button', Number(pages.style.getPropertyValue('--document-scale')) === 3 && action('zoom-in').disabled);
      action('metadata').click();
      check('metadata toggle has correct expanded state', !dialog().querySelector('.media-preview-meta').hidden && action('metadata').getAttribute('aria-expanded') === 'true');
      const expectedNext = sorted[(sorted.findIndex(d => d.documentId === mock.documentId) + 1) % sorted.length];
      key('ArrowRight');
      check('navigation follows the document list order', dialog().querySelector('h2').textContent === expectedNext.name);
      key('Escape');
      check('escape closes and restores focus and scrolling', !dialog() && document.activeElement === opener && document.body.style.overflow === '' && !document.getElementById('header').hasAttribute('inert'));

      const publicLink = document.querySelector('[data-preview-document="' + source.documentId + '"]');
      publicLink.click();
      check('public record preserves its original link', dialog().querySelector('[data-doc-source]').href === source.url && !dialog().querySelector('[data-doc-source]').hidden);
      check('public preview does not pretend to render the original', dialog().querySelectorAll('.document-sheet').length === 1 && dialog().textContent.includes('gibt den Inhalt der Originalpublikation nicht wieder'));
      action('zoom-in').focus(); key('Tab');
      check('tab wraps to the first focusable control', document.activeElement === dialog().querySelector('[data-doc-source]'));
      key('ArrowRight');
      check('switching away from an original link keeps focus in the viewer', document.activeElement === dialog().querySelector('.media-preview-stage'));
      action('close').click();

      const row = document.querySelector('[data-preview-document="' + mock.documentId + '"]').closest(simple ? '.document-list-item' : 'tr');
      row.focus();
      row.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      check('document rows open with the keyboard', dialog()?.querySelector('h2').textContent === mock.name);
      key('Escape');
      check('row preview restores focus to the row', document.activeElement === row);
      if (!simple) {
        row.querySelector('input').click();
        check('checkbox click does not open a preview', !dialog());
      }

      if (!simple) {
        const filter = document.getElementById('documents-filter');
        filter.value = 'B14005'; filter.dispatchEvent(new window.Event('input'));
        const cb = document.querySelector('#documents-tbody input');
        cb.checked = true; cb.dispatchEvent(new window.Event('change', { bubbles: true }));
        const preview = document.getElementById('btn-preview-document');
        check('selection enables the preview action', !preview.disabled);
        preview.focus(); preview.click();
        check('filtered single result has no next or previous document', action('next').disabled && action('previous').disabled && dialog().querySelector('h2').textContent === mock.name);
        key('Escape');
        check('toolbar preview restores its opener', document.activeElement === preview);
        filter.value = ''; filter.dispatchEvent(new window.Event('input'));
        check('filter change clears the previous selection', preview.disabled);
      }
      document.querySelector('[data-preview-document="' + mock.documentId + '"]').click();
      check('preview reopens before changing building', !!dialog());
      modules.ui.showDetailView(simple ? state.buildingsData.features[1].properties.bbl_id : state.buildingsData.features[1].properties.buildingId);
      check('changing building closes stale previews and unlocks the page', !dialog() && !document.getElementById('header').hasAttribute('inert'));

      const viewer = await import(pathToFileURL(path.resolve(__dirname, '..', '..', prototype, 'js/document-preview.js')).href);
      check('unsafe source protocols are rejected', viewer.documentSourceUrl({ url:'javascript:alert(1)' }) === null);
      viewer.openDocumentPreview({ documentId:'missing', name:'<img src=x onerror=alert(1)>', documentTypeCode:'O12001' });
      check('document titles are rendered as text', !dialog().querySelector('img') && dialog().querySelector('h2').textContent.startsWith('<img'));
      viewer.openDocumentPreview(source, [source]);
      check('reopening replaces the existing viewer', document.querySelectorAll('#document-preview').length === 1);
      modules.ui.switchView('map');
      check('view navigation cleans up the viewer', !dialog() && document.body.style.overflow === '');

      modules.ui.showDetailView(id);
      const imageOpener = document.getElementById('carousel-image');
      imageOpener.focus(); imageOpener.click();
      const imageDialog = document.getElementById('lightbox');
      const photos = simple ? building.properties.photos : building.properties.extensionData.photos;
      check('images use the same shell and keep credits visible', imageDialog.classList.contains('media-preview') && imageDialog.querySelector('#media-preview-caption').textContent === photos[0].credit);
      check('image download is real and upload disabled', imageDialog.querySelector('[data-doc-source]').hasAttribute('download') && imageDialog.querySelector('[data-doc-action="upload"]').disabled);
      imageDialog.querySelector('[data-doc-action="metadata"]').click();
      check('image metadata retains copyright', imageDialog.querySelector('.media-preview-meta').textContent.includes(photos[0].credit));
      key('ArrowRight');
      check('image navigation updates the carousel', imageDialog.querySelector('img').getAttribute('src') === photos[1].url && document.getElementById('carousel-image').style.backgroundImage.includes(photos[1].url));
      key('Escape');
      check('image close restores focus and scrolling', !document.getElementById('lightbox') && document.activeElement === imageOpener && document.body.style.overflow === '');
    }
  };
};
