// workflows.js — CR table, state machine, dashboard wiring, BPMN viewer.
// Provides: CURRENT_USER, STATE_DISPLAY, ENTITY_LABELS, OP_LABELS, renderCRTable,
//           setUrl, getUrl, body, closeAllMenus, clearAllStates, resetWizard,
//           showToast, enterCreate, enterMutate, applyMutateTarget, exitCreate, enterDashboard, exitDashboard, enterCRDetail,
//           exitCRDetail, renderCR, setEditPhases, setReviewPhases, renderStamp,
//           renderAbschluss, renderDiff, renderChecks, setBodyPhaseClass, renderNewWorkflowMeta, kv, fmtDateTime
// Requires: bgMap, ctx, pin (map.js)
//           wizardMap, wizardMarker, ensureWizardMap, pickAddress, highlightFeaturesAt,
//           lastEnrichment, lastRightClickLngLat, showStep (wizard.js)

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}

function showToast(message, type) {
  var container = document.getElementById('toastContainer');
  if (!container) { console.log('[toast]', type, message); return; }
  var icons = { success: 'check_circle', error: 'cancel', warn: 'warning', info: 'info' };
  var toast = document.createElement('div');
  toast.className = 'wf-toast ' + (type || 'info');
  toast.innerHTML = '<span class="material-symbols-outlined">' + esc(icons[type] || 'info') + '</span>' + esc(message);
  container.appendChild(toast);
  setTimeout(function () {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', function () { toast.remove(); });
  }, 3500);
}

// ===== Data-driven CR table =====
const CURRENT_USER = 'me';
const STATE_DISPLAY = {
  draft:    { label: 'Entwurf',     cls: 'draft',     icon: 'edit_note' },
  review:   { label: 'Eingereicht', cls: 'submitted', icon: 'send' },
  approval: { label: 'In Prüfung',  cls: 'review',    icon: 'hourglass_top' },
  applied:  { label: 'Angewendet',  cls: 'applied',   icon: 'check_circle' },
  rejected: { label: 'Abgelehnt',   cls: 'rejected',  icon: 'cancel' }
};
const ENTITY_LABELS = { building: 'Gebäude', parcel: 'Grundstück' };
const OP_LABELS     = { create: 'Neu', mutate: 'Mutation', delete: 'Löschung' };

function actorCell(actor) {
  if (!actor || !actor.user) return '<td>—</td>';
  if (actor.user === CURRENT_USER) return '<td class="me">Sie</td>';
  return '<td>' + esc(actor.user) + '</td>';
}

function renderCRTable(crs) {
  const tbody = document.getElementById('crTableBody');
  if (!tbody) return;
  if (!crs || !crs.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding: var(--space-6); text-align: center; color: var(--grey-500);">Keine Workflows</td></tr>';
    return;
  }
  tbody.innerHTML = crs.map(cr => {
    const s = STATE_DISPLAY[cr.state] || STATE_DISPLAY.draft;
    const entity = ENTITY_LABELS[cr.entity] || cr.entity;
    const op = OP_LABELS[cr.operation] || cr.operation;
    const subtitle = cr.id + (cr.subtitle ? ' · ' + cr.subtitle : '');
    const actors = cr.actors || {};
    return (
      '<tr data-action="review" data-cr="' + cr.id + '">' +
        '<td><span class="wf-state ' + s.cls + '"><span class="material-symbols-outlined">' + s.icon + '</span>' + s.label + '</span></td>' +
        '<td class="title">' + esc(cr.title) + '<small>' + esc(subtitle) + '</small></td>' +
        '<td>' + esc(entity) + ' · ' + esc(op) + '</td>' +
        actorCell(actors.requester) +
        actorCell(actors.steward) +
        actorCell(actors.approver) +
        '<td class="age">' + esc(cr.age || '—') + '</td>' +
      '</tr>'
    );
  }).join('');
}

// ----- URL state: ?cr=<id> or ?new=<entity> -----
function setUrl(params) {
  const url = new URL(window.location);
  ['cr', 'new'].forEach(k => url.searchParams.delete(k));
  Object.entries(params || {}).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
  window.history.replaceState({}, '', url);
}
function getUrl() {
  const url = new URL(window.location);
  return { cr: url.searchParams.get('cr'), neu: url.searchParams.get('new') };
}

// ===== State management =====
const body = document.body;

