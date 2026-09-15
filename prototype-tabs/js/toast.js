// Toast notifications (shared). Needs a #toast-container element fixed to the viewport.

import { escapeHtml } from './utils.js';
import { t } from './i18n.js';

const toastIcons = {
  error: 'error',
  warning: 'warning',
  success: 'check_circle',
  info: 'info'
};

// options: { type, title, message, duration (0 = sticky), actions: [{ label, primary, onClick }] }
export function showToast(options) {
  const container = document.getElementById('toast-container');
  if (!container) return null;

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
