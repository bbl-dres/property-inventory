// i18n — lightweight internationalisation runtime
// Loads a single data/i18n.json with all languages, exposes t() for keyed lookups.

var allTranslations = null; // cached: { de: { key: value }, en: { key: value }, ... }
var translations = {};
var currentLang = 'de';
var supportedLangs = ['de', 'fr', 'it', 'en'];
var fallbackLang = 'de';
var onLangChangeCallbacks = [];

// ===== PUBLIC API =====

// Translate a key, with optional parameter interpolation.
//   t('pagination.info', { start: 1, end: 50, total: 200 })
//   → "1–50 von 200 Objekte"
export function t(key, params) {
  var value = translations[key];
  if (value === undefined) {
    console.warn('[i18n] missing key: ' + key + ' (' + currentLang + ')');
    return key;
  }
  if (params) {
    Object.keys(params).forEach(function(param) {
      value = value.replace(new RegExp('\\{' + param + '\\}', 'g'), params[param]);
    });
  }
  return value;
}

// Get the current language code
export function getLang() {
  return currentLang;
}

// Get the locale string for Intl formatters (e.g. 'de-CH', 'fr-CH')
export function getLocale() {
  switch (currentLang) {
    case 'de': return 'de-CH';
    case 'fr': return 'fr-CH';
    case 'it': return 'it-CH';
    case 'en': return 'en-CH';
    default:   return 'de-CH';
  }
}

// Register a callback to run after every language change (for JS-rendered content).
export function onLangChange(callback) {
  onLangChangeCallbacks.push(callback);
}

// Set language and re-render the DOM. No fetch needed — data is already cached.
export function setLang(lang) {
  if (supportedLangs.indexOf(lang) === -1) lang = fallbackLang;
  currentLang = lang;
  translations = (allTranslations && allTranslations[lang]) || {};
  persistLang(lang);
  applyTranslationsToDOM();
  document.documentElement.lang = lang;
  onLangChangeCallbacks.forEach(function(cb) { cb(lang); });
  return Promise.resolve();
}

// Initialise: detect language, load the single i18n file, activate.
export function initI18n() {
  var lang = detectLang();
  currentLang = lang;
  return loadAllTranslations().then(function() {
    translations = (allTranslations && allTranslations[lang]) || {};
    applyTranslationsToDOM();
    document.documentElement.lang = lang;
  });
}

// ===== INTERNAL =====

function detectLang() {
  // 1. URL parameter
  var params = new URLSearchParams(window.location.search);
  var urlLang = params.get('lang');
  if (urlLang && supportedLangs.indexOf(urlLang) !== -1) return urlLang;

  // 2. localStorage
  try {
    var stored = localStorage.getItem('bbl-lang');
    if (stored && supportedLangs.indexOf(stored) !== -1) return stored;
  } catch (e) { /* ignore */ }

  // 3. Browser language
  var browserLang = (navigator.language || '').substring(0, 2).toLowerCase();
  if (supportedLangs.indexOf(browserLang) !== -1) return browserLang;

  return fallbackLang;
}

function persistLang(lang) {
  var url = new URL(window.location);
  url.searchParams.set('lang', lang);
  window.history.replaceState({}, '', url);
  try {
    localStorage.setItem('bbl-lang', lang);
  } catch (e) { /* ignore */ }
}

function loadAllTranslations() {
  if (allTranslations) return Promise.resolve(); // already loaded
  return fetch('data/i18n.json')
    .then(function(res) {
      if (!res.ok) throw new Error('Failed to load data/i18n.json');
      return res.json();
    })
    .then(function(data) {
      // data is key-grouped: { "key": { "de": "...", "en": "..." } }
      // Flatten into per-language maps: { de: { key: value }, en: { key: value } }
      allTranslations = {};
      supportedLangs.forEach(function(lang) { allTranslations[lang] = {}; });
      Object.keys(data).forEach(function(key) {
        var entry = data[key];
        supportedLangs.forEach(function(lang) {
          if (entry[lang] !== undefined) {
            allTranslations[lang][key] = entry[lang];
          }
        });
      });
    })
    .catch(function(err) {
      console.error('[i18n] ' + err.message);
      allTranslations = {};
    });
}

// Walk the DOM and apply translations to elements with data-i18n attributes.
// Supports:
//   data-i18n="key"                → sets textContent
//   data-i18n-placeholder="key"    → sets placeholder
//   data-i18n-title="key"          → sets title
//   data-i18n-aria-label="key"     → sets aria-label
//   data-i18n-alt="key"            → sets alt
function applyTranslationsToDOM() {
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
    var key = el.getAttribute('data-i18n-placeholder');
    if (key) el.placeholder = t(key);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
    var key = el.getAttribute('data-i18n-title');
    if (key) el.title = t(key);
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach(function(el) {
    var key = el.getAttribute('data-i18n-aria-label');
    if (key) el.setAttribute('aria-label', t(key));
  });
  document.querySelectorAll('[data-i18n-alt]').forEach(function(el) {
    var key = el.getAttribute('data-i18n-alt');
    if (key) el.alt = t(key);
  });
}