function closeAllMenus() {
  ctx.classList.remove('open');
  pin.classList.remove('shown');
  const nwp = document.getElementById('newWfPop');
  if (nwp) nwp.classList.remove('open');
}

function clearAllStates() {
  body.classList.remove('wf-dashboard-active', 'wf-dash-workflow-active', 'wf-dash-docs-active', 'wf-mode-edit', 'wf-mode-review', 'wf-phase-1', 'wf-phase-2', 'wf-phase-3', 'wf-phase-4');
}

function resetWizard() {
  const q = document.getElementById('q');
  if (q) q.value = '';
  // Clear every tagged input/select/textarea so a new workflow doesn't inherit stale values
  document.querySelectorAll('.wf-dash-workflow [data-field]').forEach(el => {
    if (el.tagName === 'SELECT') el.selectedIndex = 0;
    else el.value = '';
  });
  const comment = document.querySelector('.wf-dash-workflow .wf-comment');
  if (comment) comment.value = '';
  if (wizardMarker) { wizardMarker.remove(); wizardMarker = null; }
  clearLabels();
  if (wizardMap) {
    var empty = { type: 'FeatureCollection', features: [] };
    var bSrc = wizardMap.getSource('hlBuilding');
    var pSrc = wizardMap.getSource('hlParcel');
    if (bSrc) bSrc.setData(empty);
    if (pSrc) pSrc.setData(empty);
    wizardMap.jumpTo({ center: [8.23, 46.8], zoom: 7.3 });
  }
}

function enterCreate(entity, fromEnriched) {
  clearAllStates();
  resetWizard();
  body.classList.add('wf-dashboard-active', 'wf-dash-workflow-active', 'wf-mode-edit');
  setBodyPhaseClass(2);
  setUrl({ 'new': entity });

  const title = entity === 'parcel' ? 'Neues Grundstück' : 'Neues Gebäude';
  crumbCurrent.textContent = title + (fromEnriched ? ' · aus Karte' : '');
  crumbSep.hidden = false;
  crumbCurrent.hidden = false;
  if (crumbState) { crumbState.textContent = 'Neu'; crumbState.hidden = false; }

  if (fromEnriched) {
    const q = document.getElementById('q');
    const gP = lastEnrichment && lastEnrichment.gwr;
    const street = gP && (gP.strname_deinr || gP.strname) || '';
    const plz    = gP && (gP.dplz4 || gP.plz) || '';
    const ort    = gP && (gP.ggdename || gP.gdename) || '';
    const parts  = [street, [plz, ort].filter(Boolean).join(' ')].filter(Boolean);
    q.value = parts.length ? parts.join(', ') : 'Bundesgasse 3, 3003 Bern';
  }
  setEditPhases();
  renderNewWorkflowMeta(entity);
  showStep(1);
  setTimeout(() => {
    ensureWizardMap();
    if (fromEnriched) {
      pickAddress();
      // If we have the right-click lngLat captured, highlight there too
      if (lastRightClickLngLat) highlightFeaturesAt([lastRightClickLngLat.lng, lastRightClickLngLat.lat]);
    }
  }, 50);
  closeAllMenus();
}

function exitCreate() {
  body.classList.remove('wf-dash-workflow-active', 'wf-mode-edit');
  crumbSep.hidden = true;
  crumbCurrent.hidden = true;
  if (crumbState) crumbState.hidden = true;
  resetWizard();
  setUrl({});
}

function enterMutate(entity) {
  if (!window.WORKFLOWS) {
    showToast('Workflow-Daten noch nicht geladen.', 'warn');
    return;
  }
  var targets = window.WORKFLOWS.crs.filter(function (c) {
    return c.entity === entity && c.data;
  });
  if (!targets.length) {
    showToast('Keine bestehenden ' + (entity === 'parcel' ? 'Grundstücke' : 'Gebäude') + ' in den Demo-Daten gefunden.', 'warn');
    return;
  }
  closeAllMenus();
  // Show picker modal
  var overlay = document.getElementById('pickerOverlay');
  var titleEl = document.getElementById('pickerTitle');
  var bodyEl = document.getElementById('pickerBody');
  if (!overlay || !bodyEl) {
    // Fallback if picker HTML is missing — use first target directly
    applyMutateTarget(targets[0], entity);
    return;
  }
  var entLabel = entity === 'parcel' ? 'Grundstück' : 'Gebäude';
  if (titleEl) titleEl.textContent = entLabel + ' auswählen';
  bodyEl.innerHTML = targets.map(function (cr, i) {
    var addr = (cr.data.standort && cr.data.standort.adresse) || cr.title || cr.id;
    var sub = esc(cr.id) + (cr.target_bbl_id ? ' · ' + esc(cr.target_bbl_id) : '');
    return '<div class="wf-picker-item" data-pick-idx="' + i + '">' +
      '<span class="material-symbols-outlined">apartment</span>' +
      '<div><div class="picker-title">' + esc(addr) + '</div><div class="picker-sub">' + sub + '</div></div>' +
    '</div>';
  }).join('');
  overlay.hidden = false;
  // Store targets for the click handler
  overlay._targets = targets;
  overlay._entity = entity;
}

