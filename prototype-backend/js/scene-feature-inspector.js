// prototype-backend — Scene feature inspector (right drawer).
//
// Shown when a feature is selected on the scene map. Three sections:
//   - Attributes (editable in edit-mode, read-only otherwise)
//   - Geometry (collapsible, read-only pretty-printed GeoJSON)
//   - Attachments (mock dropzone + fake list)
//
// Slide in/out via the .pb-scene-inspector--open class set by the parent.

import * as api from './api.js';
import { el, toast, escHtml } from './utils.js';

let root = null;
let currentFeature = null;
let currentLayer = null;
let editMode = false;
let onClose = null;
let onSave = null;

// Column schema for the active layer (fetched lazily if not supplied).
let columns = null;

export function mount(container, options) {
  root = container;
  currentFeature = options?.feature || null;
  currentLayer = options?.layer || null;
  editMode = !!options?.editMode;
  onClose = options?.onClose || null;
  onSave = options?.onSave || null;
  columns = currentLayer?.columns || null;
  renderIfReady();
}

export function unmount() {
  if (root) root.innerHTML = '';
  root = null;
  currentFeature = null;
  currentLayer = null;
  columns = null;
  editMode = false;
  onClose = null;
  onSave = null;
}

export function setFeature(feature, layer) {
  currentFeature = feature || null;
  currentLayer = layer || null;
  columns = layer?.columns || null;
  renderIfReady();
}

export function setEditMode(next) {
  editMode = !!next;
  renderIfReady();
}

async function renderIfReady() {
  if (!root) return;
  if (!currentFeature || !currentLayer) {
    root.innerHTML = '';
    return;
  }
  if (!columns || !columns.length) {
    try { columns = await api.listColumns(currentLayer.name); }
    catch { columns = []; }
  }
  render();
}

function render() {
  root.innerHTML = '';

  // Header
  const closeBtn = el('button', {
    type: 'button',
    class: 'pb-scene-inspector-close',
    'aria-label': 'Close inspector'
  }, [el('span', { class: 'material-symbols-outlined' }, 'close')]);
  closeBtn.addEventListener('click', () => onClose?.());

  const shortId = currentFeature.id ? String(currentFeature.id).slice(0, 8) : '—';
  const header = el('div', { class: 'pb-scene-inspector-header' }, [
    el('div', { class: 'pb-scene-inspector-header-main' }, [
      el('div', { class: 'pb-scene-inspector-eyebrow' }, currentLayer.title || currentLayer.name),
      el('div', { class: 'pb-scene-inspector-title' }, `Feature #${shortId}`)
    ]),
    closeBtn
  ]);
  root.appendChild(header);

  const body = el('div', { class: 'pb-scene-inspector-body' });
  root.appendChild(body);

  // ---- Attributes section ----
  const attrSection = el('section', { class: 'pb-scene-inspector-section' }, [
    el('div', { class: 'pb-scene-inspector-section-title' }, 'Attributes')
  ]);

  const userCols = (columns || []).filter((c) => c.name !== 'id' && c.name !== 'geom');
  if (!userCols.length) {
    attrSection.appendChild(el('div', { class: 'pb-muted' }, 'No attribute columns on this layer.'));
  } else {
    const fieldInputs = new Map();
    for (const col of userCols) {
      const val = currentFeature.properties?.[col.name];
      const input = buildInputForColumn(col, val, !editMode);
      fieldInputs.set(col.name, input);
      attrSection.appendChild(el('div', { class: 'pb-field pb-scene-inspector-field' }, [
        el('label', {}, col.name),
        input,
        el('div', { class: 'pb-field-hint' }, col.type)
      ]));
    }
    if (editMode) {
      const saveBtn = el('button', { type: 'button', class: 'btn-primary pb-scene-inspector-save' }, 'Save');
      saveBtn.addEventListener('click', async () => {
        const patch = {};
        for (const [name, input] of fieldInputs.entries()) {
          patch[name] = readInputValue(input);
        }
        try { await onSave?.(patch); }
        catch (err) { toast(err?.message || 'Save failed', 'error'); }
      });
      attrSection.appendChild(saveBtn);
    }
  }
  body.appendChild(attrSection);

  // ---- Geometry section ----
  const geomPretty = currentFeature.geometry
    ? JSON.stringify(currentFeature.geometry, null, 2)
    : '(no geometry)';
  const geomSection = el('details', { class: 'pb-scene-inspector-section pb-scene-inspector-geom' }, [
    el('summary', {}, 'Geometry'),
    el('pre', { class: 'pb-code pb-scene-inspector-geom-pre' }, geomPretty)
  ]);
  body.appendChild(geomSection);

  // ---- Attachments section ----
  const dropzone = el('div', {
    class: 'pb-scene-inspector-dropzone',
    tabindex: '0',
    role: 'button',
    'aria-label': 'Upload attachment'
  }, [
    el('span', { class: 'material-symbols-outlined pb-scene-dropzone-icon' }, 'cloud_upload'),
    el('div', { class: 'pb-scene-dropzone-text' }, 'Drag files here or click to upload')
  ]);
  const notify = () => toast('Attachments — coming soon', 'info');
  dropzone.addEventListener('click', notify);
  dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); notify(); } });
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('is-drag'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-drag'));
  dropzone.addEventListener('drop', (e) => { e.preventDefault(); dropzone.classList.remove('is-drag'); notify(); });

  const attachmentList = el('div', { class: 'pb-scene-inspector-attachments' }, [
    attachmentRow('survey-notes.pdf', '142 KB', 'description'),
    attachmentRow('site-photo.jpg', '1.1 MB', 'image')
  ]);

  const attachSection = el('section', { class: 'pb-scene-inspector-section' }, [
    el('div', { class: 'pb-scene-inspector-section-title' }, 'Attachments'),
    dropzone,
    attachmentList
  ]);
  body.appendChild(attachSection);
}

