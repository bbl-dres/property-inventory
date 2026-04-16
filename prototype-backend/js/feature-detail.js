// prototype-backend — Layer detail shell (Phase 1 redesign, renamed Phase 4).
// Hero (always visible) replaces the Overview tab. Tabs: Schema · Data · Map.
//
// "Layer" here is the user-facing object class name. Internal identifiers
// (`layer`, `layers`) are preserved to keep the API contract stable.

import * as api from './api.js';
import { el, toast, relativeTimeNode, inlineEditable } from './utils.js';
import { sridName } from './constants.js';
import { bus } from './state.js';
import { renderViewHeader, metaStack } from './app.js';
import * as schemaEditor from './schema-editor.js';
import * as dataGrid from './data-grid.js';
import * as mapPreview from './map-preview.js';

const REST_BASE = 'https://<project>.supabase.co/rest/v1';

// Format a SRID into a human-readable label used in the hero badge row.
// Known codes show the EPSG code + a short CRS alias; unknown codes fall
// back to the bare "EPSG:<code>" form.
function formatSrid(srid) {
  const code = Number(srid);
  if (code === 4326) return 'EPSG:4326 (WGS 84)';
  if (code === 2056) return 'EPSG:2056 (LV95)';
  return `EPSG:${srid}`;
}

let root = null;
let currentLayer = null;
let currentTab = 'schema';
let tabHost = null;
let heroHost = null;
let apiHost = null;
let bottomHost = null;
let usedByHost = null;
let activeChildView = null;
let busUnsub = [];
let productsUsing = [];
// Id of a feature the user clicked on the Map tab; consumed once by the
// next Data-tab mount to auto-open its side panel. See bus listener below.
let pendingFocusId = null;

const TABS_SPATIAL = [
  { id: 'schema', label: 'Schema' },
  { id: 'data', label: 'Data' },
  { id: 'map', label: 'Map' }
];
const TABS_TABLE = TABS_SPATIAL.filter((t) => t.id !== 'map');

export async function mount(container, params) {
  root = container;
  currentTab = params.tab || 'schema';

  root.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><div class="loading-text">Loading layer…</div></div>';

  try {
    currentLayer = await api.getLayer(params.layerName);
  } catch (err) {
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'empty-state' }, [
      el('span', { class: 'material-symbols-outlined' }, 'error'),
      el('div', { class: 'empty-state-title' }, 'Layer not found'),
      el('div', { class: 'empty-state-description' }, `"${params.layerName}" does not exist.`)
    ]));
    return;
  }

  try { productsUsing = await api.listProductsUsingLayer(currentLayer.name); }
  catch { productsUsing = []; }

  renderShell();
  renderTab();

  const refresh = async () => {
    try {
      currentLayer = await api.getLayer(currentLayer.name);
      renderHero();
    } catch (err) {
      // Bus-driven auto-refresh (schema:changed / data:changed / layer:updated).
      // Silent catch here meant the user saw no feedback if the refetch failed;
      // under a real Supabase adapter this would hide genuine network errors.
      toast(err?.message || 'Failed to refresh layer', 'error');
    }
  };
  busUnsub.push(bus.on('schema:changed', refresh));
  busUnsub.push(bus.on('data:changed', refresh));
  busUnsub.push(bus.on('layer:updated', refresh));

  // Map tab emits `map:featureFocus` when the user clicks "Open in Data"
  // in a popup. We stash the id and navigate to the Data tab — the
  // next `renderTab('data')` consumes and clears it, handing it to the
  // data grid to open the side panel.
  busUnsub.push(bus.on('map:featureFocus', (featureId) => {
    if (!currentLayer) return;
    pendingFocusId = featureId;
    if (currentTab === 'data') {
      // Already on Data — remount so the grid picks up the focus hint.
      renderTab();
    } else {
      location.hash = `#/features/${encodeURIComponent(currentLayer.name)}?tab=data`;
    }
  }));
}

export function unmount() {
  if (activeChildView?.unmount) { try { activeChildView.unmount(); } catch {} }
  for (const off of busUnsub) { try { off(); } catch {} }
  busUnsub = [];
  activeChildView = null;
  root = null;
  currentLayer = null;
  tabHost = null;
  heroHost = null;
  apiHost = null;
  bottomHost = null;
  usedByHost = null;
  productsUsing = [];
  pendingFocusId = null;
}

export function onTabChange(tab) {
  const next = tab || 'schema';
  if (next === currentTab) return;
  currentTab = next;
  if (root) {
    for (const a of root.querySelectorAll('.pb-subtab')) {
      const active = a.dataset.tab === currentTab;
      a.classList.toggle('is-active', active);
      a.setAttribute('aria-selected', active ? 'true' : 'false');
    }
  }
  renderTab();
}

