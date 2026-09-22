// Visual probe for the prototypes: drives a headless Edge/Chrome through the DevTools protocol,
// takes screenshots at the review viewports and reads computed metrics of the shared components.
//
//   node visual.js shots  <outDir> [prototype]     screenshots of every viewport x scenario
//   node visual.js probe  <outJson> [prototype]    computed metrics (JSON) per viewport x scenario
//   node visual.js both   <outDir> [prototype]     screenshots plus probe.json in one pass
//   node visual.js eval   <expression> <prototype> <viewport> <scenario>   evaluate an expression in one page
// VIEWPORTS=desktop,phone-14 and SCENARIOS=gallery,detail limit the review; CDP_PORT=<port> selects the DevTools port (default 9333).
//
// Needs a static server on http://127.0.0.1:8123/ serving the repository root
// (python -m http.server 8123). No npm dependency: uses Node's built-in WebSocket and fetch.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8123/';
const PORT = Number(process.env.CDP_PORT) || 9333;
const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
];

const VIEWPORTS = {
  'phone-se':    { width: 375,  height: 667, mobile: true,  scale: 2, touch: true },
  'phone-14':    { width: 390,  height: 844, mobile: true,  scale: 2, touch: true },
  'phone-land':  { width: 844,  height: 390, mobile: true,  scale: 2, touch: true },
  'tablet':      { width: 768,  height: 1024, mobile: true, scale: 2, touch: true },
  'tablet-land': { width: 1024, height: 768, mobile: true,  scale: 2, touch: true },
  'laptop':      { width: 1366, height: 768, mobile: false, scale: 1, touch: false },
  'desktop-s':   { width: 1600, height: 900, mobile: false, scale: 1, touch: false },
  'desktop':     { width: 1920, height: 1080, mobile: false, scale: 1, touch: false }
};

// Scenario: URL query plus optional setup script run after boot
const SCENARIOS = {
  'map':        { query: '' },
  'selection':  { query: '', setup: 'selectFirst' },
  'filter':     { query: '', setup: 'openFilter' },
  'search':     { query: '', setup: 'search' },
  'tools':      { query: '', setup: 'openTools' },
  'tree':       { query: 'filter_land=CH', setup: 'openTree' },
  'api-docs':   { query: 'view=api-docs' },
  'gallery':    { query: 'view=gallery' },
  'table':      { query: 'table=open' },
  'detail':     { query: 'view=detail&id=' },
  'detail-tab': { query: 'view=detail&tab=measurements&id=' },
  'contracts':  { query: 'view=detail&tab=contracts&id=', only: 'prototype-tabs' },
  'costs':      { query: 'view=detail&tab=costs&id=', only: 'prototype-tabs' },
  'documents':  { query: 'view=detail&tab=documents&id=', only: 'prototype-tabs' },
  'contacts':   { query: 'view=detail&tab=contacts&id=', only: 'prototype-tabs' },
  'assets':     { query: 'view=detail&tab=assets&id=', only: 'prototype-tabs' }
};

const IDS = { 'prototype-simple': '1080%2F4840%2FAF', 'prototype-tabs': '1080/4840/AF' };

// ---------- DevTools protocol client ----------

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
      } else if (msg.method) {
        const key = (msg.sessionId || '') + ':' + msg.method;
        (this.listeners.get(key) || []).forEach(fn => fn(msg.params));
      }
    });
  }
  send(method, params, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(Object.assign({ id, method, params: params || {} }, sessionId ? { sessionId } : {})));
    });
  }
  on(sessionId, method, fn) {
    const key = (sessionId || '') + ':' + method;
    if (!this.listeners.has(key)) this.listeners.set(key, []);
    this.listeners.get(key).push(fn);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function launchBrowser() {
  const exe = BROWSERS.find(p => fs.existsSync(p));
  if (!exe) throw new Error('No Edge/Chrome found');
  const tempRoot = path.resolve(require('os').tmpdir());
  const userDir = path.resolve(tempRoot, 'pi-visual-profile-' + PORT);
  if (!Number.isInteger(PORT) || path.dirname(userDir) !== tempRoot) throw new Error('Invalid browser profile path');
  fs.rmSync(userDir, { recursive: true, force: true }); // fresh profile: no cached stylesheets from an earlier run
  const proc = spawn(exe, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--hide-scrollbars', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDir, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  proc.stderr.on('data', () => {});
  let version = null;
  for (let i = 0; i < 50 && !version; i++) {
    await sleep(200);
    try { version = await (await fetch('http://127.0.0.1:' + PORT + '/json/version')).json(); } catch (e) { /* not yet */ }
  }
  if (!version) { proc.kill(); throw new Error('Browser did not start'); }
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  return { proc, cdp: new CDP(ws) };
}

async function openPage(cdp, viewport) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Network.enable', {}, sessionId);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width, height: viewport.height, deviceScaleFactor: viewport.scale, mobile: viewport.mobile
  }, sessionId);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: viewport.touch, maxTouchPoints: viewport.touch ? 5 : 1 }, sessionId);
  if (viewport.touch) {
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] }, sessionId);
  }
  const errors = [];
  cdp.on(sessionId, 'Runtime.exceptionThrown', p => errors.push(p.exceptionDetails.text + ' ' + ((p.exceptionDetails.exception || {}).description || '')));
  cdp.on(sessionId, 'Runtime.consoleAPICalled', p => { if (p.type === 'error') errors.push(p.args.map(a => a.value || a.description).join(' ')); });
  return { sessionId, targetId, errors };
}

