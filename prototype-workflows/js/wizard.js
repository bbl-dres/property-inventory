// wizard.js — swisstopo API logger, right-click enrichment, wizard mini-map,
//             address search, step navigation, bootstrap fetch.
// Provides: logApi, swisstopoIdentify, lastEnrichment, lastRightClickLngLat, showCtx,
//           wizardMap, wizardMarker, ensureWizardMap, highlightFeaturesAt, clearLabels,
//           showStep, pickAddress, searchDebounce, STEPS, currentStep
// Requires: bgMap, ctx, pin, mapView, coordsEl (map.js)
//           renderCRTable, getUrl, enterCRDetail, enterCreate, exitCreate,
//           body, setBodyPhaseClass, renderStamp, renderAbschluss (workflows.js)

// ===== swisstopo API query logger =====
const apiLog = document.getElementById('apiLog');
const apiLogTab = document.getElementById('apiLogTab');
const apiLogBody = document.getElementById('apiLogBody');
const apiLogBadge = document.getElementById('apiLogBadge');
const apiLogClear = document.getElementById('apiLogClear');
let apiLogCount = 0;
function logApi(label, url, result) {
  apiLogCount++;
  if (apiLogBadge) { apiLogBadge.textContent = apiLogCount; apiLogBadge.hidden = false; }
  if (apiLogBody.querySelector('.wf-api-empty')) apiLogBody.innerHTML = '';
  const entry = document.createElement('div');
  entry.className = 'wf-api-entry';
  const ok = result && !result.error;
  let summary = '';
  try {
    if (result && result.results) summary = result.results.length + ' Feature(s)';
    if (result && result.error) summary = 'Fehler: ' + result.error;
  } catch(e){}
  var tagSpan = document.createElement('span');
  tagSpan.className = 'tag ' + (ok ? 'ok' : (result ? 'err' : ''));
  tagSpan.textContent = label;
  var urlLink = document.createElement('a');
  urlLink.className = 'url';
  urlLink.href = url;
  urlLink.target = '_blank';
  urlLink.rel = 'noopener';
  urlLink.textContent = url.replace(/^https?:\/\/[^\/]+/, '');
  entry.appendChild(tagSpan);
  entry.appendChild(urlLink);
  if (summary) {
    var sumDiv = document.createElement('div');
    sumDiv.className = 'summary';
    sumDiv.textContent = summary;
    entry.appendChild(sumDiv);
  }
  apiLogBody.prepend(entry);
  if (window.DEBUG) console.log('[swisstopo]', label, url, result);
}
if (apiLogTab) apiLogTab.addEventListener('click', () => {
  const open = apiLog.dataset.open === '1';
  apiLog.dataset.open = open ? '0' : '1';
  apiLogTab.setAttribute('aria-expanded', open ? 'false' : 'true');
});
if (apiLogClear) apiLogClear.addEventListener('click', () => {
  apiLogBody.innerHTML = '<div class="wf-api-empty">Rechtsklick auf die Karte — Abfragen erscheinen hier.</div>';
  apiLogCount = 0; apiLogBadge.hidden = true;
});

// swisstopo identify helper (WGS84 lngLat → layer features). Optional tolerance in pixels.
async function swisstopoIdentify(label, lngLat, layerId, tolerance) {
  const delta = 0.0005; // ~50 m
  const url = new URL('https://api3.geo.admin.ch/rest/services/api/MapServer/identify');
  url.searchParams.set('geometry', lngLat.lng + ',' + lngLat.lat);
  url.searchParams.set('geometryType', 'esriGeometryPoint');
  url.searchParams.set('geometryFormat', 'geojson');
  url.searchParams.set('imageDisplay', '256,256,96');
  url.searchParams.set('mapExtent',
    (lngLat.lng - delta) + ',' + (lngLat.lat - delta) + ',' +
    (lngLat.lng + delta) + ',' + (lngLat.lat + delta));
  url.searchParams.set('tolerance', String(tolerance || 10));
  url.searchParams.set('layers', 'all:' + layerId);
  url.searchParams.set('returnGeometry', 'true');
  url.searchParams.set('sr', '4326');
  url.searchParams.set('lang', 'de');
  try {
    const res = await fetch(url);
    const data = await res.json();
    logApi(label, url.toString(), data);
    return data;
  } catch (err) {
    logApi(label, url.toString(), { error: err.message });
    return null;
  }
}

function fmtM2(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  if (isNaN(n)) return null;
  return n.toLocaleString('de-CH', { maximumFractionDigits: 0 }) + ' m²';
}

