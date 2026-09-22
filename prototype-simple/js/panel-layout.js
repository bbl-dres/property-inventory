// Actual header geometry and phone-sheet focus, shared by both prototypes.
import { isMobileLayout } from './utils.js';

let initialized = false;
let frame;
let sheet = null;
let oldOverflow = '';
let inertElements = [];
let lastOpened = 'tree-panel';

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
  if (window.innerWidth < 1280) {
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
  if (window.innerWidth < 1280 && document.querySelector('#tree-panel.open') && document.querySelector('#filter-panel.open')) {
    document.getElementById(lastOpened === 'tree-panel' ? 'drawer-close-btn' : 'tree-close-btn')?.click();
  }
  const header = document.getElementById('header');
  const bottom = Math.max(0, Math.min(innerHeight, header?.getBoundingClientRect().bottom || 0));
  document.documentElement.style.setProperty('--detail-panel-top', bottom + 'px');
  const next = isMobileLayout() ? document.querySelector('#filter-panel.open, #tree-panel.open') : null;
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
  if (window.ResizeObserver) new ResizeObserver(updatePanelLayout).observe(document.getElementById('header'));
  if (window.MutationObserver) {
    const observer = new MutationObserver(updatePanelLayout);
    ['tree-panel','filter-panel'].forEach(id => observer.observe(document.getElementById(id), { attributes: true, attributeFilter: ['class'] }));
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
