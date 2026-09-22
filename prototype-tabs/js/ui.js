// UI: views (map, gallery, detail), detail tabs, tools panel / phone menu, info panel
// and browser history.

import { state } from './state.js';
import { isMobileLayout, isLandscapePhone } from './utils.js';
import { t, onLangChange } from './i18n.js';
import { showToast } from './toast.js';
import { setStyleSwitcherVisible } from './basemaps.js';
import { initAccordion } from './accordion.js';
import { initToolsPanel, closePhoneMenu } from './tools-panel.js';
import { toggleTreePanel } from './location-tree.js';
import { initSheetGesture } from './gestures.js';
import { shareUrl } from './context-menu.js';
import { renderFilteredTables, renderGalleryView, syncGalleryFilter, setTablePanelOpen } from './list.js';
import { populateDetailView } from './detail.js';
import { closeDocumentPreview } from './document-preview.js';
import { renderEntityTable } from './entity-tables.js';
import { zoomToFilteredPoints, resetFilters, toggleSmartDrawer } from './filters.js';
import { getShareUrl, updateShareLink, updateExportCount } from './export.js';
import { clearSelection, zoomToSelection, setInternalLayerVisibility } from './map.js';
import { flyHome } from './map-controls.js';
import { clearSearch } from './search.js';

// ===== URL HELPERS =====

export function getViewFromURL() {
  return new URLSearchParams(window.location.search).get('view') || 'map';
}

export function getBuildingIdFromURL() {
  return new URLSearchParams(window.location.search).get('id');
}

export function getTabFromURL() {
  return new URLSearchParams(window.location.search).get('tab') || 'overview';
}

// While a popstate event is being handled, URL updates must not push new entries;
// otherwise Back/Forward would immediately re-push what they just navigated away from.
let suppressHistoryPush = false;

export function setViewInURL(view, buildingId, tab) {
  const url = new URL(window.location);
  url.searchParams.set('view', view);
  // Detail pages carry their building; other views keep the map selection (share links stay complete)
  const id = buildingId || (view !== 'detail' ? state.selectedBuildingId : null);
  if (id) url.searchParams.set('id', id); else url.searchParams.delete('id');
  if (view === 'detail' && tab && tab !== 'overview') url.searchParams.set('tab', tab); else url.searchParams.delete('tab');
  if (url.toString() === window.location.href) return; // no duplicate history entries
  if (suppressHistoryPush) window.history.replaceState({}, '', url);
  else window.history.pushState({}, '', url);
}

export function setTabInURL(tab) {
  const url = new URL(window.location);
  if (tab && tab !== 'overview') url.searchParams.set('tab', tab); else url.searchParams.delete('tab');
  window.history.replaceState({}, '', url);
}

// ===== VIEWS =====

const VIEWS = ['map', 'gallery', 'detail', 'api-docs'];