function applyMutateTarget(target, entity) {
  clearAllStates();
  resetWizard();
  body.classList.add('wf-dashboard-active', 'wf-dash-workflow-active', 'wf-mode-edit');
  setBodyPhaseClass(2);
  setUrl({ 'new': entity });

  var entLabel = entity === 'parcel' ? 'Grundstück' : 'Gebäude';
  crumbCurrent.textContent = 'Mutation ' + entLabel + ': ' + esc(target.title || target.id);
  crumbSep.hidden = false;
  crumbCurrent.hidden = false;

  if (crumbState) { crumbState.textContent = 'Mutation'; crumbState.hidden = false; }

  var data = target.data || {};
  var fieldValues = Object.assign({}, data.stammdaten || {}, data.portfolio || {});
  document.querySelectorAll('.wf-dash-workflow [data-field]').forEach(function (el) {
    var key = el.dataset.field;
    if (!(key in fieldValues)) return;
    var v = fieldValues[key];
    el.value = (v === null || v === undefined) ? '' : String(v);
  });

  var q = document.getElementById('q');
  if (q && data.standort && data.standort.adresse) {
    q.value = data.standort.adresse;
  }

  setEditPhases();
  renderNewWorkflowMeta(entity);
  var metaType = document.getElementById('metaType');
  if (metaType) metaType.value = 'Mutation · ' + entLabel;

  showStep(1);
  setTimeout(function () {
    ensureWizardMap();
    var st = data.standort || {};
    if (st.lngLat && Array.isArray(st.lngLat)) {
      pickAddress(st.lngLat);
      highlightFeaturesAt(st.lngLat);
    }
  }, 50);
  closeAllMenus();
}

function enterDashboard() {
  clearAllStates();
  body.classList.add('wf-dashboard-active');
  closeAllMenus();
}

function exitDashboard() {
  clearAllStates();
  crumbSep.hidden = true;
  crumbCurrent.hidden = true;
  if (crumbState) crumbState.hidden = true;
  resetWizard();
  setUrl({});
  setTimeout(() => bgMap.resize(), 50);
}

// CR detail pane inside the dashboard (breadcrumb-navigated)
const crumbSep = document.getElementById('crumbSep');
const crumbCurrent = document.getElementById('crumbCurrent');
const crumbState = document.getElementById('crumbState');
const crumbRoot = document.getElementById('crumbRoot');

function enterCRDetail(title, crId) {
  body.classList.remove('wf-mode-edit');
  body.classList.add('wf-dashboard-active', 'wf-dash-workflow-active', 'wf-mode-review');
  setUrl({ cr: crId });
  // Look up full CR in the loaded workflows data
  const cr = window.WORKFLOWS && window.WORKFLOWS.crs.find(c => c.id === crId);
  renderCR(cr, title);
  crumbCurrent.textContent = (cr && cr.title) || title;
  crumbSep.hidden = false;
  crumbCurrent.hidden = false;
  if (cr && crumbState) {
    var op = OP_LABELS[cr.operation] || '';
    var s = STATE_DISPLAY[cr.state] || STATE_DISPLAY.draft;
    crumbState.textContent = (op ? op + ' · ' : '') + s.label;
    crumbState.hidden = false;
  }
  setReviewPhases(cr);
  showStep(1);
  setTimeout(() => ensureWizardMap(), 50);
}

