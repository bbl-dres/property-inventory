// prototype-backend — Import flow modal (M5)
// Triggered from the Data tab toolbar. Three-step flow: pick file → map columns → run.
// Uses api.importFeatures(layerName, features[]) which does strict geometry-type validation.

import * as api from './api.js';
import { ApiError } from './api.js';
import { el, openModal, closeModal, toast, parseUpload } from './utils.js';

const FIVE_MB = 5 * 1024 * 1024;

/**
 * Open the import modal for a layer.
 * @param {object} layer - full layer object (with `name`, `geometry_type`, `columns`).
 * @param {() => void} onDone - called after a successful import (close → refresh grid).
 */
export function openImportModal(layer, onDone) {
  const modalBody = el('div', { class: 'pb-import-modal' });
  const host = renderHost(modalBody);
  openModal(host);

  // State shared across steps
  const ctx = {
    layer,
    onDone,
    modalBody,
    host,
    filename: null,
    source: null,       // 'geojson' | 'csv'
    sourceColumns: [],  // string[] — CSV headers OR keys from GeoJSON properties
    rows: [],           // for CSV: objects keyed by header; for GeoJSON: {__feature: Feature, ...props}
    features: null      // for GeoJSON: Feature[]
  };

  renderStep1(ctx);
}

function renderHost(bodyNode) {
  return el('div', {}, [
    el('div', { class: 'pb-modal-header' }, 'Import features'),
    bodyNode
  ]);
}

function setBody(ctx, children) {
  ctx.modalBody.innerHTML = '';
  for (const c of children) if (c) ctx.modalBody.appendChild(c);
}

// ===== Step 1 — Pick file =====

function renderStep1(ctx) {
  const fileInput = el('input', {
    type: 'file',
    accept: '.geojson,.json,.csv',
    class: 'pb-import-file'
  });

  const err = el('div', { class: 'pb-field-error', style: { display: 'none' } });

  const cancelBtn = el('button', { type: 'button', class: 'btn-secondary' }, 'Cancel');
  cancelBtn.addEventListener('click', () => closeModal());

  fileInput.addEventListener('change', async () => {
    err.style.display = 'none';
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    if (file.size > FIVE_MB) {
      toast(`File is larger than 5 MB (${(file.size / 1024 / 1024).toFixed(1)} MB) — proceeding anyway.`, 'info');
    }

    let parsed;
    try {
      parsed = await parseUpload(file);
    } catch (e) {
      err.textContent = e.message || String(e);
      err.style.display = '';
      return;
    }

    if (parsed.kind === 'geojson') {
      if (!parsed.features.length) {
        err.textContent = 'GeoJSON contains no features.';
        err.style.display = '';
        return;
      }
      const keySet = new Set();
      for (const f of parsed.features) {
        for (const k of Object.keys(f.properties || {})) keySet.add(k);
      }
      ctx.source = 'geojson';
      ctx.filename = parsed.filename;
      ctx.features = parsed.features;
      ctx.sourceColumns = Array.from(keySet);
      ctx.rows = parsed.features;
    } else {
      if (!parsed.rows.length) {
        err.textContent = 'CSV has no data rows.';
        err.style.display = '';
        return;
      }
      ctx.source = 'csv';
      ctx.filename = parsed.filename;
      ctx.features = null;
      ctx.sourceColumns = parsed.columns.map((c) => c.name).filter((n) => n && n.length);
      ctx.rows = parsed.rows;
    }

    renderStep2(ctx);
  });

  setBody(ctx, [
    el('div', { class: 'pb-modal-body pb-import-step' }, [
      el('p', { class: 'pb-field-hint' },
        `Append records to feature "${ctx.layer.name}" (${ctx.layer.geometry_type}). GeoJSON or CSV; skip-and-report validation.`),
      el('div', { class: 'pb-field' }, [
        el('label', {}, 'Select a file'),
        fileInput,
        el('div', { class: 'pb-field-hint' }, 'Accepts .geojson, .json, or .csv.')
      ]),
      err
    ]),
    el('div', { class: 'pb-modal-footer' }, [cancelBtn])
  ]);
}

// Parsing is handled by utils.parseUpload (shared with new-layer drawer).

// ===== Step 2 — Column mapping =====

