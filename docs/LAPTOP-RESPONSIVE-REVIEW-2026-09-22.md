# Laptop responsive design review

The review findings below record the original baseline. The approved recommendations
have now been implemented in both independent prototypes; see the implementation
and validation notes at the end.

## Conclusion

The primary workstation is a **1920 × 1200 laptop at 150% Windows scaling**. At
100% browser zoom this corresponds to approximately **1280 × 800 CSS pixels**
before the taskbar and browser chrome reduce the available height. The main design
target should therefore be approximately **1280 × 700**, with neighbouring widths
and heights tested as well.

The application does not enter its phone layout at this size. Instead, several
independent rules create an inconsistent laptop experience: early removal of header
labels, height-based removal of object information, and panels that compete for
too little map space. A deliberate laptop layout is warranted.

CSS width media queries use viewport width; device pixel ratio relates physical
pixels to CSS pixels, and browser page zoom also affects that ratio. The conversion
above applies those definitions to the supplied display settings. References:
[MDN: viewport width media feature](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/width),
[MDN: devicePixelRatio](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio).

## Scope and evidence

Both prototypes were reviewed in a real headless Edge browser with mouse-style
input at 1920 × 1100, 1536 × 860, 1440 × 800, 1366 × 680, 1280 × 700,
1097 × 590 and 960 × 510 CSS pixels. These are representative content viewports,
not measurements of the users' actual browser chrome.

The review covered 98 states: map, selection, both side panels, gallery with
filters, detail, detail with the location tree, and measurements. Follow-up checks
covered the 1279/1280/1281 panel boundary, map-table heights, detail reading order,
and 24 temporary header-layout experiments across DE/FR/IT/EN.

Evidence is saved locally in `tmp/laptop-review/metrics.json`, `followup.json` and
the corresponding screenshots. The temporary review scripts are
`tmp/laptop-review.cjs` and `tmp/laptop-followup.cjs`.

No document-level horizontal overflow or header collisions occurred in the 98
baseline states. Internal table scrolling is separate from document overflow.
The current gallery retained three columns at the primary 1280 px target with
filters open. The laptop experience needs refinement, not a wholesale redesign.

## Findings, in priority order

### 1. Map overlays collide at the primary laptop width — high priority, both prototypes

At 1280 px, two 320 px side panels leave a 640 px map. The floating tools menu is
300 px wide and the object card is 320 px wide, before offsets and map controls.
The object card visibly covers part of the tools menu.

The current mutual-exclusion rule uses `innerWidth < 1280`. Both panels remain
open at 1280 and 1281; at 1279 the other panel closes and the map suddenly expands
from 640 to 959 px. The users' normal configuration lands exactly on this boundary.

**Recommendation:** decide panel coexistence from remaining map width. Reserve
roughly 760–800 px for a comfortable map with floating UI; below that, use one
docked side panel or automatically collapse the floating tools menu when showing
object information. Preserve explicit user reopening and selection state. The
320 px default widths can remain.

Sources: [panel coordination](../prototype-simple/js/panel-layout.js),
[effective drawer geometry](../prototype-simple/css/panel-layout.css), identical
local counterparts in prototype-tabs.

### 2. The map table opens too short to work in — high priority, both prototypes

| Viewport height | Table panel, excluding border | Scroll area including column header | Fully visible data rows |
| --- | ---: | ---: | ---: |
| 700 px | 174 px | 80 px | 1 |
| 800 px | 239 px | 145 px | 2 |
| 860 px | 257 px | 163 px | 3 |

The short-height rules shrink the table to 25vh at 700 px and 20vh at 600 px.
The toolbar and column header consume most of the resulting space. Drag resizing
exists, but every opening should start with a useful working area.

**Recommendation:** choose an opening height that shows at least 3–5 rows, roughly
280–320 px for the present chrome, constrained by available map height. Retain
resizing and consider remembering the user's preferred height. This is more
valuable than shrinking labels or cell text.

Sources: [.table-panel and short-height rules](../prototype-simple/css/components.css),
[opening/resizing behaviour](../prototype-simple/js/list.js), corresponding Tabs files.

### 3. Header labels disappear earlier than necessary — medium priority, both prototypes

At `max-width: 1720px`, both location/filter button labels and the active view label
disappear together. This affects 1536 px and 1280 px laptop viewports, even though
their primary tasks still suit desktop navigation.

Temporary browser-only experiments retained the full organisation title, location
and filter labels, and the active view label. A flexible search column, smaller
gaps and a 72 px header fit without overlap in all four languages:

| Viewport width | Actual search input width across both prototypes and languages |
| --- | ---: |
| 1536 px | 424–436 px |
| 1280 px | 293–371 px |
| 1200 px | 213–291 px |

These are feasibility measurements, not implemented designs. At 1200 px the French
search field becomes less comfortable; that is a better point to begin selectively
simplifying secondary content than removing every label at 1720 px.

**Recommendation:** preserve primary action labels around 1280 px. Let search and
spacing flex; relax strict visual centring. Aim for a 72–76 px laptop header
instead of 90 px, while retaining current readable text sizes.

Source: [header and responsive rules](../prototype-simple/css/components.css).

### 4. Short-height rules silently remove useful object context — medium priority, both prototypes

At a viewport height of 800 px or less, the object card hides its photograph and
all rows marked secondary. The 150% workstation routinely enters this mode,
even with ample horizontal space. Width and height reductions therefore compound.

**Recommendation:** use a compact card with a smaller image, prioritised fields
and accessible scrolling/expansion according to available card height. Keep
location-identifying information readily available. Tune this separately from
phone presentation.

