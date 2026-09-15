// Minimal fake of the MapLibre GL JS API used by the prototypes. Records calls so scenarios can
// assert on layers, sources, listeners and camera movements without WebGL.

class Evented {
  constructor() { this._listeners = []; }
  _split(type, layerOrFn, maybeFn) {
    const layer = typeof layerOrFn === 'string' ? layerOrFn : null;
    return { type, layer, fn: layer ? maybeFn : layerOrFn };
  }
  on(type, a, b) { this._listeners.push(Object.assign(this._split(type, a, b), { once: false })); return this; }
  once(type, a, b) { this._listeners.push(Object.assign(this._split(type, a, b), { once: true })); return this; }
  off(type, a, b) {
    const s = this._split(type, a, b);
    this._listeners = this._listeners.filter(l => !(l.type === s.type && l.layer === s.layer && l.fn === s.fn));
    return this;
  }
  fire(type, event, layer) {
    event = event || {};
    const hits = this._listeners.filter(l => l.type === type && l.layer === (layer || null));
    hits.forEach(l => {
      if (l.once) this._listeners = this._listeners.filter(x => x !== l);
      l.fn(event);
    });
  }
  listenerCount(type, layer) {
    return this._listeners.filter(l => l.type === type && l.layer === (layer || null)).length;
  }
}

class FakeMap extends Evented {
  constructor(options) {
    super();
    this.options = options || {};
    this._sources = {};
    this._layers = [];
    this._loaded = false;
    const center = this.options.center || [0, 0];
    this._center = { lng: center[0], lat: center[1] };
    this._zoom = this.options.zoom || 0;
    this._pitch = this.options.pitch || 0;
    this._bearing = this.options.bearing || 0;
    this.calls = { flyTo: [], fitBounds: [], setStyle: [], jumpTo: [], resize: 0, panBy: [] };
    this._container = typeof this.options.container === 'string'
      ? document.getElementById(this.options.container)
      : this.options.container;
    this._canvas = document.createElement('canvas');
    this.queryResult = null; // scenario hook: (point, options) => features
    FakeMap.instances.push(this);
  }

  // Simulate the style/data load of a real map
  triggerLoad() {
    this._loaded = true;
    this.fire('style.load');
    this.fire('load');
    this.fire('idle');
  }
  loaded() { return this._loaded; }
  isStyleLoaded() { return this._loaded; }
  areTilesLoaded() { return this._tilesLoaded !== false; }

  addControl(control) {
    if (control && control.onAdd) {
      const el = control.onAdd(this);
      if (el && this._container) this._container.appendChild(el);
    }
    return this;
  }

  addSource(id, source) {
    if (this._sources[id]) throw new Error('Source already exists: ' + id);
    const self = this;
    this._sources[id] = Object.assign({
      setData(data) { self._sources[id].data = data; },
      getClusterExpansionZoom(clusterId, cb) { cb(null, 12); }
    }, source);
  }
  getSource(id) { return this._sources[id]; }
  removeSource(id) { delete this._sources[id]; }

  addLayer(layer, beforeId) {
    if (this._layers.find(l => l.id === layer.id)) throw new Error('Layer already exists: ' + layer.id);
    const copy = Object.assign({ layout: {}, paint: {} }, layer);
    copy.layout = Object.assign({}, copy.layout);
    copy.paint = Object.assign({}, copy.paint);
    const idx = beforeId ? this._layers.findIndex(l => l.id === beforeId) : -1;
    if (idx >= 0) this._layers.splice(idx, 0, copy); else this._layers.push(copy);
  }
  getLayer(id) { return this._layers.find(l => l.id === id); }
  removeLayer(id) { this._layers = this._layers.filter(l => l.id !== id); }
  setFilter(id, filter) { const l = this.getLayer(id); if (!l) throw new Error('No layer: ' + id); l.filter = filter; }
  setLayoutProperty(id, key, value) { const l = this.getLayer(id); if (!l) throw new Error('No layer: ' + id); l.layout[key] = value; }
  getLayoutProperty(id, key) { const l = this.getLayer(id); return l ? l.layout[key] : undefined; }
  setPaintProperty(id, key, value) { const l = this.getLayer(id); if (!l) throw new Error('No layer: ' + id); l.paint[key] = value; }

  getStyle() {
    const sources = {};
    Object.keys(this._sources).forEach(id => { sources[id] = { type: this._sources[id].type, data: this._sources[id].data }; });
    return { version: 8, sources, layers: this._layers.map(l => JSON.parse(JSON.stringify(l))) };
  }
  setStyle(style) {
    this.calls.setStyle.push(style);
    this._sources = {};
    this._layers = [];
    const self = this;
    setTimeout(() => { self.fire('style.load'); self.fire('idle'); }, 0);
  }

  flyTo(o) {
    this.calls.flyTo.push(o);
    if (o.center) this._center = { lng: o.center[0], lat: o.center[1] };
    if (o.zoom != null) this._zoom = o.zoom;
    if (o.pitch != null) this._pitch = o.pitch;
    if (o.bearing != null) this._bearing = o.bearing;
    this.fire('moveend');
  }
  fitBounds(bounds, options) { this.calls.fitBounds.push({ bounds, options }); this.fire('moveend'); }
  jumpTo(o) { this.calls.jumpTo.push(o); if (o.center) this._center = { lng: o.center[0], lat: o.center[1] }; }
  panBy(offset, options) { this.calls.panBy.push({ offset, options }); }
  resize() { this.calls.resize++; }
  getCenter() { return this._center; }
  getZoom() { return this._zoom; }
  getPitch() { return this._pitch; }
  getBearing() { return this._bearing; }
  getCanvas() { return this._canvas; }
  getContainer() { return this._container; }
  project() { return { x: 100, y: 100, dist() { return 1000; } }; }
  queryRenderedFeatures(point, options) { return this.queryResult ? this.queryResult(point, options) : []; }
  remove() {}
}
FakeMap.instances = [];

class Marker extends Evented {
  constructor(options) {
    super();
    this.options = options || {};
    this.removed = false;
    this._el = this.options.element || document.createElement('div');
    Marker.instances.push(this);
  }
  setLngLat(lngLat) { this._lngLat = lngLat; return this; }
  getLngLat() { return { lng: this._lngLat[0], lat: this._lngLat[1] }; }
  addTo(map) { this._map = map; return this; }
  remove() { this.removed = true; }
  getElement() { return this._el; }
}
Marker.instances = [];

class Popup extends Evented {
  constructor() { super(); Popup.instances.push(this); }
  setLngLat(ll) { this._lngLat = ll; return this; }
  setHTML(html) { this.html = html; return this; }
  addTo() { return this; }
  remove() { this.fire('close'); }
}
Popup.instances = [];

class NavigationControl { onAdd() { return document.createElement('div'); } onRemove() {} }
class ScaleControl { onAdd() { return document.createElement('div'); } onRemove() {} }
class LngLatBounds { constructor() { this.points = []; } extend(p) { this.points.push(p); return this; } }

module.exports = { Map: FakeMap, Marker, Popup, NavigationControl, ScaleControl, LngLatBounds };