// Show one view container, sync the toggle buttons and the page scroll mode
function setActiveView(view) {
  VIEWS.forEach(function(v) {
    const el = document.getElementById(v + '-view');
    if (el) el.classList.toggle('active', v === view);
  });
  document.querySelectorAll('.view-toggle-btn').forEach(function(btn) {
    const active = btn.dataset.view === view;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.body.classList.toggle('detail-active', view === 'detail');
  setStyleSwitcherVisible(view === 'map');
  updateDetailHeaderOffset();
}

// Views the Back button returns to (never the detail page itself)
function rememberPreviousView() {
  if (state.currentView !== 'detail' && state.currentView !== 'api-docs') state.previousView = state.currentView;
}

export function switchView(view) {
  closeDocumentPreview(false);
  if (view === 'detail' || VIEWS.indexOf(view) === -1) view = 'map';
  rememberPreviousView();
  state.currentView = view;
  setViewInURL(view);
  setActiveView(view);

  if (view === 'map' && state.map) {
    setTimeout(function() {
      if (state.currentView !== 'map') return;
      state.map.resize();
      // A filter applied while the map was hidden could not zoom to its result (a hidden map has no
      // size): do it now, once. Returning to an unchanged filter keeps the reader's map position.
      if (state.pendingFilterZoom && state.map.getLayer('buildings-points')) {
        state.pendingFilterZoom = false;
        zoomToFilteredPoints();
      }
    }, 100);
    if (state.listViewDirty && state.tableOpen) {
      renderFilteredTables();
      state.listViewDirty = false;
    }
  }
  if (view === 'gallery') {
    syncGalleryFilter();
    renderGalleryView();
    state.galleryViewDirty = false;
  }
  if (view === 'api-docs') {
    window.scrollTo(0, 0);
    initApiDocs();
  }
}

export function showDetailView(buildingId, tab) {
  closeDocumentPreview(false);
  if (!state.buildingsData) return;
  const building = state.buildingIndex.get(buildingId);
  if (!building) {
    console.error('[ui] building not found:', buildingId);
    return;
  }
  if (!tab) tab = 'overview';

  rememberPreviousView();
  state.currentDetailBuilding = building;
  state.currentView = 'detail';
  setViewInURL('detail', buildingId, tab);
  setActiveView('detail');
  window.scrollTo(0, 0);

  populateDetailView(building);
  activateTab(tab);
  // Phones: the sticky header collapses to the tab strip (needs the rendered breadcrumb height)
  updateDetailHeaderOffset();
}

// ===== DETAIL HEADER (phones: sticky header collapses to the tab strip) =====

export function showApiDocsView() {
  switchView('api-docs');
}

function updateDetailHeaderOffset() {
  const header = document.getElementById('header');
  const tabs = document.querySelector('.detail-tabs');
  if (!header) return;
  if (!isMobileLayout() || !document.body.classList.contains('detail-active') || !tabs) {
    header.style.removeProperty('--header-sticky-offset');
    return;
  }
  const offset = header.offsetHeight - tabs.offsetHeight;
  header.style.setProperty('--header-sticky-offset', (-Math.max(0, offset)) + 'px');
}

// ===== DETAIL TABS =====

function tabStrip() {
  return document.querySelector('.detail-tabs');
}

// Phones: the tab strip is wider than the screen and scrolls horizontally
function isTabStripScrollable() {
  const strip = tabStrip();
  return !!strip && strip.scrollWidth > strip.clientWidth + 1;
}

// Fade hint at the right edge while more tabs are hidden (css: .detail-tabs.can-scroll-right)
function updateTabStripFade() {
  const strip = tabStrip();
  if (!strip) return;
  const more = isTabStripScrollable() && strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
  strip.classList.toggle('can-scroll-right', more);
}

export function activateTab(tab) {
  document.querySelectorAll('.detail-tab').forEach(function(el) {
    const active = el.dataset.tab === tab;
    el.classList.toggle('active', active);
    el.setAttribute('aria-selected', active ? 'true' : 'false');
    el.setAttribute('tabindex', active ? '0' : '-1');
    if (active && el.scrollIntoView && isTabStripScrollable()) {
      el.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  });
  updateTabStripFade();
  document.querySelectorAll('.tab-content').forEach(function(content) {
    content.classList.toggle('active', content.dataset.content === tab);
  });
  renderEntityTable(tab);
}

function initDetailTabs() {
  document.querySelectorAll('.detail-tab').forEach(function(tab) {
    function select() {
      if (tab.classList.contains('disabled')) return;
      activateTab(tab.dataset.tab);
      setTabInURL(tab.dataset.tab);
    }
    tab.addEventListener('click', select);
    tab.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select();
      }
    });
  });
  const strip = tabStrip();
  if (strip) {
    strip.addEventListener('scroll', updateTabStripFade, { passive: true });
    window.addEventListener('resize', updateTabStripFade);
  }
  window.addEventListener('resize', updateDetailHeaderOffset);
}

// ===== BACK BUTTON AND VIEW TOGGLE =====

function initBackButtons() {
  ['btn-back', 'btn-back-api'].forEach(function(id) {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', function() { switchView(state.previousView || 'map'); });
  });
}