function renderStep2(ctx) {
  const layer = ctx.layer;
  const userCols = (layer.columns || []).filter((c) => !c.locked && c.name !== 'id' && c.name !== 'geom');
  const userColNames = userCols.map((c) => c.name);

  const gt = layer.geometry_type;
  const isTable = gt === 'Table';
  const isPointish = gt === 'Point' || gt === 'MultiPoint';
  // CSV can't express line/polygon geometry — any of these variants is unsupported.
  const isLineOrPolyish = gt === 'LineString' || gt === 'MultiLineString'
    || gt === 'Polygon' || gt === 'MultiPolygon';

  // For GeoJSON source, hide keys that are literally the geometry container
  // (in practice GeoJSON properties don't contain the geometry, but be defensive).
  const visibleSourceCols = ctx.sourceColumns.filter((k) => k !== 'geometry' && k !== 'geom');

  // Build mapping rows
  const mappingSelects = {}; // sourceCol -> <select>
  const mappingRows = visibleSourceCols.map((srcCol) => {
    const autoMatch = userColNames.includes(srcCol) ? srcCol : '__skip';
    const sel = el('select', { class: 'pb-import-target' });
    const skipOpt = el('option', { value: '__skip' }, 'Skip this column');
    sel.appendChild(skipOpt);
    for (const name of userColNames) {
      const opt = el('option', { value: name }, name);
      sel.appendChild(opt);
    }
    sel.value = autoMatch;
    mappingSelects[srcCol] = sel;

    return el('tr', {}, [
      el('td', { class: 'pb-name-mono' }, srcCol),
      el('td', {}, [sel])
    ]);
  });

  // Geometry section
  let latSelect = null;
  let lonSelect = null;
  let geomNote = null;
  let disableImport = false;

  if (ctx.source === 'geojson' && !isTable) {
    geomNote = el('div', { class: 'pb-field-hint' }, 'Geometry auto-detected from GeoJSON.');
  } else if (ctx.source === 'csv' && isPointish) {
    const buildLatLonSelect = (auto) => {
      const sel = el('select', {});
      sel.appendChild(el('option', { value: '__none' }, '— Select column —'));
      for (const s of ctx.sourceColumns) sel.appendChild(el('option', { value: s }, s));
      // auto-match
      const match = ctx.sourceColumns.find((c) => auto.test(c));
      if (match) sel.value = match;
      return sel;
    };
    latSelect = buildLatLonSelect(/^(lat|latitude|y)$/i);
    lonSelect = buildLatLonSelect(/^(lon|lng|long|longitude|x)$/i);
    geomNote = el('div', { class: 'pb-import-geom' }, [
      el('div', { class: 'pb-field' }, [el('label', {}, 'Latitude column'), latSelect]),
      el('div', { class: 'pb-field' }, [el('label', {}, 'Longitude column'), lonSelect])
    ]);
  } else if (ctx.source === 'csv' && isLineOrPolyish) {
    geomNote = el('div', { class: 'pb-field-error' },
      `CSV import not supported for ${gt} features — use GeoJSON.`);
    disableImport = true;
  } else if (ctx.source === 'csv' && isTable) {
    geomNote = el('div', { class: 'pb-field-hint' }, 'Non-spatial feature — no geometry required.');
  } else if (isTable) {
    geomNote = el('div', { class: 'pb-field-hint' }, 'Non-spatial feature — no geometry required.');
  }

  const err = el('div', { class: 'pb-field-error', style: { display: 'none' } });

  const backBtn = el('button', { type: 'button', class: 'btn-secondary' }, 'Back');
  backBtn.addEventListener('click', () => renderStep1(ctx));

  const cancelBtn = el('button', { type: 'button', class: 'btn-secondary' }, 'Cancel');
  cancelBtn.addEventListener('click', () => closeModal());

  const importBtn = el('button', {
    type: 'button',
    class: 'btn-primary',
    disabled: disableImport ? true : false
  }, 'Import');

  importBtn.addEventListener('click', async () => {
    err.style.display = 'none';

    // Build mapping
    const mapping = {}; // srcCol -> targetCol
    for (const srcCol of visibleSourceCols) {
      const v = mappingSelects[srcCol].value;
      if (v && v !== '__skip') mapping[srcCol] = v;
    }

    // Validate lat/lon for CSV Point
    let latCol = null, lonCol = null;
    if (ctx.source === 'csv' && isPointish) {
      latCol = latSelect.value;
      lonCol = lonSelect.value;
      if (!latCol || latCol === '__none' || !lonCol || lonCol === '__none') {
        err.textContent = 'Select both Latitude and Longitude columns for Point features.';
        err.style.display = '';
        return;
      }
    }

    importBtn.disabled = true;
    backBtn.disabled = true;

    let features;
    try {
      features = buildFeatures(ctx, mapping, { latCol, lonCol });
    } catch (e) {
      err.textContent = e.message || String(e);
      err.style.display = '';
      importBtn.disabled = false;
      backBtn.disabled = false;
      return;
    }

    try {
      const result = await api.importFeatures(ctx.layer.name, features);
      renderStep3(ctx, result);
    } catch (e) {
      const msg = e instanceof ApiError ? `${e.code}: ${e.message}` : (e?.message || 'Import failed');
      err.textContent = msg;
      err.style.display = '';
      importBtn.disabled = false;
      backBtn.disabled = false;
    }
  });

  const rowCount = ctx.source === 'geojson' ? ctx.features.length : ctx.rows.length;

  const mappingTable = mappingRows.length
    ? el('table', { class: 'pb-table pb-import-mapping' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', {}, 'Source column'),
          el('th', {}, 'Target column')
        ])]),
        el('tbody', {}, mappingRows)
      ])
    : el('div', { class: 'pb-field-hint' },
        ctx.source === 'geojson'
          ? 'No property keys found in source features.'
          : 'No columns to map.');

  setBody(ctx, [
    el('div', { class: 'pb-modal-body pb-import-step' }, [
      el('div', { class: 'pb-import-summary' },
        `Parsed ${rowCount} ${rowCount === 1 ? 'row' : 'rows'} from ${ctx.filename}.`),
      mappingTable,
      geomNote,
      err
    ]),
    el('div', { class: 'pb-modal-footer' }, [
      backBtn,
      el('div', { style: { flex: '1' } }),
      cancelBtn,
      importBtn
    ])
  ]);
}