Source: [`max-height: 800px` rule](../prototype-simple/css/components.css).

### 5. Stacked detail sections put secondary information before master data — high priority when narrow, Tabs

At 1280 px with the tree open, the overview still has two 448 px columns. That is
appropriate. At a narrower window or roughly 110% browser zoom on the same
150%-scaled display, the remaining content falls below the 850 px container rule.

The entire left column then precedes the right column: images, additional
information and energy statistics appear before object master data. At the tested
1164 × 636 viewport, master data begins around y=1173 and the address around
y=1872. This makes the overview feel like a long mobile page and buries its most
important content.

**Recommendation:** define a meaningful single-column reading order, bringing
master data directly after a compact image/identity summary. Keep two columns while
their actual content remains readable; do not force them into insufficient space.

Sources: [section order](../prototype-tabs/index.html),
[850 px container rule](../prototype-tabs/css/panel-layout.css).

### 6. Large imagery consumes working space — medium priority, Simple

At 1280 × 700 with the tree open, the 240 px carousel is above the inline tabs.
Master data begins around y=531. The carousel remains above the measurements tab,
so a large part of the first screen is spent on imagery while the user is doing
tabular work.

**Recommendation:** keep the image prominent in the overview; use a compact or
collapsible image area during measurements. The Simple prototype can retain its
single-column structure.

Source: [Simple detail structure](../prototype-simple/index.html).

## Proposed responsive strategy

These ranges are design starting points, subject to validation with real content
and the four languages. They describe available CSS width, not physical screen
resolution or a detected device model.

| Available width | Intended treatment |
| --- | --- |
| 1600 px and above | Spacious desktop: generous search, labelled actions, room for simultaneous panels. |
| 1200–1599 px | Primary laptop layout: labelled desktop navigation, 72–76 px header, moderate spacing, panel coexistence based on remaining map width. Optimise first at 1280 × 700. |
| 1024–1199 px | Narrow desktop window: simplify secondary header content progressively; retain visible tabs, tables and desktop navigation. |
| 768–1023 px | Existing narrow/tablet arrangement, adapted to content width and input capability. |
| Below 768 px | Existing phone menu and sheet behaviour; retain the special touch-landscape handling. |

Avoid creating a separate global mode for every component. Use these tiers for
the application shell; use container dimensions for tables, cards and panel
coordination. Touch-target sizing remains independent of width. Each prototype
continues to own its code and assets.

Keep the users' 150% scaling and readable typography. Recover space through
layout, spacing and content priority. A breakpoint at 1920 physical pixels would
not address the CSS viewport being delivered to the application.

## Approved implementation order

1. Fix map overlay collisions and table opening height at 1280 × 700.
2. Introduce the laptop header treatment, preserving primary labels.
3. Refine compact object cards and the detail reading order/image priority.
4. Validate 1200, 1280, 1366, 1440, 1536 and 1920 px widths; 650, 700 and 800 px
   heights; all four languages; both panels and selection; table workflows;
   and nearby zoom/window sizes. Recheck phones and tablets for regressions.

## Implemented changes

- **Laptop header:** 72px high below 1600px, with fluid search and tighter spacing.
  Location/filter labels and the active view label remain until the viewport is
  narrower than 1200px. Text sizes and Windows scaling are unchanged.
- **Panel coordination:** both drawers can remain docked when their actual CSS
  widths leave at least 760px for content. Opening or enlarging a drawer closes
  the older one when necessary. The menu folds when selection or resizing would
  cause it to cover the object card or table; explicit reopening remains possible.
- **Map table:** default height is `clamp(280px, 40vh, 360px)`, capped at 75% of
  the workspace while leaving at least 160px for the map and resize handle. Drag resizing observes the
  same bounds. At 1280 × 700, the table now shows three full rows instead of one.
- **Object cards:** all fields remain in a scrollable body, with a sticky detail
  action. The photo is smaller below 800px height and hidden while the table is
  open on these short screens. Card height follows the actual map, excluding the
  table; phone sheets retain their own height limits.
- **Tabs overview:** when content becomes one column, the DOM order is image,
  master data, address, additional information, energy. Existing nodes move;
  maps, images and field state are preserved. At 1164 × 636 with the tree open,
  master data now follows the image directly, with its first value at about 615px
  down the page; previously the section began around 1173px.
- **Simple measurements:** the photo becomes a 112px strip while measurements
  are active. Gallery access and the overview image remain available.

Each prototype owns its implementation. No cross-prototype runtime modules were
introduced. Both local design guides describe the new responsive behavior.

## Validation

Final result: **242 browser layout states passed**, across 12 viewport/input
profiles per prototype and four interface languages. All **26 application
regression scenarios passed**. Local-file alignment and independent module graphs
also passed (347 local imports); `git diff --check` is clean.

Run `node test/laptop-layout.js` with the repository served at
`http://127.0.0.1:8123/`. This browser regression covers desktop, laptop, narrow
desktop, phone and touch-landscape layouts in both prototypes, including DE/FR/IT/EN,
panel sizing, object selection, table visibility, detail reading order and resizing
back to desktop. The primary 1280 × 700 profile also uses a 1.5 device scale factor.

Screenshots and geometry results are written to ignored `tmp/laptop-layout/`.
`PROFILES=1280x700,960x510` can limit a follow-up run. Validation also includes the
26 existing application scenarios, the identical-local-file alignment check, and
the independent-import-graph check.

These checks emulate CSS viewports and device scale; they do not replace a final
look on the users' actual Windows/browser configuration.