// ===== Map context menu: right-click handler =====
// DOM refs (mapView, ctx, pin, coordsEl) + outside-click/escape handlers live in map.js.
// Latest enrichment captured on right-click (consumed when entering Create)
let lastEnrichment = null;
let lastRightClickLngLat = null;

function showCtx(point, lngLat) {
  pin.style.left = point.x + 'px';
  pin.style.top  = point.y + 'px';
  pin.classList.add('shown');

  const menuW = 260, menuH = 120;
  const rect = mapView.getBoundingClientRect();
  const left = Math.min(point.x, rect.width  - menuW - 8);
  const top  = Math.min(point.y, rect.height - menuH - 8);
  ctx.style.left = left + 'px';
  ctx.style.top  = top + 'px';

  coordsEl.textContent = lngLat.lat.toFixed(5) + ', ' + lngLat.lng.toFixed(5);
  lastRightClickLngLat = { lng: lngLat.lng, lat: lngLat.lat };
  lastEnrichment = null;
  ctx.classList.add('open');

  // Eager fetch: stash nearest address + cadastre so the Create form can prefill instantly.
  Promise.all([
    swisstopoIdentify('GWR',      lngLat, 'ch.bfs.gebaeude_wohnungs_register'),
    swisstopoIdentify('Kataster', lngLat, 'ch.kantone.cadastralwebmap-farbe', 1)
  ]).then(([gwr, cad]) => {
    const gFeat = gwr && gwr.results && gwr.results[0];
    const cFeat = cad && cad.results && cad.results[0];
    const gP = gFeat ? (gFeat.properties || gFeat.attributes || {}) : null;
    const cP = cFeat ? (cFeat.properties || cFeat.attributes || {}) : null;
    lastEnrichment = { gwr: gP, cadastre: cP };
  });
}

// Right-click on the MapLibre map → context menu at canvas point + lngLat
bgMap.on('contextmenu', (e) => {
  e.preventDefault();
  showCtx(e.point, e.lngLat);
});

// ===== Wizard Step 1: address search + mini MapLibre map =====
const q = document.getElementById('q');
const results = document.getElementById('results');

// Lazily-initialised wizard map (Create pane)
let wizardMap = null;
let wizardMarker = null;
function ensureWizardMap() {
  if (wizardMap) { wizardMap.resize(); return; }
  wizardMap = new maplibregl.Map({
    container: 'wizardMap',
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    center: [8.23, 46.8],
    zoom: 7.3,
    canvasContextAttributes: { antialias: true }
  });
  wizardMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  wizardMap.on('load', () => {
    // Empty highlight sources for building footprint + parcel polygon
    const empty = { type: 'FeatureCollection', features: [] };
    wizardMap.addSource('hlParcel',   { type: 'geojson', data: empty });
    wizardMap.addSource('hlBuilding', { type: 'geojson', data: empty });
    wizardMap.addLayer({
      id: 'hlParcelFill', type: 'fill', source: 'hlParcel',
      paint: { 'fill-color': '#005ea8', 'fill-opacity': 0.08 }
    });
    wizardMap.addLayer({
      id: 'hlParcelLine', type: 'line', source: 'hlParcel',
      paint: { 'line-color': '#005ea8', 'line-width': 2 }
    });
    wizardMap.addLayer({
      id: 'hlBuildingFill', type: 'fill', source: 'hlBuilding',
      paint: { 'fill-color': '#c00', 'fill-opacity': 0.25 }
    });
    wizardMap.addLayer({
      id: 'hlBuildingLine', type: 'line', source: 'hlBuilding',
      paint: { 'line-color': '#c00', 'line-width': 2 }
    });
  });
}

// ---- polygon label placement (pole of inaccessibility via polylabel) ----
function ringArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length; i < n - 1; i++) {
    a += (ring[i+1][0] - ring[i][0]) * (ring[i+1][1] + ring[i][1]);
  }
  return Math.abs(a / 2);
}
function polygonLabelPoint(geometry, fallback) {
  if (!geometry) return fallback || null;
  if (geometry.type === 'Point') return geometry.coordinates;
  if (typeof polylabel !== 'function') return fallback || null;
  if (geometry.type === 'Polygon') {
    try { return polylabel(geometry.coordinates, 1e-5); } catch (e) { return fallback || null; }
  }
  if (geometry.type === 'MultiPolygon') {
    // Pick the largest polygon by outer-ring area, then run polylabel on it
    let biggest = geometry.coordinates[0];
    let biggestA = ringArea(biggest[0]);
    for (let i = 1; i < geometry.coordinates.length; i++) {
      const a = ringArea(geometry.coordinates[i][0]);
      if (a > biggestA) { biggestA = a; biggest = geometry.coordinates[i]; }
    }
    try { return polylabel(biggest, 1e-5); } catch (e) { return fallback || null; }
  }
  return fallback || null;
}

