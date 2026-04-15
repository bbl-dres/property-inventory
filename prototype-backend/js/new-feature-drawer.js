// prototype-backend — New feature drawer/modal (was "new layer").
// Replaces the old #/layers/new route. Opened via sidebar "+ New" button.
// Terminology note: UI says "feature"; internal API still uses `createLayer`.

import * as api from './api.js';
import { bus } from './state.js';
import {
  el, validateLayerName, toast, openModal, closeModal, parseUpload
} from './utils.js';
import { COLUMN_TYPES as TYPES, GEOMETRY_TYPES, SUPPORTED_SRIDS, GEOMETRY_COMPAT } from './constants.js';

let parsed = null;

export function open() {
  parsed = null;

  const nameInput = el('input', { type: 'text', autocomplete: 'off', required: true, spellcheck: 'false', placeholder: 'e.g. inspections_2026' });
  const nameError = el('div', { class: 'pb-field-error', style: { display: 'none' } });

  const titleInput = el('input', { type: 'text', placeholder: 'Human-readable title (optional)' });
  const descInput = el('textarea', { placeholder: 'What is this feature for?' });

  // Geometry type — the list now covers all core GeoJSON types. We render as
  // a <select> (compact for 7 options) but keep value semantics identical to
  // the previous radio group so downstream code is unchanged.
  const geomSelect = el('select', { name: 'geom', class: 'pb-geom-select' },
    GEOMETRY_TYPES.map((t) =>
      el('option', { value: t, selected: t === 'Point' ? true : undefined }, t)
    ));
  // Shim so existing querySelector('input[name="geom"]:checked') calls still work.
  const geomGroup = el('div', { class: 'pb-geom-group' }, [geomSelect]);
  geomGroup.querySelector = ((origQS) => function (sel) {
    if (sel === 'input[name="geom"]:checked') return { value: geomSelect.value };
    return origQS.call(geomGroup, sel);
  })(Element.prototype.querySelector);

  // SRID dropdown (hidden for Table layers).
  const sridSelect = el('select', { name: 'srid' },
    SUPPORTED_SRIDS.map((s) =>
      el('option', { value: String(s.code), selected: s.code === 4326 ? true : undefined },
        `${s.code} · ${s.name}`)
    ));
  const sridField = el('div', { class: 'pb-field' }, [
    el('label', {}, 'SRID'),
    sridSelect,
    el('div', { class: 'pb-field-hint' }, 'Coordinate reference system. Cannot be changed later.')
  ]);

  const syncSridVisibility = () => {
    sridField.style.display = geomSelect.value === 'Table' ? 'none' : '';
  };

  const fileInput = el('input', {
    type: 'file',
    accept: '.geojson,application/geo+json,application/json,.csv,text/csv',
    class: 'pb-import-file'
  });
  const previewHost = el('div', {});

  const cancelBtn = el('button', { type: 'button', class: 'btn-secondary' }, 'Cancel');
  const submitBtn = el('button', { type: 'button', class: 'btn-primary' }, 'Create feature');

  const form = el('form', { class: 'pb-form', novalidate: true }, [
    el('div', { class: 'pb-field' }, [
      el('label', {}, 'Name'),
      nameInput,
      el('div', { class: 'pb-field-hint' }, 'Lowercase, digits, underscore. Start with a letter. Max 63 chars. Cannot be changed later.'),
      nameError
    ]),
    el('div', { class: 'pb-field' }, [el('label', {}, 'Title'), titleInput]),
    el('div', { class: 'pb-field' }, [el('label', {}, 'Description'), descInput]),
    el('div', { class: 'pb-field' }, [el('label', {}, 'Geometry type'), geomGroup]),
    sridField,
    el('div', { class: 'pb-field' }, [
      el('label', {}, 'Seed from file (optional)'),
      fileInput,
      el('div', { class: 'pb-field-hint' }, 'Upload a GeoJSON or CSV to infer columns and seed records.')
    ]),
    previewHost,
    // Hidden submit so Enter submits the form.
    el('button', { type: 'submit', style: { display: 'none' } }, '')
  ]);
  submitBtn.addEventListener('click', () => form.requestSubmit());

  nameInput.addEventListener('input', () => {
    const val = nameInput.value;
    if (!val) { nameInput.classList.remove('is-invalid'); nameError.style.display = 'none'; return; }
    const res = validateLayerName(val);
    nameInput.classList.toggle('is-invalid', !res.ok);
    nameError.textContent = res.ok ? '' : res.error;
    nameError.style.display = res.ok ? 'none' : '';
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) { parsed = null; previewHost.innerHTML = ''; return; }
    previewHost.innerHTML = '';
    previewHost.appendChild(el('div', { class: 'pb-muted' }, 'Parsing…'));
    try {
      parsed = await parseUpload(file);
      renderPreview(previewHost, geomGroup);
    } catch (err) {
      parsed = null;
      previewHost.innerHTML = '';
      toast('Failed to parse file: ' + (err?.message || 'unknown'), 'error');
    }
  });

  geomSelect.addEventListener('change', () => {
    syncSridVisibility();
    if (parsed) renderPreview(previewHost, geomGroup);
  });
  syncSridVisibility();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const check = validateLayerName(name);
    if (!check.ok) {
      nameInput.classList.add('is-invalid');
      nameError.textContent = check.error;
      nameError.style.display = '';
      nameInput.focus();
      return;
    }

    const geometry_type = geomSelect.value || 'Point';
    const srid = geometry_type === 'Table' ? null : Number(sridSelect.value) || 4326;
    const title = titleInput.value.trim();
    const description = descInput.value.trim();

    let columns = [];
    let seedFeatures = [];
    if (parsed) {
      columns = parsed.columns.filter((c) => c.include).map((c) => ({ name: c.name, type: c.type, description: '' }));
      if (geometry_type === 'Table') {
        seedFeatures = (parsed.features || []).map((f) => ({
          id: f.id, geometry: null, properties: filterProps(f.properties, columns)
        }));
      } else {
        const accepted = GEOMETRY_COMPAT[geometry_type] || [geometry_type];
        seedFeatures = (parsed.features || [])
          .filter((f) => !f.geometry || accepted.includes(f.geometry.type))
          .map((f) => ({
            id: f.id,
            geometry: f.geometry && accepted.includes(f.geometry.type) ? f.geometry : null,
            properties: filterProps(f.properties, columns)
          }));
      }
      if (geometry_type !== 'Table' && parsed.features?.length && seedFeatures.length === 0) {
        toast(`File has no ${geometry_type} features — pick a matching geometry type.`, 'error');
        return;
      }
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating…';
    try {
      await api.createLayer({ name, geometry_type, srid, title, description, columns, seedFeatures });
      closeModal();
      const count = seedFeatures.length;
      toast(count > 0
        ? `Created "${name}" with ${count.toLocaleString()} seed record${count === 1 ? '' : 's'}.`
        : `Created "${name}"`, 'success');
      bus.emit('layer:created', { name });
    } catch (err) {
      toast(err?.message || 'Failed to create feature', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create feature';
    }
  });

  cancelBtn.addEventListener('click', () => closeModal());

  const content = el('div', { class: 'pb-new-layer-drawer' }, [
    el('div', { class: 'pb-modal-header' }, 'New feature'),
    el('div', { class: 'pb-modal-body' }, [form]),
    el('div', { class: 'pb-modal-footer' }, [cancelBtn, submitBtn])
  ]);

  openModal(content);
  setTimeout(() => nameInput.focus(), 0);
}

