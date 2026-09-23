# Map interaction review (September 2026)

A review of the map of both prototypes (`prototype-simple`, `prototype-tabs`) with a focus on
interactions, bugs and robustness. The map code is split between the common modules
(`portfolio-map-layers.js`, `portfolio-map-interactions.js`, `map-controls.js`, `parcel-labels.js`,
`measure.js`, `context-menu.js`, `swisstopo.js`, `basemaps.js`, `location-tree.js`; byte-identical local
copies) and the prototype-specific `map.js`, `config.js` and `filters.js`. Nothing is shared at runtime.

## Findings

| # | Severity | Where | Finding | Decision |
|---|---|---|---|---|
| M1 | High | `portfolio-map-interactions.js` | The hover highlight of parcels and land cover was set on `mouseenter` and cleared on `mouseleave` of the fill layer. MapLibre fires these per layer, not per feature: moving from one polygon straight onto an adjacent one fires neither event, so the highlight stayed on the first polygon. Land cover is a full partition of a parcel, so there it never updated; reproduced with real pointer moves (filter stuck on the building footprint while the pointer sat on a garden piece). | **Hover fill removed** in both prototypes (`parcels-highlight`, `landcovers-highlight`). The pointer cursor stays as hover feedback; the selection layers show the state. A `mousemove`-driven highlight would cost a style filter update on every pointer move, only exists on desktop, and duplicated the selection. |
| M2 | Medium | `swisstopo.js` | The identify highlight of an external layer (orange fill, outline) was anchored below the ground polygons. With the official, nearly opaque land-cover fills the highlight disappeared under the land cover; under parcels it was tinted. | Anchored above the ground polygons and below the points and labels. External raster layers stay below every data layer. |
| M3 | Low | `portfolio-map-interactions.js` | Click precedence: a polygon click yields to points, clusters and land cover within 15 px, while the generic map click tests the exact point. A click 10 px beside a point on a parcel selects nothing (no parcel, no clearing). | Accepted: it protects a near miss of a marker from selecting the parcel underneath; documented. |
| M4 | Low | `map.js` (both) | The pulse ring of the selected building runs a `setInterval` at 20 fps with two `setPaintProperty` calls per tick, which re-renders the map. It pauses while hidden or in other views. | Accepted for the prototype; a transition on `circle-radius` would be the lighter alternative. |
| M5 | Info | `portfolio-map-interactions.js` | Layer listeners are bound once per map (`WeakSet`); MapLibre keeps delegated listeners across `setStyle`, and the cluster expansion guards stale responses with a request token and a source identity check. | Verified, no change. |
| M6 | Info | `map-controls.js`, `basemaps.js` | Basemap change: layers, selection, 3D buildings, external layers, measurement and the country outline are restored from one `style.load` handler; rapid changes cancel the previous handler. | Verified, no change. |
| M7 | Info | Touch | Hover events never fire on touch screens; tapping selects, the info panel becomes a sheet and `revealSelectionOnMobile` pans the object out from under it. Measuring needs the context menu (right click) and is therefore a desktop tool. | Verified, no change. |

## Changes

- Both prototypes: `parcels-highlight` and `landcovers-highlight` layers removed from the layer stacks,
  from the "Interne Karten" visibility groups and from the interactions; `mouseenter`/`mouseleave` only
  switch the cursor.
- Both prototypes: the identify highlight is added before the building clusters/points; the external
  layer anchor no longer refers to it.
- Tests: the boot scenarios assert that no hover fill layers exist and check the identify highlight
  order; the design guides and the print notes no longer mention hover highlights.

## Verification

- jsdom: all scenarios of both prototypes.
- Browser (CDP pointer moves): before the change the highlight filter stayed on the first land-cover
  polygon while the pointer rested on an adjacent one; after the change no hover fill layer exists and the
  cursor is a pointer over every polygon.