// ---- map label markers ----
let labelMarkers = [];
function clearLabels() {
  labelMarkers.forEach(m => m.remove());
  labelMarkers = [];
}
function addMapLabel(key, value, lngLat, cls, anchor) {
  if (!lngLat || !wizardMap) return;
  const el = document.createElement('div');
  el.className = 'wf-map-label ' + (cls || '');
  el.innerHTML = '<span class="lbl-key">' + key + '</span> = ' + value;
  const marker = new maplibregl.Marker({ element: el, anchor: anchor || 'center' })
    .setLngLat(lngLat)
    .addTo(wizardMap);
  labelMarkers.push(marker);
}

// Three parallel identify calls at the picked location:
//   - VECTOR25 Gebäude (swisstopo) → polygon footprint (highlight)
//   - ÖREB / cadastral webmap → parcel polygon + EGRID (highlight + verify)
//   - GWR → EGID + building attrs (verify)
const BUILDING_FOOTPRINT_LAYER = 'ch.swisstopo.vec25-gebaeude'; // VECTOR25 Gebäude (swisstopo), Switzerland-wide
async function highlightFeaturesAt(lngLat) {
  if (!wizardMap) return;
  const point = { lng: lngLat[0], lat: lngLat[1] };
  const [bldg, cad, gwr] = await Promise.all([
    swisstopoIdentify('VECTOR25 Gebäude', point, BUILDING_FOOTPRINT_LAYER),
    swisstopoIdentify('Kataster',          point, 'ch.kantone.cadastralwebmap-farbe', 1),
    swisstopoIdentify('GWR',               point, 'ch.bfs.gebaeude_wohnungs_register')
  ]);
  const bldgFeatures = (bldg && bldg.results) || [];
  const cadFeatures  = (cad  && cad.results)  || [];

  function applyHighlights() {
    const bSrc = wizardMap.getSource('hlBuilding');
    const pSrc = wizardMap.getSource('hlParcel');
    if (bSrc) bSrc.setData({ type: 'FeatureCollection', features: bldgFeatures });
    if (pSrc) pSrc.setData({ type: 'FeatureCollection', features: cadFeatures });

    const gP = gwr && gwr.results && gwr.results[0] && (gwr.results[0].properties || gwr.results[0].attributes);
    const egid  = gP && gP.egid  ? String(gP.egid)  : null;
    const egrid = gP && (gP.egrid || gP.egris_egrid) ? String(gP.egrid || gP.egris_egrid) : null;

    clearLabels();
    const bPoly = firstPolygonFeature(bldgFeatures);
    const cPoly = firstPolygonFeature(cadFeatures);

    // Compute label positions — use polygon centers when available,
    // otherwise offset from click point to avoid overlapping the marker.
    var egidPos  = bPoly ? polygonLabelPoint(bPoly.geometry, null) : null;
    var egridPos = cPoly ? polygonLabelPoint(cPoly.geometry, null) : null;
    var fallbackN = [lngLat[0], lngLat[1] + 0.00018]; // ~20 m north
    var fallbackS = [lngLat[0], lngLat[1] - 0.00018]; // ~20 m south
    if (!egidPos)  egidPos  = fallbackN;
    if (!egridPos) egridPos = fallbackS;

    // If both positions are very close, nudge apart vertically
    if (egid && egrid && Math.abs(egidPos[1] - egridPos[1]) < 0.00012) {
      var mid = (egidPos[1] + egridPos[1]) / 2;
      egidPos  = [egidPos[0],  mid + 0.00010];
      egridPos = [egridPos[0], mid - 0.00010];
    }

    // EGID (building): red label, anchored at bottom → sits above the point
    if (egid) {
      addMapLabel('EGID', egid, egidPos, 'building', 'bottom');
    }
    // EGRID (parcel): blue label, anchored at top → hangs below the point
    if (egrid) {
      addMapLabel('EGRID', egrid, egridPos, 'parcel', 'top');
    }
  }

  if (wizardMap.loaded()) {
    applyHighlights();
  } else {
    wizardMap.once('load', applyHighlights);
  }
}

function firstPolygonFeature(features) {
  if (!features) return null;
  for (const f of features) {
    const t = f && f.geometry && f.geometry.type;
    if (t === 'Polygon' || t === 'MultiPolygon') return f;
  }
  return null;
}

