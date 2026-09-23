# Table panel: the map view split

Review of the table toggle in both prototypes, 23 September 2026, with the
changes made afterwards. Each prototype keeps its own markup, styles and
modules; the behaviour and the code are the same in both.

## Findings

The map view is meant to be a vertical split: the map above, the table below,
with the "Tabelle" toggle and a drag handle between them. The split itself
worked. What broke were the elements that float over the map, because they
were children of the split container rather than of the map.

1. **Basemap switcher over the table (Tabs).** `#style-switcher` sat next to
   the table inside `#map-view`, so "bottom: 40px" meant the bottom of the
   split, not of the map. With the table open the switcher covered the table's
   last rows. Simple already kept the switcher inside `#map`.
2. **Measure display over the table (Tabs).** `#measure-distance-display` had
   the same parent, so the distance panel could sit on the table as well.
3. **Tools menu into the table (both).** `#accordion-wrapper` was positioned
   against `#map-view` and limited to its height, so a tall menu reached into
   the table. The code compensated with `collapseToolsPanelIfColliding()`,
   called from a 350 ms timer after opening, a 600 ms timer at boot, on every
   drag frame and from a resize observer, and folded the menu whenever the two
   rectangles overlapped.
4. **Object card into the table (both).** `#info-panel` had the same problem.
   `panel-layout.js` measured the map height in a resize observer and wrote it
   into a custom property that the card's `max-height` subtracted.
5. **Two hierarchies.** Simple and Tabs ordered these children differently, so
   the same bug appeared in one prototype and not the other.
6. **Duplicated size rules.** The drag code recomputed the panel's maximum
   height, which `.table-panel { max-height }` already expressed, and called
   `map.resize()` from timers and animation frames although MapLibre 5 follows
   the container with its own resize observer.
7. **Keyboard.** The resize handle was a bare `div` without a role or focus,
   so the table height could only be changed with a pointer.
8. **Fixed offset for the reset action.** With a filter active, a `:has()`
   rule moved the tools menu and the object card down by 64 px on every
   screen, although the centred "Alle aktiven Filter zurücksetzen" button only
   reaches them on narrow maps.

## Changes

- **One hierarchy in both prototypes.** `.main-content` is the split: the four
  views, then the table dock (`.table-split` with the toggle and the resize
  handle, then `#table-panel`). `#map-view` holds only `#map`, and every
  floating control is a child of `#map`: the top controls, the measure
  display, the basemap switcher, the menu backdrop, the tools menu, the object
  card, the context menu and the print preview. MapLibre sets
  `overflow: hidden` on the map, so these elements are positioned by the map
  and clipped by it; an open or resized table cannot cover them by
  construction.
- **The dock serves the gallery too.** Because it sits below the active view
  rather than inside the map view, the table opens under the gallery cards as
  well, follows the filters there, and is hidden in the detail and API views.
  A row selected under the gallery is shown on the map: the map view opens and
  the object is selected there.
- **Workarounds removed.** The table collision fold, its timers, the measured
  map height and the manual `map.resize()` calls are gone. The tools menu still
  folds when the object card would cover it on a narrow map, which is a
  different collision. The stylesheet owns the panel's default height, minimum
  and maximum; the drag and keyboard code only sets a height and lets
  `max-height` clamp it.
- **Keyboard resizing.** The handle is a `role="separator"` with a tab stop;
  ArrowUp and ArrowDown change the height in 40 px steps, never below 120 px.
  The toggle carries `aria-expanded` and `aria-controls`.
- **Measured reset offset.** `panel-layout.js` compares the reset button's
  rectangle with the tools menu and the object card whenever the map, the
  button or the card changes, and sets `reset-over-menu` or `reset-over-card`
  on `#map-view`. Only the panel the button would overlap moves down. At
  1920 and 1366 px wide nothing moves; at 1024 px both do.
- **Phones** are unchanged: the tools menu and backdrop still move to `<body>`
  as the slide-in menu, the object card is still a fixed bottom sheet, and the
  table stays hidden.

## Verification

```powershell
node test/all.js                 # both prototypes: hierarchy, toggle, keyboard resize, URL state
node test/check-alignment.js     # identical local copies of the shared modules and stylesheets
node test/laptop-layout.js       # browser: panels, table, object card at laptop and phone sizes (server on :8123)
```

The normal-boot scenarios assert the hierarchy, that opening the table leaves
the tools menu open, the keyboard resize and its minimum, and that closing the
table clears the height and the URL state. The browser layout suite checks that
the map keeps at least 125 px with the table open and that the object card and
the tools menu stay inside the map.
