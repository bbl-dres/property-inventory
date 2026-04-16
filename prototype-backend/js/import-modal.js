// prototype-backend — Import flow modal (M5)
// Triggered from the Data tab toolbar. Three-step flow: pick file → map columns → run.
// Uses api.importFeatures(layerName, features[]) which does strict geometry-type validation.

import * as api from './api.js';
import { ApiError } from './api.js';
import { el, openModal, closeModal, toast, parseUpload } from './utils.js';

const FIVE_MB = 5 * 1024 * 1024;

// Formats the import flow recognises but cannot parse in the MVP (no WASM
// ogr2ogr in-browser, no shapefile/KML/GPX parser shipped). We show a friendly
// error with the exact ogr2ogr conversion command so a GIS user who tries the
// most likely file types gets unstuck immediately.
const UNSUPPORTED_FORMATS = {
  gpkg: {
    label: 'GeoPackage (.gpkg)',
    cmd: 'ogr2ogr -f GeoJSON output.geojson input.gpkg',
    note: null
  },
  shp: {
    label: 'Shapefile (.shp)',
    cmd: 'ogr2ogr -f GeoJSON output.geojson input.shp',
    note: 'Shapefiles are multi-file bundles (.shp + .shx + .dbf + .prj). Point ogr2ogr at the .shp and keep the sidecars next to it.'
  },
  zip: {
    label: 'Zipped Shapefile (.zip)',
    cmd: 'ogr2ogr -f GeoJSON output.geojson /vsizip/input.zip',
    note: 'A .zip is assumed to contain a Shapefile bundle (.shp/.shx/.dbf/.prj). Unzip first, or use the /vsizip/ prefix shown above.'
  },
  kml: {
    label: 'KML (.kml)',
    cmd: 'ogr2ogr -f GeoJSON output.geojson input.kml',
    note: null
  },
  gpx: {
    label: 'GPX (.gpx)',
    cmd: 'ogr2ogr -f GeoJSON output.geojson input.gpx',
    note: null
  }
};

function extOf(filename) {
  const m = /\.([a-z0-9]+)$/i.exec(filename || '');
  return m ? m[1].toLowerCase() : '';
}

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
    el('div', { class: 'pb-modal-header' }, 'Import records'),
    bodyNode
  ]);
}

function setBody(ctx, children) {
  ctx.modalBody.innerHTML = '';
  for (const c of children) if (c) ctx.modalBody.appendChild(c);
}

// ===== Step 1 — Pick file =====

