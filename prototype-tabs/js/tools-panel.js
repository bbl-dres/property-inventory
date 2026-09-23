// Map tools panel (shared). Desktop and tablets: the accordion panel floats at the top left of the
// map with the "Menü" toggle attached below it (css: #accordion-wrapper). Phones: the same panel
// slides in from the right as the hamburger menu, with a backdrop, focus management and Escape.
// Tablets and phones start collapsed: open, the panel covers 40 to 80 % of the map.

import { t } from './i18n.js';
import { isMobileLayout, isCompactLayout } from './utils.js';
import { onEscape } from './keys.js';

let menuOpen = true;
let setOpenRef = function() {};

export function isToolsPanelOpen() {
  return menuOpen;
}

// Closes the phone menu after an entry was chosen; on desktop the panel stays open
export function closePhoneMenu(restoreFocus) {
  if (menuOpen && isMobileLayout()) setOpenRef(false, restoreFocus);
}

// Unfolds the panel (tablets start collapsed, phones keep it as the hamburger menu) so that an
// accordion item opened from elsewhere, e.g. "Drucken" in the map context menu, is visible
export function openToolsPanel() {
  if (!menuOpen) setOpenRef(true);
}

// Folds the floating panel when another element (the object card on a narrow map) would overlap it; the
// reader can open it again with the toggle. Returns true when it folded. Phones: the menu never floats.
export function collapseToolsPanelIfColliding(el) {
  const panel = document.getElementById('accordion-panel');
  if (!menuOpen || !el || !panel || isMobileLayout()) return false;
  const a = panel.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  if (!a.height || !b.height) return false;
  const overlaps = a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right;
  if (overlaps) setOpenRef(false);
  return overlaps;
}

export function initToolsPanel() {
  const menuToggle = document.getElementById('menu-toggle');
  const panel = document.getElementById('accordion-panel');
  const toggleText = document.getElementById('menu-toggle-text');
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const closeBtn = document.getElementById('mobile-menu-close');
  const backdrop = document.getElementById('mobile-menu-backdrop');
  if (!menuToggle || !panel) return;
  const toggleIcon = menuToggle.querySelector('.material-symbols-outlined');
  // The phone menu is global navigation. Its desktop dock lives inside the map
  // view, which is display:none on detail/gallery pages. Keep stable return points.
  const docks = [backdrop, document.getElementById('accordion-wrapper')].filter(Boolean).map(function(el) {
    const marker = document.createComment('desktop tools dock');
    el.before(marker);
    return { el, marker };
  });

  // Backdrop and hamburger state only apply to the phone layout
  function syncPhoneChrome() {
    const mobile = isMobileLayout();
    const focused = panel.contains(document.activeElement) ? document.activeElement : null;
    docks.forEach(function({ el, marker }) {
      if (mobile && el.parentElement !== document.body) document.body.appendChild(el);
      else if (!mobile && el.parentElement !== marker.parentElement) marker.after(el);
    });
    if (focused && focused !== document.activeElement && focused.getClientRects().length) focused.focus();
    const phoneOpen = menuOpen && mobile;
    if (backdrop) backdrop.classList.toggle('active', phoneOpen);
    if (hamburgerBtn) hamburgerBtn.setAttribute('aria-expanded', phoneOpen ? 'true' : 'false');
  }

  function render() {
    panel.classList.toggle('collapsed', !menuOpen);
    // data-i18n keeps the label correct after a language change
    if (toggleText) {
      toggleText.setAttribute('data-i18n', menuOpen ? 'menu.close' : 'menu.open');
      toggleText.textContent = t(menuOpen ? 'menu.close' : 'menu.open');
    }
    if (toggleIcon) toggleIcon.textContent = menuOpen ? 'expand_less' : 'expand_more';
    menuToggle.setAttribute('aria-expanded', menuOpen ? 'true' : 'false');
    syncPhoneChrome();
  }

  // restoreFocus: the menu was dismissed without choosing an entry
  function setOpen(open, restoreFocus) {
    menuOpen = open;
    render();
    if (!isMobileLayout()) return;
    if (open && closeBtn) {
      closeBtn.focus(); // screen readers, external keyboards on tablets
    } else if (!open && restoreFocus && hamburgerBtn && panel.contains(document.activeElement)) {
      hamburgerBtn.focus();
    }
  }
  setOpenRef = setOpen;

  menuOpen = !isCompactLayout();
  render();

  menuToggle.addEventListener('click', function() { setOpen(!menuOpen); });
  menuToggle.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(!menuOpen);
    }
  });
  if (hamburgerBtn) hamburgerBtn.addEventListener('click', function() { setOpen(true); });
  if (closeBtn) closeBtn.addEventListener('click', function() { setOpen(false, true); });
  if (backdrop) backdrop.addEventListener('click', function() { setOpen(false, true); });
  window.addEventListener('resize', syncPhoneChrome);

  onEscape(function() {
    if (!(menuOpen && isMobileLayout())) return false;
    setOpen(false, true);
    return true;
  }, 40);
}
