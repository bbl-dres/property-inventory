// Boot helpers (shared): loading overlay, global error reporting, fatal boot errors.

import { tf } from './i18n.js';
import { showError } from './toast.js';

export function showLoadingOverlay(text) {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  const textEl = overlay.querySelector('.loading-text');
  if (textEl && text) textEl.textContent = text;
  overlay.classList.remove('hidden');
}

export function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.add('hidden');
}

// Marks the boot as finished for the watchdog in index.html (which otherwise replaces the
// spinner with a static error message after 20 s).
export function markBooted() {
  window.__appBooted = true;
}

let lastRuntimeError = null;
let lastRuntimeErrorAt = 0;

// Surfaces uncaught errors / rejected promises as a toast instead of failing silently.
// Throttled and de-duplicated so a repeating error cannot flood the screen.
export function reportRuntimeError(err) {
  const message = (err && err.message) ? err.message : String(err || 'Unknown error');
  if (/ResizeObserver loop|^Script error\.?$/.test(message)) return; // benign browser noise
  const now = Date.now();
  if (message === lastRuntimeError && now - lastRuntimeErrorAt < 10000) return;
  lastRuntimeError = message;
  lastRuntimeErrorAt = now;
  console.error('[app] runtime error:', err);
  showError(
    tf('error.unexpected.title', 'Unerwarteter Fehler'),
    tf('error.unexpected.message', 'Ein Fehler ist aufgetreten. Bitte laden Sie die Seite neu, falls das Problem weiterhin besteht.') +
      ' (' + message + ')'
  );
}

export function initGlobalErrorHandlers() {
  window.addEventListener('error', function(e) { reportRuntimeError(e.error || e.message); });
  window.addEventListener('unhandledrejection', function(e) { reportRuntimeError(e.reason); });
}

// Anything that throws before the data is loaded ends up here: hide the spinner and
// show a persistent error with a reload action.
export function fatalBootError(err) {
  console.error('[app] fatal boot error:', err);
  hideLoadingOverlay();
  markBooted();
  const message = (err && err.message) ? err.message : String(err);
  showError(
    tf('error.init.title', 'Anwendung konnte nicht gestartet werden'),
    tf('error.init.message', 'Bitte laden Sie die Seite neu. Details finden Sie in der Browser-Konsole.') + ' (' + message + ')',
    function() { window.location.reload(); }
  );
}