function renderStep1(ctx) {
  // `accept` extended to include GPKG/Shapefile/KML/GPX so users can *pick*
  // those files — we then explicitly reject with an ogr2ogr conversion
  // recipe. Better UX than silently hiding them in the file picker.
  const fileInput = el('input', {
    type: 'file',
    accept: '.geojson,.json,.csv,.gpkg,.zip,.kml,.gpx,.shp',
    class: 'pb-import-file'
  });

  const err = el('div', { class: 'pb-field-error', style: { display: 'none' } });
  // Separate container for the unsupported-format guidance block (with a
  // copyable ogr2ogr command). Shown instead of the plain text error above
  // when the user picks a known-but-unsupported format.
  const unsupportedHost = el('div', { style: { display: 'none' } });

  const cancelBtn = el('button', { type: 'button', class: 'btn-secondary' }, 'Cancel');
  cancelBtn.addEventListener('click', () => closeModal());

  fileInput.addEventListener('change', async () => {
    err.style.display = 'none';
    unsupportedHost.style.display = 'none';
    unsupportedHost.innerHTML = '';
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    // Early reject unsupported-but-recognised formats with a copyable
    // ogr2ogr recipe. Uses the extension only; we don't sniff contents.
    const ext = extOf(file.name);
    if (UNSUPPORTED_FORMATS[ext]) {
      unsupportedHost.appendChild(renderUnsupportedBlock(ext));
      unsupportedHost.style.display = '';
      fileInput.value = '';
      return;
    }

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

  // Non-WGS84 SRID warning — the importer does NOT reproject, so a mismatch
  // between the file CRS and the layer CRS silently produces wrong-place
  // geometries. Warn prominently on step 1 so the user can convert first.
  const srid = Number(ctx.layer.srid);
  const needsSridWarning = Number.isFinite(srid) && srid !== 4326;
  const sridBanner = needsSridWarning ? renderSridWarningBanner(srid) : null;

  setBody(ctx, [
    el('div', { class: 'pb-modal-body pb-import-step' }, [
      sridBanner,
      el('p', { class: 'pb-field-hint' },
        `Append records to layer "${ctx.layer.name}" (${ctx.layer.geometry_type}). GeoJSON or CSV; skip-and-report validation.`),
      el('div', { class: 'pb-field' }, [
        el('label', {}, 'Select a file'),
        fileInput,
        el('div', { class: 'pb-field-hint' }, 'Accepts .geojson, .json, or .csv.')
      ]),
      err,
      unsupportedHost
    ].filter(Boolean)),
    el('div', { class: 'pb-modal-footer' }, [cancelBtn])
  ]);
}

/**
 * Dismissible warning banner shown at the top of import step 1 when the
 * target layer's SRID is anything other than 4326 (WGS 84). The importer
 * does NOT reproject, so the user needs to know their file must already
 * be in the layer's CRS.
 */
function renderSridWarningBanner(srid) {
  const dismissBtn = el('button', {
    type: 'button',
    class: 'pb-banner-close',
    'aria-label': 'Dismiss warning'
  }, [el('span', { class: 'material-symbols-outlined pb-icon-sm' }, 'close')]);
  const banner = el('div', {
    class: 'pb-banner pb-banner--warn',
    role: 'status'
  }, [
    el('span', { class: 'material-symbols-outlined pb-banner-icon' }, 'warning'),
    el('div', { class: 'pb-banner-text' },
      `This layer uses EPSG:${srid}. Ensure your file uses the same coordinate system — the importer will NOT reproject.`),
    dismissBtn
  ]);
  dismissBtn.addEventListener('click', () => banner.remove());
  return banner;
}

function renderUnsupportedBlock(ext) {
  const info = UNSUPPORTED_FORMATS[ext];
  const copyBtn = el('button', {
    type: 'button',
    class: 'btn-tertiary',
    title: 'Copy command'
  }, [
    el('span', { class: 'material-symbols-outlined pb-icon-xs' }, 'content_copy'),
    ' Copy'
  ]);
  const pre = el('pre', { class: 'pb-code', style: { margin: '0', flex: '1' } }, info.cmd);
  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(info.cmd); toast('Command copied', 'success'); }
    catch { toast('Copy failed', 'error'); }
  });

  return el('div', { class: 'pb-unsupported-block', style: {
    border: '1px solid var(--status-warning)',
    background: 'var(--status-warning-bg)',
    color: 'var(--status-warning-text)',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-sm, 4px)',
    marginTop: 'var(--space-2)'
  } }, [
    el('div', { style: { fontWeight: '600', marginBottom: '6px' } },
      `${info.label} import is not supported in MVP.`),
    el('div', { style: { marginBottom: '6px' } },
      'Convert with ogr2ogr, then upload the resulting GeoJSON file here:'),
    el('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start' } }, [pre, copyBtn]),
    info.note
      ? el('div', { class: 'pb-field-hint', style: { marginTop: '6px', color: 'var(--status-warning-text)' } }, info.note)
      : null
  ].filter(Boolean));
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
      `CSV import not supported for ${gt} layers — use GeoJSON.`);
    disableImport = true;
  } else if (ctx.source === 'csv' && isTable) {
    geomNote = el('div', { class: 'pb-field-hint' }, 'Non-spatial layer — no geometry required.');
  } else if (isTable) {
    geomNote = el('div', { class: 'pb-field-hint' }, 'Non-spatial layer — no geometry required.');
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
        err.textContent = 'Select both Latitude and Longitude columns for Point layers.';
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
