// Tools panel accordion (shared). Accordion items carry data-accordion="print|catalog|layers|...";
// exactly one item is open at a time. The print item shows the print preview while open, the
// catalog item expands to full height and loads the Geokatalog.

import { showPrintPreview, hidePrintPreview } from './print.js';
import { loadGeokatalog } from './swisstopo.js';
import { openToolsPanel } from './tools-panel.js';

let hooks = {};

function toggleHeader(header) {
  const item = header.closest('.accordion-item');
  const key = item ? (item.getAttribute('data-accordion') || '') : '';
  const content = header.nextElementSibling;
  const wasActive = header.classList.contains('active');

  document.querySelectorAll('.accordion-header').forEach(function(h) {
    h.classList.remove('active');
    h.setAttribute('aria-expanded', 'false');
  });
  document.querySelectorAll('.accordion-content').forEach(function(c) { c.classList.remove('show'); });
  const geokatalog = document.getElementById('geokatalog-accordion');
  if (geokatalog) geokatalog.classList.remove('expanded');

  // The print preview only makes sense while the print item is open
  hidePrintPreview();

  if (!wasActive) {
    header.classList.add('active');
    header.setAttribute('aria-expanded', 'true');
    if (content) content.classList.add('show');
    if (key === 'print') showPrintPreview();
    if (key === 'catalog') {
      if (geokatalog) geokatalog.classList.add('expanded');
      loadGeokatalog();
    }
    if (hooks.onOpen) hooks.onOpen(key, header);
  }
  if (hooks.onChange) hooks.onChange(key, !wasActive);
}

// hooks: { onOpen(key, header), onChange(key, isOpen) }
export function initAccordion(options) {
  hooks = options || {};
  document.querySelectorAll('.accordion-header').forEach(function(header) {
    header.addEventListener('click', function() { toggleHeader(header); });
    // Headers that are not <button> elements (div[role="button"]) need Enter/Space themselves
    if (header.tagName !== 'BUTTON') {
      header.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleHeader(header);
        }
      });
    }
  });
}

// Open an item programmatically (e.g. from the map context menu). The tools panel is unfolded
// first: an item opened inside a collapsed panel would be invisible.
export function openAccordion(key) {
  const header = document.querySelector('.accordion-item[data-accordion="' + key + '"] .accordion-header');
  if (!header) return;
  openToolsPanel();
  if (!header.classList.contains('active')) header.click();
}
