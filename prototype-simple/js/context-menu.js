// Map context menu (shared): coordinates, share, measure, print, report a problem.
// Needs the #map-context-menu markup.

import { showToast } from './toast.js';
import { t } from './i18n.js';
import { onEscape } from './keys.js';
import { isMeasuring, toggleMeasurement } from './measure.js';
import { openAccordion } from './accordion.js';

let contextMenuLngLat = null;

export function hideContextMenu() {
  const contextMenu = document.getElementById('map-context-menu');
  if (contextMenu) contextMenu.classList.remove('show');
}

function copyToClipboard(text, successMessage) {
  if (!navigator.clipboard) {
    showToast({ type: 'error', title: t('error.copy.title'), message: t('error.copy.message'), duration: 3000 });
    return Promise.resolve(false);
  }
  return navigator.clipboard.writeText(text).then(function() {
    showToast({ type: 'success', title: t('success.copy.title'), message: successMessage, duration: 2000 });
    return true;
  }).catch(function() {
    showToast({ type: 'error', title: t('error.copy.title'), message: t('error.copy.message'), duration: 3000 });
    return false;
  });
}

// Web Share API when available, clipboard otherwise
export function shareUrl(url, title, text) {
  if (navigator.share) {
    return navigator.share({ title: title, text: text, url: url }).catch(function(err) {
      // User cancelled or share failed: copy to clipboard as fallback
      if (err && err.name !== 'AbortError') return copyToClipboard(url, t('success.copy.message'));
    });
  }
  return copyToClipboard(url, t('success.copy.message'));
}

export function initContextMenu(map) {
  const contextMenu = document.getElementById('map-context-menu');
  if (!contextMenu) return;
  const coordsItem = document.getElementById('context-menu-coords');
  const coordsText = document.getElementById('context-menu-coords-text');
  const shareItem = document.getElementById('context-menu-share');
  const measureItem = document.getElementById('context-menu-measure');
  const measureText = document.getElementById('context-menu-measure-text');
  const printItem = document.getElementById('context-menu-print');
  const reportItem = document.getElementById('context-menu-report');

  map.on('contextmenu', function(e) {
    e.preventDefault();
    contextMenuLngLat = e.lngLat;

    if (coordsText) coordsText.textContent = e.lngLat.lat.toFixed(5) + ', ' + e.lngLat.lng.toFixed(5);
    if (coordsItem) coordsItem.classList.remove('copied');
    if (measureText) measureText.textContent = t(isMeasuring() ? 'map.context.measure.delete' : 'map.context.measure');

    // Flip the menu near the right/bottom edge of the map
    const mapRect = map.getContainer().getBoundingClientRect();
    const menuWidth = 200;
    const menuHeight = 180;
    contextMenu.style.left = e.point.x + 'px';
    contextMenu.style.top = e.point.y + 'px';
    contextMenu.classList.toggle('flip-horizontal', (e.point.x + menuWidth) > mapRect.width);
    contextMenu.classList.toggle('flip-vertical', (e.point.y + menuHeight) > mapRect.height);
    contextMenu.classList.add('show');
  });

  // Any left click on the map closes the menu (the measure tool then handles the click). The menu is
  // anchored to a map position: a pan or zoom moves the map under it, so it closes too, as does a
  // click anywhere else on the page.
  map.on('click', hideContextMenu);
  map.on('movestart', hideContextMenu);
  document.addEventListener('click', function(e) {
    if (contextMenu.classList.contains('show') && !contextMenu.contains(e.target)) hideContextMenu();
  });

  onEscape(function() {
    if (!contextMenu.classList.contains('show')) return false;
    hideContextMenu();
    return true;
  }, 80);

  if (coordsItem && coordsText) {
    coordsItem.addEventListener('click', function() {
      const text = coordsText.textContent;
      copyToClipboard(text, text).then(function(ok) {
        if (ok) {
          coordsItem.classList.add('copied');
          setTimeout(hideContextMenu, 300);
        }
      });
    });
  }

  if (shareItem) {
    shareItem.addEventListener('click', function(e) {
      e.stopPropagation();
      if (!contextMenuLngLat) return;
      // The share URL uses the same lng/lat/zoom parameters the app restores on load
      const url = new URL(window.location);
      url.searchParams.set('lng', contextMenuLngLat.lng.toFixed(5));
      url.searchParams.set('lat', contextMenuLngLat.lat.toFixed(5));
      url.searchParams.set('zoom', map.getZoom().toFixed(2));
      hideContextMenu();
      shareUrl(url.toString(), t('share.title'), t('share.email.body'));
    });
  }

  if (measureItem) {
    measureItem.addEventListener('click', function() {
      hideContextMenu();
      toggleMeasurement();
    });
  }

  // "Drucken" opens the print panel (PDF export) instead of the browser's page print
  if (printItem) {
    printItem.addEventListener('click', function() {
      hideContextMenu();
      openAccordion('print');
    });
  }

  if (reportItem) {
    reportItem.addEventListener('click', function() {
      hideContextMenu();
      if (!contextMenuLngLat) return;
      const lat = contextMenuLngLat.lat.toFixed(5);
      const lon = contextMenuLngLat.lng.toFixed(5);
      const subject = encodeURIComponent('Problem melden - GIS Immobilienportfolio');
      const body = encodeURIComponent('Problembeschreibung:\n\n\n\n---\nKoordinaten: ' + lat + ', ' + lon + '\nURL: ' + window.location.href);
      window.location.href = 'mailto:info@gis-immo.ch?subject=' + subject + '&body=' + body;
    });
  }
}