// ===== Shell =====

function renderShell() {
  root.innerHTML = '';

  heroHost = el('section', { class: 'pb-layer-hero', id: 'pb-layer-hero' });
  root.appendChild(heroHost);

  const tabs = currentLayer.geometry_type === 'Table' ? TABS_TABLE : TABS_SPATIAL;
  const tabsBar = el('nav', { class: 'pb-subtabs', role: 'tablist', 'aria-label': 'Layer sections' }, tabs.map((t) =>

    el('a', {
      href: `#/features/${encodeURIComponent(currentLayer.name)}?tab=${t.id}`,
      class: 'pb-subtab' + (t.id === currentTab ? ' is-active' : ''),
      role: 'tab',
      'aria-selected': t.id === currentTab ? 'true' : 'false',
      dataset: { tab: t.id }
    }, t.label)
  ));
  tabHost = el('div', { class: 'pb-tab-host' });
  const tabsWrap = el('div', { class: 'pb-tabs-wrap' }, [tabsBar, tabHost]);
  root.appendChild(tabsWrap);

  apiHost = el('section', { class: 'pb-layer-api' });
  root.appendChild(apiHost);

  bottomHost = el('section', { class: 'pb-layer-bottom' });
  root.appendChild(bottomHost);

  // Render hero last so apiHost/bottomHost already exist when renderHero
  // tries to populate them.
  renderHero();
}

function renderHero() {
  if (!heroHost) return;
  heroHost.innerHTML = '';
  // `fc` is the record count for this layer — kept the shortened name for
  // diff-friendliness; display label below says "record(s)".
  const fc = Number(currentLayer.feature_count ?? 0);

  // Inline-editable title.
  const titleEditor = inlineEditable({
    value: currentLayer.title || currentLayer.name,
    placeholder: 'Layer title',
    onSave: async (next) => {
      await api.updateLayerMeta(currentLayer.name, { title: next });
      currentLayer.title = next;
      bus.emit('layer:updated');
      toast('Saved', 'success');
    }
  });

  const descEditor = inlineEditable({
    value: currentLayer.description || '',
    placeholder: 'Add a description…',
    multiline: true,
    onSave: async (next) => {
      await api.updateLayerMeta(currentLayer.name, { description: next });
      currentLayer.description = next;
      bus.emit('layer:updated');
      toast('Saved', 'success');
    }
  });

  // REST endpoint card.
  // The URL here is an illustrative template — in MVP the app talks to an
  // in-browser mock, so there is no live endpoint to call. We keep the
  // copy-URL button (handy when wiring the real backend) and show a block
  // of example curls below as documentation only.
  const url = `${REST_BASE}/${currentLayer.name}`;
  const copyBtn = el('button', { type: 'button', class: 'btn-secondary', title: 'Copy URL' }, [
    el('span', { class: 'material-symbols-outlined pb-icon-sm' }, 'content_copy'),
    ' Copy'
  ]);
  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); toast('URL copied', 'success'); }
    catch { toast('Copy failed', 'error'); }
  });

  const curlExamples = [
    '# List (first 50)',
    `curl '${url}?limit=50'`,
    '',
    '# Bounding box query (bbox=west,south,east,north)',
    `curl '${url}?bbox=8.5,47.3,8.6,47.4'`,
    '',
    '# Field selection',
    `curl '${url}?select=id,parcel_no,area_m2'`,
    '',
    '# Single record by id',
    `curl '${url}?id=eq.{uuid}'`
  ].join('\n');

  const apiCard = el('section', { class: 'pb-card pb-card--padded' }, [
    el('div', { class: 'pb-card-header' }, 'API & usage'),
    el('div', { class: 'pb-card-body' }, [
      el('div', { class: 'pb-url-row' }, [
        el('code', { class: 'pb-code pb-code--inline' }, url),
        copyBtn
      ]),
      el('div', { class: 'pb-field-hint', style: { marginTop: '4px' } },
        'Example only — not a live endpoint. Wire up a Supabase/PostgREST project to call these paths.'),
      el('details', { class: 'pb-details' }, [
        el('summary', {}, 'curl examples (reference only)'),
        el('pre', { class: 'pb-code' }, curlExamples)
      ])
    ])
  ]);

  // Used-by card (reverse link to Maps & Apps).
  const usedByChips = productsUsing.map((p) =>
    el('a', { href: `#/maps/${encodeURIComponent(p.slug)}`, class: 'pb-chip' }, [
      el('span', { class: 'material-symbols-outlined pb-icon-xs' }, 'apps'),
      ' ',
      p.name || p.slug
    ])
  );
  const usedByCard = el('section', { class: 'pb-card pb-card--padded' }, [
    el('div', { class: 'pb-card-header' }, 'Used by'),
    el('div', { class: 'pb-card-body' }, [
      usedByChips.length
        ? el('div', { class: 'pb-chip-row' }, usedByChips)
        : el('div', { class: 'pb-muted' }, 'No maps or apps consume this layer yet.')
    ])
  ]);

  // Title is the inline-editable layer title with a geometry-type badge.
  const titleNode = el('span', { class: 'pb-title-row' }, [
    titleEditor,
    el('span', { class: 'pb-badge' }, currentLayer.geometry_type)
  ]);

  // Subtitle: geometry · records · SRID on the top line, updated-at on a
  // smaller secondary line. Uses the shared `metaStack` helper so every
  // detail view in the app renders this region identically.
  const isTable = currentLayer.geometry_type === 'Table';
  const recordsLabel = `${fc.toLocaleString()} record${fc === 1 ? '' : 's'}`;
  const metaTokens = isTable
    ? ['Table', recordsLabel]
    : [currentLayer.geometry_type, recordsLabel, formatSrid(currentLayer.srid)];
  const subtitleNode = metaStack({
    meta: metaTokens,
    secondary: el('span', {}, ['Updated ', relativeTimeNode(currentLayer.updated_at)])
  });

  // Unified view-header replaces the old .pb-hero top block. The REST,
  // Used-by, and Metadata cards still render below as siblings.
  const header = renderViewHeader({
    breadcrumb: [
      { label: 'Layers', href: '#/features' },
      { label: currentLayer.title || currentLayer.name }
    ],
    title: titleNode,
    subtitle: subtitleNode,
    description: descEditor
  });
  heroHost.appendChild(header);

  if (apiHost) {
    apiHost.innerHTML = '';
    apiHost.appendChild(el('div', { class: 'pb-card-grid pb-card-grid--2col' }, [apiCard, usedByCard]));
  }

  if (bottomHost) {
    bottomHost.innerHTML = '';
    bottomHost.appendChild(renderMetadataCard());
  }
}

