import { state } from './state.js';
import { showToast } from './toast.js';
import { startMeasurement, clearMeasurement } from './measure.js';
import { getShareUrl } from './share.js';
import { t } from './i18n.js';

// ===== MAP CONTEXT MENU =====

// Hide context menu
function hideContextMenu() {
  var contextMenu = document.getElementById('map-context-menu');
  if (contextMenu) {
    contextMenu.classList.remove('show');
  }
}

// Initialize context menu: set up all event handlers
function initContextMenu() {
  var map = state.map;
  var contextMenu = document.getElementById('map-context-menu');
  var contextMenuCoords = document.getElementById('context-menu-coords');
  var contextMenuCoordsText = document.getElementById('context-menu-coords-text');
  var contextMenuShare = document.getElementById('context-menu-share');
  var contextMenuMeasureText = document.getElementById('context-menu-measure-text');
  var contextMenuPrint = document.getElementById('context-menu-print');
  var contextMenuReport = document.getElementById('context-menu-report');

  // Show context menu on right-click
  map.on('contextmenu', function(e) {
    e.preventDefault();

    // Store clicked coordinates
    state.contextMenuLngLat = e.lngLat;

    // Update coordinates display (lat, lon with 5 decimals)
    var lat = state.contextMenuLngLat.lat.toFixed(5);
    var lon = state.contextMenuLngLat.lng.toFixed(5);
    contextMenuCoordsText.textContent = lat + ', ' + lon;
    contextMenuCoords.classList.remove('copied');

    // Toggle measure menu text based on state
    if (state.measureState.active) {
      contextMenuMeasureText.textContent = t('map.context.measure.delete');
    } else {
      contextMenuMeasureText.textContent = t('map.context.measure');
    }

    // Get map container dimensions
    var mapContainer = document.getElementById('map');
    var mapRect = mapContainer.getBoundingClientRect();

    // Calculate menu position relative to map container
    var menuWidth = 200;
    var menuHeight = 180;
    var clickX = e.point.x;
    var clickY = e.point.y;

    // Edge detection
    var flipHorizontal = (clickX + menuWidth) > mapRect.width;
    var flipVertical = (clickY + menuHeight) > mapRect.height;

    // Position the menu
    contextMenu.style.left = clickX + 'px';
    contextMenu.style.top = clickY + 'px';

    // Apply flip classes
    contextMenu.classList.toggle('flip-horizontal', flipHorizontal);
    contextMenu.classList.toggle('flip-vertical', flipVertical);

    // Show menu
    contextMenu.classList.add('show');
  });

  // Close menu on Escape key + clear measurement
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    var contextMenu = document.getElementById('map-context-menu');
    if (contextMenu && contextMenu.classList.contains('show')) {
      e.stopImmediatePropagation();
      hideContextMenu();
      return;
    }
    if (state.measureState.active) {
      e.stopImmediatePropagation();
      clearMeasurement();
    }
  });

  // Copy coordinates to clipboard
  contextMenuCoords.addEventListener('click', function() {
    var coordsText = contextMenuCoordsText.textContent;
    navigator.clipboard.writeText(coordsText).then(function() {
      contextMenuCoords.classList.add('copied');
      showToast({
        type: 'success',
        title: t('success.copy.title'),
        message: coordsText,
        duration: 2000
      });
      setTimeout(hideContextMenu, 300);
    }).catch(function(err) {
      showToast({
        type: 'error',
        title: t('error.copy.title'),
        message: t('error.copy.message'),
        duration: 3000
      });
    });
  });

  // Share - use native system share
  // BUG FIX #21: Fixed fallback showToast calls to use correct object format
  contextMenuShare.addEventListener('click', function(e) {
    e.stopPropagation();
    if (!state.contextMenuLngLat) return;

    // Generate share URL with coordinates
    var lat = state.contextMenuLngLat.lat.toFixed(5);
    var lon = state.contextMenuLngLat.lng.toFixed(5);
    var shareUrl = window.location.origin + window.location.pathname + '?center=' + lon + ',' + lat + '&zoom=' + Math.round(map.getZoom());

    hideContextMenu();

    // Use native Web Share API
    if (navigator.share) {
      navigator.share({
        title: t('share.title'),
        text: t('share.email.body'),
        url: shareUrl
      }).catch(function(err) {
        // User cancelled or share failed - copy to clipboard as fallback
        if (err.name !== 'AbortError') {
          navigator.clipboard.writeText(shareUrl).then(function() {
            showToast({
              type: 'success',
              title: 'Link kopiert',
              message: 'Link wurde in die Zwischenablage kopiert',
              duration: 2000
            });
          });
        }
      });
    } else {
      // Fallback for browsers without Web Share API - copy to clipboard
      navigator.clipboard.writeText(shareUrl).then(function() {
        showToast({
          type: 'success',
          title: t('success.copy.title'),
          message: t('success.copy.message'),
          duration: 2000
        });
      });
    }
  });

  // Print map
  contextMenuPrint.addEventListener('click', function() {
    hideContextMenu();
    window.print();
  });

  // Report problem
  contextMenuReport.addEventListener('click', function() {
    hideContextMenu();
    if (!state.contextMenuLngLat) return;
    var lat = state.contextMenuLngLat.lat.toFixed(5);
    var lon = state.contextMenuLngLat.lng.toFixed(5);
    var subject = encodeURIComponent('Problem melden - GIS Immobilienportfolio');
    var body = encodeURIComponent('Problembeschreibung:\n\n\n\n---\nKoordinaten: ' + lat + ', ' + lon + '\nURL: ' + window.location.href);
    window.location.href = 'mailto:info@gis-immo.ch?subject=' + subject + '&body=' + body;
  });
}

export { initContextMenu, hideContextMenu };
