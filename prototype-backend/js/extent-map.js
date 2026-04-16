// prototype-backend — Extent map helper
//
// Paints a set of items as bbox rectangles on a MapLibre map and fits the
// viewport to their union. Used by the Layers and Maps & Apps catalogues
// when the user picks the "Map" view mode.
//
// Callers provide:
//   - itemLabel(item) → string used as the popup title
//   - itemHref(item)  → URL hash the user navigates to on click
//   - itemBbox(item)  → [minLon, minLat, maxLon, maxLat] or null. Items
//                       without a bbox are silently skipped, honouring
//                       the "empty metadata → don't show" contract.
//
// Returns `{ unmount }` so the catalogue component can tear down the map
// cleanly when the user toggles to a different view.

const CARTO_POSITRON = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const BBOX_COLOR = '#c8102e';
const SOURCE_ID = 'pb-extent-src';
const FILL_ID   = 'pb-extent-fill';
const LINE_ID   = 'pb-extent-line';

/**
 * @param {HTMLElement} host
 * @param {Array<object>} items
 * @param {{itemLabel: Function, itemHref: Function, itemBbox: Function}} opts
 * @returns {{ unmount: () => void }}
 */
export function paintExtentMap(host, items, opts) {
  const { itemLabel, itemHref, itemBbox } = opts;

  if (typeof maplibregl === 'undefined') {
    host.appendChild(hostError('Map library not loaded'));
    return { unmount() {} };
  }

  // Filter to items that actually have a bbox — skip the rest per the
  // "empty metadata → show nothing" contract.
  const features = [];
  for (const item of items) {
    const bb = itemBbox(item);
    if (!isValidBbox(bb)) continue;
    features.push({
      type: 'Feature',
      properties: {
        label: String(itemLabel(item) || ''),
        href:  String(itemHref(item) || '')
      },
      geometry: bboxToPolygon(bb)
    });
  }

  if (!features.length) {
    host.appendChild(hostEmpty());
    return { unmount() {} };
  }

  const map = new maplibregl.Map({
    container: host,
    style: CARTO_POSITRON,
    center: [8.3, 46.8],    // rough Switzerland middle as a sane default
    zoom: 4,
    attributionControl: true
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  const fc = { type: 'FeatureCollection', features };
  let cleanupHandlers = null;

  map.on('load', () => {
    map.addSource(SOURCE_ID, { type: 'geojson', data: fc });
    map.addLayer({
      id: FILL_ID,
      type: 'fill',
      source: SOURCE_ID,
      paint: {
        'fill-color': BBOX_COLOR,
        'fill-opacity': 0.12
      }
    });
    map.addLayer({
      id: LINE_ID,
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': BBOX_COLOR,
        'line-width': 2
      }
    });

    // Fit to the union bbox.
    const union = unionBboxFromFeatures(features);
    if (union) {
      try {
        map.fitBounds([[union[0], union[1]], [union[2], union[3]]], {
          padding: 40,
          maxZoom: 12,
          duration: 0
        });
      } catch (err) {
        console.warn('[extent-map] fitBounds failed', err);
      }
    }

    // Click + hover interactions.
    const onClick = (e) => {
      const hit = e.features && e.features[0];
      if (hit?.properties?.href) location.hash = hit.properties.href;
    };
    const onEnter = () => { if (map) map.getCanvas().style.cursor = 'pointer'; };
    const onLeave = () => { if (map) map.getCanvas().style.cursor = ''; };

    map.on('click', FILL_ID, onClick);
    map.on('mouseenter', FILL_ID, onEnter);
    map.on('mouseleave', FILL_ID, onLeave);

    // Hover popup with label. One popup instance recycled on each enter.
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
    const onMove = (e) => {
      const hit = e.features && e.features[0];
      if (!hit) return;
      popup.setLngLat(e.lngLat).setText(hit.properties.label).addTo(map);
    };
    const onMouseLeavePopup = () => popup.remove();
    map.on('mousemove', FILL_ID, onMove);
    map.on('mouseleave', FILL_ID, onMouseLeavePopup);

    cleanupHandlers = () => {
      try { map.off('click', FILL_ID, onClick); } catch {}
      try { map.off('mouseenter', FILL_ID, onEnter); } catch {}
      try { map.off('mouseleave', FILL_ID, onLeave); } catch {}
      try { map.off('mousemove', FILL_ID, onMove); } catch {}
      try { map.off('mouseleave', FILL_ID, onMouseLeavePopup); } catch {}
      try { popup.remove(); } catch {}
    };
  });

  return {
    unmount() {
      if (cleanupHandlers) cleanupHandlers();
      try { map.remove(); } catch (err) { console.warn('[extent-map] remove', err); }
    }
  };
}

function hostError(msg) {
  const d = document.createElement('div');
  d.className = 'pb-catalogue-map-empty';
  d.textContent = msg;
  return d;
}

function hostEmpty() {
  const d = document.createElement('div');
  d.className = 'pb-catalogue-map-empty';
  d.innerHTML =
    '<div class="empty-state-title">Nothing on the map</div>' +
    '<div class="empty-state-description">None of these items have a spatial extent recorded. Add one via metadata to see them here.</div>';
  return d;
}

function isValidBbox(bb) {
  if (!Array.isArray(bb) || bb.length !== 4) return false;
  return bb.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function bboxToPolygon([w, s, e, n]) {
  return {
    type: 'Polygon',
    coordinates: [[
      [w, s],
      [e, s],
      [e, n],
      [w, n],
      [w, s]
    ]]
  };
}

function unionBboxFromFeatures(features) {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const f of features) {
    const [w, s, e, n] = f.geometry.coordinates[0][0]
      ? [
          f.geometry.coordinates[0][0][0],
          f.geometry.coordinates[0][0][1],
          f.geometry.coordinates[0][2][0],
          f.geometry.coordinates[0][2][1]
        ]
      : [0, 0, 0, 0];
    if (w < minLon) minLon = w;
    if (e > maxLon) maxLon = e;
    if (s < minLat) minLat = s;
    if (n > maxLat) maxLat = n;
  }
  if (!Number.isFinite(minLon)) return null;
  return [minLon, minLat, maxLon, maxLat];
}