// ----- helpers -----
function kv(label, value) {
  const isEmpty = (value === null || value === undefined || value === '' || value === '—');
  const display = isEmpty ? '—' : esc(value);
  return '<div><div class="k">' + esc(label) + '</div><div class="v' + (isEmpty ? ' empty' : '') + '">' + display + '</div></div>';
}
function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('de-CH') + ', ' + d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
}
function fmtActor(actor) {
  if (!actor || !actor.user) return '—';
  const name = actor.user === CURRENT_USER ? 'Sie' : actor.user;
  const ts = actor.at ? ' · ' + fmtDateTime(actor.at) : '';
  if (actor.decision === 'approve') return name + ' · freigegeben' + ts;
  if (actor.decision === 'reject')  return name + ' · abgelehnt' + ts;
  return name;
}

// Populate the whole review pane from a CR record
function renderCR(cr, fallbackTitle) {
  const a = (cr && cr.actors) || {};
  const entity = cr ? (ENTITY_LABELS[cr.entity] || cr.entity) : '';
  const op = cr ? (OP_LABELS[cr.operation] || cr.operation) : '';
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setVal('metaRequester', fmtActor(a.requester));
  setVal('metaSteward',   fmtActor(a.steward));
  setVal('metaApprover',  fmtActor(a.approver));
  setVal('metaType',      (op && entity) ? (op + ' · ' + entity) : '');

  const data = (cr && cr.data) || {};
  const st = data.standort || {}, sm = data.stammdaten || {}, pt = data.portfolio || {};

  // Populate the SAME edit-mode inputs used for Erfassung; in review mode CSS
  // renders them read-only. One DOM, two modes.
  const fieldValues = Object.assign({}, sm, pt);
  document.querySelectorAll('.wf-dash-workflow [data-field]').forEach(el => {
    const key = el.dataset.field;
    if (!(key in fieldValues)) return;
    const v = fieldValues[key];
    el.value = (v === null || v === undefined) ? '' : String(v);
  });

  // Map header (review-only): address label + Google Maps link
  const mapAddress = document.getElementById('mapAddress');
  const mapExtLink = document.getElementById('mapExternalLink');
  if (mapAddress) mapAddress.textContent = st.adresse || '—';
  if (mapExtLink && st.lngLat && Array.isArray(st.lngLat)) {
    mapExtLink.href = 'https://www.google.com/maps?q=' + st.lngLat[1] + ',' + st.lngLat[0];
  }

  // Recenter the wizard map on the CR's coordinates + drop a marker + highlight footprints
  if (st.lngLat && Array.isArray(st.lngLat)) {
    setTimeout(() => {
      ensureWizardMap();
      if (wizardMarker) wizardMarker.remove();
      wizardMarker = new maplibregl.Marker({ color: '#c00' }).setLngLat(st.lngLat).addTo(wizardMap);
      wizardMap.flyTo({ center: st.lngLat, zoom: 17, duration: 600 });
      highlightFeaturesAt(st.lngLat);
    }, 50);
  }

  // Step 4 summary grids
  const sumStandort = document.getElementById('summaryStandort');
  if (sumStandort) sumStandort.innerHTML =
    kv('Adresse', st.adresse) + kv('Koordinaten (LV95)', st.koordinaten) +
    kv('EGID', st.egid) + kv('EGRID', st.egrid) +
    kv('BFS Gemeinde', st.bfs_gemeinde) + kv('Bauzone', st.bauzone);
  const sumStammdaten = document.getElementById('summaryStammdaten');
  if (sumStammdaten) sumStammdaten.innerHTML =
    kv('Objektbezeichnung', sm.bez) + kv('Wirtschaftseinheit', sm.we) +
    kv('Gebäudeart', sm.gebaeudeart) + kv('Eigentum', sm.eigentum) +
    kv('Status', sm.status) + kv('Baujahr', sm.baujahr);
  const sumPortfolio = document.getElementById('summaryPortfolio');
  if (sumPortfolio) sumPortfolio.innerHTML =
    kv('Teilportfolio', pt.teilportfolio) + kv('Mietmodell', pt.mietmodell) +
    kv('Objektverantwortliche', pt.ovtw) + kv('Portfoliomanager', pt.pvtw) +
    kv('Anschaffungswert', pt.awrt) + kv('Buchwert', pt.bwrt);
  renderDiff(cr);
  renderChecks(cr);
}

