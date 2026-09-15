// Shared utilities for the property-inventory prototypes (prototype-simple, prototype-tabs).
// Pure helpers only: no application state, no DOM ids.

// ===== ESCAPING =====

export function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// CSS url() value for an inline background-image (quotes and parentheses escaped)
export function cssUrl(url) {
  return "url('" + String(url || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\)/g, '\\)') + "')";
}

// Strip HTML tags from API results (e.g. swisstopo returns <b>, <i> markup in labels)
export function stripHtml(str) {
  if (!str) return '';
  return String(str).replace(/<[^>]*>/g, '');
}

// Wrap the matched term in <b>. The text is escaped first, so API markup cannot leak through.
export function highlightMatch(text, term) {
  const safe = escapeHtml(text || '');
  if (!term) return safe;
  const pattern = escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp('(' + pattern + ')', 'ig'), '<b>$1</b>');
}

// ===== OBJECT ACCESS =====

export function getNestedProperty(obj, path) {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length; i++) {
    if (current == null) return undefined;
    current = current[parts[i]];
  }
  return current;
}

// ===== FORMATTING =====

// Cached Intl.NumberFormat instances (construction is expensive)
const chfFormatter = new Intl.NumberFormat('de-CH', {
  style: 'currency',
  currency: 'CHF',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});
const deChNumberFormatter = new Intl.NumberFormat('de-CH');

// Number with Swiss thousands separator (1'000)
export function formatNum(value, decimals) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  const fixed = decimals != null ? num.toFixed(decimals) : String(num);
  const parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return parts.join('.');
}

export function formatArea(value) {
  if (value === undefined || value === null || value === '') return null;
  return formatNum(value, 0) + ' m²';
}

export function formatVolume(value) {
  if (value === undefined || value === null || value === '') return null;
  return formatNum(value, 0) + ' m³';
}

export function formatCHF(value) {
  if (value === undefined || value === null || value === '') return null;
  return 'CHF ' + formatNum(value, 0);
}

// ISO 8601 date -> DD.MM.YYYY
export function formatDate(isoDate) {
  if (!isoDate) return null;
  const match = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[3] + '.' + match[2] + '.' + match[1] : null;
}

// ISO 8601 date -> year ("1902-01-01T00:00:00Z" -> "1902")
export function extractYear(isoDate) {
  if (!isoDate) return null;
  const match = String(isoDate).match(/^(\d{4})/);
  return match ? match[1] : null;
}

export function formatBoolean(value) {
  if (value === true) return 'Ja';
  if (value === false) return 'Nein';
  return '—';
}

export function formatCurrency(amount) {
  if (amount == null) return '—';
  return chfFormatter.format(amount);
}

// "CHF 185'000" for units like "CHF/Jahr"; unknown currency codes fall back to number + code
export function formatCurrencyWithUnit(amount, einheit) {
  if (amount == null) return '—';
  let currency = 'CHF';
  if (einheit) {
    const parts = String(einheit).split('/');
    if (parts.length > 0 && parts[0].trim()) currency = parts[0].trim();
  }
  if (currency === 'CHF') return chfFormatter.format(amount);
  try {
    return new Intl.NumberFormat('de-CH', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  } catch (e) {
    return deChNumberFormatter.format(Number(amount)) + ' ' + currency;
  }
}

export function getContractStatusClassName(status) {
  if (!status) return '';
  const s = String(status).toLowerCase();
  if (s === 'aktiv') return 'status-active';
  if (s === 'gekündigt') return 'status-terminated';
  if (s === 'ausgelaufen') return 'status-expired';
  return '';
}

// ===== DOM =====

// Set the text of an element by id; empty values render as an en dash. Missing elements are skipped.
export function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = (value !== undefined && value !== null && value !== '') ? value : '–';
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ===== SAFE STORAGE =====
// localStorage can throw (private mode, blocked third-party storage, enterprise policies).
// These helpers never throw so a storage problem can't take the whole app down.
export function storageGet(key) {
  try { return window.localStorage.getItem(key); } catch (e) { return null; }
}

export function storageSet(key, value) {
  try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; }
}

// ===== FETCH =====
// JSON fetch with HTTP status check and a timeout, so a hanging request surfaces as an
// error (and a retry option) instead of an endless spinner.
export function fetchWithErrorHandling(url, options, timeoutMs) {
  options = options || {};
  if (timeoutMs === undefined) timeoutMs = 30000;
  const controller = new AbortController();
  const timer = setTimeout(function() { controller.abort(); }, timeoutMs);
  if (options.signal) {
    options.signal.addEventListener('abort', function() { controller.abort(); });
  }
  const opts = Object.assign({}, options, { signal: controller.signal });
  return fetch(url, opts)
    .then(function(response) {
      if (!response.ok) {
        throw new Error('HTTP ' + response.status + ': ' + response.statusText + ' (' + url + ')');
      }
      return response.json();
    })
    .catch(function(err) {
      if (err && err.name === 'AbortError') {
        throw new Error('Timeout after ' + Math.round(timeoutMs / 1000) + ' s: ' + url);
      }
      throw err;
    })
    .finally(function() { clearTimeout(timer); });
}

// ===== LAYOUT MODE =====
// Mirrors the breakpoints of the stylesheets. "Mobile" is a narrow viewport (phones in portrait)
// or a landscape phone: short and touch-operated, even though it is wider than 767px.
export const MOBILE_LAYOUT_QUERY = '(max-width: 767px), (max-height: 500px) and (pointer: coarse)';
export const LANDSCAPE_PHONE_QUERY = '(max-height: 500px) and (pointer: coarse) and (min-width: 600px)';
export const COMPACT_LAYOUT_QUERY = '(max-width: 1024px)';

export function mediaMatches(query) {
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

// Phones in portrait and landscape: bottom sheets, full-screen drawer, compact header
export function isMobileLayout() { return mediaMatches(MOBILE_LAYOUT_QUERY); }
// Landscape phones: info panel and tools panel dock to the sides instead of the bottom
export function isLandscapePhone() { return mediaMatches(LANDSCAPE_PHONE_QUERY); }
// Tablets and phones: the map tools panel starts collapsed
export function isCompactLayout() { return mediaMatches(COMPACT_LAYOUT_QUERY); }
