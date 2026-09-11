// i18n — lightweight internationalisation runtime
// Loads a single data/i18n.json with all languages, exposes t() for keyed lookups.

let allTranslations = null; // cached: { de: { key: value }, en: { key: value }, ... }
let loadFailed = false;     // true when data/i18n.json could not be loaded (UI shows raw keys)
let translations = {};
let currentLang = 'de';
const supportedLangs = ['de', 'fr', 'it', 'en'];
const fallbackLang = 'de';
const onLangChangeCallbacks = [];

// ===== PUBLIC API =====

// Translate a key, with optional parameter interpolation.
//   t('pagination.info', { start: 1, end: 50, total: 200 })
//   → "1–50 von 200 Objekte"
export function t(key, params) {
  let value = translations[key];
  if (value === undefined) {
    console.warn('[i18n] missing key: ' + key + ' (' + currentLang + ')');
    return key;
  }
  if (params) {
    Object.keys(params).forEach(function(param) {
      value = value.split('{' + param + '}').join(params[param]);
    });
  }
  return value;
}

// True once translations were loaded successfully; false if the fetch failed.
export function translationsLoaded() {
  return !loadFailed;
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

// Initialise from the URL, defaulting to German, then load and activate translations.
export function initI18n() {
  const lang = detectLang();
  currentLang = lang;
  return loadAllTranslations().then(function() {
    translations = (allTranslations && allTranslations[lang]) || {};
    applyTranslationsToDOM();
    document.documentElement.lang = lang;
    persistLang(lang);
  });
}

// ===== INTERNAL =====

function detectLang() {
  // Explicit links override the German default; browser and saved preferences do not.
  const params = new URLSearchParams(window.location.search);
  const urlLang = params.get('lang');
  if (urlLang && supportedLangs.indexOf(urlLang) !== -1) return urlLang;

  return fallbackLang;
}

function persistLang(lang) {
  const url = new URL(window.location);
  url.searchParams.set('lang', lang);
  if (url.href !== window.location.href) {
    window.history.replaceState(window.history.state, '', url);
  }
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
        const entry = data[key];
        supportedLangs.forEach(function(lang) {
          if (entry[lang] !== undefined) {
            allTranslations[lang][key] = entry[lang];
          }
        });
      });
    })
    .catch(function(err) {
      console.error('[i18n] ' + err.message);
      loadFailed = true;
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
  // Single querySelectorAll pass instead of 5 separate queries
  document.querySelectorAll('[data-i18n],[data-i18n-placeholder],[data-i18n-title],[data-i18n-aria-label],[data-i18n-alt]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);

    key = el.getAttribute('data-i18n-placeholder');
    if (key) el.placeholder = t(key);

    key = el.getAttribute('data-i18n-title');
    if (key) el.title = t(key);

    key = el.getAttribute('data-i18n-aria-label');
    if (key) el.setAttribute('aria-label', t(key));

    key = el.getAttribute('data-i18n-alt');
    if (key) el.alt = t(key);
  });
}