// Phase sidebar states differ between new (edit) and existing (review) CRs
function setEditPhases() {
  const phases = document.querySelectorAll('.wf-dash-workflow .wf-phase');
  phases.forEach(p => {
    p.classList.remove('active', 'done');
    const num = p.querySelector('.wf-phase-num');
    if (num) num.innerHTML = p.dataset.phase;
  });
  // Phase 1 "Workflow starten" is informational (metadata); the active work is phase 2 "Daten erfassen"
  const second = document.querySelector('.wf-dash-workflow .wf-phase[data-phase="2"]');
  if (second) second.classList.add('active');
}

// For a NEW workflow: populate the Workflow-Informationen meta box
function renderNewWorkflowMeta(entity) {
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  const now = new Date();
  const nowStr = now.toLocaleDateString('de-CH') + ', ' + now.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  const entLabel = entity === 'parcel' ? 'Grundstück' : 'Gebäude';
  setVal('metaRequester', 'Sie · ' + nowStr);
  setVal('metaSteward',   '— noch nicht zugewiesen');
  setVal('metaApprover',  '— noch nicht zugewiesen');
  setVal('metaType',      'Neu · ' + entLabel);
}
// Apply a body class wf-phase-1 / 2 / 3 reflecting which phase is currently expanded
function setBodyPhaseClass(idx) {
  body.classList.remove('wf-phase-1', 'wf-phase-2', 'wf-phase-3', 'wf-phase-4');
  if (idx >= 1 && idx <= 4) body.classList.add('wf-phase-' + idx);
}

// Populate the Prüfung view (phase 3): show both Data Steward and Approver stamps.
function renderStamp(cr) {
  const actorEl = document.getElementById('stampActor');
  const decisionEl = document.getElementById('stampDecision');
  const desc = document.getElementById('stampDesc');
  if (!actorEl) return;
  const a = (cr && cr.actors) || {};

  function stampRow(role, actor) {
    if (!actor || !actor.user) {
      return '<div class="wf-stamp-actor"><span class="material-symbols-outlined">hourglass_top</span><div class="info"><div class="name">Ausstehend</div><div class="desc">' + esc(role) + ' noch nicht zugewiesen.</div></div></div>';
    }
    const isMe = actor.user === CURRENT_USER;
    const name = isMe ? 'Sie' : actor.user;
    const ts = actor.at ? ' · ' + esc(fmtDateTime(actor.at)) : '';
    if (actor.decision === 'approve') {
      return '<div class="wf-stamp-actor pass"><span class="material-symbols-outlined">check_circle</span><div class="info"><div class="name">' + esc(name) + ' · freigegeben</div><div class="desc">' + esc(role) + ts + '</div></div></div>';
    }
    if (actor.decision === 'reject') {
      return '<div class="wf-stamp-actor fail"><span class="material-symbols-outlined">cancel</span><div class="info"><div class="name">' + esc(name) + ' · abgelehnt</div><div class="desc">' + esc(role) + ts + (actor.comment ? ' · ' + esc(actor.comment) : '') + '</div></div></div>';
    }
    return '<div class="wf-stamp-actor"><span class="material-symbols-outlined">hourglass_top</span><div class="info"><div class="name">' + esc(name) + '</div><div class="desc">' + esc(role) + ' · Entscheid ausstehend</div></div></div>';
  }

  if (desc) desc.textContent = 'Zwei unabhängige Freigaben: zuerst der Data Steward, dann der Approver (4-Augen-Prinzip).';
  actorEl.outerHTML = '<div id="stampActor" class="wf-stamp-list">' + stampRow('Data Steward', a.steward) + stampRow('Approver', a.approver) + '</div>';

  // Show decision buttons only when the current user is the next actor AND no decision yet
  const nextPending = !a.steward || !a.steward.decision ? a.steward :
                     (!a.approver || !a.approver.decision ? a.approver : null);
  const showButtons = nextPending && nextPending.user === CURRENT_USER;
  if (decisionEl) decisionEl.style.display = showButtons ? 'flex' : 'none';
  // Also disable Step 4 decision buttons based on same logic
  var step4Btns = document.querySelectorAll('.wf-review-only [data-decision]');
  step4Btns.forEach(function (btn) {
    if (!showButtons) {
      btn.disabled = true;
      btn.title = 'Sie sind nicht der aktuelle Prüfer für diesen Antrag.';
    } else {
      btn.disabled = false;
      btn.title = '';
    }
  });
}

