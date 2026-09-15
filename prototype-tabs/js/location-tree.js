// Location tree (shared): Land → Region → Ort → Wirtschaftseinheit → objects, in the left panel.
// A country, region or city node sets the matching filters of the drawer (Land, Region, Ort): the tree is a
// second way to reach the same filters, so the Filter button counts them and the pills show them. Node
// counts honour the other drawer filters but not the location filters, so every branch stays reachable.
// WE nodes are folders; an object row selects the object on the map. Branches open one level at a time and
// every level has one open node (opening a country folds the other): the tree never grows past one path.
// A node row toggles: the first click selects (filters) and opens it, the second removes its filter and folds
// it; the chevron only folds. One tab stop, arrow keys (ARIA tree). The panel's right edge drags the width.
//
// initLocationTree(adapter) — adapter:
//   buildings()      features that pass the drawer filters except the location filters
//   allBuildings()   every building feature            parcels()  parcel features (may be empty)
//   building(f)      { id, code, label, country, region, city, we }
//   parcel(f)        { id, code, label, we }           (geography comes from the building of the WE)
//   filterKeys       { country: 'land', region: 'region', city: 'ort' }  drawer filter key per level
//   getFilter(key)   current values of a drawer filter (array)
//   setFilters(map)  { land: 'CH', region: null, … } sets each key to one value or none and applies
//   onSelectObject(kind, id)   'building' | 'parcel'

import { state } from './state.js';
import { escapeHtml, isMobileLayout, storageGet, storageSet } from './utils.js';
import { t } from './i18n.js';
import { onEscape } from './keys.js';
import { closePhoneMenu } from './tools-panel.js';

const LEVELS = ['country', 'region', 'city', 'we'];
const FILTER_LEVELS = ['country', 'region', 'city']; // levels backed by a drawer filter; 'we' is a folder
const LEVEL_ICONS = { country: 'public', region: 'map', city: 'location_on', we: 'folder' };
const KIND_ICONS = { building: 'apartment', parcel: 'crop_square' };
const INDENT = 20; // px per level
const GUTTER = 28; // px before the first level: room for the fold chevron

let adapter = null;
const openChild = new Map(); // parent node key ('' = root level) -> key of its one open child
let nodeIndex = new Map(); // node key -> node of the last rendering

// ===== SELECTION (= the location filters of the drawer) =====

export function countryName(code) {
  const name = t('country.' + code);
  return name === 'country.' + code ? code : name;
}

// The selected path: every location filter with exactly one value, contiguous from the country down
function currentSelection() {
  const sel = {};
  for (let i = 0; i < FILTER_LEVELS.length; i++) {
    const key = adapter.filterKeys[FILTER_LEVELS[i]];
    const values = key ? adapter.getFilter(key) : null;
    if (!values || values.length !== 1) break;
    sel[FILTER_LEVELS[i]] = values[0];
  }
  return sel;
}

// Filters for a node: its path exactly, the deeper levels cleared
function filtersFor(sel) {
  const values = {};
  FILTER_LEVELS.forEach(function(level) {
    const key = adapter.filterKeys[level];
    if (key) values[key] = sel && sel[level] != null ? sel[level] : null;
  });
  return values;
}

// ===== NODES =====

function compareDe(a, b) {
  return String(a).localeCompare(String(b), 'de');
}

function nodeKey(level, values) {
  return level + ':' + values.map(encodeURIComponent).join('/');
}

function collectObjects() {
  const items = adapter.buildings().map(function(f) {
    const o = adapter.building(f);
    o.kind = 'building';
    return o;
  });
  const byWe = new Map();
  adapter.allBuildings().forEach(function(f) {
    const o = adapter.building(f);
    if (!byWe.has(o.we)) byWe.set(o.we, o);
  });
  adapter.parcels().forEach(function(f) {
    const o = adapter.parcel(f);
    const b = byWe.get(o.we);
    if (!b) return; // no building of that WE: no place in the tree
    o.kind = 'parcel';
    o.country = b.country; o.region = b.region; o.city = b.city;
    items.push(o);
  });
  return items;
}

function stateOf(sel, current) {
  const keys = Object.keys(sel);
  if (!keys.every(function(k) { return String(current[k]) === String(sel[k]); })) return '';
  return Object.keys(current).length > keys.length ? 'path' : 'active';
}

