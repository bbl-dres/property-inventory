// prototype-backend — DOM helpers, validation, modal/toast, CSV, type inference

import { LAYER_NAME_RE } from './constants.js';

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsAll = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class' || k === 'className') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'dataset' && typeof v === 'object') {
      for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
    }
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    // Note: the old `html:` pseudo-attr that assigned innerHTML was removed as an
    // XSS-surface reduction. No callers use it — always build children with `el()`
    // or `escHtml()`.
    else if (k === 'text') node.textContent = v;
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function debounce(fn, ms = 200) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

export function formatRelativeTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '—';
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 86400 * 30) return Math.floor(diff / 86400) + 'd ago';
  return date.toISOString().slice(0, 10);
}

/**
 * Wrap a relative-time string in a span whose `title` attribute carries
 * the full ISO timestamp. "1d ago" answers the common question; the
 * tooltip provides the precise value when the user needs it (debugging
 * a sync, diffing two layers, auditing a deploy). Returns the plain
 * placeholder string when no ISO is available.
 *
 * @param {string|null|undefined} iso
 * @returns {string|Node}
 */
export function relativeTimeNode(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '—';
  return el('span', { class: 'pb-reltime', title: date.toISOString() },
    formatRelativeTime(iso));
}

/**
 * Canonical "lifecycle" pill for deployable artifacts (Maps & Apps).
 * Not used on Layers — layers are data, not deployments, and don't have
 * a meaningful live/staging/archived axis. The asymmetry is deliberate:
 * if you find yourself wanting this on a layer, what you actually want
 * is probably a tag or a "used by" indicator.
 *
 * @param {'live'|'staging'|'archived'|string} status
 * @returns {Node}
 */
export function statusPill(status) {
  const s = status || 'staging';
  const descriptions = {
    live: 'Live — deployed and available to end users',
    staging: 'Staging — available for review, not yet promoted',
    archived: 'Archived — retired, kept for reference only'
  };
  return el('span', {
    class: `pb-status pb-status--${s}`,
    title: descriptions[s] || s
  }, s);
}

export function validateLayerName(name) {
  if (!name) return { ok: false, error: 'Name is required' };
  if (!LAYER_NAME_RE.test(name)) {
    return { ok: false, error: 'Must start with a-z, then a-z, 0-9, or _ (max 63 chars)' };
  }
  return { ok: true };
}

// ===== Small cross-cutting helpers =====

/**
 * Trigger a form's submit event from outside the form. Needed when a
 * submit button lives in a separate container (e.g., modal footer) and so
 * can't rely on the native `type=submit` association.
 */
export function submitForm(form) {
  if (!form) return;
  if (typeof form.requestSubmit === 'function') form.requestSubmit();
  else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
}

/**
 * Call a bus-unsubscribe (or any cleanup fn) swallowing errors. Returns
 * `null` so callers can reassign the slot to null in the same line:
 *   roleUnsub = safeUnsubscribe(roleUnsub);
 */
export function safeUnsubscribe(unsub) {
  if (typeof unsub === 'function') {
    try { unsub(); } catch {}
  }
  return null;
}

/**
 * Wire a trigger button to a popover-style menu. Standard behaviour:
 * click the trigger to toggle, Escape or an outside click closes the
 * menu, focus returns to the trigger on Escape. The menu's visibility
 * is driven by the HTML `hidden` attribute (admin.css has a global
 * `[hidden]` rule so `display` in component CSS won't leak through).
 *
 * @param {HTMLElement} btn - trigger button (gets aria-expanded toggled)
 * @param {HTMLElement} menu - menu element to show/hide
 * @param {HTMLElement} [wrap] - ancestor used for outside-click detection;
 *   defaults to the trigger's parentElement
 * @returns {{ open: () => void, close: () => void }}
 */
export function wireMenu(btn, menu, wrap) {
  const outer = wrap || btn.parentElement;
  let onDocClick = null;
  let onEsc = null;
  const close = () => {
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (onDocClick) { document.removeEventListener('click', onDocClick, true); onDocClick = null; }
    if (onEsc) { document.removeEventListener('keydown', onEsc); onEsc = null; }
  };
  const open = () => {
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    onDocClick = (e) => { if (!outer.contains(e.target)) close(); };
    onEsc = (e) => { if (e.key === 'Escape') { close(); try { btn.focus(); } catch {} } };
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onEsc);
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.hidden) open(); else close();
  });
  return { open, close };
}

