// prototype-backend — Feature detail shell (Phase 1 redesign, renamed Phase 4).
// Hero (always visible) replaces the Overview tab. Tabs: Schema · Data · Map.
//
// "Feature" here is the object class (user-facing name). Internal identifiers
// (`layer`, `layers`) are preserved to keep the API contract stable.

import * as api from './api.js';
import { el, toast, formatRelativeTime, inlineEditable } from './utils.js';
import { sridName } from './constants.js';
import { bus } from './state.js';
import { renderBreadcrumb } from './app.js';
import * as schemaEditor from './schema-editor.js';
import * as dataGrid from './data-grid.js';
import * as mapPreview from './map-preview.js';

const REST_BASE = 'https://<project>.supabase.co/rest/v1';
const ANON_KEY = '<ANON_KEY>';

let root = null;
let currentLayer = null;
let currentTab = 'schema';
let tabHost = null;
let heroHost = null;
let usedByHost = null;
let activeChildView = null;
let busUnsub = [];
let productsUsing = [];

const TABS_SPATIAL = [
  { id: 'schema', label: 'Schema' },
  { id: 'data', label: 'Data' },
  { id: 'map', label: 'Map' }
];
const TABS_TABLE = TABS_SPATIAL.filter((t) => t.id !== 'map');
const TAB_LABEL = { schema: 'Schema', data: 'Data', map: 'Map' };