function build(items, depth, sel, values, parent, current) {
  if (depth === LEVELS.length) {
    return items.slice().sort(function(a, b) { return compareDe(a.kind, b.kind) || compareDe(a.label, b.label); })
      .map(function(o) {
        const active = (o.kind === 'building' && state.selectedBuildingId === o.id) || (o.kind === 'parcel' && state.selectedParcelId === o.id);
        return { key: 'obj:' + o.kind + ':' + encodeURIComponent(o.id), parent: parent, leaf: true, kind: o.kind, id: o.id, label: o.label, idText: o.code,
          icon: KIND_ICONS[o.kind], state: active ? 'active' : '', children: [] };
      });
  }
  const level = LEVELS[depth];
  const groups = new Map();
  items.forEach(function(o) {
    const v = o[level] == null ? '' : String(o[level]);
    if (!groups.has(v)) groups.set(v, []);
    groups.get(v).push(o);
  });
  const labelOf = function(v) { return level === 'country' ? countryName(v) : level === 'we' ? t('tree.we') + ' ' + v : v; };
  const keys = Array.from(groups.keys()).sort(function(a, b) {
    return level === 'we' ? compareDe(a, b) : compareDe(labelOf(a), labelOf(b));
  });
  return keys.map(function(v) {
    const entries = groups.get(v);
    const own = level === 'we' ? null : Object.assign({}, sel, { [level]: v });
    const vals = values.concat([v]);
    const key = nodeKey(level, vals);
    return { key: key, parent: parent, level: level, label: labelOf(v), icon: LEVEL_ICONS[level], count: entries.length,
      sel: own, state: own ? stateOf(own, current) : '', children: build(entries, depth + 1, own || sel, vals, key, current) };
  });
}

// ===== RENDERING =====

// Open: the one node of its level that is unfolded (the reader's choice or the branch of the selection)
function isOpen(node) {
  if (node.leaf || !node.children.length) return false;
  return openChild.get(node.parent) === node.key;
}

function setOpen(node, open) {
  if (open) openChild.set(node.parent, node.key);
  else if (openChild.get(node.parent) === node.key) openChild.delete(node.parent);
}

// Unfolds the branch of a selection, level by level (each level keeps its one open node)
function openPath(sel) {
  const values = [];
  let parent = '';
  for (let i = 0; i < FILTER_LEVELS.length; i++) {
    const v = sel && sel[FILTER_LEVELS[i]];
    if (!v) break;
    values.push(String(v));
    const key = nodeKey(FILTER_LEVELS[i], values);
    openChild.set(parent, key);
    parent = key;
  }
}

function rowHtml(node, depth) {
  nodeIndex.set(node.key, node);
  const indent = GUTTER + depth * INDENT;
  const open = isOpen(node);
  const stateCls = node.state === 'active' ? ' is-active' : node.state === 'path' ? ' is-path' : '';
  const fold = node.leaf || !node.children.length
    ? '<span class="tree-fold-slot" aria-hidden="true"></span>'
    : '<button type="button" class="tree-fold" data-fold="' + escapeHtml(node.key) + '" tabindex="-1" aria-expanded="' + open + '" aria-label="' + escapeHtml(t(open ? 'tree.collapse' : 'tree.expand', { name: node.label })) + '">' +
      '<span class="material-symbols-outlined">chevron_right</span></button>';
  const row = '<button type="button" class="tree-row" role="treeitem" tabindex="-1" aria-level="' + (depth + 1) + '"' +
    (node.state === 'active' ? ' aria-selected="true"' : ' aria-selected="false"') +
    (node.leaf ? '' : ' aria-expanded="' + open + '"') +
    ' data-node="' + escapeHtml(node.key) + '"' + (node.leaf ? ' data-kind="' + node.kind + '" data-id="' + escapeHtml(node.id) + '"' : '') + '>' +
    '<span class="material-symbols-outlined tree-icon" aria-hidden="true">' + node.icon + '</span>' +
    (node.idText ? '<span class="tree-id">' + escapeHtml(node.idText) + '</span>' : '') +
    '<span class="tree-label">' + escapeHtml(node.label) + '</span>' +
    (node.count != null ? '<span class="tree-count">' + node.count + '</span>' : '') +
    '</button>';
  const children = node.children.length
    ? '<ul class="tree-children" role="group"' + (open ? '' : ' hidden') + '>' + (open ? node.children.map(function(c) { return rowHtml(c, depth + 1); }).join('') : '') + '</ul>'
    : '';
  return '<li class="tree-item" role="none" style="--tree-ind:' + indent + 'px"><div class="tree-node' + stateCls + '">' + fold + row + '</div>' + children + '</li>';
}

