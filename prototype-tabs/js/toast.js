// Toast notifications (shared). Needs a #toast-container element fixed to the viewport.

import { escapeHtml } from './utils.js';
import { t } from './i18n.js';

const toastIcons = {
  error: 'error',
  warning: 'warning',
  success: 'check_circle',
  info: 'info'
};

let positionInitialized = false;
let positionFrame;
function updateToastPosition() {
  if (positionFrame) cancelAnimationFrame(positionFrame);
  positionFrame = requestAnimationFrame(function() {
    positionFrame = null;
    const container = document.getElementById('toast-container');
    const toggle = document.getElementById('tbl-toggle');
    if (!container) return;
    if (toggle?.getClientRects().length) {
      const rect = toggle.getBoundingClientRect();
      const scale = container.offsetWidth ? container.getBoundingClientRect().width / container.offsetWidth : 1;
      container.style.setProperty('--toast-bottom', (window.innerHeight - rect.top + 16) / scale + 'px');
    } else container.style.removeProperty('--toast-bottom');
  });
}

function initToastPosition() {
  if (!positionInitialized) {
    positionInitialized = true;
    window.addEventListener('resize', updateToastPosition);
    // The map shrinks while the table opens/resizes; the toggle moves with it.
    if (window.ResizeObserver) {
      const observer = new ResizeObserver(updateToastPosition);
      ['map', 'tbl-toggle', 'footer'].forEach(id => {
        const element = document.getElementById(id);
        if (element) observer.observe(element);
      });
    }
  }
  updateToastPosition();
}

// options: { type, title, message, duration (0 = sticky), actions: [{ label, primary, onClick }] }
export function showToast(options) {
  const container = document.getElementById('toast-container');
  if (!container) return null;
  initToastPosition();

  const type = options.type || 'info';
  const title = options.title || '';
  const message = options.message || '';
  const duration = options.duration !== undefined ? options.duration : 5000;
  const actions = options.actions || [];

  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;

  let html = '<div class="toast-icon"><span class="material-symbols-outlined">' + toastIcons[type] + '</span></div>';
  html += '<div class="toast-content">';
  if (title) html += '<div class="toast-title">' + escapeHtml(title) + '</div>';
  if (message) html += '<div class="toast-message">' + escapeHtml(message) + '</div>';
  if (actions.length > 0) {
    html += '<div class="toast-actions">';
    actions.forEach(function(action, index) {
      html += '<button class="toast-action-btn ' + (action.primary ? 'primary' : 'secondary') + '" data-toast-action="' + index + '">' + escapeHtml(action.label) + '</button>';
    });
    html += '</div>';
  }
  html += '</div>';
  html += '<button class="icon-btn toast-close" aria-label="' + escapeHtml(t('modal.close')) + '"><span class="material-symbols-outlined">close</span></button>';

  toast.innerHTML = html;
  container.appendChild(toast);

  toast.querySelector('.toast-close').addEventListener('click', function() { hideToast(toast); });

  actions.forEach(function(action, index) {
    const btn = toast.querySelector('[data-toast-action="' + index + '"]');
    if (btn && action.onClick) {
      btn.addEventListener('click', function() {
        action.onClick();
        hideToast(toast);
      });
    }
  });

  if (duration > 0) {
    setTimeout(function() { hideToast(toast); }, duration);
  }

  return toast;
}

export function hideToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.classList.add('hiding');
  setTimeout(function() {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 300);
}

// Sticky when a retry callback is given, otherwise 8 s
export function showError(title, message, retryCallback) {
  const actions = [];
  if (retryCallback) {
    actions.push({ label: t('error.retry'), primary: true, onClick: retryCallback });
  }
  return showToast({ type: 'error', title: title, message: message, duration: retryCallback ? 0 : 8000, actions: actions });
}

export function showWarning(title, message) {
  return showToast({ type: 'warning', title: title, message: message, duration: 6000 });
}
