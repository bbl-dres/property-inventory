// Real-browser localization layout check. Start the local server on :8123 first.
//   node test/i18n-visual.js [output directory]
const fs = require('fs');
const path = require('path');
const { launchBrowser, openPage, navigate, evaluate, BASE, VIEWPORTS } = require('./visual');
const out = path.resolve(process.argv[2] || 'tmp/i18n-visual');

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const { proc, cdp } = await launchBrowser();
  const results = [];
  try {
    for (const viewport of ['desktop', 'phone-14']) {
      for (const lang of ['de', 'fr', 'it', 'en']) {
        const page = await openPage(cdp, VIEWPORTS[viewport]);
        await navigate(cdp, page.sessionId, BASE + 'prototype-tabs/?lang=' + lang);
        for (const view of ['map', 'gallery', 'overview', 'measurements', 'documents']) {
          const result = await evaluate(cdp, page.sessionId, `(async () => {
            const { state } = await import('./js/state.js');
            const ui = await import('./js/ui.js');
            if (['map', 'gallery'].includes('${view}')) ui.switchView('${view}');
            else ui.showDetailView(state.buildingsData.features[0].properties.buildingId, '${view}');
            await new Promise(resolve => setTimeout(resolve, 150));
            const link = document.getElementById('mini-map-address');
            return { lang: document.documentElement.lang, view: state.currentView,
              width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
              addressUnderlined: getComputedStyle(link).textDecorationLine === 'underline',
              iconUnderlined: getComputedStyle(link.parentElement, '::before').textDecorationLine !== 'none',
              labels: [...document.querySelectorAll('.detail-tab')].map(el => el.textContent),
              missingKeys: [...document.querySelectorAll('[data-i18n]')].filter(el => el.textContent === el.dataset.i18n).map(el => el.dataset.i18n)
            };
          })()`);
          results.push({ viewport, lang, view, ...result });
          if (['fr', 'it'].includes(lang) && ['overview', 'documents'].includes(view)) {
            const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
            fs.writeFileSync(path.join(out, viewport + '-' + lang + '-' + view + '.png'), Buffer.from(shot.data, 'base64'));
          }
        }
        if (page.errors.length) results.push({ viewport, lang, errors: page.errors });
        await cdp.send('Target.closeTarget', { targetId: page.targetId });
      }
    }
    // The address underline change also applies to the independent Simple prototype.
    const page = await openPage(cdp, VIEWPORTS['phone-14']);
    await navigate(cdp, page.sessionId, BASE + 'prototype-simple/?lang=en&view=detail&id=1080%2F4840%2FAF');
    results.push(await evaluate(cdp, page.sessionId, `(() => {
      const link = document.getElementById('mini-map-address');
      return { prototype: 'simple', width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        addressUnderlined: getComputedStyle(link).textDecorationLine === 'underline',
        iconUnderlined: getComputedStyle(link.parentElement, '::before').textDecorationLine !== 'none' };
    })()`));
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
    const failures = results.filter(r => r.scrollWidth > r.width + 1 || r.missingKeys?.length || r.errors?.length ||
      r.iconUnderlined || (r.view === 'detail' || r.prototype === 'simple') && !r.addressUnderlined);
    console.log(JSON.stringify({ checks: results.length, failures }, null, 2));
    process.exitCode = failures.length ? 1 : 0;
  } finally { cdp.ws.close(); proc.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
