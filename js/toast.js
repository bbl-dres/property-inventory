// Toast notification system

import { escapeHtml } from './utils.js';
import { t } from './i18n.js';

var toastIcons = {
  error: 'error',
  warning: 'warning',
  success: 'check_circle',
  info: 'info'
};

export function showToast(options) {
  var container = document.getElementById('toast-container');
  if (!container) return;

  var type = options.type || 'info';
  var title = options.title || '';
  var message = options.message || '';
  var duration = options.duration !== undefined ? options.duration : 5000;
  var actions = options.actions || [];

  var toast = document.createElement('div');
  toast.className = 'toast toast-' + type;

  var html = '<div class="toast-icon"><span class="material-symbols-outlined">' + toastIcons[type] + '</span></div>';
  html += '<div class="toast-content">';
  if (title) {
    html += '<div class="toast-title">' + escapeHtml(title) + '</div>';
  }
  if (message) {
    html += '<div class="toast-message">' + escapeHtml(message) + '</div>';
  }
  if (actions.length > 0) {
    html += '<div class="toast-actions">';
    actions.forEach(function(action, index) {
      html += '<button class="toast-action-btn ' + (action.primary ? 'primary' : 'secondary') + '" data-action="' + index + '">' + escapeHtml(action.label) + '</button>';
    });
    html += '</div>';
  }
  html += '</div>';
  html += '<button class="toast-close" aria-label="' + t('modal.close') + '"><span class="material-symbols-outlined">close</span></button>';

  toast.innerHTML = html;
  container.appendChild(toast);

  var closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', function() {
    hideToast(toast);
  });

  actions.forEach(function(action, index) {
    var btn = toast.querySelector('[data-action="' + index + '"]');
    if (btn && action.onClick) {
      btn.addEventListener('click', function() {
        action.onClick();
        hideToast(toast);
      });
    }
  });

  if (duration > 0) {
    setTimeout(function() {
      hideToast(toast);
    }, duration);
  }

  return toast;
}

export function hideToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.classList.add('hiding');
  setTimeout(function() {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 300);
}

export function showError(title, message, retryCallback) {
  var actions = [];
  if (retryCallback) {
    actions.push({
      label: t('error.retry'),
      primary: true,
      onClick: retryCallback
    });
  }
  return showToast({
    type: 'error',
    title: title,
    message: message,
    duration: retryCallback ? 0 : 8000,
    actions: actions
  });
}

export function showWarning(title, message) {
  return showToast({ type: 'warning', title: title, message: message, duration: 6000 });
}

export function showSuccess(title, message) {
  return showToast({ type: 'success', title: title, message: message, duration: 4000 });
}

export function showInfo(title, message) {
  return showToast({ type: 'info', title: title, message: message, duration: 5000 });
}