// ===== swisstopo SearchServer — live address search =====
let searchDebounce = null;
async function swisstopoSearch(query) {
  const url = new URL('https://api3.geo.admin.ch/rest/services/api/SearchServer');
  url.searchParams.set('type', 'locations');
  url.searchParams.set('origins', 'address,gazetteer');
  url.searchParams.set('searchText', query);
  url.searchParams.set('sr', '4326');
  url.searchParams.set('limit', '8');
  url.searchParams.set('lang', 'de');
  try {
    const res = await fetch(url);
    const data = await res.json();
    logApi('Search', url.toString(), data);
    return data.results || [];
  } catch (err) {
    logApi('Search', url.toString(), { error: err.message });
    return [];
  }
}
function renderSearchResults(items) {
  if (!items.length) {
    results.innerHTML = '<div style="padding: var(--space-2) var(--space-3); color: var(--grey-500); font-size: var(--text-xs);">Keine Treffer</div>';
    results.classList.add('open');
    return;
  }
  results.innerHTML = items.map(r => {
    var tmp = document.createElement('div');
    tmp.innerHTML = r.attrs.label || '';
    var safe = tmp.textContent || '';
    return '<div data-pick data-lat="' + r.attrs.lat + '" data-lon="' + r.attrs.lon + '">' + safe + '</div>';
  }).join('');
  results.classList.add('open');
}
q.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  const query = q.value.trim();
  const clearBtn = document.getElementById('qClear');
  if (clearBtn) clearBtn.classList.toggle('visible', q.value.length > 0);
  clearLabels();
  if (query.length < 2) { results.classList.remove('open'); return; }
  searchDebounce = setTimeout(async () => {
    const items = await swisstopoSearch(query);
    renderSearchResults(items);
  }, 300);
});

// Clear-button wiring (reusable for any search input + clear button)
function wireSearchClear(inputId, clearId, onClear) {
  const input = document.getElementById(inputId);
  const clearBtn = document.getElementById(clearId);
  if (!input || !clearBtn) return;
  input.addEventListener('input', () => {
    clearBtn.classList.toggle('visible', input.value.length > 0);
  });
  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.remove('visible');
    input.focus();
    // Fire input event so any listeners react to the clear
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (onClear) onClear();
  });
}
wireSearchClear('q', 'qClear', () => {
  results.classList.remove('open');
});
wireSearchClear('crFilter', 'crFilterClear');
q.addEventListener('focus', () => { if (results.children.length && q.value.trim().length >= 2) results.classList.add('open'); });
document.addEventListener('click', (e) => {
  if (!e.target.closest('.wf-search-wrap')) results.classList.remove('open');
});
// Delegated click on results (works across rebuilds)
results.addEventListener('click', (e) => {
  const el = e.target.closest('[data-pick]');
  if (!el) return;
  // Strip HTML for the text input
  const tmp = document.createElement('div'); tmp.innerHTML = el.innerHTML;
  q.value = tmp.textContent || '';
  results.classList.remove('open');
  const lat = parseFloat(el.dataset.lat);
  const lon = parseFloat(el.dataset.lon);
  if (!isNaN(lat) && !isNaN(lon)) {
    pickAddress([lon, lat]);
    highlightFeaturesAt([lon, lat]);
  }
});

// ===== Wizard navigation (steps 1 → 4) =====
const STEPS = {
  1: { title: 'Standort',              desc: 'Adresse suchen oder Punkt auf der Karte wählen. Identifikatoren werden automatisch aus swisstopo ermittelt.' },
  2: { title: 'Stammdaten',            desc: 'Objektbezeichnung, Klassifizierung und Zeitdaten.' },
  3: { title: 'Portfolio & Merkmale',  desc: 'Portfolio-Zuordnung, Zuständigkeiten und Finanzdaten.' },
  4: { title: 'Prüfen & Einreichen',   desc: 'Daten prüfen und Auftrag zur 4-Augen-Prüfung einreichen.' }
};
let currentStep = 1;
const stepTitle = document.getElementById('stepTitle');
const stepDesc = document.getElementById('stepDesc');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const contentEl = document.querySelector('.wf-dash-workflow .wf-content');

function showStep(n) {
  currentStep = n;
  document.querySelectorAll('.wf-dash-workflow .wf-step-content').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.step) === n);
  });
  // Sub-steps in the Entwurf phase reflect form progress
  document.querySelectorAll('#stepSidebar .wf-sub').forEach(el => {
    const s = parseInt(el.dataset.step);
    if (!s) return;
    el.classList.toggle('active', s === n);
    el.classList.toggle('done', s < n);
    const icon = el.querySelector('.wf-sub-status');
    if (icon) {
      icon.textContent = s < n ? 'check_circle' : (s === n ? 'radio_button_checked' : 'radio_button_unchecked');
    }
  });
  stepTitle.textContent = STEPS[n].title;
  stepDesc.textContent = STEPS[n].desc;
  prevBtn.disabled = n === 1;
  if (n === 4) {
    nextBtn.className = 'btn-submit';
    nextBtn.innerHTML = '<span class="material-symbols-outlined">send</span>Einreichen';
  } else {
    nextBtn.className = 'btn-primary';
    nextBtn.innerHTML = 'Weiter<span class="material-symbols-outlined">chevron_right</span>';
  }
  if (contentEl) contentEl.scrollTop = 0;
}

