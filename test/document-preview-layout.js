// Real-browser preview checks; start a static server on :8123 first (see visual.js).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser, openPage, navigate, evaluate, BASE, VIEWPORTS } = require('./visual');
const out = path.resolve('visual-out/document-preview');
const settled = 'await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));';
const inspect = `(() => {
  const root = document.querySelector('.media-preview');
  const stage = root.querySelector('.media-preview-stage');
  const rect = root.getBoundingClientRect();
  const scale = Number(root.querySelector('.media-preview-pages').style.getPropertyValue('--document-scale'));
  const canvas = root.querySelector('.media-preview-canvas').getBoundingClientRect();
  const previous = root.querySelector('[data-doc-action="previous"]').getBoundingClientRect();
  const next = root.querySelector('[data-doc-action="next"]').getBoundingClientRect();
  return {
    sideArrows: previous.x - canvas.x >= 32 && previous.x - canvas.x <= 65 &&
      canvas.right - next.right >= 32 && canvas.right - next.right <= 65 &&
      canvas.right - next.right - (stage.offsetWidth - stage.clientWidth) >= 12 &&
      Math.abs(previous.y + previous.height / 2 - (canvas.y + canvas.height / 2)) < 1 &&
      !root.querySelector('.media-preview-controls [data-doc-action="previous"]'),
    fullscreen: rect.x === 0 && rect.y === 0 && Math.abs(rect.width - innerWidth) < 1 && Math.abs(rect.height - innerHeight) < 1,
    overflow: document.documentElement.scrollWidth > innerWidth,
    fits: stage.scrollWidth <= stage.clientWidth + 1,
    controlsVisible: Array.from(root.querySelectorAll('button, .media-preview-actions a[href]')).filter(el => !el.closest('[hidden]')).every(el => {
      const r = el.getBoundingClientRect(); return r.x >= 0 && r.right <= innerWidth + 1 && r.y >= 0 && r.bottom <= innerHeight + 1;
    }),
    pages: Array.from(root.querySelectorAll('.document-sheet')).map(sheet => {
      const r = sheet.getBoundingClientRect();
      const footer = sheet.querySelector('.document-sheet-footer').getBoundingClientRect();
      const previous = sheet.querySelector('.document-sheet-footer').previousElementSibling.getBoundingClientRect();
      return { footerInside: footer.bottom <= r.bottom - 30 * scale, noOverlap: previous.bottom <= footer.top + 1,
        contentInside: sheet.scrollHeight <= sheet.clientHeight + 1 };
    })
  };
})()`;