async function evaluate(cdp, sessionId, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error('evaluate failed: ' + (r.exceptionDetails.exception || {}).description);
  return r.result.value;
}

async function navigate(cdp, sessionId, url) {
  const loaded = new Promise(resolve => cdp.on(sessionId, 'Page.loadEventFired', resolve));
  await cdp.send('Page.navigate', { url }, sessionId);
  await loaded;
  // Wait for the app boot flag (data loaded) and let the map settle
  for (let i = 0; i < 60; i++) {
    if (await evaluate(cdp, sessionId, 'window.__appBooted === true')) break;
    await sleep(250);
  }
  await sleep(1500);
}

const wait = ms => 'await new Promise(r => setTimeout(r, ' + ms + '));';
const SETUP = {
  // Select the first building through the search box (works in both prototypes)
  selectFirst: `(async () => { const i = document.getElementById('search-input'); i.value = 'Bundeshaus'; i.dispatchEvent(new Event('input', { bubbles: true }));
    ${wait(800)} const el = document.querySelector('#search-results .search-item[data-action="searchLocal"]'); if (el) el.click(); ${wait(1500)} return !!el; })()`,
  openTree: `(async () => { const b = document.getElementById('tree-panel-btn'); if (getComputedStyle(b).display !== 'none') b.click(); else { document.getElementById('hamburger-btn').click(); ${wait(300)} document.getElementById('mobile-tree-btn').click(); } ${wait(600)} return true; })()`,
  openFilter: `(async () => { document.getElementById('filter-panel-btn').click(); ${wait(600)} return true; })()`,
  search: `(async () => { const i = document.getElementById('search-input'); i.focus(); i.value = 'Bern'; i.dispatchEvent(new Event('input', { bubbles: true })); ${wait(900)} return true; })()`,
  openTools: `(async () => { const h = document.getElementById('hamburger-btn'); const t = document.getElementById('menu-toggle');
    if (h && getComputedStyle(h).display !== 'none') { h.click(); } else if (t) { const p = document.getElementById('accordion-panel'); if (p && p.classList.contains('collapsed')) t.click(); }
    ${wait(500)}
    const print = document.querySelector('#accordion-panel:not(.collapsed) .accordion-item[data-accordion="print"] .accordion-header');
    if (print && !print.classList.contains('active')) print.click(); ${wait(500)} return true; })()`
};