function initViewToggle() {
  document.querySelectorAll('.view-toggle-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { switchView(this.dataset.view); });
  });
}

// ===== BROWSER BACK/FORWARD =====

function initPopstate() {
  window.addEventListener('popstate', function() {
    if (!state.buildingsData) return; // data not loaded yet: the boot code restores the view
    const buildingId = getBuildingIdFromURL();
    const view = getViewFromURL();
    suppressHistoryPush = true;
    try {
      if (view === 'detail' && buildingId) showDetailView(buildingId, getTabFromURL());
      else switchView(view);
    } finally {
      suppressHistoryPush = false;
    }
  });
}

// ===== HOME (logo) =====

// The logo is the home button: landing state of the app — map view, no filters, no selection,
// search and drawer closed, initial map extent. Basemap and language stay (user preferences).
export function goHome() {
  closePhoneMenu();
  toggleSmartDrawer(false);
  toggleTreePanel(false);
  clearSearch();
  clearSelection();
  resetFilters();
  setTablePanelOpen(false);
  switchView('map');
  if (state.map) flyHome(state.map);
}

function initLogoHome() {
  const logo = document.getElementById('logo-area');
  if (logo) logo.addEventListener('click', goHome);
}

// ===== INFO PANEL =====

function initInfoPanel() {
  const closeBtn = document.getElementById('info-close');
  const zoomBtn = document.getElementById('info-zoom-to');
  const shareBtn = document.getElementById('info-share');
  if (closeBtn) closeBtn.addEventListener('click', clearSelection);
  if (zoomBtn) zoomBtn.addEventListener('click', zoomToSelection);
  if (shareBtn) shareBtn.addEventListener('click', shareCurrentView);

  // Bottom sheet on phones: swipe down on the handle or header to dismiss
  const panel = document.getElementById('info-panel');
  initSheetGesture(panel, ['.sheet-handle', '#info-header'], function() {
    if (closeBtn) closeBtn.click();
  }, function() {
    // Landscape phones dock the panel to the right: no vertical swipe there
    return isMobileLayout() && !isLandscapePhone();
  });
}

// Share the current view (selected object or map position) via the Web Share API, falling
// back to the clipboard.
export function shareCurrentView() {
  const text = state.selectedBuildingId
    ? t('share.building', { id: state.selectedBuildingId })
    : state.selectedParcelId
      ? t('share.parcel', { id: state.selectedParcelId })
      : t('share.map');
  shareUrl(getShareUrl(), t('share.title'), text);
}

// ===== INTERNAL LAYER TOGGLES ("Interne Karten") =====

function initInternalLayerToggles() {
  ['buildings', 'parcels'].forEach(function(key) {
    const toggle = document.getElementById('layer-toggle-' + key);
    if (toggle) {
      toggle.addEventListener('change', function() { setInternalLayerVisibility(key, this.checked); });
    }
  });
}

// ===== API DOCS (Swagger UI, loaded on first open) =====
// The 1.5 MB Swagger UI bundle is only fetched when the API page is opened.
let swaggerAssetsPromise = null;
let swaggerInitialized = false;

function loadScriptOnce(src) {
  return new Promise(function(resolve, reject) {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = function() { resolve(); };
    s.onerror = function() { reject(new Error('Failed to load ' + src)); };
    document.head.appendChild(s);
  });
}