// Populate the Abschluss view (phase 4): applied info or still-pending note.
function renderAbschluss(cr) {
  const actorEl = document.getElementById('abschlussActor');
  const desc = document.getElementById('abschlussDesc');
  if (!actorEl) return;
  if (cr && cr.state === 'applied') {
    actorEl.className = 'wf-stamp-actor pass';
    actorEl.innerHTML = '<span class="material-symbols-outlined">check_circle</span><div class="info"><div class="name">Angewendet</div><div class="desc">' + esc(cr.applied_at ? new Date(cr.applied_at).toLocaleDateString('de-CH') : 'System') + '</div></div>';
    if (desc) desc.textContent = 'Der Antrag wurde freigegeben und auf das Portfolio angewendet.';
  } else if (cr && cr.state === 'rejected') {
    actorEl.className = 'wf-stamp-actor fail';
    actorEl.innerHTML = '<span class="material-symbols-outlined">cancel</span><div class="info"><div class="name">Abgelehnt</div><div class="desc">Wird nicht auf das Portfolio angewendet.</div></div>';
    if (desc) desc.textContent = 'Der Antrag wurde abgelehnt.';
  } else {
    actorEl.className = 'wf-stamp-actor';
    actorEl.innerHTML = '<span class="material-symbols-outlined">hourglass_top</span><div class="info"><div class="name">Noch offen</div><div class="desc">Wird nach Freigabe automatisch angewendet.</div></div>';
    if (desc) desc.textContent = 'Der Workflow ist noch nicht abgeschlossen.';
  }
}

function renderDiff(cr) {
  const section = document.getElementById('diffSection');
  const list = document.getElementById('diffList');
  if (!section || !list) return;
  const diff = (cr && cr.diff) || [];
  if (!diff.length) { section.hidden = true; return; }
  section.hidden = false;
  list.innerHTML = diff.map(function (d) {
    var fromVal = d.from === null || d.from === undefined || d.from === '' ? '—' : esc(d.from);
    var toVal = d.to === null || d.to === undefined || d.to === '' ? '—' : esc(d.to);
    var sqCls = d.source_quality || '';
    return (
      '<div class="wf-diff-row">' +
        '<div class="field">' + esc(d.label) + '<small>' + esc(d.field) + '</small></div>' +
        '<div class="values">' +
          (d.from !== null && d.from !== undefined && d.from !== '' ? '<span class="old">' + fromVal + '</span><span class="arrow">→</span>' : '') +
          '<span class="new">' + toVal + '</span>' +
        '</div>' +
        '<div class="src ' + esc(sqCls) + '">' + esc(d.source || '') + '</div>' +
      '</div>'
    );
  }).join('');
}

function renderChecks(cr) {
  var section = document.getElementById('checksSection');
  var list = document.getElementById('checksList');
  if (!section || !list) return;
  var checks = (cr && cr.quality_checks) || [];
  if (!checks.length) { section.hidden = true; return; }
  section.hidden = false;
  var icons = { pass: 'check_circle', warn: 'warning', fail: 'cancel' };
  list.innerHTML = checks.map(function (c) {
    var cls = c.status || 'pass';
    var icon = icons[cls] || 'help';
    return (
      '<div class="wf-check ' + esc(cls) + '">' +
        '<span class="material-symbols-outlined">' + esc(icon) + '</span>' +
        '<div class="check-body"><strong>' + esc(c.rule) + '</strong><small>' + esc(c.detail || '') + '</small></div>' +
      '</div>'
    );
  }).join('');
}

// Given the CR's current state, compute which phase is active and which are done
function setReviewPhases(cr) {
  // state → "active phase index"
  // phases: 1 Workflow starten, 2 Stammdaten, 3 Prüfung, 4 Abschluss
  const state = cr ? cr.state : 'approval';
  let activeIdx;
  if (state === 'draft')         activeIdx = 2;
  else if (state === 'review')   activeIdx = 3;
  else if (state === 'approval') activeIdx = 3;
  else if (state === 'applied')  activeIdx = 4;
  else if (state === 'rejected') activeIdx = 3;
  else                           activeIdx = 3;

  document.querySelectorAll('.wf-dash-workflow .wf-phase').forEach(p => {
    p.classList.remove('active', 'done');
    const num = p.querySelector('.wf-phase-num');
    const idx = parseInt(p.dataset.phase);
    if (idx < activeIdx) {
      p.classList.add('done');
      if (num) num.innerHTML = '<span class="material-symbols-outlined">check</span>';
    } else if (idx === activeIdx) {
      p.classList.add('active');
      if (num) num.innerHTML = idx;
    } else {
      if (num) num.innerHTML = idx;
    }
  });
  setBodyPhaseClass(activeIdx);
  if (activeIdx === 3) renderStamp(cr);
  if (activeIdx === 4) renderAbschluss(cr);
}