// ===== Metadata card =====
//
// Field groups follow a lightweight subset of ISO 19115 (geographic info
// metadata) + DCAT (dataset catalog vocabulary). We only implement the
// "core" fields that are genuinely useful for a small GIS admin; full
// conformance would require a much larger record.
//
//   - Identification (ISO 19115 MD_DataIdentification):
//       title, description, tags/keywords, topic_category
//   - Distribution & rights (DCAT):
//       license (SPDX-friendly), attribution, access_rights
//   - Responsibility (ISO 19115 CI_ResponsibleParty):
//       contact (role: point-of-contact), owner (publisher)
//   - Currency / quality (ISO 19115 lineage + MD_MaintenanceInformation):
//       update_frequency (aligns with MD_MaintenanceFrequencyCode),
//       lineage, temporal_extent (start/end ISO dates)

const UPDATE_FREQ_OPTIONS = ['', 'daily', 'weekly', 'monthly', 'yearly', 'irregular', 'notPlanned'];
const TOPIC_CATEGORIES = [
  '', 'boundaries', 'buildings', 'transportation', 'utilities',
  'environment', 'planning', 'economy', 'society', 'imagery', 'other'
];
const ACCESS_RIGHTS = ['', 'public', 'restricted', 'internal'];
const LICENSE_SUGGESTIONS = ['CC-BY-4.0', 'CC0-1.0', 'MIT', 'ODbL-1.0', 'proprietary'];