// ===== Modal =====

let activeModal = null;
let escHandler = null;
let keydownTrapHandler = null;
let modalLastFocused = null;

// Selector for focusable elements inside a trap container. Excludes disabled
// inputs and anything explicitly removed from the tab order.
const FOCUSABLE_SEL =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Attach a keyboard focus trap to a container. Tab/Shift-Tab at the
 * boundary wraps to the other end. Returns a function to detach.
 * Exported so side panels and other dialog-like surfaces can reuse.
 */
export function trapFocus(container) {
  const handler = (e) => {
    if (e.key !== 'Tab') return;
    const focusables = Array.from(container.querySelectorAll(FOCUSABLE_SEL))
      .filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (!focusables.length) { e.preventDefault(); container.focus?.(); return; }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !container.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  container.addEventListener('keydown', handler);
  return () => container.removeEventListener('keydown', handler);
}

export function openModal(contentNode) {
  closeModal();
  modalLastFocused = document.activeElement;
  const host = document.getElementById('modal-host');
  const backdrop = el('div', { class: 'pb-modal-backdrop', 'data-action': 'modal-close' });
  const modal = el('div', { class: 'pb-modal', role: 'dialog', 'aria-modal': 'true' }, [contentNode]);
  host.appendChild(backdrop);
  host.appendChild(modal);
  activeModal = { backdrop, modal };
  escHandler = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', escHandler);
  // Focus trap — wrap Tab/Shift-Tab at the boundary so focus stays inside.
  keydownTrapHandler = trapFocus(modal);
  // Focus first focusable
  const focusable = modal.querySelector(FOCUSABLE_SEL);
  if (focusable) setTimeout(() => focusable.focus(), 0);
  return { backdrop, modal };
}

export function closeModal() {
  if (!activeModal) return;
  activeModal.backdrop.remove();
  activeModal.modal.remove();
  activeModal = null;
  if (escHandler) {
    document.removeEventListener('keydown', escHandler);
    escHandler = null;
  }
  if (keydownTrapHandler) {
    try { keydownTrapHandler(); } catch {}
    keydownTrapHandler = null;
  }
  if (modalLastFocused && typeof modalLastFocused.focus === 'function') {
    try { modalLastFocused.focus(); } catch {}
  }
  modalLastFocused = null;
}

export function confirmModal({ title, message, requireText, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const input = requireText
      ? el('input', {
          type: 'text',
          class: 'pb-confirm-input',
          autocomplete: 'off',
          spellcheck: 'false',
          'aria-label': `Type ${requireText} to confirm`
        })
      : null;

    const confirmBtn = el('button', {
      type: 'button',
      class: danger ? 'btn-danger' : 'btn-primary',
      disabled: requireText ? true : false
    }, confirmLabel);

    const cancelBtn = el('button', { type: 'button', class: 'btn-secondary' }, 'Cancel');

    const bodyChildren = [el('p', {}, message || '')];
    if (requireText) {
      // Prominent echo of the required string — its own block, monospace,
      // bordered. Users shouldn't have to scan prose to find what to type.
      bodyChildren.push(el('div', { class: 'pb-confirm-echo' }, [
        el('span', { class: 'pb-confirm-echo-label' }, 'Type to confirm:'),
        el('code', { class: 'pb-confirm-echo-value' }, requireText)
      ]));
      bodyChildren.push(el('div', { class: 'pb-field' }, [input]));

      const sync = () => {
        const match = input.value === requireText;
        confirmBtn.disabled = !match;
        input.classList.toggle('is-valid', match);
      };
      input.addEventListener('input', sync);
      // Enter submits when the match is complete — saves a reach to the mouse
      // after a careful paste. Escape is already wired by openModal().
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !confirmBtn.disabled) {
          e.preventDefault();
          confirmBtn.click();
        }
      });
    }

    const content = el('div', {}, [
      el('div', { class: 'pb-modal-header' }, title || 'Confirm'),
      el('div', { class: 'pb-modal-body' }, bodyChildren),
      el('div', { class: 'pb-modal-footer' }, [cancelBtn, confirmBtn])
    ]);

    cancelBtn.addEventListener('click', () => { closeModal(); resolve(false); });
    confirmBtn.addEventListener('click', () => { closeModal(); resolve(true); });

    const { backdrop } = openModal(content);
    backdrop.addEventListener('click', () => { closeModal(); resolve(false); }, { once: true });
    if (input) setTimeout(() => input.focus(), 0);
  });
}