// Upload parsing was extracted to utils.parseUpload — shared with import-modal.

function filterProps(props, columns) {
  if (!props) return {};
  const keep = new Set(columns.map((c) => c.name));
  const out = {};
  for (const k of Object.keys(props)) if (keep.has(k)) out[k] = props[k];
  return out;
}

function renderPreview(host, geomGroup) {
  host.innerHTML = '';
  if (!parsed) return;
  const selectedGeom = geomGroup.querySelector('input[name="geom"]:checked')?.value || 'Point';

  const warnings = [];
  if (parsed.kind === 'geojson') {
    if (selectedGeom === 'Table' && parsed.geomTypes.size > 0) {
      warnings.push('File contains geometries but feature is Table; geometries will be dropped.');
    } else if (selectedGeom !== 'Table') {
      const accepted = GEOMETRY_COMPAT[selectedGeom] || [selectedGeom];
      const hasAny = Array.from(parsed.geomTypes).some((t) => accepted.includes(t));
      if (parsed.geomTypes.size === 0) warnings.push('File has no geometries; features will be empty.');
      else if (!hasAny) warnings.push(`File contains ${Array.from(parsed.geomTypes).join(', ')} but none are compatible with ${selectedGeom} (accepts: ${accepted.join(', ')}).`);
    }
  } else if (parsed.kind === 'csv' && selectedGeom !== 'Table') {
    warnings.push('CSV has no geometry; features will have null geometry.');
  }

  const colRows = parsed.columns.map((col, i) => {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = col.include !== false;
    cb.addEventListener('change', () => { parsed.columns[i].include = cb.checked; });
    const typeSel = el('select', { class: 'pb-import-target' }, TYPES.map((t) =>
      el('option', { value: t, selected: t === col.type ? true : undefined }, t)));
    typeSel.value = col.type;
    typeSel.addEventListener('change', () => { parsed.columns[i].type = typeSel.value; });
    return el('tr', {}, [
      el('td', { style: { width: '32px' } }, cb),
      el('td', {}, el('span', { class: 'pb-name-mono' }, col.name)),
      el('td', {}, typeSel)
    ]);
  });

  const card = el('div', { class: 'pb-card pb-card--padded', style: { marginTop: 'var(--space-3)' } }, [
    el('div', { class: 'pb-card-header' }, 'File preview'),
    el('div', { class: 'pb-card-body' }, [
      el('div', { class: 'pb-import-summary' },
        `${parsed.rowCount.toLocaleString()} row${parsed.rowCount === 1 ? '' : 's'} detected` +
        (parsed.geomTypes.size ? ` · geometries: ${Array.from(parsed.geomTypes).join(', ')}` : '')
      ),
      ...(warnings.length ? [el('div', { class: 'pb-field-error', style: { display: 'block' } },
        warnings.map((w) => el('div', {}, w)))] : []),
      el('table', { class: 'pb-table pb-import-mapping' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', {}, 'Include'), el('th', {}, 'Column'), el('th', {}, 'Type')
        ])]),
        el('tbody', {}, colRows)
      ])
    ])
  ]);
  host.appendChild(card);
}