function renderMetadataCard() {
  const meta = currentLayer.metadata || {};

  const saveMeta = async (patch) => {
    await api.updateLayerMeta(currentLayer.name, { metadata: patch });
    currentLayer.metadata = { ...(currentLayer.metadata || {}), ...patch };
    bus.emit('layer:updated');
    toast('Saved', 'success');
  };

  // ---- Editors ----
  const tagsStr = Array.isArray(meta.tags) ? meta.tags.join(', ') : '';
  const tagsEditor = inlineEditable({
    value: tagsStr,
    placeholder: 'Add tags (comma-separated)…',
    onSave: async (next) => {
      const arr = next.split(',').map((t) => t.trim()).filter(Boolean);
      await saveMeta({ tags: arr });
    }
  });
  const tagChips = (meta.tags && meta.tags.length)
    ? el('div', { class: 'pb-chip-row', style: { marginTop: '4px' } },
        meta.tags.map((t) => el('span', { class: 'pb-chip' }, t)))
    : null;

  const licenseEditor = inlineEditable({
    value: meta.license || '',
    placeholder: `e.g. ${LICENSE_SUGGESTIONS.join(', ')}`,
    onSave: (next) => saveMeta({ license: next })
  });
  const contactEditor = inlineEditable({
    value: meta.contact || '',
    placeholder: 'e.g. data@example.ch',
    onSave: (next) => saveMeta({ contact: next })
  });
  const ownerEditor = inlineEditable({
    value: meta.owner || '',
    placeholder: 'Publishing organization',
    onSave: (next) => saveMeta({ owner: next })
  });
  const attributionEditor = inlineEditable({
    value: meta.attribution || '',
    placeholder: '© Source / Provider',
    onSave: (next) => saveMeta({ attribution: next })
  });
  const lineageEditor = inlineEditable({
    value: meta.lineage || '',
    placeholder: 'How was this data produced? Sources, processing steps…',
    multiline: true,
    onSave: (next) => saveMeta({ lineage: next })
  });
  const spatialExtentEditor = inlineEditable({
    value: meta.spatial_extent_note || '',
    placeholder: 'e.g. Canton of Zurich',
    onSave: (next) => saveMeta({ spatial_extent_note: next })
  });

  // <select> editor factory for enum fields (topic_category, access_rights,
  // update_frequency). Swaps between a static view and a <select>.
  const selectEditor = (currentValue, options, field, placeholder) => {
    const view = el('span', {
      class: 'pb-inline-value' + (currentValue ? '' : ' is-placeholder'),
      tabindex: '0', role: 'button', 'aria-label': 'Click to edit'
    }, currentValue || placeholder);
    const edit = () => {
      const sel = el('select', { class: 'pb-inline-input' },
        options.map((v) =>
          el('option', { value: v, selected: v === (currentValue || '') ? true : undefined },
            v || '— unset —')));
      const wrap = view.parentElement;
      wrap.replaceChild(sel, view);
      sel.focus();
      const commit = async () => {
        const next = sel.value || null;
        try { await saveMeta({ [field]: next }); currentValue = next; meta[field] = next; }
        catch (err) { toast(err?.message || 'Save failed', 'error'); }
        view.textContent = next || placeholder;
        view.classList.toggle('is-placeholder', !next);
        wrap.replaceChild(view, sel);
      };
      sel.addEventListener('change', commit);
      sel.addEventListener('blur', commit);
    };
    view.addEventListener('click', edit);
    view.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); edit(); }
    });
    return el('span', { class: 'pb-inline-edit' }, [view]);
  };

  const topicEditor = selectEditor(meta.topic_category || '', TOPIC_CATEGORIES, 'topic_category', 'Set topic category…');
  const accessEditor = selectEditor(meta.access_rights || '', ACCESS_RIGHTS, 'access_rights', 'Set access rights…');
  const freqEditor = selectEditor(meta.update_frequency || '', UPDATE_FREQ_OPTIONS, 'update_frequency', 'Set update frequency…');

  // Temporal extent — two date inputs.
  const te = meta.temporal_extent || {};
  const teStart = el('input', { type: 'date', class: 'pb-inline-input', value: te.start || '', style: { width: 'auto', display: 'inline-block' } });
  const teEnd = el('input', { type: 'date', class: 'pb-inline-input', value: te.end || '', style: { width: 'auto', display: 'inline-block' } });
  const commitTemporal = async () => {
    const s = teStart.value || null;
    const e = teEnd.value || null;
    try { await saveMeta({ temporal_extent: (s || e) ? { start: s, end: e } : null }); }
    catch (err) { toast(err?.message || 'Save failed', 'error'); }
  };
  teStart.addEventListener('change', commitTemporal);
  teEnd.addEventListener('change', commitTemporal);
  const temporalRow = el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } }, [
    el('span', { class: 'pb-muted', style: { fontSize: '12px' } }, 'Start'), teStart,
    el('span', { class: 'pb-muted', style: { fontSize: '12px' } }, 'End'), teEnd
  ]);

  // ---- Layout helpers ----
  const kv = (label, valueNode, hint) => el('div', { class: 'pb-meta-row' }, [
    el('dt', { class: 'pb-meta-label', title: hint || '' }, label),
    el('dd', { class: 'pb-meta-value' }, [valueNode])
  ]);

  const section = (summary, ...children) =>
    el('details', { class: 'pb-meta-section' }, [
      el('summary', {}, summary),
      el('div', { class: 'pb-meta-section-body' }, [
        el('dl', { class: 'pb-meta-dl' }, children)
      ])
    ]);

  const fieldsSet = countMetadataFields(meta);

  const srid = currentLayer.srid;
  const technicalSection = section('Technical',
    kv('Internal name', el('span', { class: 'pb-name-mono' }, currentLayer.name)),
    kv('SRID', srid != null ? String(srid) : '—'),
    kv('CRS', srid != null ? (sridName(srid) || '—') : '—'),
    kv('Created', relativeTimeNode(currentLayer.created_at))
  );

  return el('section', { class: 'pb-card pb-card--padded pb-metadata-card' }, [
    el('div', { class: 'pb-card-header' }, [
      'Metadata',
      el('span', { class: 'pb-meta-summary-hint' }, ` · ${fieldsSet} field${fieldsSet === 1 ? '' : 's'} set`)
    ]),
    el('div', { class: 'pb-card-body' }, [
      technicalSection,
      section('Identification',
        kv('Tags', el('div', {}, [tagsEditor, tagChips].filter(Boolean)),
           'ISO 19115 · keywords'),
        kv('Topic category', topicEditor,
           'ISO 19115 MD_TopicCategoryCode (simplified)')
      ),
      section('Rights & access',
        kv('License', licenseEditor, 'DCAT · SPDX identifiers preferred'),
        kv('Attribution', attributionEditor, 'DCAT · attribution statement'),
        kv('Access rights', accessEditor, 'DCAT dct:accessRights')
      ),
      section('Responsibility',
        kv('Contact', contactEditor, 'ISO 19115 CI_ResponsibleParty · point of contact'),
        kv('Owner', ownerEditor, 'ISO 19115 · publishing organization')
      ),
      section('Currency & lineage',
        kv('Update frequency', freqEditor, 'ISO 19115 MD_MaintenanceFrequencyCode'),
        kv('Lineage', lineageEditor, 'ISO 19115 · statement of origin / processing'),
        kv('Temporal extent', temporalRow, 'ISO 19115 EX_TemporalExtent · valid period'),
        kv('Spatial extent note', spatialExtentEditor, 'ISO 19115 · free-text spatial coverage')
      )
    ])
  ]);
}

