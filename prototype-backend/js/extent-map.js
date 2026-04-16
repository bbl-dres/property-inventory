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

/**
 * Build a tiny static SVG thumbnail showing a layer's bbox positioned
 * against a world frame. Intended for catalogue cards where instantiating
 * MapLibre per card would be prohibitively expensive (a 30-card grid ×
 * a GL context each = broken). Returns null when the bbox is invalid so
 * callers can fall back to a neutral placeholder.
 *
 * Frame: [-180, -85, 180, 85] (EPSG:4326, Web-Mercator-ish latitude clip).
 * Viewport: 200×100 (roughly matches the old thumb aspect ratio).
 *
 * @param {[number,number,number,number]|null|undefined} bbox
 * @returns {SVGElement|null}
 */
export function extentThumbnail(bbox) {
  if (!isValidBbox(bbox)) return null;
  const [w, s, e, n] = bbox;

  const FRAME_W = 200;
  const FRAME_H = 100;
  const LON_MIN = -180, LON_SPAN = 360;
  const LAT_MAX = 85,   LAT_SPAN = 170;

  const x = ((w - LON_MIN) / LON_SPAN) * FRAME_W;
  const y = ((LAT_MAX - n) / LAT_SPAN) * FRAME_H;
  const width  = Math.max(2, ((e - w) / LON_SPAN) * FRAME_W);
  const height = Math.max(2, ((n - s) / LAT_SPAN) * FRAME_H);

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${FRAME_W} ${FRAME_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'pb-extent-thumb');

  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
  bg.setAttribute('width', String(FRAME_W));
  bg.setAttribute('height', String(FRAME_H));
  bg.setAttribute('fill', '#f1f3f5');
  svg.appendChild(bg);

  // Equator + prime meridian as faint guides.
  const mid = document.createElementNS(SVG_NS, 'line');
  mid.setAttribute('x1', String(FRAME_W / 2)); mid.setAttribute('x2', String(FRAME_W / 2));
  mid.setAttribute('y1', '0'); mid.setAttribute('y2', String(FRAME_H));
  mid.setAttribute('stroke', '#e9ecef'); mid.setAttribute('stroke-width', '0.5');
  svg.appendChild(mid);
  const eq = document.createElementNS(SVG_NS, 'line');
  eq.setAttribute('x1', '0'); eq.setAttribute('x2', String(FRAME_W));
  eq.setAttribute('y1', String(FRAME_H / 2)); eq.setAttribute('y2', String(FRAME_H / 2));
  eq.setAttribute('stroke', '#e9ecef'); eq.setAttribute('stroke-width', '0.5');
  svg.appendChild(eq);

  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('x', String(x)); rect.setAttribute('y', String(y));
  rect.setAttribute('width',  String(width));
  rect.setAttribute('height', String(height));
  rect.setAttribute('fill', BBOX_COLOR);
  rect.setAttribute('fill-opacity', '0.32');
  rect.setAttribute('stroke', BBOX_COLOR);
  rect.setAttribute('stroke-width', '1');
  svg.appendChild(rect);

  return svg;
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