function roving(host) {
  const rows = Array.from(host.querySelectorAll('[role="treeitem"]'));
  rows.forEach(function(r) { r.tabIndex = -1; });
  const current = rows.find(function(r) { return r.getAttribute('aria-selected') === 'true'; }) || rows[0];
  if (current) current.tabIndex = 0;
}

export function renderLocationTree() {
  const host = document.getElementById('tree-panel-content');
  if (!host || !adapter) return;
  nodeIndex = new Map();
  const nodes = build(collectObjects(), 0, {}, [], '', currentSelection());
  host.innerHTML = nodes.length
    ? '<ul class="tree" role="tree" aria-label="' + escapeHtml(t('tree.title')) + '">' + nodes.map(function(n) { return rowHtml(n, 0); }).join('') + '</ul>'
    : '<div class="tree-empty">' + escapeHtml(t('tree.empty')) + '</div>';
  roving(host);
}

// ===== PANEL =====

// The header button is a plain toggle: .panel-open while the panel shows, default otherwise
export function toggleTreePanel(open) {
  const panel = document.getElementById('tree-panel');
  const btn = document.getElementById('tree-panel-btn');
  if (!panel) return;
  if (open === undefined) open = !panel.classList.contains('open');
  const wasOpen = panel.classList.contains('open');
  panel.classList.toggle('open', open);
  if (btn) {
    btn.classList.toggle('panel-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (open && !wasOpen) {
    renderLocationTree();
    if (isMobileLayout()) {
      const closeBtn = document.getElementById('tree-close-btn');
      if (closeBtn) closeBtn.focus();
    }
  } else if (!open && wasOpen && btn && panel.contains(document.activeElement)) {
    btn.focus();
  }
  if (state.map) setTimeout(function() { state.map.resize(); }, 350);
}

// ===== RESIZE (right edge; same handling as the filter drawer) =====

function initTreeResize(panel) {
  const handle = panel.querySelector('.tree-resize-handle');
  if (!handle) return;

  let startX, startWidth;
  const styles = getComputedStyle(document.documentElement);
  const minWidth = parseInt(styles.getPropertyValue('--tree-panel-min-width')) || 240;
  const maxWidth = parseInt(styles.getPropertyValue('--tree-panel-max-width')) || 600;

  const savedWidth = parseInt(storageGet('treePanelWidth'), 10);
  if (savedWidth) {
    document.documentElement.style.setProperty('--tree-panel-width', Math.min(maxWidth, Math.max(minWidth, savedWidth)) + 'px');
  }

  function onResizeMove(e) {
    const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + (e.clientX - startX))); // dragging right = wider
    document.documentElement.style.setProperty('--tree-panel-width', newWidth + 'px');
  }

  function onResizeEnd() {
    document.removeEventListener('pointermove', onResizeMove);
    document.removeEventListener('pointerup', onResizeEnd);
    document.removeEventListener('pointercancel', onResizeEnd);
    handle.classList.remove('dragging');
    panel.classList.remove('resizing');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    storageSet('treePanelWidth', panel.offsetWidth);
    if (state.map) state.map.resize();
  }

  // Pointer events cover mouse, pen and touch (the handle has touch-action: none in the stylesheet)
  handle.addEventListener('pointerdown', function(e) {
    if (e.button !== 0 || isMobileLayout()) return; // full-screen sheet on phones: nothing to resize
    startX = e.clientX;
    startWidth = panel.offsetWidth;
    handle.classList.add('dragging');
    panel.classList.add('resizing');
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
    document.addEventListener('pointermove', onResizeMove);
    document.addEventListener('pointerup', onResizeEnd);
    document.addEventListener('pointercancel', onResizeEnd);
  });
}