// Metrics of the shared components (rect + a few computed styles)
const PROBE = `(() => {
  const pick = (sel, props) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    const o = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), display: cs.display };
    (props || []).forEach(p => { o[p] = cs[p]; }); return o; };
  const T = ['fontSize','fontWeight','lineHeight','color','backgroundColor','borderRadius','paddingTop','paddingLeft','paddingRight','paddingBottom','borderTopWidth','borderTopColor','letterSpacing','textTransform','gap','boxShadow','height','minHeight'];
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    bodyFont: getComputedStyle(document.body).fontFamily, bodyFontSize: getComputedStyle(document.body).fontSize,
    banner: pick('#prototype-banner', T), header: pick('#header', T), headerMain: pick('.header-main', T),
    logo: pick('#logo-title strong', T), logoSub: pick('.logo-subtitle span', T), logoShort: pick('.logo-title-short', T),
    searchContainer: pick('#search-container', T), searchInput: pick('#search-input', T), searchIconBtn: pick('#search-icon-btn', T), searchScopeBtn: pick('#search-scope-btn', T),
    viewToggle: pick('.view-toggle', T), viewToggleBtn: pick('.view-toggle-btn', T), viewToggleActive: pick('.view-toggle-btn.active', T),
    filterBtn: pick('#filter-panel-btn', T), langBtn: pick('#lang-btn', T), loginBtn: pick('#login-btn', T), hamburger: pick('#hamburger-btn', T), objectCount: pick('#object-count', T),
    main: pick('#main', T), mapView: pick('#map-view', T), map: pick('#map', T), footer: pick('#footer', T), coords: pick('#coordinates', T), footerLink: pick('#footer-links a', T),
    accordionPanel: pick('#accordion-panel', T), accordionHeader: pick('.accordion-header', T), accordionHeaderActive: pick('.accordion-header.active', T), accordionContent: pick('.accordion-content.show', T),
    menuToggle: pick('#menu-toggle', T), layerItem: pick('.active-layer-item', T), layerTitle: pick('.active-layer-title', T), layerInfoBtn: pick('.active-layer-info', T), layerGroupLabel: pick('.layer-group-label', T),
    infoPanel: pick('#info-panel', T), infoHeader: pick('#info-header', T), infoTitle: pick('#info-header-title', T), infoRow: pick('.info-row', T), infoLabel: pick('.info-label', T), infoValue: pick('.info-value', T), infoDetailLink: pick('.info-detail-link', T), infoClose: pick('#info-close', T), statusBadge: pick('.status-badge', T),
    styleSwitcherBtn: pick('.style-switcher-btn', T), styleSwitcher: pick('#style-switcher', T), styleOption: pick('.style-option', T),
    mapCtrlBtn: pick('.maplibregl-ctrl-group button', T), mapCtrlGroup: pick('.maplibregl-ctrl-group', T), homeBtn: pick('.map-home-btn', T),
    filterPanel: pick('#filter-panel', T), filterHeader: pick('.filter-panel-header', T), filterTitle: pick('.filter-panel-title, #filter-panel-title', T), filterPanelBtn: pick('.filter-panel-btn', T), filterSection: pick('.filter-section', T), filterSectionHeader: pick('.filter-section-header', T), filterSectionTitle: pick('.filter-section-title', T), filterOption: pick('.filter-option', T), filterOptionLabel: pick('.filter-option label', T), filterCheckbox: pick('.filter-option input', T), filterFooter: pick('.filter-panel-footer', T), btnPrimary: pick('.btn-primary', T), btnSecondary: pick('.btn-secondary', T), filterSearch: pick('.filter-search', T),
    searchResults: pick('#search-results', T), searchSection: pick('.search-section-header', T), searchItem: pick('.search-item', T), searchItemTitle: pick('.search-item-title', T), searchItemMeta: pick('.search-item-meta', T),
    galleryGrid: pick('.gallery-grid', T), galleryCard: pick('.gallery-card', T), galleryImage: pick('.gallery-image', T), galleryTitle: pick('.gallery-title', T), gallerySubtitle: pick('.gallery-subtitle', T), galleryTag: pick('.gallery-tag', T),
    detailView: pick('#detail-view', T), detailContent: pick('.detail-content', T), breadcrumb: pick('.breadcrumb', T), breadcrumbLink: pick('.breadcrumb a', T), btnBack: pick('.btn-back', T), btnEdit: pick('.btn-edit', T), detailTab: pick('.detail-tab', T), detailTabActive: pick('.detail-tab.active', T), detailTabs: pick('.detail-tabs, .detail-tabs-inline', T),
    detailOverline: pick('.detail-overline', T), detailCard: pick('.detail-card', T), detailGridRow: pick('.detail-grid-row', T), detailLabel: pick('.detail-label', T), detailValue: pick('.detail-value', T),
    detailSection: pick('.detail-section', T), detailSectionTitle: pick('.detail-section-title', T), dataItem: pick('.data-item', T), dataLabel: pick('.data-label', T), dataValue: pick('.data-value', T),
    carousel: pick('.carousel', T), carouselBtn: pick('.carousel-btn', T), carouselDot: pick('.carousel-dot', T), miniMap: pick('#mini-map', T),
    listTable: pick('.list-table', T), listTh: pick('.list-table th', T), listTd: pick('.list-table td', T), listRow: pick('#list-body tr', T), toolbar: pick('.toolbar', T), toolbarSearch: pick('.toolbar-search', T), dropdownBtn: pick('.dropdown-btn', T), pagination: pick('.pagination-footer', T), paginationBtn: pick('.pagination-btn', T), paginationInfo: pick('.pagination-info', T), paginationSelect: pick('.pagination-rows select', T),
    tablePanel: pick('#table-panel', T), tableTab: pick('.table-tab', T), tblToggle: pick('#tbl-toggle', T),
    toast: pick('.toast', T), contextMenu: pick('#map-context-menu', T), contextItem: pick('.context-menu-item', T), measureDisplay: pick('#measure-distance-display', T),
    printBtn: pick('.print-btn', T), printSelect: pick('#print-orientation', T), printLabel: pick('label[for="print-orientation"]', T), printRow: pick('.print-form-row', T), printCheckbox: pick('.print-checkbox-label', T),
    mobileMenu: pick('#mobile-menu', T), mobileMenuHeader: pick('.mobile-menu-header', T), mobileMenuTitle: pick('.mobile-menu-title', T), mobileMenuItem: pick('.mobile-menu-item', T),
    docWidth: document.documentElement.scrollWidth, overflowX: document.documentElement.scrollWidth > window.innerWidth
  };
})()`;

