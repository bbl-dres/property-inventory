// Actual header geometry and phone-sheet focus, shared by both prototypes.
import { isMobileLayout } from './utils.js';
import { collapseToolsPanelIfColliding } from './tools-panel.js';

let initialized = false;
let frame;
let sheet = null;
let oldOverflow = '';
let inertElements = [];
let lastOpened = 'tree-panel';

// Measure the actual CSS drawer widths (including user resizing) before docking both.
// A panel is temporarily closed, but its width remains available via its resize preference.
function canDockBothPanels() {
  const root = getComputedStyle(document.documentElement);
  const width = document.getElementById('main').clientWidth;
  const panelWidth = name => Math.min(parseFloat(root.getPropertyValue(name)), width - 400);
  return width - panelWidth('--tree-panel-width') - panelWidth('--drawer-width') >= 760;
}

export function restorePanelFocus(panel) {
  const hadFocus = panel.contains(document.activeElement);
  if (sheet === panel) clearSheet();
  if (!hadFocus) return;
  let target = document.getElementById(panel.id === 'tree-panel' ? 'tree-panel-btn' : 'filter-panel-btn');
  if (!target?.getClientRects().length) target = document.getElementById('hamburger-btn');
  target?.focus();
}

export function preparePanelOpen(panelId) {
  lastOpened = panelId;
  // Two drawers on a small screen leave no usable content area.
  if (!isMobileLayout() && !canDockBothPanels()) {
    const other = panelId === 'tree-panel' ? 'filter-panel' : 'tree-panel';
    if (document.getElementById(other)?.classList.contains('open'))
      document.getElementById(other === 'tree-panel' ? 'tree-close-btn' : 'drawer-close-btn')?.click();
  }
}

function clearSheet() {
  if (!sheet) return;
  inertElements.forEach(([el, wasInert]) => { if (!wasInert) el.removeAttribute('inert'); });
  inertElements = [];
  sheet.removeAttribute('aria-modal');
  sheet.setAttribute('role', 'complementary');
  document.body.style.overflow = oldOverflow;
  sheet = null;
}

function update() {
  frame = null;
  if (!isMobileLayout() && document.querySelector('#tree-panel.open') && document.querySelector('#filter-panel.open') && !canDockBothPanels()) {
    document.getElementById(lastOpened === 'tree-panel' ? 'drawer-close-btn' : 'tree-close-btn')?.click();
  }
  const header = document.getElementById('header');
  const bottom = Math.max(0, Math.min(window.innerHeight, header?.getBoundingClientRect().bottom || 0));
  document.documentElement.style.setProperty('--detail-panel-top', bottom + 'px');
  // The phone tree lives inside the tools accordion; only filters use a separate sheet.
  const next = isMobileLayout() ? document.querySelector('#filter-panel.open') : null;
  if (next === sheet) return;
  clearSheet();
  if (!next) return;
  sheet = next;
  oldOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', sheet.id === 'tree-panel' ? 'Standorte' : 'Filter');
  // Inert siblings at each ancestor, without disabling the panel itself.
  let branch = sheet;
  while (branch.parentElement) {
    Array.from(branch.parentElement.children).filter(el => el !== branch && !['SCRIPT','STYLE'].includes(el.tagName)).forEach(el => {
      inertElements.push([el, el.hasAttribute('inert')]); el.setAttribute('inert', '');
    });
    if (branch.parentElement === document.body) break;
    branch = branch.parentElement;
  }
  sheet.querySelector(sheet.id === 'tree-panel' ? '#tree-close-btn' : '#drawer-close-btn')?.focus();
}

export function updatePanelLayout() {
  if (frame) cancelAnimationFrame(frame);
  frame = requestAnimationFrame(update);
}

export function initPanelLayout() {
  if (initialized) return;
  initialized = true;
  window.addEventListener('scroll', updatePanelLayout, { passive: true });
  window.addEventListener('resize', updatePanelLayout);
  if (window.ResizeObserver) {
    const observer = new ResizeObserver(updatePanelLayout);
    ['header', 'tree-panel', 'filter-panel'].forEach(id => observer.observe(document.getElementById(id)));
    // A narrowing map, or a reset label of another length, can bring the floating elements together.
    const overlays = new ResizeObserver(checkMapOverlays);
    ['map', 'map-reset-filters'].forEach(id => { const el = document.getElementById(id); if (el) overlays.observe(el); });
  }
  if (window.MutationObserver) {
    const observer = new MutationObserver(updatePanelLayout);
    ['tree-panel','filter-panel'].forEach(id => observer.observe(document.getElementById(id), { attributes: true, attributeFilter: ['class'] }));
    const overlays = new MutationObserver(checkMapOverlays);
    overlays.observe(document.getElementById('info-panel'), { attributes: true, attributeFilter: ['class'] });
    const reset = document.getElementById('map-reset-filters');
    if (reset) overlays.observe(reset, { attributes: true, attributeFilter: ['hidden'] });
  }
  document.addEventListener('keydown', event => {
    if (!sheet || event.key !== 'Tab' || document.querySelector('.media-preview')) return;
    const controls = Array.from(sheet.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]')).filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    const first = controls[0], last = controls[controls.length - 1];
    if (!first) return;
    if (event.shiftKey && (document.activeElement === first || !sheet.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !sheet.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  });
  updatePanelLayout();
}

// Horizontal overlap of two rectangles, with a small clearance
function sideBySide(a, b) {
  return a.width > 0 && b.width > 0 && a.right > b.left - 8 && a.left < b.right + 8;
}

// Overlaps between the floating map UI. The centred reset action pushes the tools menu and the object
// card down (classes on #map-view, see components.css) only when it would overlap them on a narrow
// map; the tools menu folds when the object card would cover it. The table cannot collide with any
// of them: everything floating lives inside #map, above the split.
function checkMapOverlays() {
  const view = document.getElementById('map-view');
  const info = document.getElementById('info-panel');
  const tools = document.getElementById('accordion-wrapper');
  const reset = document.getElementById('map-reset-filters');
  const cardShown = info.classList.contains('show');
  const resetRect = reset && !reset.hidden && !isMobileLayout() ? reset.getBoundingClientRect() : null;
  view.classList.toggle('reset-over-menu', !!resetRect && !!tools && sideBySide(resetRect, tools.getBoundingClientRect()));
  view.classList.toggle('reset-over-card', !!resetRect && cardShown && sideBySide(resetRect, info.getBoundingClientRect()));
  collapseToolsPanelIfColliding(cardShown ? info : null);
}
