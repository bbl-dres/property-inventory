// Boots a prototype inside jsdom with a fake MapLibre and a fetch that serves the prototype's
// own files. One scenario per Node process (ES module state is per process).

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { JSDOM, VirtualConsole } = require('jsdom');
const fakeMaplibre = require('./fake-maplibre');

const ROOT = path.resolve(__dirname, '..', '..');

function jsonResponse(body, status) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: !status || status < 400,
    status: status || 200,
    statusText: status && status >= 400 ? 'Error' : 'OK',
    json: async () => JSON.parse(text),
    text: async () => text
  };
}

// Serves relative URLs from the prototype folder; external hosts get empty API results unless
// the scenario provides an override (prefix match) that returns a body, a status or an Error.
function makeFetch(prototypeDir, overrides) {
  overrides = overrides || {};
  return async function fakeFetch(url) {
    url = String(url);
    const key = Object.keys(overrides).find(k => url.startsWith(k) || url.split('?')[0] === k);
    if (key !== undefined) {
      const o = typeof overrides[key] === 'function' ? overrides[key](url) : overrides[key];
      if (o instanceof Error) throw o;
      if (o && o.status && !o.body) return jsonResponse('{}', o.status);
      if (o && o.status && o.body) return jsonResponse(o.body, o.status);
      return jsonResponse(o);
    }
    if (/^https?:/.test(url)) {
      if (url.indexOf('SearchServer') !== -1) return jsonResponse({ results: [] });
      if (url.indexOf('CatalogServer') !== -1) return jsonResponse({ results: { root: { children: [] } } });
      if (url.indexOf('/identify') !== -1) return jsonResponse({ results: [] });
      if (url.indexOf('/legend') !== -1) return jsonResponse('<div>legend</div>');
      if (url.endsWith('/rest/services')) return jsonResponse({ topics: [{ id: 'ech' }, { id: 'swisstopo' }] });
      return jsonResponse('{}', 404);
    }
    const file = path.join(prototypeDir, url.split('?')[0]);
    if (!fs.existsSync(file)) return jsonResponse('{}', 404);
    return jsonResponse(fs.readFileSync(file, 'utf8'));
  };
}

// Let pending promises and timers of the app settle
function settle(ms) {
  return new Promise(resolve => setTimeout(resolve, ms || 20));
}

async function bootApp(options) {
  const prototypeDir = path.join(ROOT, options.prototype);
  const html = fs.readFileSync(path.join(prototypeDir, 'index.html'), 'utf8');
  const errors = [];

  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', e => errors.push('jsdom: ' + (e && e.message ? e.message : e)));
  virtualConsole.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ')));

  const dom = new JSDOM(html, {
    url: options.url || ('http://localhost/' + options.prototype + '/'),
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole
  });
  const window = dom.window;

  // jsdom gaps
  window.matchMedia = window.matchMedia || function(query) {
    return { matches: !!(options.mediaMatches && options.mediaMatches(query)), media: query, addEventListener() {}, removeEventListener() {} };
  };
  if (!window.CSS) window.CSS = {};
  if (!window.CSS.escape) window.CSS.escape = s => String(s).replace(/([^\w-])/g, '\\$1');
  window.requestAnimationFrame = window.requestAnimationFrame || (fn => setTimeout(fn, 0));
  window.cancelAnimationFrame = window.cancelAnimationFrame || clearTimeout;
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || function() {};
  window.scrollTo = function() {}; // jsdom stub logs 'not implemented'
  window.Element.prototype.setPointerCapture = window.Element.prototype.setPointerCapture || function() {};
  window.navigator.clipboard = window.navigator.clipboard || { writeText: async () => {} };
  window.URL.createObjectURL = window.URL.createObjectURL || (() => 'blob:fake');
  window.URL.revokeObjectURL = window.URL.revokeObjectURL || (() => {});

  // ES modules run in Node: expose the browser globals they use
  const g = global;
  g.window = window;
  g.document = window.document;
  g.navigator = window.navigator;
  g.location = window.location;
  g.history = window.history;
  g.localStorage = window.localStorage;
  g.sessionStorage = window.sessionStorage;
  g.HTMLElement = window.HTMLElement;
  g.Element = window.Element;
  g.Event = window.Event;
  g.CustomEvent = window.CustomEvent;
  g.KeyboardEvent = window.KeyboardEvent;
  g.MouseEvent = window.MouseEvent;
  g.DOMParser = window.DOMParser;
  g.getComputedStyle = window.getComputedStyle.bind(window);
  g.requestAnimationFrame = window.requestAnimationFrame;
  g.cancelAnimationFrame = window.cancelAnimationFrame;
  g.CSS = window.CSS;
  g.matchMedia = window.matchMedia;
  g.MutationObserver = window.MutationObserver;
  g.Node = window.Node;
  g.NodeList = window.NodeList;
  g.maplibregl = fakeMaplibre;
  g.fetch = makeFetch(prototypeDir, options.fetch);
  g.Blob = window.Blob;
  g.URL = window.URL;

  // Capture errors reported by the app's own console usage
  const origError = console.error;
  console.error = function(...a) { errors.push('console.error: ' + a.map(x => (x && x.stack) ? x.message : String(x)).join(' ')); };

  if (options.beforeImport) options.beforeImport({ window, document: window.document });

  const modules = {};
  const appUrl = pathToFileURL(path.join(prototypeDir, 'js', 'app.js')).href;
  await import(appUrl);
  for (const name of ['state', 'ui', 'filters', 'map', 'list', 'search', 'measure', 'swisstopo', 'basemaps', 'export']) {
    const file = path.join(prototypeDir, 'js', name + '.js');
    if (fs.existsSync(file)) modules[name] = await import(pathToFileURL(file).href);
  }

  // i18n fetch -> boot -> data fetch
  await settle(50);
  const map = fakeMaplibre.Map.instances[0];
  if (map && !options.skipMapLoad) {
    map.triggerLoad();
    await settle(50);
  }

  return {
    window,
    document: window.document,
    map,
    modules,
    errors,
    settle,
    fake: fakeMaplibre,
    setFetch(overrides) { g.fetch = makeFetch(prototypeDir, overrides); },
    restoreConsole() { console.error = origError; }
  };
}

module.exports = { bootApp, settle, makeFetch };
