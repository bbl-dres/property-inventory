# 3D view

Review of the 2D/3D toggle, tilt and rotation in both prototypes, 23 September
2026, with the changes made afterwards. The 3D view extrudes the building
footprints of CARTO's vector tiles (OpenMapTiles schema, `render_height`) on a
tilted MapLibre map. Each prototype keeps its own copy of `map-controls.js`,
`basemaps.js`, `portfolio-map-layers.js` and `mini-map.js`; the copies are
byte-identical and checked by `node test/check-alignment.js`.

## Findings

1. **No buildings over imagery.** The aerial and hybrid basemaps are raster
   styles without a vector source, so `findVectorSourceId()` found nothing to
   extrude. The toggle still switched to "2D", tilted the view and wrote
   `3d=1` into the URL, but no building appeared. The same happened when a
   user switched to the aerial basemap while 3D was on.
2. **Wrong occlusion order.** The 3D layer was inserted before the
   application's first ground layer, so parcels and land covers were drawn
   after the extrusions and painted their fills and outlines over the roofs.
   The basemap's labels, which precede the application's layers, ended up
   under the buildings. The mini map already used the right rule: above all
   ground geometry, below the final label block.
3. **Rotation lost in links.** The URL only carried the bearing while the view
   was tilted. A rotated flat map shared or reloaded came back north-up.
4. **Home kept the tilt.** The home control and the logo flew to the initial
   extent but left pitch and bearing as they were, so the world view stayed
   tilted.
5. **No way to level the view.** The compass reset north only. With
   `visualizePitch` off there was no control that returns to a flat view apart
   from leaving 3D.
6. **Toggle semantics.** The 3D button had a title but no `aria-label` or
   `aria-pressed`.
7. **Inconsistent extrusion base.** The mini map used `render_min_height`,
   the main map a base of 0.

What held up: MapLibre 5's `fitBounds` accounts for pitch, so zooming to a
filter or a selection works tilted; the keyboard handler tilts and rotates with
Shift and the arrow keys; two-finger drag tilts on touch; selection under pitch
uses `queryRenderedFeatures` and is exact; labels are viewport-aligned; the
print keeps the bearing and renders flat.

## Changes

- **Buildings over imagery.** The aerial style declares CARTO's vector tiles
  as a source that no layer draws; the hybrid style inherits it. The 3D layer
  finds that source when no basemap layer references a `building`
  source-layer. Attribution is in `THIRD-PARTY.md`.
- **One ordering rule.** At every style load `map-controls.js` remembers the
  first layer of the basemap's final label block. Ground data (land cover,
  parcels) is inserted before the 3D layer when it exists and otherwise before
  that block; the 3D layer is inserted before the block. The application's
  points, labels and collision obstacles are added without an anchor and stay
  on top. Either order of loading, data first or 3D first, yields basemap
  geometry, ground data, extrusions, basemap labels, application points and
  labels. The mini map uses the same function.
- **URL and home.** The bearing is kept in the URL whenever the view is not
  north-up; `flyHome` resets pitch and bearing and leaves the buildings as
  chosen.
- **Compass.** The navigation control shows the tilt and its compass resets
  north and tilt.
- **Toggle.** `aria-label` and `aria-pressed` follow the state; the main map
  uses `render_min_height` like the mini map.

Not changed on purpose: building markers keep MapLibre's default
`circle-pitch-scale: map`, so far markers are smaller in a tilted view, which
reads as depth; a selected land cover under a 3D building is hidden by that
building, which is physically right; the selection pulse still repaints at
20 Hz, which costs more with extrusions on but is fine for the current data.

## Verification

```powershell
node test/all.js                 # late-data scenarios: layer order, toggle, URL, home; aerial scenario: vector source
node test/check-alignment.js
```

The late-data scenarios boot with a CARTO-like basemap (geometry, an early
label, more geometry, flat buildings, a final label block) and assert the order
of ground data, extrusions, basemap labels and application layers, the toggle's
state and URL, the bearing of a flat rotated view, the home reset and the
restored flat buildings. The aerial scenario asserts that both imagery styles
expose the CARTO source and that the Esri reference alone is never extruded.
A real-browser check with the aerial basemap at zoom 16 over Bern confirms
rendered extrusion features.