function loadStylesheet(href) {
  if (document.querySelector('link[href="' + href + '"]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  l.onerror = function() { console.warn('[api] stylesheet failed to load:', href); };
  document.head.appendChild(l);
}

export function initApiDocs() {
  if (swaggerInitialized) return;
  const host = document.getElementById('swagger-ui');
  if (!host) return;

  if (!swaggerAssetsPromise) {
    host.innerHTML = '<div class="loading-row"><span class="spinner inline-spinner" aria-hidden="true"></span><span>' + t('api.loading') + '</span></div>';
    loadStylesheet('vendor/swagger-ui/swagger-ui.css');
    swaggerAssetsPromise = window.SwaggerUIBundle ? Promise.resolve() : loadScriptOnce('vendor/swagger-ui/swagger-ui-bundle.js');
  }

  swaggerAssetsPromise
    .then(function() {
      if (swaggerInitialized) return;
      if (typeof window.SwaggerUIBundle !== 'function') throw new Error('SwaggerUIBundle not available');
      swaggerInitialized = true;
      window.SwaggerUIBundle({
        url: 'data/swagger.json',
        dom_id: '#swagger-ui',
        deepLinking: false,          // the app owns the URL (view/id/filters)
        docExpansion: 'list',
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 2,
        displayRequestDuration: false,
        supportedSubmitMethods: [],  // mock API: no "Try it out"
        showExtensions: true,
        showCommonExtensions: true
      });
    })
    .catch(function(err) {
      console.error('[api] Swagger UI failed:', err);
      swaggerAssetsPromise = null;
      swaggerInitialized = false;
      host.innerHTML = '<div class="loading-row loading-row--error"><span>' + t('api.error') + '</span>' +
        '<button type="button" class="geokatalog-retry" data-action="retryApiDocs">' + t('error.retry') + '</button></div>';
    });
}

// "API" in the footer and in the phone menu open the documentation view
function initFooterApiLink() {
  ['footer-api-link', 'mobile-api-link'].forEach(function(id) {
    const link = document.getElementById(id);
    if (!link) return;
    link.addEventListener('click', function(e) {
      e.preventDefault();
      closePhoneMenu();
      showApiDocsView();
    });
  });
}

// ===== LANGUAGE SELECTOR (same control as the simple prototype; languages are not implemented here) =====

function initLanguageSelector() {
  const langBtn = document.getElementById('lang-btn');
  const langDropdown = document.getElementById('lang-dropdown');
  if (!langBtn || !langDropdown) return;

  function close() {
    langDropdown.classList.remove('open');
    langBtn.setAttribute('aria-expanded', 'false');
  }

  langBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    const isOpen = langDropdown.classList.contains('open');
    langDropdown.classList.toggle('open', !isOpen);
    langBtn.setAttribute('aria-expanded', String(!isOpen));
  });

  // This prototype has no translations: the interface stays German, the choice only warns
  function notImplemented() {
    close();
    showToast({ type: 'warning', message: t('lang.notImplemented'), duration: 6000 });
  }

  langDropdown.addEventListener('click', function(e) {
    if (e.target.closest('.lang-option')) notImplemented();
  });

  document.addEventListener('click', function(e) {
    if (!e.target.closest('#lang-selector')) close();
  });

  // Language pills in the phone menu
  document.querySelectorAll('.mobile-lang-pill').forEach(function(pill) {
    pill.addEventListener('click', notImplemented);
  });
}

// ===== SEARCH PLACEHOLDER (phones) =====

// The long placeholder is cut to "Suche nach Objekten, O" in a narrow field: shorter hint on phones
function initResponsiveSearchPlaceholder() {
  const searchInput = document.getElementById('search-input');
  if (!searchInput) return;
  function update() {
    searchInput.setAttribute('placeholder', t(isMobileLayout() ? 'header.search.placeholder.short' : 'header.search.placeholder'));
  }
  update();
  window.addEventListener('resize', update);
  onLangChange(update);
}

// Placeholder buttons of the prototype (login, edit)
export function comingSoon() {
  showToast({ type: 'info', message: t('detail.coming_soon'), duration: 4000 });
}

// ===== INIT =====

export function initUI() {
  initAccordion({
    onOpen: function(key) {
      if (key === 'share') updateShareLink();
      if (key === 'export') updateExportCount();
    }
  });
  initLanguageSelector();
  initToolsPanel();
  initInfoPanel();
  initInternalLayerToggles();
  initDetailTabs();
  initViewToggle();
  initLogoHome();
  initPopstate();
  initBackButtons();
  initFooterApiLink();
  initResponsiveSearchPlaceholder();
}