function exitCRDetail() {
  body.classList.remove('wf-dash-workflow-active', 'wf-mode-review');
  crumbSep.hidden = true;
  crumbCurrent.hidden = true;
  if (crumbState) crumbState.hidden = true;
  setUrl({});
}

crumbRoot.addEventListener('click', () => {
  if (body.classList.contains('wf-mode-review')) exitCRDetail();
  else if (body.classList.contains('wf-mode-edit')) exitCreate();
});

// Delegated action handling
document.addEventListener('click', (e) => {
  const createEl = e.target.closest('[data-action="create"]');
  if (createEl) {
    enterCreate(createEl.dataset.entity, createEl.dataset.enriched === '1');
    return;
  }
  const mutateEl = e.target.closest('[data-action="mutate"]');
  if (mutateEl) {
    enterMutate(mutateEl.dataset.entity);
    return;
  }
  const reviewEl = e.target.closest('[data-action="review"]');
  if (reviewEl) {
    // Read the CR title from the row's .title cell (or fall back to CR id)
    const titleCell = reviewEl.querySelector('td.title');
    const title = titleCell ? titleCell.childNodes[0].textContent.trim() : (reviewEl.dataset.cr || 'CR');
    enterCRDetail(title, reviewEl.dataset.cr);
  }
});

// ===== Header: Workflows toggle (opens dashboard view) =====
const wfBtn = document.getElementById('workflowsBtn');
wfBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (body.classList.contains('wf-dashboard-active')) {
    exitDashboard();
  } else {
    enterDashboard();
  }
  wfBtn.setAttribute('aria-pressed', body.classList.contains('wf-dashboard-active'));
});

// ===== Dashboard: Zurück button =====
document.getElementById('dashBackBtn').addEventListener('click', exitDashboard);

// ===== Dokumentation pane (BPMN viewer) =====
let bpmnViewer = null;
function ensureBpmnViewer() {
  if (bpmnViewer) return bpmnViewer;
  if (typeof BpmnJS === 'undefined') { console.warn('bpmn-js not loaded'); return null; }
  // NavigatedViewer variant already bundles wheel-zoom + drag-pan
  bpmnViewer = new BpmnJS({ container: '#bpmnCanvas' });
  return bpmnViewer;
}
function bpmnZoom(step) {
  if (!bpmnViewer) return;
  try {
    const c = bpmnViewer.get('canvas');
    const current = c.zoom();
    c.zoom(Math.max(0.2, Math.min(4, current + step)));
  } catch (e) { console.warn(e); }
}
function bpmnZoomFit() {
  if (!bpmnViewer) return;
  try { bpmnViewer.get('canvas').zoom('fit-viewport'); } catch (e) {}
}
function loadBpmn(file, label) {
  const wrap = document.getElementById('bpmnWrap');
  const placeholder = document.getElementById('bpmnPlaceholder');
  const title = document.getElementById('docsTitle');
  const desc = document.getElementById('docsDesc');
  if (title) title.textContent = label || 'Workflow';
  if (!file) {
    if (desc) desc.textContent = 'Noch nicht dokumentiert.';
    if (placeholder) placeholder.textContent = 'Kein Diagramm verfügbar';
    if (wrap) wrap.classList.add('no-bpmn');
    return;
  }
  if (desc) desc.textContent = 'BPMN-Prozessdiagramm.';
  if (wrap) wrap.classList.remove('no-bpmn');
  const v = ensureBpmnViewer();
  if (!v) {
    if (placeholder) placeholder.textContent = 'BPMN-Viewer konnte nicht geladen werden.';
    if (wrap) wrap.classList.add('no-bpmn');
    return;
  }
  fetch('assets/workflows/' + file)
    .then(r => r.text())
    .then(xml => v.importXML(xml))
    .then(() => { try { v.get('canvas').zoom('fit-viewport'); } catch(e) {} })
    .catch(err => {
      console.warn('BPMN load failed:', err);
      if (placeholder) placeholder.textContent = 'BPMN-Datei konnte nicht geladen werden.';
      if (wrap) wrap.classList.add('no-bpmn');
    });
}
document.getElementById('dashDocsBtn').addEventListener('click', () => {
  const active = body.classList.toggle('wf-dash-docs-active');
  if (active) {
    // Load the currently selected item
    const selected = document.querySelector('.wf-docs-item.active') || document.querySelector('.wf-docs-item');
    if (selected) loadBpmn(selected.dataset.bpmn, selected.dataset.label);
  }
});
document.getElementById('docsList').addEventListener('click', (e) => {
  const item = e.target.closest('.wf-docs-item');
  if (!item) return;
  document.querySelectorAll('.wf-docs-item').forEach(el => el.classList.remove('active'));
  item.classList.add('active');
  loadBpmn(item.dataset.bpmn, item.dataset.label);
});

