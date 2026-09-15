// Touch gestures (shared): swipe-to-dismiss bottom sheets and horizontal swipes.

// Bottom sheets on phones: swiping the handle (or header) down dismisses the sheet.
//   panel:           the sheet element
//   handleSelectors: selectors (inside the panel) that accept the gesture
//   onDismiss:       called after a drag of more than 80 px
//   isSheetFn:       returns true while the panel is laid out as a sheet
export function initSheetGesture(panel, handleSelectors, onDismiss, isSheetFn) {
  if (!panel) return;
  let startY = 0;
  let dragY = 0;
  let dragging = false;

  function onStart(e) {
    if (!isSheetFn() || e.touches.length !== 1) return;
    startY = e.touches[0].clientY;
    dragY = 0;
    dragging = true;
    panel.classList.add('sheet-dragging');
  }

  function onMove(e) {
    if (!dragging) return;
    dragY = Math.max(0, e.touches[0].clientY - startY);
    if (dragY > 0) {
      panel.style.transform = 'translateY(' + dragY + 'px)';
      if (e.cancelable) e.preventDefault(); // the sheet follows the finger, the map must not pan
    }
  }

  function onEnd() {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove('sheet-dragging');
    panel.style.transform = '';
    if (dragY > 80) onDismiss();
  }

  handleSelectors.forEach(function(selector) {
    const el = panel.querySelector(selector);
    if (!el) return;
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
  });
}

// Horizontal swipe on an element: onSwipeLeft (finger moves left) / onSwipeRight
export function initSwipe(el, onSwipeLeft, onSwipeRight) {
  if (!el || el.dataset.swipeInit) return;
  el.dataset.swipeInit = '1';
  let startX = null;
  let startY = 0;
  el.addEventListener('touchstart', function(e) {
    if (e.touches.length !== 1) { startX = null; return; }
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchend', function(e) {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    startX = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) onSwipeLeft(); else onSwipeRight();
    }
  }, { passive: true });
}