async function run(mode, outArg, onlyPrototype) {
  const prototypes = onlyPrototype ? [onlyPrototype] : ['prototype-simple', 'prototype-tabs'];
  const { proc, cdp } = await launchBrowser();
  const results = {};
  try {
    for (const prototype of prototypes) {
      results[prototype] = {};
      for (const [vpName, viewport] of Object.entries(VIEWPORTS).filter(v => !process.env.VIEWPORTS || process.env.VIEWPORTS.split(",").includes(Array.isArray(v) ? v[0] : v))) {
        results[prototype][vpName] = {};
        for (const [scName, sc] of Object.entries(SCENARIOS)) {
          if (process.env.SCENARIOS && !process.env.SCENARIOS.split(',').includes(scName)) continue;
          if (sc.only && sc.only !== prototype) continue;
          // One tab per scenario: a tab reused across navigations can composite stale layers into the screenshot
          const page = await openPage(cdp, viewport);
          const query = sc.query.endsWith('id=') ? sc.query + IDS[prototype] : sc.query;
          await navigate(cdp, page.sessionId, BASE + prototype + '/' + (query ? '?' + query : ''));
          if (sc.setup) {
            await evaluate(cdp, page.sessionId, SETUP[sc.setup]);
            await sleep(700);
          }
          if (mode === 'shots' || mode === 'both') {
            const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 72 }, page.sessionId);
            fs.mkdirSync(outArg, { recursive: true });
            fs.writeFileSync(path.join(outArg, prototype.replace('prototype-', '') + '--' + vpName + '--' + scName + '.jpg'), Buffer.from(data, 'base64'));
          }
          if (mode === 'probe' || mode === 'both') {
            const m = await evaluate(cdp, page.sessionId, PROBE);
            m.errors = page.errors.splice(0);
            results[prototype][vpName][scName] = m;
          }
          process.stdout.write('.');
          await cdp.send('Target.closeTarget', { targetId: page.targetId });
        }
      }
    }
  } finally {
    proc.kill();
  }
  if (mode === 'probe') fs.writeFileSync(outArg, JSON.stringify(results, null, 1));
  if (mode === 'both') fs.writeFileSync(path.join(outArg, 'probe.json'), JSON.stringify(results, null, 1));
  console.log('\ndone');
}

async function evalOnce(expression, prototype, vpName, scName) {
  const { proc, cdp } = await launchBrowser();
  try {
    const page = await openPage(cdp, VIEWPORTS[vpName]);
    const sc = SCENARIOS[scName];
    const query = sc.query.endsWith('id=') ? sc.query + IDS[prototype] : sc.query;
    await navigate(cdp, page.sessionId, BASE + prototype + '/' + (query ? '?' + query : ''));
    if (sc.setup) { await evaluate(cdp, page.sessionId, SETUP[sc.setup]); await sleep(700); }
    const result = await evaluate(cdp, page.sessionId, expression);
    console.log(JSON.stringify(result, null, 1));
    if (process.env.EVAL_SHOT) {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 72 }, page.sessionId);
      fs.writeFileSync(process.env.EVAL_SHOT, Buffer.from(data, 'base64'));
    }
    if (page.errors.length) console.log('errors:', page.errors);
  } finally {
    proc.kill();
  }
}

module.exports = { launchBrowser, openPage, navigate, evaluate, BASE, VIEWPORTS };

if (require.main === module) {
  const [mode, out, only] = process.argv.slice(2);
  if (mode === 'eval') {
    evalOnce(out, process.argv[4] || 'prototype-simple', process.argv[5] || 'phone-14', process.argv[6] || 'map').catch(e => { console.error(e); process.exit(1); });
  } else if (!mode || !out) {
    console.error('usage: node visual.js shots|probe|both <out> [prototype-simple|prototype-tabs]');
    process.exit(2);
  }
  if (mode !== 'eval') run(mode, out, only).catch(e => { console.error(e); process.exit(1); });
}