prevBtn.addEventListener('click', () => { if (currentStep > 1) showStep(currentStep - 1); });
nextBtn.addEventListener('click', () => {
  if (currentStep < 4) {
    showStep(currentStep + 1);
  } else {
    showToast('Auftrag eingereicht — CR angelegt, Benachrichtigung an Data Steward', 'success');
    exitCreate();
    showStep(1);
  }
});

document.getElementById('stepSidebar').addEventListener('click', (e) => {
  const s = e.target.closest('.wf-sub');
  if (s && s.dataset.step) { showStep(parseInt(s.dataset.step)); return; }
  const phaseHead = e.target.closest('.wf-phase-head');
  if (phaseHead) {
    const phaseEl = phaseHead.closest('.wf-phase');
    if (!phaseEl || phaseEl.classList.contains('active')) return;
    document.querySelectorAll('#stepSidebar .wf-phase').forEach(p => p.classList.remove('active'));
    phaseEl.classList.add('active');
    const idx = parseInt(phaseEl.dataset.phase);
    setBodyPhaseClass(idx);
    const crId = new URL(window.location).searchParams.get('cr');
    const cr = window.WORKFLOWS && window.WORKFLOWS.crs.find(c => c.id === crId);
    if (idx === 2) showStep(1);
    else if (idx === 3) renderStamp(cr);
    else if (idx === 4) renderAbschluss(cr);
  }
});

// Section "Bearbeiten" buttons (review mode) — would launch a Mutation workflow for that section
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-edit-section]');
  if (btn) {
    const section = btn.dataset.editSection;
    showToast('Änderungsantrag "' + section + '" starten — würde einen Mutation-Workflow anlegen.', 'info');
  }
});

// Standort card inline edit (Bearbeiten / Bestätigen / Abbrechen)
document.addEventListener('click', (e) => {
  const card = document.getElementById('standortCard');
  if (!card) return;
  if (e.target.closest('[data-standort-edit]'))   { card.classList.add('wf-is-editing'); return; }
  if (e.target.closest('[data-standort-confirm]')) { card.classList.remove('wf-is-editing'); showToast('Neuer Standort bestätigt — würde einen Mutation-Workflow speichern.', 'success'); return; }
  if (e.target.closest('[data-standort-cancel]'))  { card.classList.remove('wf-is-editing'); return; }
});

// "Bearbeiten" jump-back buttons inside the Step 4 summary
document.addEventListener('click', (e) => {
  const jumper = e.target.closest('[data-goto]');
  if (jumper && body.classList.contains('wf-dash-workflow-active')) {
    showStep(parseInt(jumper.dataset.goto));
  }
});

function pickAddress(coords) {
  ensureWizardMap();
  const lngLat = coords || [7.4425, 46.9470]; // default: Bundesgasse 3, Bern
  if (wizardMarker) wizardMarker.remove();
  wizardMarker = new maplibregl.Marker({ color: '#c00' }).setLngLat(lngLat).addTo(wizardMap);
  wizardMap.flyTo({ center: lngLat, zoom: 17, duration: 900 });
}

// ===== Bootstrap: fetch workflows.json, render table, apply any deep-link =====
// Placed at end of the last script file so all referenced functions
// (enterCRDetail, enterCreate, ensureWizardMap, etc.) are already defined.
fetch('data/workflows.json')
  .then(r => r.json())
  .then(data => {
    window.WORKFLOWS = data;
    renderCRTable(data.crs);
    // Deep-link: open a specific CR or a new create flow
    const u = getUrl();
    if (u.cr) {
      const cr = data.crs.find(c => c.id === u.cr);
      if (cr) enterCRDetail(cr.title, cr.id);
    } else if (u.neu === 'building' || u.neu === 'parcel') {
      enterCreate(u.neu, false);
    }
  })
  .catch(err => {
    console.warn('workflows.json failed:', err);
    const tbody = document.getElementById('crTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="padding: var(--space-6); text-align: center; color: var(--status-error-text);">Workflows konnten nicht geladen werden</td></tr>';
  });