// ===== INTERACTION =====

function onTreeClick(e) {
  const fold = e.target.closest('.tree-fold');
  if (fold) {
    const key = fold.dataset.fold;
    const node = nodeIndex.get(key);
    if (node) setOpen(node, !isOpen(node));
    renderLocationTree();
    const again = document.querySelector('.tree-fold[data-fold="' + CSS.escape(key) + '"]');
    if (again) again.focus();
    return;
  }
  const row = e.target.closest('.tree-row');
  if (!row) return;
  const node = nodeIndex.get(row.dataset.node);
  if (!node) return;
  if (node.leaf) {
    adapter.onSelectObject(node.kind, node.id);
    if (isMobileLayout()) toggleTreePanel(false);
    return;
  }
  if (!node.sel) {
    // WE: a folder, the row toggles it like the chevron
    setOpen(node, !isOpen(node));
    renderLocationTree();
    focusRow(node.key);
    return;
  }
  if (node.state === 'active') {
    // The selected node again: remove its filter (and the deeper ones) and fold its branch (toggle)
    setOpen(node, false);
    const parentSel = Object.assign({}, node.sel);
    delete parentSel[node.level];
    adapter.setFilters(filtersFor(parentSel));
    return;
  }
  openPath(node.sel);
  adapter.setFilters(filtersFor(node.sel)); // applies the filters, which re-renders the tree
}

// Arrow keys and Home/End move the single tab stop; Right opens, Left closes or goes to the parent
function onTreeKey(e) {
  const host = document.getElementById('tree-panel-content');
  const rows = Array.from(host.querySelectorAll('[role="treeitem"]'));
  const i = rows.indexOf(document.activeElement);
  if (i < 0) return;
  function go(j) { e.preventDefault(); rows.forEach(function(r) { r.tabIndex = -1; }); rows[j].tabIndex = 0; rows[j].focus(); }
  const current = rows[i];
  const key = current.dataset.node;
  const node = nodeIndex.get(key);
  if (e.key === 'ArrowDown' && i < rows.length - 1) go(i + 1);
  else if (e.key === 'ArrowUp' && i > 0) go(i - 1);
  else if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(rows.length - 1);
  else if (e.key === 'ArrowRight' && node && !node.leaf && !isOpen(node)) {
    e.preventDefault();
    setOpen(node, true);
    renderLocationTree();
    focusRow(key);
  } else if (e.key === 'ArrowLeft' && node) {
    e.preventDefault();
    if (!node.leaf && isOpen(node)) {
      setOpen(node, false);
      renderLocationTree();
      focusRow(key);
    } else {
      const parentItem = current.closest('.tree-children');
      const parentRow = parentItem && parentItem.parentElement.querySelector(':scope > .tree-node > .tree-row');
      if (parentRow) { rows.forEach(function(r) { r.tabIndex = -1; }); parentRow.tabIndex = 0; parentRow.focus(); }
    }
  }
}

function focusRow(key) {
  const row = document.querySelector('.tree-row[data-node="' + CSS.escape(key) + '"]');
  if (row) {
    document.querySelectorAll('#tree-panel-content [role="treeitem"]').forEach(function(r) { r.tabIndex = -1; });
    row.tabIndex = 0;
    row.focus();
  }
}

export function initLocationTree(a) {
  adapter = a;
  const panel = document.getElementById('tree-panel');
  const host = document.getElementById('tree-panel-content');
  if (!panel || !host) return;

  host.addEventListener('click', onTreeClick);
  host.addEventListener('keydown', onTreeKey);
  initTreeResize(panel);

  const btn = document.getElementById('tree-panel-btn');
  if (btn) btn.addEventListener('click', function() { toggleTreePanel(); });
  const closeBtn = document.getElementById('tree-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', function() { toggleTreePanel(false); });
  const menuBtn = document.getElementById('mobile-tree-btn');
  if (menuBtn) menuBtn.addEventListener('click', function() { closePhoneMenu(); toggleTreePanel(true); });

  onEscape(function() {
    if (!panel.classList.contains('open')) return false;
    toggleTreePanel(false);
    return true;
  }, 30);

  openPath(currentSelection()); // location filters restored from the URL show their branch
  renderLocationTree();
}