function attachmentRow(name, size, icon) {
  const delBtn = el('button', {
    type: 'button',
    class: 'pb-scene-attachment-del',
    'aria-label': `Delete ${name}`,
    title: 'Delete'
  }, [el('span', { class: 'material-symbols-outlined' }, 'close')]);
  delBtn.addEventListener('click', () => toast('Delete attachment — coming soon', 'info'));
  return el('div', { class: 'pb-attachment-row' }, [
    el('span', { class: 'material-symbols-outlined pb-attachment-icon' }, icon || 'draft'),
    el('div', { class: 'pb-attachment-meta' }, [
      el('div', { class: 'pb-attachment-name' }, name),
      el('div', { class: 'pb-attachment-size' }, size)
    ]),
    delBtn
  ]);
}

// ---- Input helpers -----------------------------------------------------

function buildInputForColumn(col, value, disabled) {
  const t = String(col.type || '').toLowerCase();
  const common = {
    class: 'pb-scene-inspector-input',
    disabled: disabled ? true : undefined
  };
  if (disabled) common.style = 'background: var(--grey-50); color: var(--grey-700);';

  if (t.startsWith('integer') || t.startsWith('bigint') || t.startsWith('numeric') || t.startsWith('double') || t === 'real') {
    return el('input', { ...common, type: 'number', value: value == null ? '' : String(value) });
  }
  if (t === 'boolean') {
    const cb = el('input', { type: 'checkbox', disabled: disabled ? true : undefined });
    cb.checked = value === true || value === 'true';
    return cb;
  }
  if (t === 'date') {
    return el('input', { ...common, type: 'date', value: value || '' });
  }
  if (t === 'timestamptz') {
    // HTML datetime-local expects no timezone suffix; best-effort truncate.
    let v = value || '';
    if (typeof v === 'string' && v.length >= 16) v = v.slice(0, 16);
    return el('input', { ...common, type: 'datetime-local', value: v });
  }
  if (t === 'jsonb') {
    return el('textarea', {
      ...common,
      rows: '3',
      class: 'pb-scene-inspector-input pb-scene-inspector-input--ta',
    }, value == null ? '' : (typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)));
  }
  if (t === 'text' && String(value || '').length > 80) {
    return el('textarea', { ...common, rows: '3', class: 'pb-scene-inspector-input pb-scene-inspector-input--ta' }, value || '');
  }
  return el('input', { ...common, type: 'text', value: value == null ? '' : String(value) });
}

function readInputValue(input) {
  if (input.type === 'checkbox') return input.checked;
  if (input.type === 'number') {
    const v = input.value;
    if (v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  const v = input.value;
  return v === '' ? null : v;
}
// `escHtml` is re-exported from utils only where needed; left imported so
// downstream expansions (e.g. unescaped labels) have it handy.
void escHtml;