// ===== Tab dispatch =====

function renderTab() {
  if (!tabHost) return;
  if (activeChildView?.unmount) { try { activeChildView.unmount(); } catch {} }
  activeChildView = null;
  tabHost.innerHTML = '';

  // API/Used-by cards and the metadata card live outside `tabHost` so they
  // persist across tab switches, but conceptually they describe the layer
  // itself, not the record set. Surface them only on the Schema tab — on
  // Data and Map the focus is the record-level work, and these cards
  // compete with it.
  const showAncillary = currentTab === 'schema';
  if (apiHost) apiHost.hidden = !showAncillary;
  if (bottomHost) bottomHost.hidden = !showAncillary;

  switch (currentTab) {
    case 'schema':
      schemaEditor.mount(tabHost, { layer: currentLayer });
      activeChildView = schemaEditor;
      break;
    case 'data': {
      // `pendingFocusId` is set by a `map:featureFocus` emit from the Map
      // tab. We hand it to the grid once and clear it, so a subsequent
      // tab switch doesn't re-focus the same record.
      const focusId = pendingFocusId;
      pendingFocusId = null;
      dataGrid.mount(tabHost, { layer: currentLayer, focusFeatureId: focusId });
      activeChildView = dataGrid;
      break;
    }
    case 'map':
      mapPreview.mount(tabHost, { layer: currentLayer });
      activeChildView = mapPreview;
      break;
    default:
      schemaEditor.mount(tabHost, { layer: currentLayer });
      activeChildView = schemaEditor;
  }
}

// Inline-edit helpers were de-duplicated into `inlineEditable` in utils.js.

// Count populated metadata fields across all sections. Non-empty scalars
// (strings/numbers/booleans), non-empty arrays, and objects with at least
// one populated key each count as 1.
function countMetadataFields(meta) {
  if (!meta || typeof meta !== 'object') return 0;
  let n = 0;
  for (const key of Object.keys(meta)) {
    const v = meta[key];
    if (v == null) continue;
    if (Array.isArray(v)) { if (v.length) n += 1; continue; }
    if (typeof v === 'object') {
      const hasAny = Object.values(v).some((x) => x != null && x !== '');
      if (hasAny) n += 1;
      continue;
    }
    if (typeof v === 'string') { if (v.trim() !== '') n += 1; continue; }
    // number, boolean (including explicit false) — treat as "set".
    n += 1;
  }
  return n;
}