// ===== Toast =====

// Per-kind auto-dismiss delays (ms). Success messages confirm an action the
// user just took — they can disappear fast. Errors need time to read and
// act on, so they linger. `0` would mean "never auto-dismiss"; we don't use
// that yet but the code paths support it.
const TOAST_DURATIONS = { success: 2000, info: 3500, warning: 4500, error: 6000 };

export function toast(message, kind = 'info') {
  const host = document.getElementById('toast-host');
  if (!host) return;
  const t = el('div', {
    class: `pb-toast pb-toast--${kind}`,
    role: kind === 'error' ? 'alert' : 'status'
  }, [
    el('span', {}, message),
    el('button', {
      class: 'pb-toast-close',
      type: 'button',
      'aria-label': 'Dismiss',
      'data-action': 'toast-dismiss'
    }, [el('span', { class: 'material-symbols-outlined pb-icon-sm' }, 'close')])
  ]);
  host.appendChild(t);
  const ms = TOAST_DURATIONS[kind] ?? TOAST_DURATIONS.info;
  const timer = ms > 0 ? setTimeout(() => t.remove(), ms) : null;
  t.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="toast-dismiss"]')) {
      if (timer) clearTimeout(timer);
      t.remove();
    }
  });
}

// ===== Downloads =====

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ===== CSV =====

// Minimal RFC 4180 parser: handles quoted fields with embedded commas, quotes (""), CRLF.
export function csvToRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  // Strip BOM
  if (text.charCodeAt(0) === 0xFEFF) i = 1;

  while (i < len) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      row.push(field); field = ''; rows.push(row); row = []; i++; continue;
    }
    if (ch === '\n') {
      row.push(field); field = ''; rows.push(row); row = []; i++; continue;
    }
    field += ch; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  // Drop trailing empty row
  if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  return rows;
}

// Characters that, when leading a cell, would be interpreted as a formula by
// Excel / Google Sheets / LibreOffice Calc. We prefix with a single quote to
// neutralize. See OWASP "CSV Injection".
const CSV_INJECTION_LEAD = /^[=+\-@\t\r]/;

export function csvSafeCell(v) {
  if (v == null) return '';
  let s = String(v);
  if (CSV_INJECTION_LEAD.test(s)) s = "'" + s;
  return s;
}

export function rowsToCsv(rows, columns) {
  const cols = columns || (rows[0] ? Object.keys(rows[0]) : []);
  const esc = (v) => {
    const s = csvSafeCell(v);
    if (s === '') return '';
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const out = [cols.join(',')];
  for (const r of rows) {
    out.push(cols.map((c) => esc(r[c])).join(','));
  }
  return out.join('\r\n');
}

// ===== Type inference =====

const INT_RE = /^-?\d+$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const INT32_MAX = 2147483647;
const INT32_MIN = -2147483648;

function inferOne(val) {
  if (val == null || val === '') return null;
  // Objects / arrays → jsonb. This catches nested structures that GeoJSON
  // `properties` bags legitimately carry.
  if (typeof val === 'object') return 'jsonb';
  const s = String(val).trim();
  if (s === '') return null;
  if (s === 'true' || s === 'false') return 'boolean';
  if (INT_RE.test(s)) {
    // Promote to bigint when the value doesn't fit 32-bit signed. We keep
    // `double precision` as the default for non-integer numbers — only pick
    // `numeric` if the user explicitly chooses it (manual override).
    const n = Number(s);
    if (Number.isFinite(n) && (n > INT32_MAX || n < INT32_MIN)) return 'bigint';
    return 'integer';
  }
  if (NUM_RE.test(s)) return 'double precision';
  if (TS_RE.test(s)) return 'timestamptz';
  if (DATE_RE.test(s)) return 'date';
  if (UUID_RE.test(s)) return 'uuid';
  return 'text';
}

// Type-merge policy for the column inferrer: when different rows infer
// different types for the same column, pick the least-surprising supertype.
function mergeTypes(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a === b) return a;
  // Numeric family: integer < bigint < double precision.
  const numericUpgrade = (x, y) => {
    const rank = { 'integer': 1, 'bigint': 2, 'double precision': 3 };
    if (rank[x] && rank[y]) return rank[x] >= rank[y] ? x : y;
    return null;
  };
  const num = numericUpgrade(a, b);
  if (num) return num;
  // uuid + text → text (uuid is a strict subset of text syntactically).
  if ((a === 'uuid' && b === 'text') || (a === 'text' && b === 'uuid')) return 'text';
  return 'text';
}

