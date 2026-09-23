// Basemaps (shared): style definitions, URL-owned basemap selection and the style switcher widget.
// The URL owns the basemap (?basemap=light|standard|aerial|aerial-labels|dark) so the same link opens the same
// background everywhere; missing or invalid values mean Light.

import { showToast } from './toast.js';
import { t } from './i18n.js';

const THUMBNAIL_BASE = new URL('../assets/basemaps/', import.meta.url);

export const SWISSIMAGE_TILES = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg';
// Global aerial imagery for the objects abroad (Esri World Imagery: free with attribution, see THIRD-PARTY.md)
export const WORLD_IMAGERY_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
// Esri's current Hybrid Reference Layer, designed to sit above imagery (see THIRD-PARTY.md).
const HYBRID_REFERENCE_STYLE = 'https://www.arcgis.com/sharing/rest/content/items/30d6b8271e1849cd9c3042060001f425/resources/styles/root.json';
const HYBRID_REFERENCE_TILES = 'https://basemaps.arcgis.com/arcgis/rest/services/World_Basemap_v2/VectorTileServer/tile/{z}/{y}/{x}.pbf';

// Same basemaps in every prototype: CARTO vector styles (OpenMapTiles schema) and the swisstopo
// SWISSIMAGE raster. `url` is a style URL or an inline style object; `thumbnail` a local PNG rendered
// from the style itself (shared/assets/basemaps): no API key, no static-image service.
export const mapStyles = {
  'positron': {
    name: 'Light',
    urlValue: 'light',
    url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    thumbnail: new URL('positron.png', THUMBNAIL_BASE).href
  },
  'voyager': {
    name: 'Standard',
    urlValue: 'standard',
    url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    thumbnail: new URL('voyager.png', THUMBNAIL_BASE).href
  },
  // Aerial: Esri World Imagery worldwide, the higher-resolution swisstopo SWISSIMAGE on top within Switzerland
  'swissimage': {
    name: 'Luftbild',
    urlValue: 'aerial',
    url: {
      version: 8,
      glyphs: 'https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf',
      sources: {
        'world-imagery': {
          type: 'raster',
          tiles: [WORLD_IMAGERY_TILES],
          tileSize: 256,
          maxzoom: 19,
          attribution: 'Esri, Maxar, Earthstar Geographics, and the GIS User Community'
        },
        'swissimage': {
          type: 'raster',
          tiles: [SWISSIMAGE_TILES],
          tileSize: 256,
          minzoom: 8,
          maxzoom: 20,
          bounds: [5.95, 45.81, 10.49, 47.81],
          attribution: '&copy; <a href="https://www.swisstopo.admin.ch">swisstopo</a>'
        },
        // CARTO's vector tiles (OpenMapTiles schema), the same source the vector basemaps use. No layer
        // of this style draws them: they carry the building footprints of the 3D view, which raster
        // imagery cannot provide (see findVectorSourceId in map-controls.js).
        'carto': {
          type: 'vector',
          url: 'https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json',
          attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }
      },
      layers: [
        { id: 'world-imagery', type: 'raster', source: 'world-imagery' },
        { id: 'swissimage', type: 'raster', source: 'swissimage' }
      ]
    },
    thumbnail: new URL('swissimage.png', THUMBNAIL_BASE).href
  },
  'swissimage-labels': {
    name: 'Hybrid',
    urlValue: 'aerial-labels',
    url: HYBRID_REFERENCE_STYLE,
    thumbnail: new URL('swissimage.png', THUMBNAIL_BASE).href
  },
  'dark-matter': {
    name: 'Dark',
    urlValue: 'dark',
    url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    thumbnail: new URL('dark-matter.png', THUMBNAIL_BASE).href
  }
};

export const DEFAULT_MAP_STYLE = 'positron';

// Only known URL values select a basemap; absent or invalid values mean Light.
export function getMapStyleFromBasemap(basemap) {
  return Object.keys(mapStyles).find(function(styleId) {
    return mapStyles[styleId].urlValue === basemap;
  }) || DEFAULT_MAP_STYLE;
}

let currentMapStyle = getMapStyleFromBasemap(new URLSearchParams(window.location.search).get('basemap'));

export function getCurrentMapStyle() {
  return currentMapStyle;
}

export function getCurrentMapStyleName() {
  return mapStyles[currentMapStyle] ? mapStyles[currentMapStyle].name : currentMapStyle;
}

export function getCurrentBasemapUrlValue() {
  return mapStyles[currentMapStyle].urlValue;
}

export function getMapStyleUrl(styleId) {
  return mapStyles[styleId || currentMapStyle].url;
}