function checkLayout(result, label) {
  assert.equal(result.sideArrows, true, label + ' navigation at canvas sides');
  assert.equal(result.fullscreen, true, label + ' fullscreen');
  assert.equal(result.overflow, false, label + ' page overflow');
  assert.equal(result.fits, true, label + ' fit-to-width overflow');
  assert.equal(result.controlsVisible, true, label + ' off-screen controls');
  result.pages.forEach((page, i) => {
    assert.equal(page.footerInside, true, label + '/' + i + ' footer outside sheet');
    assert.equal(page.noOverlap, true, label + '/' + i + ' footer overlaps content');
    assert.equal(page.contentInside, true, label + '/' + i + ' content outside sheet');
  });
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const { proc, cdp } = await launchBrowser();
  let checked = 0;
  try {
    for (const prototype of ['prototype-simple', 'prototype-tabs']) {
      for (const viewport of ['desktop', 'phone-se', 'phone-land']) {
        const page = await openPage(cdp, VIEWPORTS[viewport]);
        const run = expression => evaluate(cdp, page.sessionId, expression);
        await navigate(cdp, page.sessionId, BASE + prototype + '/?view=detail&tab=' + (prototype === 'prototype-simple' ? 'overview' : 'documents') + '&id=9900/9002/AA');
        const titles = await run(`Array.from(document.querySelectorAll('[data-preview-document]')).map(el => el.dataset.previewDocument)`);
        assert.equal(titles.length, prototype === 'prototype-simple' ? 0 : 6, prototype + ' document entry points');
        for (const id of titles) {
          await run(`(async () => {
            const link = document.querySelector('[data-preview-document="${id}"]');
            link.focus(); link.click(); ${settled}
          })()`);
          const name = prototype + '/' + viewport + '/' + id;
          checkLayout(await run(inspect), name);
          checked++;
          await run(`(async () => { document.querySelector('[data-doc-action="metadata"]').click(); ${settled} })()`);
          checkLayout(await run(inspect), name + '/metadata');
          const title = await run("document.querySelector('#document-preview h2').textContent");
          if (title.includes('Flächen')) {
            const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
            fs.writeFileSync(path.join(out, prototype + '--' + viewport + '.png'), Buffer.from(shot.data, 'base64'));
          }
          await run(`(async () => { document.querySelector('[data-doc-action="zoom-in"]').click(); document.querySelector('[data-doc-action="fit"]').click(); ${settled} })()`);
          checkLayout(await run(inspect), name + '/refit');
          await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, page.sessionId);
          await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, page.sessionId);
          assert.deepEqual(await run(`({ open: !!document.getElementById('document-preview'), focus: document.activeElement.dataset.previewDocument || document.activeElement.outerHTML.slice(0, 200), inert: document.getElementById('header').inert })`), { open: false, focus: id, inert: false }, name + ' close/focus cleanup');
        }
        // Check every building's titles and page content, including the longest names.
        if (viewport === 'desktop' && !process.argv.includes('--quick')) {
          const results = await run(`(async () => {
            const { state } = await import('./js/state.js');
            const { openDocumentPreview, closeDocumentPreview } = await import('./js/document-preview.js');
            const results = [];
            for (const b of state.buildingsData.features) {
              const p = b.properties;
              const simple = '${prototype}' === 'prototype-simple';
              const data = simple ? { ...p.demoRelatedRecords, measurements: p.demoRelatedRecords.areaMeasurements } : {
                documents: state.allDocuments.filter(d => d.buildingIds.includes(p.buildingId)),
                measurements: state.allAreaMeasurements.filter(d => d.buildingIds.includes(p.buildingId)),
                costs: state.allCosts.filter(d => d.buildingIds.includes(p.buildingId))
              };
              for (const doc of data.documents) {
                openDocumentPreview(doc, data.documents, { ...data, buildingName: p.bbl_bez || p.name, address: p.adr_conct || p.streetName });
                ${settled}
                results.push({ name: doc.name, result: ${inspect} });
                closeDocumentPreview(false);
              }
            }
            return results;
          })()`);
          for (const { name, result } of results) { checkLayout(result, prototype + '/' + name); checked++; }
        }
        await run(`(async()=>{const ui=await import('./js/ui.js');ui.activateTab('overview');document.getElementById('carousel-image').click();await new Promise(r=>setTimeout(r,250));})()`);
        checkLayout(await run(inspect), prototype + '/' + viewport + '/image'); checked++;
        await run(`(async()=>{document.querySelector('[data-doc-action="metadata"]').click();${settled}})()`);
        checkLayout(await run(inspect), prototype + '/' + viewport + '/image-info');
        const imageShot = await cdp.send('Page.captureScreenshot', {format:'png'},page.sessionId);
        fs.writeFileSync(path.join(out,prototype+'--'+viewport+'--image.png'),Buffer.from(imageShot.data,'base64'));
        await run(`(async()=>{document.querySelector('[data-doc-action="next"]').click();await new Promise(r=>setTimeout(r,250));})()`);
        checkLayout(await run(inspect), prototype + '/' + viewport + '/image-next');
        await run(`document.querySelector('[data-doc-action="close"]').click()`);
        assert.deepEqual(page.errors, [], prototype + '/' + viewport + ' browser errors');
        await cdp.send('Target.closeTarget', { targetId: page.targetId });
      }
    }
    console.log('PASS document sheets, desktop/mobile layout, metadata, fit, focus and closing (' + checked + ' previews)');
  } finally { proc.kill(); }
})().catch(error => { console.error(error); process.exit(1); });