export function inferColumnsFromRows(rows) {
  if (!rows || !rows.length) return [];
  const keys = new Set();
  for (const r of rows) for (const k of Object.keys(r)) keys.add(k);

  const types = new Map();
  for (const k of keys) {
    let t = null;
    for (const r of rows) {
      const inferred = inferOne(r[k]);
      if (inferred) t = mergeTypes(t, inferred);
    }
    types.set(k, t || 'text');
  }

  return Array.from(keys).map((name) => ({ name, type: types.get(name), description: '' }));
}

// ===== Upload parsing (shared by new-layer drawer + import modal) =====

/**
 * Parse an uploaded file (GeoJSON or CSV) into a uniform shape.
 * Callers then decide how to apply it (seed layer vs append features).
 *
 * @param {File} file
 * @returns {Promise<{
 *   kind: 'geojson'|'csv',
 *   filename: string,
 *   columns: Array<{name, type, description, include?: boolean}>,
 *   rows: Array<object>,
 *   features: Array<{id?, geometry, properties}>,
 *   rowCount: number,
 *   geomTypes: Set<string>
 * }>}
 */
export async function parseUpload(file) {
  if (!file) throw new Error('No file provided');
  const filename = file.name || 'upload';
  const lower = filename.toLowerCase();
  const isCsv = lower.endsWith('.csv');
  const isGeo = lower.endsWith('.geojson') || lower.endsWith('.json');
  if (!isCsv && !isGeo) throw new Error('Unsupported file type. Use .geojson, .json, or .csv.');
  const text = await file.text();
  return isCsv ? parseCsvUpload(text, filename) : parseGeoJsonUpload(text, filename);
}

function parseGeoJsonUpload(text, filename) {
  let data;
  try { data = JSON.parse(text); }
  catch (e) { throw new Error('Invalid JSON: ' + e.message); }
  let features = [];
  if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) features = data.features;
  else if (data?.type === 'Feature') features = [data];
  else throw new Error('Not a GeoJSON FeatureCollection or Feature.');
  const rows = features.map((f) => f?.properties || {});
  const inferred = inferColumnsFromRows(rows).map((c) => ({ ...c, include: true }));
  const geomTypes = new Set();
  for (const f of features) if (f?.geometry?.type) geomTypes.add(f.geometry.type);
  const normFeatures = features.map((f) => ({
    id: f?.id,
    geometry: f?.geometry || null,
    properties: f?.properties || {}
  }));
  return {
    kind: 'geojson',
    filename,
    columns: inferred,
    rows,
    features: normFeatures,
    rowCount: features.length,
    geomTypes
  };
}

function parseCsvUpload(text, filename) {
  const rawRows = csvToRows(text);
  if (!rawRows.length) throw new Error('CSV is empty.');
  const header = rawRows[0];
  if (!header || !header.length || header.every((h) => !h || !String(h).trim())) {
    throw new Error('CSV has no header row.');
  }
  const headers = header.map((h) => String(h || '').trim());
  const dataRows = rawRows.slice(1).map((r) => {
    const o = {};
    for (let i = 0; i < headers.length; i++) o[headers[i]] = r[i] ?? '';
    return o;
  });
  const inferred = inferColumnsFromRows(dataRows).map((c) => ({ ...c, include: true }));
  const features = dataRows.map((r) => ({ id: undefined, geometry: null, properties: r }));
  return {
    kind: 'csv',
    filename,
    columns: inferred,
    rows: dataRows,
    features,
    rowCount: dataRows.length,
    geomTypes: new Set()
  };
}

// ===== Geometry: GeoJSON <-> WKT =====
//
// MVP parser — no Z/M coords, no EMPTY, no GEOMETRYCOLLECTION.
// Supported WKT tags: POINT, MULTIPOINT, LINESTRING, MULTILINESTRING,
// POLYGON, MULTIPOLYGON (case-insensitive). Whitespace-tolerant.
// On error, throws with a clear message.