function buildFeatures(ctx, mapping, { latCol, lonCol }) {
  const layer = ctx.layer;
  const isTable = layer.geometry_type === 'Table';
  const features = [];

  if (ctx.source === 'geojson') {
    for (const f of ctx.features) {
      const props = (f && f.properties && typeof f.properties === 'object') ? f.properties : {};
      const mapped = {};
      for (const [srcCol, targetCol] of Object.entries(mapping)) {
        mapped[targetCol] = props[srcCol];
      }
      features.push({
        geometry: isTable ? null : (f && f.geometry ? f.geometry : null),
        properties: mapped
      });
    }
    return features;
  }

  // CSV
  for (const row of ctx.rows) {
    const mapped = {};
    for (const [srcCol, targetCol] of Object.entries(mapping)) {
      mapped[targetCol] = row[srcCol];
    }
    let geometry = null;
    if (!isTable && latCol && lonCol) {
      const lat = parseFloat(row[latCol]);
      const lon = parseFloat(row[lonCol]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        geometry = { type: 'Point', coordinates: [lon, lat] };
      } else {
        // Leave geometry null — API will still insert. Mismatched rows would be caught
        // by API's strict check, but null geometry is accepted. Mark as undefined instead
        // to keep clean? We push null — api treats null as "no geometry" and inserts.
        geometry = null;
      }
    }
    features.push({ geometry, properties: mapped });
  }
  return features;
}

// ===== Step 3 — Summary =====

function renderStep3(ctx, result) {
  const { inserted, skipped, skippedDetails } = result;

  const summary = el('div', { class: 'pb-import-summary' },
    `Inserted ${inserted} · Skipped ${skipped}`);

  let detailsNode = null;
  if (skipped > 0 && Array.isArray(skippedDetails) && skippedDetails.length) {
    const shown = skippedDetails.slice(0, 50);
    const list = el('ul', { class: 'pb-import-skiplist' },
      shown.map((d) => el('li', {}, `Row ${d.row}: ${d.reason}`))
    );
    const extra = skippedDetails.length > shown.length
      ? el('div', { class: 'pb-field-hint' }, `…and ${skippedDetails.length - shown.length} more not shown.`)
      : null;
    detailsNode = el('details', { class: 'pb-details', open: true }, [
      el('summary', {}, `Show ${skippedDetails.length} skipped row${skippedDetails.length === 1 ? '' : 's'}`),
      el('div', { class: 'pb-import-skipbox' }, [list, extra].filter(Boolean))
    ]);
  }

  const closeBtn = el('button', { type: 'button', class: 'btn-primary' }, 'Close');
  closeBtn.addEventListener('click', () => {
    closeModal();
    try { ctx.onDone && ctx.onDone(); } catch {}
  });

  if (inserted > 0) toast(`Imported ${inserted} feature${inserted === 1 ? '' : 's'}`, 'success');
  else if (skipped > 0) toast(`No rows inserted — ${skipped} skipped`, 'error');

  setBody(ctx, [
    el('div', { class: 'pb-modal-body pb-import-step' }, [summary, detailsNode].filter(Boolean)),
    el('div', { class: 'pb-modal-footer' }, [closeBtn])
  ]);
}