export async function mount(container, params) {
  root = container;
  currentTab = params.tab || 'schema';

  root.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><div class="loading-text">Loading layer…</div></div>';

  try {
    currentLayer = await api.getLayer(params.layerName);
  } catch (err) {
    root.innerHTML = '';
    renderBreadcrumb([{ label: 'Layers', href: '#/features' }, { label: params.layerName }]);
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
  updateBreadcrumb();
  renderTab();

  const refresh = async () => {
    try {
      currentLayer = await api.getLayer(currentLayer.name);
      renderHero();
    } catch {}
  };
  busUnsub.push(bus.on('schema:changed', refresh));
  busUnsub.push(bus.on('data:changed', refresh));
  busUnsub.push(bus.on('layer:updated', refresh));
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
  usedByHost = null;
  productsUsing = [];
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

export function updateBreadcrumb() {
  if (!currentLayer) return;
  const crumbs = [
    { label: 'Layers', href: '#/features' },
    { label: currentLayer.name, href: `#/features/${encodeURIComponent(currentLayer.name)}` },
    { label: TAB_LABEL[currentTab] || currentTab }
  ];
  renderBreadcrumb(crumbs);
}

// ===== Shell =====

function renderShell() {
  root.innerHTML = '';

  heroHost = el('section', { class: 'pb-hero', id: 'pb-layer-hero' });
  root.appendChild(heroHost);
  renderHero();

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
  root.appendChild(tabsBar);

  tabHost = el('div', { class: 'pb-tab-host' });
  root.appendChild(tabHost);
}

function renderHero() {
  if (!heroHost) return;
  heroHost.innerHTML = '';
  // `fc` is the record count for this feature — kept the shortened name for
  // diff-friendliness; display label below says "record(s)".
  const fc = Number(currentLayer.feature_count ?? 0);

  // Inline-editable title.
  const titleEditor = inlineEditable({
    value: currentLayer.title || currentLayer.name,
    placeholder: 'Layer title',
    className: 'pb-hero-title-edit',
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

  // REST endpoint card
  const url = `${REST_BASE}/${currentLayer.name}`;
  const copyBtn = el('button', { type: 'button', class: 'btn-secondary', title: 'Copy URL' }, [
    el('span', { class: 'material-symbols-outlined', style: { fontSize: '16px' } }, 'content_copy'),
    ' Copy'
  ]);
  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); toast('URL copied', 'success'); }
    catch { toast('Copy failed', 'error'); }
  });
  const curlExample = `curl -H "apikey: ${ANON_KEY}" "${url}?limit=10"`;

  const restCard = el('section', { class: 'pb-card pb-card--padded' }, [
    el('div', { class: 'pb-card-header' }, 'REST endpoint'),
    el('div', { class: 'pb-card-body' }, [
      el('div', { class: 'pb-url-row' }, [
        el('code', { class: 'pb-code pb-code--inline' }, url),
        copyBtn
      ]),
      el('details', { class: 'pb-details' }, [
        el('summary', {}, 'curl example'),
        el('pre', { class: 'pb-code' }, curlExample)
      ])
    ])
  ]);

  // Used-by card (reverse link to data products).
  const usedByChips = productsUsing.map((p) =>
    el('a', { href: `#/products/${encodeURIComponent(p.slug)}`, class: 'pb-chip' }, [
      el('span', { class: 'material-symbols-outlined', style: { fontSize: '14px' } }, 'apps'),
      ' ',
      p.name || p.slug
    ])
  );
  const usedByCard = el('section', { class: 'pb-card pb-card--padded' }, [
    el('div', { class: 'pb-card-header' }, 'Used by'),
    el('div', { class: 'pb-card-body' }, [
      usedByChips.length
        ? el('div', { class: 'pb-chip-row' }, usedByChips)
        : el('div', { class: 'pb-muted' }, 'No data products consume this layer yet.')
    ])
  ]);

  // Streamlined hero: title + geometry badge on line 1; stats line (record
  // count + updated) under the title; description on line 3. Technical
  // details (internal name, SRID/CRS, created, access hints) stay folded
  // into a collapsed <details> block below.
  const statsLine = el('div', { class: 'pb-hero-stats' }, [
    `${fc.toLocaleString()} record${fc === 1 ? '' : 's'}`,
    ' · ',
    `updated ${formatRelativeTime(currentLayer.updated_at)}`
  ]);

  const accessHints = [
    currentLayer.metadata?.access_rights ? `Access: ${currentLayer.metadata.access_rights}` : null,
    currentLayer.metadata?.license ? `License: ${currentLayer.metadata.license}` : null
  ].filter(Boolean).join(' · ') || '—';

  const techGrid = el('dl', { class: 'pb-hero-technical-grid' }, [
    el('dt', {}, 'Internal name'), el('dd', {}, el('span', { class: 'pb-name-mono' }, currentLayer.name)),
    el('dt', {}, 'SRID'),          el('dd', {}, currentLayer.srid != null ? String(currentLayer.srid) : '—'),
    el('dt', {}, 'CRS'),           el('dd', {}, currentLayer.srid != null ? (sridName(currentLayer.srid) || '—') : '—'),
    el('dt', {}, 'Created'),       el('dd', {}, `${formatRelativeTime(currentLayer.created_at)}`),
    el('dt', {}, 'Access hints'),  el('dd', {}, accessHints)
  ]);

  const techDetails = el('details', { class: 'pb-hero-technical' }, [
    el('summary', {}, 'Technical details'),
    techGrid
  ]);

  const heroHead = el('div', { class: 'pb-hero-head' }, [
    el('div', { style: { flex: '1', minWidth: '0' } }, [
      el('div', { class: 'pb-hero-titlebar' }, [
        el('h1', { class: 'pb-hero-title' }, [titleEditor]),
        el('span', { class: 'pb-badge' }, currentLayer.geometry_type)
      ]),
      statsLine,
      el('div', { class: 'pb-hero-desc' }, [descEditor]),
      techDetails
    ])
  ]);

  heroHost.appendChild(heroHead);
  heroHost.appendChild(el('div', { class: 'pb-hero-cards' }, [restCard, usedByCard]));
  heroHost.appendChild(renderMetadataCard());
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

  const caption = el('div', { class: 'pb-meta-caption' }, [
    'Based on ISO 19115 core + DCAT. ',
    el('a', {
      href: 'https://www.iso.org/standard/53798.html',
      target: '_blank',
      rel: 'noopener noreferrer'
    }, 'Learn more ↗')
  ]);

  return el('section', { class: 'pb-card pb-card--padded pb-metadata-card' }, [
    el('div', { class: 'pb-card-header' }, [
      'Metadata',
      el('span', { class: 'pb-meta-summary-hint' }, ` · ${fieldsSet} field${fieldsSet === 1 ? '' : 's'} set`)
    ]),
    el('div', { class: 'pb-card-body' }, [
      caption,
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
  updateBreadcrumb();

  switch (currentTab) {
    case 'schema':
      schemaEditor.mount(tabHost, { layer: currentLayer });
      activeChildView = schemaEditor;
      break;
    case 'data':
      dataGrid.mount(tabHost, { layer: currentLayer });
      activeChildView = dataGrid;
      break;
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