// MapLibre calls this after downloading the reference style and before style.load.
// Both aerial choices share exactly the same imagery; only this one adds reference layers.
function composeHybridStyle(previousStyle, referenceStyle) {
  const aerial = mapStyles.swissimage.url;
  return {
    ...referenceStyle,
    // Keep the app's Open Sans / Noto labels working with the same glyph service.
    glyphs: aerial.glyphs,
    sources: {
      ...aerial.sources,
      esri: {
        type: 'vector',
        // ArcGIS service metadata is not TileJSON; use its tile template directly.
        tiles: [HYBRID_REFERENCE_TILES],
        maxzoom: 16,
        attribution: 'Esri, TomTom, Garmin, FAO, NOAA, USGS, &copy; OpenStreetMap contributors, and the GIS User Community'
      }
    },
    layers: aerial.layers.concat(referenceStyle.layers.map(function(layer) {
      const fonts = layer.layout && layer.layout['text-font'];
      if (!fonts) return layer;
      const weight = fonts.some(font => font.includes('Bold')) ? 'Bold'
        : fonts.some(font => font.includes('Italic')) ? 'Italic' : 'Regular';
      return {
        ...layer,
        layout: { ...layer.layout, 'text-font': ['Open Sans ' + weight, 'Noto Sans ' + weight] }
      };
    }))
  };
}

// Used for initial URL loading as well as selector and Back/Forward changes.
export function getMapStyleOptions(styleId) {
  return (styleId || currentMapStyle) === 'swissimage-labels'
    ? { transformStyle: composeHybridStyle }
    : {};
}

function updateBasemapUrl() {
  const url = new URL(window.location);
  url.searchParams.set('basemap', mapStyles[currentMapStyle].urlValue);
  if (url.href !== window.location.href) {
    window.history.replaceState(window.history.state, '', url);
  }
}

function getStyleThumbnail(styleId) {
  const style = mapStyles[styleId];
  return style && style.thumbnail ? style.thumbnail : '';
}

// Lazy thumbnail initialisation: only when the style panel is first opened
let thumbnailsInitialized = false;

function initStyleThumbnails() {
  if (thumbnailsInitialized) return;
  thumbnailsInitialized = true;
  Object.keys(mapStyles).forEach(function(styleId) {
    const thumbEl = document.getElementById('thumb-' + styleId);
    if (thumbEl) thumbEl.src = getStyleThumbnail(styleId);
  });
  const current = document.getElementById('current-style-thumb');
  if (current) current.src = getStyleThumbnail(currentMapStyle);
}

function updateActiveStyleButton() {
  document.querySelectorAll('.style-option').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.style === currentMapStyle);
  });
  const current = document.getElementById('current-style-thumb');
  if (current) current.src = getStyleThumbnail(currentMapStyle);
}

// The style switcher is only visible in the map view
export function setStyleSwitcherVisible(visible) {
  const el = document.getElementById('style-switcher');
  if (el) el.classList.toggle('visible', !!visible);
}

// Style switcher widget (#style-switcher, #style-panel, .style-option[data-style], #current-style-thumb).
//   map:           the MapLibre map
//   restoreLayers: called after every style change once the new style has loaded, so the app can
//                  re-add its sources, layers, selection and external layers
export function initStyleSwitcher(map, restoreLayers) {
  const styleSwitcherBtn = document.getElementById('style-switcher-btn');
  const stylePanel = document.getElementById('style-panel');
  if (!styleSwitcherBtn || !stylePanel) return;
  let stylePanelOpen = false;

  function setPanelOpen(open) {
    stylePanelOpen = open;
    if (open) initStyleThumbnails();
    stylePanel.classList.toggle('show', open);
  }

  document.addEventListener('click', function(e) {
    if (stylePanelOpen && !e.target.closest('.style-switcher')) setPanelOpen(false);
  });

  styleSwitcherBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    setPanelOpen(!stylePanelOpen);
  });

  function restoreLayersAfterStyleChange() {
    try {
      restoreLayers();
    } catch (e) {
      console.error('[map] failed to restore layers after style change:', e);
      showToast({ type: 'error', title: t('map.error.title'), message: e.message, duration: 8000 });
    }
  }

  function applyMapStyle(styleId) {
    const changed = styleId !== currentMapStyle;
    currentMapStyle = styleId;
    updateBasemapUrl();
    updateActiveStyleButton();

    if (changed) {
      // The old style can become idle while the new one is still downloading.
      // Rebuild after the new style loads, including when backgrounds change rapidly.
      map.off('style.load', restoreLayersAfterStyleChange);
      map.once('style.load', restoreLayersAfterStyleChange);
      map.setStyle(mapStyles[styleId].url, { diff: false, ...getMapStyleOptions(styleId) });
    }
  }

  document.querySelectorAll('.style-option').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const styleId = this.dataset.style;
      if (styleId !== currentMapStyle && mapStyles[styleId]) applyMapStyle(styleId);
      setPanelOpen(false);
    });
  });

  window.addEventListener('popstate', function() {
    applyMapStyle(getMapStyleFromBasemap(new URLSearchParams(window.location.search).get('basemap')));
  });

  // Make the default explicit in copied URLs, including when an invalid value was supplied.
  updateBasemapUrl();
  updateActiveStyleButton();
}