/**
 * Parse a user-entered geometry string, accepting either GeoJSON or WKT.
 * Returns a GeoJSON geometry object `{type, coordinates}`.
 */
export function parseGeometry(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Geometry is empty.');

  // Try GeoJSON first.
  if (raw.startsWith('{')) {
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) { throw new Error('Invalid GeoJSON: ' + e.message); }
    if (parsed && typeof parsed === 'object' && parsed.type && 'coordinates' in parsed) {
      return parsed;
    }
    throw new Error('GeoJSON must be a geometry object with "type" and "coordinates".');
  }

  // Otherwise treat as WKT.
  return wktToGeometry(raw);
}

// ---- WKT parser (hand-rolled, MVP scope) ----

const WKT_TAGS = /^(MULTIPOLYGON|MULTILINESTRING|MULTIPOINT|POLYGON|LINESTRING|POINT)\s*\(([\s\S]*)\)\s*$/i;

function wktToGeometry(wkt) {
  const m = wkt.match(WKT_TAGS);
  if (!m) throw new Error('Unrecognised WKT — supported: POINT, LINESTRING, POLYGON and their MULTI variants.');
  const tag = m[1].toUpperCase();
  const body = m[2].trim();

  switch (tag) {
    case 'POINT':
      return { type: 'Point', coordinates: parseCoord(body) };
    case 'MULTIPOINT': {
      // Two flavours: "MULTIPOINT (x y, x y)" or "MULTIPOINT ((x y), (x y))".
      const coords = splitTopLevel(body).map((c) => {
        const inner = c.trim().replace(/^\(|\)$/g, '').trim();
        return parseCoord(inner);
      });
      return { type: 'MultiPoint', coordinates: coords };
    }
    case 'LINESTRING':
      return { type: 'LineString', coordinates: parseCoordList(body) };
    case 'MULTILINESTRING': {
      const lines = splitTopLevel(body).map((s) => parseCoordList(stripParens(s)));
      return { type: 'MultiLineString', coordinates: lines };
    }
    case 'POLYGON': {
      const rings = splitTopLevel(body).map((s) => parseCoordList(stripParens(s)));
      return { type: 'Polygon', coordinates: rings };
    }
    case 'MULTIPOLYGON': {
      const polys = splitTopLevel(body).map((polyStr) => {
        const rings = splitTopLevel(stripParens(polyStr)).map((s) => parseCoordList(stripParens(s)));
        return rings;
      });
      return { type: 'MultiPolygon', coordinates: polys };
    }
    default:
      throw new Error(`Unsupported WKT tag: ${tag}`);
  }
}

function stripParens(s) {
  const t = s.trim();
  if (!t.startsWith('(') || !t.endsWith(')')) {
    throw new Error('Malformed WKT — expected parentheses.');
  }
  return t.slice(1, -1).trim();
}

/** Split a string by commas at the *top* level of parentheses nesting. */
function splitTopLevel(s) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out.map((p) => p.trim()).filter(Boolean);
}

function parseCoord(text) {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) throw new Error(`Malformed coordinate "${text}".`);
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`Non-numeric coordinate "${text}".`);
  }
  return [x, y];
}

function parseCoordList(text) {
  return splitTopLevel(text).map((c) => parseCoord(c));
}

/**
 * Convert a GeoJSON geometry to a WKT string.
 * MVP — no Z/M, no EMPTY, no GEOMETRYCOLLECTION.
 */
export function geometryToWkt(geom) {
  if (!geom || !geom.type || !('coordinates' in geom)) {
    throw new Error('Not a GeoJSON geometry.');
  }
  const fmtPt = (p) => `${p[0]} ${p[1]}`;
  const fmtPts = (pts) => pts.map(fmtPt).join(', ');

  switch (geom.type) {
    case 'Point':
      return `POINT(${fmtPt(geom.coordinates)})`;
    case 'MultiPoint':
      return `MULTIPOINT(${geom.coordinates.map((p) => `(${fmtPt(p)})`).join(', ')})`;
    case 'LineString':
      return `LINESTRING(${fmtPts(geom.coordinates)})`;
    case 'MultiLineString':
      return `MULTILINESTRING(${geom.coordinates.map((line) => `(${fmtPts(line)})`).join(', ')})`;
    case 'Polygon':
      return `POLYGON(${geom.coordinates.map((ring) => `(${fmtPts(ring)})`).join(', ')})`;
    case 'MultiPolygon':
      return `MULTIPOLYGON(${geom.coordinates.map((poly) =>
        `(${poly.map((ring) => `(${fmtPts(ring)})`).join(', ')})`
      ).join(', ')})`;
    default:
      throw new Error(`Unsupported geometry type for WKT: ${geom.type}`);
  }
}

