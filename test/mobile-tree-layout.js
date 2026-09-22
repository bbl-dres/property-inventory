// Real-browser check for the phone location accordion. Requires the local server on :8123.
// node test/mobile-tree-layout.js [output directory]
const fs = require('fs');
const path = require('path');
const { launchBrowser, openPage, navigate, evaluate, BASE, VIEWPORTS } = require('./visual');
const out = path.resolve(process.argv[2] || 'tmp/mobile-tree-layout');

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const { proc, cdp } = await launchBrowser();
  const results = [];
  const inspectReset = `(() => {
    const button = document.getElementById('map-reset-filters');
    const map = document.getElementById('map').getBoundingClientRect();
    const rect = button.getBoundingClientRect();
    const busy = document.getElementById('map-busy');
    const busyShown = busy.classList.contains('show');
    busy.classList.add('show');
    const busyRect = busy.getBoundingClientRect();
    if (!busyShown) busy.classList.remove('show');
    const nav = document.querySelector('#map .maplibregl-ctrl-top-right')?.getBoundingClientRect();
    const text = [...button.querySelectorAll('[data-i18n]')].find(el => getComputedStyle(el).display !== 'none');
    return { visible: !button.hidden && rect.width > 0,
      centered: Math.abs((rect.left + rect.right) / 2 - (map.left + map.right) / 2) < 2,
      contained: rect.left >= map.left && rect.right <= map.right && rect.bottom <= map.bottom,
      touchTarget: rect.height >= 44,
      textFits: text.scrollWidth <= text.clientWidth + 1,
      belowLoading: busyRect.top >= rect.bottom,
      clearOfZoom: !nav || rect.right <= nav.left || rect.top >= nav.bottom || rect.bottom <= nav.top,
      clearOfPanels: ['#info-panel.show', '#accordion-wrapper'].every(selector => {
        const el = document.querySelector(selector); if (!el) return true;
        const other = el.getBoundingClientRect();
        return !other.width || !other.height || rect.right <= other.left || rect.left >= other.right || rect.bottom <= other.top || rect.top >= other.bottom;
      })
    };
  })()`;
  try {
    for (const prototype of ['prototype-simple', 'prototype-tabs']) {
      for (const viewport of ['phone-se', 'phone-land']) {
        const page = await openPage(cdp, VIEWPORTS[viewport]);
        const run = expression => evaluate(cdp, page.sessionId, expression);
        await navigate(cdp, page.sessionId, BASE + prototype + '/');
        await run(`(() => {
          document.getElementById('hamburger-btn').click();
          document.getElementById('mobile-tree-btn').click();
          const tree = document.getElementById('tree-panel-content');
          tree.querySelector('[data-node="country:CH"]').click();
          tree.querySelector('.tree-row[data-node^="region:CH/"]').click();
          tree.querySelector('.tree-row[data-node^="city:CH/"]').click();
          tree.querySelector('.tree-row[data-node^="we:CH/"]').click();
        })()`);
        await new Promise(resolve => setTimeout(resolve, 400));
        const inspect = `(() => {
          const host = document.getElementById('tree-panel-content');
          const menu = document.getElementById('accordion-panel');
          const header = document.getElementById('mobile-tree-btn');
          const item = header.closest('.accordion-item');
          const rect = host.getBoundingClientRect();
          return { noOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
            mounted: host.parentElement.id === 'mobile-tree-content',
            visible: rect.width > 0 && rect.left >= 0 && rect.right <= innerWidth + 1 && getComputedStyle(item).display !== 'none',
            treeDockHidden: getComputedStyle(document.getElementById('tree-panel')).display === 'none',
            expanded: header.getAttribute('aria-expanded') === 'true',
            menuOpen: !menu.classList.contains('collapsed'),
            oneScrollSurface: getComputedStyle(host).overflowY === 'visible',
            contentNotInert: !host.closest('[inert]'),
            uniqueTree: document.querySelectorAll('#tree-panel-content').length === 1,
            touchTargets: [...host.querySelectorAll('.tree-row')].every(el => el.getBoundingClientRect().height >= 44)
          };
        })()`;
        results.push({ prototype, viewport, view: 'map', checks: await run(inspect) });
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
        fs.writeFileSync(path.join(out, prototype + '-' + viewport + '.png'), Buffer.from(shot.data, 'base64'));
        await run(`(async () => {
          document.getElementById('mobile-menu-close').click();
          const { setLang } = await import('./js/i18n.js'); await setLang('fr');
          await new Promise(resolve => setTimeout(resolve, 400));
        })()`);
        results.push({ prototype, viewport, view: 'map-reset', checks: await run(inspectReset) });
        const resetShot = await cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
        fs.writeFileSync(path.join(out, prototype + '-' + viewport + '-reset.png'), Buffer.from(resetShot.data, 'base64'));
        await run(`(async () => {
          const { showDetailView } = await import('./js/ui.js');
          const id = document.querySelector('#tree-panel-content [data-kind="building"]').dataset.id;
          showDetailView(id);
          document.getElementById('hamburger-btn').click();
        })()`);
        await new Promise(resolve => setTimeout(resolve, 400));
        results.push({ prototype, viewport, view: 'detail', checks: await run(inspect) });
        const selected = await run(`(() => {
          const row = document.querySelector('#tree-panel-content [data-kind="building"]');
          row.focus(); row.click();
          return document.getElementById('accordion-panel').classList.contains('collapsed') && document.activeElement.id === 'hamburger-btn';
        })()`);
        results.push({ prototype, viewport, action: 'select', checks: { selected } });
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, page.sessionId);
        await new Promise(resolve => setTimeout(resolve, 400));
        results.push({ prototype, viewport, action: 'resize-to-desktop', checks: await run(`(() => {
          document.getElementById('tree-panel-btn').click();
          return { dockRestored: document.getElementById('tree-panel-content').parentElement.id === 'tree-panel',
            sidebarOpen: document.getElementById('tree-panel').classList.contains('open'),
            mobileItemHidden: getComputedStyle(document.querySelector('.mobile-tree-accordion')).display === 'none' };
        })()`) });
        await run(`(async () => {
          const ui = await import('./js/ui.js'); const filters = await import('./js/filters.js');
          ui.switchView('map'); filters.toggleSmartDrawer(true);
          await new Promise(resolve => setTimeout(resolve, 450));
        })()`);
        results.push({ prototype, viewport: 'desktop', view: 'map-reset-drawers', checks: await run(inspectReset) });
        const drawerShot = await cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
        fs.writeFileSync(path.join(out, prototype + '-desktop-reset.png'), Buffer.from(drawerShot.data, 'base64'));
        if (page.errors.length) throw new Error(page.errors.join('\n'));
        await cdp.send('Target.closeTarget', { targetId: page.targetId });
      }
    }
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
    const failures = results.filter(r => Object.values(r.checks).some(value => !value));
    console.log(JSON.stringify({ states: results.length, failures }, null, 2));
    process.exitCode = failures.length ? 1 : 0;
  } finally { cdp.ws.close(); proc.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