// Zoom buttons (for keyboard / non-mouse users)
const zIn = document.getElementById('bpmnZoomIn');
const zOut = document.getElementById('bpmnZoomOut');
const zFit = document.getElementById('bpmnZoomFit');
if (zIn)  zIn.addEventListener('click',  () => bpmnZoom(0.2));
if (zOut) zOut.addEventListener('click', () => bpmnZoom(-0.2));
if (zFit) zFit.addEventListener('click', bpmnZoomFit);

// ===== Dashboard: "Neuer Workflow" popover =====
const newWfBtn = document.getElementById('newWfBtn');
const newWfPop = document.getElementById('newWfPop');
newWfBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  newWfPop.classList.toggle('open');
  newWfBtn.setAttribute('aria-expanded', newWfPop.classList.contains('open'));
});
document.addEventListener('click', (e) => {
  if (!newWfPop.contains(e.target) && !newWfBtn.contains(e.target)) {
    newWfPop.classList.remove('open');
  }
});

// Mutate / delete placeholders — route later to picker + wizard
document.addEventListener('click', (e) => {
  const todo = e.target.closest('[data-wf-todo]');
  if (!todo) return;
  newWfPop.classList.remove('open');
  const map = {
    'delete-building':  'Löschung Gebäude — Soft-Delete (Status → Stillgelegt) oder Hard-Delete',
    'delete-parcel':    'Löschung Grundstück — Soft-Delete oder Hard-Delete'
  };
  showToast(map[todo.dataset.wfTodo] || 'Noch nicht implementiert', 'info');
});

// ===== Filter panel toggle =====
const fpBtn = document.getElementById('filter-panel-btn');
const fp = document.getElementById('filter-panel');
fpBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  fp.classList.toggle('open');
  fpBtn.classList.toggle('panel-open', fp.classList.contains('open'));
});

// ===== Four-eyes decision guard =====
document.addEventListener('click', function (e) {
  var btn = e.target.closest('[data-decision]');
  if (!btn) return;
  var crId = new URL(window.location).searchParams.get('cr');
  var cr = window.WORKFLOWS && window.WORKFLOWS.crs.find(function (c) { return c.id === crId; });
  if (!cr) { showToast('Kein CR geladen.', 'warn'); return; }
  var actors = cr.actors || {};
  // Four-eyes guard: requester cannot approve/reject their own request
  if (actors.requester && actors.requester.user === CURRENT_USER) {
    btn.disabled = true;
    showToast('4-Augen-Prinzip: Antragsteller (' + CURRENT_USER + ') kann den eigenen Antrag nicht freigeben oder ablehnen.', 'error');
    return;
  }
  var decision = btn.dataset.decision;
  if (decision === 'approve') {
    showToast('Antrag freigegeben durch ' + CURRENT_USER, 'success');
  } else {
    showToast('Antrag abgelehnt durch ' + CURRENT_USER, 'error');
  }
});

// ===== Building picker modal =====
document.addEventListener('click', function (e) {
  var overlay = document.getElementById('pickerOverlay');
  if (!overlay || overlay.hidden) return;
  // Close on overlay background click or close button
  if (e.target === overlay || e.target.closest('#pickerClose')) {
    overlay.hidden = true;
    return;
  }
  // Pick an item
  var item = e.target.closest('[data-pick-idx]');
  if (!item) return;
  var idx = parseInt(item.dataset.pickIdx);
  var targets = overlay._targets;
  var entity = overlay._entity;
  if (targets && targets[idx]) {
    overlay.hidden = true;
    applyMutateTarget(targets[idx], entity);
  }
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    var overlay = document.getElementById('pickerOverlay');
    if (overlay && !overlay.hidden) overlay.hidden = true;
  }
});