// ===== Inline-edit helper (shared) =====

/**
 * Attach an inline view/edit swap to a container.
 * @param {{
 *   value: string,
 *   placeholder?: string,
 *   multiline?: boolean,
 *   className?: string,
 *   onSave: (next: string) => Promise<void>|void,
 *   onCancel?: () => void
 * }} opts
 * @returns {HTMLElement} wrapper element to insert into DOM
 */
export function inlineEditable(opts) {
  const { value = '', placeholder = '', multiline = false, className = '', onSave, onCancel } = opts || {};
  const wrapTag = multiline ? 'div' : 'span';
  const wrap = el(wrapTag, { class: 'pb-inline-edit ' + (className || '') });
  const viewClass = 'pb-inline-value' + (multiline ? ' pb-inline-value--multiline' : '');
  // aria-label spells out both the primary action and the keyboard paths so
  // screen-reader users discover what sighted users see via the pencil icon.
  const REST_ARIA = multiline
    ? 'Editable. Press Enter or click to edit. Ctrl+Enter to save, Escape to cancel.'
    : 'Editable. Press Enter or click to edit. Enter to save, Escape to cancel.';
  const view = el(multiline ? 'div' : 'span', {
    class: viewClass, tabindex: '0', role: 'button',
    'aria-label': REST_ARIA,
    title: multiline ? 'Click to edit (Ctrl+Enter to save, Esc to cancel)' : 'Click to edit (Enter to save, Esc to cancel)'
  }, [
    el('span', { class: 'pb-inline-value-text' }, value || placeholder || '—'),
    // Pencil affordance — visible signal that the field is editable. Style
    // lives in admin.css; `pointer-events: none` so clicks fall through to
    // the wrapping view (which owns the enter-edit listener).
    el('span', {
      class: 'material-symbols-outlined pb-inline-edit-icon',
      'aria-hidden': 'true'
    }, 'edit')
  ]);
  if (!value) view.classList.add('is-placeholder');

  const input = multiline
    ? el('textarea', { class: 'pb-inline-input pb-inline-input--ta', rows: '3', placeholder })
    : el('input', { type: 'text', class: 'pb-inline-input', value, placeholder });

  let current = value || '';
  let editing = false;
  let saveFlashTimer = null;

  function enter() {
    if (editing) return;
    editing = true;
    input.value = current;
    wrap.innerHTML = '';
    wrap.appendChild(input);
    input.focus();
    if (!multiline && input.select) input.select();
  }
  function flashSaved() {
    view.classList.add('is-just-saved');
    if (saveFlashTimer) clearTimeout(saveFlashTimer);
    saveFlashTimer = setTimeout(() => view.classList.remove('is-just-saved'), 900);
  }
  async function commit() {
    if (!editing) return;
    const next = input.value.trim();
    if (next === current) { cancel(); return; }
    let saved = false;
    try {
      await onSave(next);
      current = next;
      saved = true;
    } catch (err) {
      toast(err?.message || 'Save failed', 'error');
    }
    editing = false;
    // Update the text span but leave the sibling pencil-icon <span> intact
    // so the hover affordance survives a save round-trip.
    const textNode = view.querySelector('.pb-inline-value-text');
    if (textNode) textNode.textContent = current || placeholder || '—';
    else view.textContent = current || placeholder || '—';
    view.classList.toggle('is-placeholder', !current);
    wrap.innerHTML = '';
    wrap.appendChild(view);
    if (saved) flashSaved();
  }
  function cancel() {
    editing = false;
    wrap.innerHTML = '';
    wrap.appendChild(view);
    try { onCancel && onCancel(); } catch {}
  }

  view.addEventListener('click', enter);
  view.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(); }
  });
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    else if (!multiline && e.key === 'Enter') { e.preventDefault(); input.blur(); }
    else if (multiline && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); input.blur(); }
  });

  wrap.appendChild(view);
  return wrap;
}
