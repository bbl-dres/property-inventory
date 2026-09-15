# Design & UX Review — prototype-simple

**Date:** 2026-09-15 · **Scope:** `prototype-simple` (minimal scope) and `prototype-tabs` (extended scope) ·
**Goal:** one design system, pixel-perfectly aligned, while both apps stay independent (no shared files at runtime)

The sibling document in `../../prototype-tabs/docs/DESIGN-REVIEW.md` is the same review from the other prototype's point of view;
sections 1–5 are identical, section 6 describes what changed in this prototype.

## 1. Method

- Read both stylesheets rule by rule (`prototype-simple/css/tokens.css` + `styles.css`, 5,900 lines; `prototype-tabs/css/main.css`, 5,800 lines), both design guides and both responsive reviews.
- Rendered both apps in headless Edge through the DevTools protocol (`test/visual.js`) at six viewports — 375×667 and 390×844 phones, 844×390 landscape phone, 768×1024 and 1024×768 tablets, 1366×768 laptop — in nine states each (map, selection, filter drawer, search results, tools panel, gallery, list/table, detail, detail tab). Screenshots plus the computed styles of ~90 shared elements (size, padding, font, colour, radius, shadow) were compared between the two apps.
- Baseline: 108 captures per app; the comparison script listed every property where the same component rendered differently.

## 2. Findings

### 2.1 Tokens

| # | Finding | Evidence |
|---|---------|----------|
| T1 | The tabs prototype carried its own copy of the tokens inline in `main.css` (with legacy aliases `--success-green`, `--warning-orange`, `--info-blue`) instead of a `tokens.css`; the sets had drifted (`--primary-red-tint`, `--tracking-wide`, `--font-mono`, `--checkbox-accent` missing in tabs). | `main.css` lines 5–136 vs `tokens.css` |
| T2 | No z-index scale. Values were scattered (500, 501, 600, 650, 1000, 1001, 2000, 2099, 2100, 3000, 3001, 9999, 10000, 10001) and differed per app for the same element (phone info sheet 600 vs 650; phone menu 3001 vs 2100). | both stylesheets |
| T3 | Checkbox accent colour was red in simple (global rule) but mixed in tabs: red for filters and print, **blue** for the layer toggles, the export options and the search scope menu. | tabs `main.css` `.active-layer-checkbox`, `.export-checkbox-label`, `.search-scope-option` |
| T4 | Overline labels (layer groups, column groups, dropdown headers, section overlines, address table headers) used four different combinations of tracking (0.5px, 0.05em, 0.08em) and colour (grey-400/500/600). | grep of `text-transform: uppercase` |
| T5 | Unused primitives in `tokens.css`: `.icon-btn*`, `.text-overline`, `.base-table`, `.loading-state`, the skeleton classes. | dead-CSS check |

### 2.2 Typography and colour

| # | Finding |
|---|---------|
| C1 | Same font stack, type scale and weights in both apps (no finding beyond C6). |
| C2 | Links were red in some places (simple detail values, tabs legend tables in simple) and blue in others (footer, API links, tabs legend tables). The guide reserves blue for links. |
| C3 | The print button was brand-red in simple and a white secondary button in tabs; the export button in tabs used the panel grey as a button colour. Three styles for the same "run this panel action" role. |
| C4 | Active-filter state of the header button: light red tint in simple, grey-900 pill with a red count badge in tabs. |
| C5 | Breadcrumb links grey-700 (simple) vs grey-600 (tabs); detail tabs grey-500 vs grey-600. |
| C6 | Buttons, inputs and selects without an explicit font-family rendered in the browser default (Arial 13.33px) in both apps — the basemap switcher label, the language options, the pagination select, the header buttons' text on some platforms. Neither stylesheet had the `font: inherit` reset for form controls. |

### 2.3 Components (rendered differences, laptop 1366×768 unless noted)

| Component | prototype-simple | prototype-tabs |
|-----------|----------------|----------------|
| Search box | 40px high | 44px high |
| Tools panel | 300px wide, 43px headers, toggle attached below the panel (CSS) | 380px wide, 45px headers, toggle positioned by JavaScript after every DOM change |
| Print form | grid form, red button | flex rows with a 100px label column, three checkboxes in one row that wrapped onto three lines at 300px (phone menu), white button |
| Info panel | preview image toggled by inline style; at ≤1366px moved to `right: 10px` where it **covered the zoom controls** | preview toggled by a class; always clear of the controls |
| Table | table panel under the map (toggle, tabs, resizable), compact rows (8/16px padding, 12px semibold headers, hover red), row-active tint, rows select on the map | separate "Tabelle" view: full-page card, airy rows (12–16px padding, 500-weight grey headers), rows opened the detail page, no row-active style although `list.js` set the class |
| Toolbar / dropdown buttons / pagination | 32px controls, 12px text, white toolbar | 34px+ controls, 14px text, grey toolbar, different pagination order |
| Columns dropdown | scrollable 400px list with group labels | class present in the markup but **no CSS** (list unbounded) |
| Detail tabs | 2px underline, medium/semibold, 42px | 3px underline, regular, 56px |
| Carousel | 340px, 200px on phones, 240px on short screens | 340px; the phone rule was overridden by a later rule (340px on phones) |
| Address table | compact variant with 10px uppercase headers | two definitions in the same file; the later one (copied from simple) overrode the first and added a 12px inset inside a padded section |
| Mini map | wrapper with address header | bare container |
| Footer | no top border, 26px | 1px top border, 27px |
| Toasts | slide up from bottom, 44px above the edge (touching the "Tabelle" toggle) | slide in from the right, 60px |
| Measure display / labels / markers | tokens (56px, 12px labels, grey-900 marker) | hard-coded (40px, 11px, black) |
| 3D map button | styled | the shared `map-controls.js` renders it, but tabs had no rule for it |
| Login button | none | 40px circle in the header (mock) |
| Language selector | header pill with dropdown, pills in the phone menu | none |
| Object count | none | "10 Objekte" next to the filter button |
| Status badges | `.badge` primitive (4px 8px, line-height 1) | own definition (2px 8px) |
| Basemap switcher, measure display | inside `#map`, so they inherited MapLibre's 12px Helvetica | siblings of `#map`, app font 14px |

### 2.4 Layout

| # | Finding |
|---|---------|
| L1 | Header: simple centred the search box absolutely (exactly centred on wide screens); tabs let it float in the space between logo and actions, so the box sat 30–50px further left. |
| L2 | Tablet: simple kept the two-line logo and its 320px search box shrank to 200px; tabs used a one-line logo, icon-only 44px header buttons and the filter count on the button corner. |
| L3 | The map view in simple was a column (map + table panel); in tabs `#map { height: 100% }`. Harmless, but two ways to write the same layout. |
| L4 | Detail page: composition differs by design (simple: one 720px column of collapsible cards; tabs: header tab strip and a two-column grid of sections). The shared parts — breadcrumb, back button, tab strip, carousel, mini map, address table — differed in every metric listed above. |
| L5 | `min-width: 0` guards for flex/grid children existed only in tabs. |
| L6 | **Map layers:** simple clustered the building points (clusters up to zoom 14, click to expand), labelled points from zoom 16 and faded parcels in from zoom 12; tabs drew every point individually at every zoom, without labels, with parcels always visible. Same basemaps, point and selection styles otherwise. |

### 2.5 Responsive and mobile

| # | Finding |
|---|---------|
| R1 | **Phone header:** simple used one 56px row (title hidden, view toggle hidden, everything else in the hamburger menu); tabs used two 44px rows (title, filter and menu / search and view toggle). Two different phone products. |
| R2 | **Phone menu:** simple had a second, JavaScript-populated menu (`#mobile-menu` with copies of the layer toggles, `populateMobileLayers()`); tabs turned the tools panel itself into the slide-in menu. The simple version duplicated state and hid the print form and the Geokatalog on phones. |
| R3 | Small phones (<480px): simple shrank header buttons to 32×32 while the touch rule set the height to 44 → 32×44 buttons. |
| R4 | Basemap switcher on phones: column list (simple) vs 2×2 grid, hidden while a sheet is open (tabs). |
| R5 | Landscape phone rules matched; the info sheet z-index did not (600 vs 650), so the sheet sat under/over the tools panel differently. |
| R6 | Detail page on phones: simple's back button was not full width; tabs' was. Simple's tab strip had a static gradient hint; tabs toggled it only when the strip overflows. |
| R7 | Search placeholder: tabs shortened it on phones ("Objekt, Ort oder Karte"), simple showed "Suche nach Objekten, Orten ode…". |
| R8 | Print media rules existed only in tabs. |

### 2.6 Accessibility

| # | Finding |
|---|---------|
| A1 | Accordion headers were `<button>`s in simple but `<div role="button" tabindex="0">` in tabs (keyboard handling reimplemented in JavaScript); detail tabs likewise (`button` vs `div`). |
| A2 | Both apps met the 44px touch-target rule on coarse pointers, with slightly different element lists (toast close, table tabs, pagination select). |
| A3 | Focus styles: simple `*:focus:not(:focus-visible)`, tabs `*:focus { outline: none }` (equivalent in practice). |

## 3. Recommendations

| # | Recommendation | Status |
|---|----------------|--------|
| R-1 | Split every stylesheet into `tokens.css` + `components.css` (identical copies in both apps) and `app.css` (per app). Extend `test/check-alignment.js` to the CSS copies and to the design guide. | done |
| R-2 | One token set with a z-index scale (`--z-*`), layout tokens (`--tools-panel-width`, `--content-max-width`, `--control-height`) and sheet/menu shadows; drop the legacy colour aliases and the unused primitives. | done |
| R-3 | One header: three flex columns with a 16px gap (equal side columns keep the search centred, the centre shrinks first so nothing overlaps), icon-only actions and view toggle from 1720px down, flexing search below 1366px, one-line logo and 44px buttons from 1024px down, two 44px rows on phones (one row on landscape phones), hamburger button inside `#header-right` in both apps. | done |
| R-4 | One phone menu: the tools panel is the hamburger menu in both apps (shared `js/tools-panel.js`); app-specific entries (share, language pills, footer links) sit in `.mobile-menu-extras`. Remove simple's duplicate menu and `populateMobileLayers()`. | done |
| R-5 | One tools panel: 300px, `#accordion-wrapper` with the toggle attached below the panel in CSS (no JavaScript positioning), `<button>` headers, simple's grid print form and `.custom-select` in both. | done |
| R-6 | One button vocabulary: `.btn-primary` / `.btn-secondary` / `.btn-tertiary` (tokens), `.header-btn` pill with `.panel-open` (panel-grey fill) and `.has-active-filters` (default pill + red badge), `.panel-btn` for panel actions (grey-900). Red only for selected/active states and the brand. | done |
| R-7 | One table density (compact), one toolbar, one pagination (info · nav · rows), `.badge` + `.status-badge` everywhere, `.row-active` in both. | done |
| R-8 | Detail page parts shared: breadcrumb, back button, 2px tab strip with the same fade hint, 340/240/220px carousel, mini map with address header, address table in a size container (`.address-table-wrap`) that stacks label/value rows below 640px in both apps. | done |
| R-9 | Info panel: `has-preview` class in both, always clear of the map controls, one z-index as a bottom sheet. | done |
| R-10 | Links blue everywhere; checkbox accent red everywhere; one overline style; form controls inherit the app font (`--font-sans`), floating map widgets set it explicitly. | done |
| R-11 | Phones: 2×2 basemap grid hidden while a sheet or the menu is open, full-width back button, short search placeholder (i18n key `header.search.placeholder.short`), toasts sliding up, no 32px buttons on small phones, print media rules in both. | done |
| R-12 | "Tabelle" toggle under the map (simple): grey-900 with white text like the "Menü" toggle — the white pill was hard to see on the map. | done (requested during the review) |
| R-13a | Same map layer stack in both apps: clustered building source, cluster and count layers, id labels from zoom 16, parcels from zoom 12 (tabs adopted simple's layers; `internalLayerIds` and the print module already handle them). | done (requested during the review) |
| R-13b | Same table in both apps: the tabs prototype's "Tabelle" view (a third view with a full-page table whose rows opened the detail page) is replaced by simple's table panel under the map — "Tabelle" toggle, Gebäude / Grundstücke tabs, toolbar with filter pills and column search, rows select on the map, `?table=open` / `?tableTab=`. The view toggle has the same two views (Karte, Galerie) in both apps. | done (requested during the review) |
| R-13c | Login button in simple's header, same as tabs (mock, "coming soon" toast; hidden on phones); the object count of the tabs header removed — simple never had one, both headers now hold the same controls. | done (requested during the review) |
| R-13d | 3D toggle: both apps already share `map-controls.js` (2D/3D button, OpenStreetMap-based building extrusions of the CARTO basemaps, `?3d=1`); nothing to port. | verified |
| R-13e | "Luftbild" basemap with global coverage: Esri World Imagery worldwide, swisstopo SWISSIMAGE on top within Switzerland (the objects abroad had no imagery). Free with attribution under Esri's terms; see THIRD-PARTY.md. | done (requested during the review) |
| R-13f | Header actions: one 12px gap at every width (was 32px above 1366px, then 16/12/8px). | done (requested during the review) |
| R-13g | Language selector in tabs' header and phone menu, same control as simple; tabs has no translations yet, so a choice shows a warning toast (`lang.notImplemented`). | done (requested during the review) |
| R-13h | Object ids: both data sets use the BBL/SAP scheme `Buchungskreis/Wirtschaftseinheit/Objekt` (letters = building, two digits = parcel) with Buchungskreis 1080; the tabs mock data (`BBL-001`, `PCL-001`, `SITE-BBL-001`) now carries the ids of the same objects in simple, composite entity ids (`4840-M1`) are prefixed with the Wirtschaftseinheit. | done (requested during the review) |
| R-17 | Location tree (new, requested): "Standorte" toggle in the header, left panel with Land → Region → Ort → WE → objects, counts; a country, region or city node sets the Land / Region / Ort filters of the drawer (the Filter button counts them, no badge on the Standorte button, which is a plain panel toggle), WE nodes are folders, object rows select on the map and, on the detail page, open that object's page (a parcel: its building's); one level at a time, one open node per level, node rows toggle; width draggable at the right edge (240-600px, remembered); shared `js/location-tree.js` with a per-app data adapter in `app.js`. Phones: entry in the menu, full-screen sheet (first step, to be refined with user feedback). | done (requested during the review) |
| R-18 | API documentation in tabs: footer link "API", `?view=api-docs`, the same `#api-docs-view` (view nav, header, Swagger UI host); `data/swagger.json` and `vendor/swagger-ui/` are identical copies checked by the alignment test, the loader code in `js/ui.js` is the same. The spec documents the target API (simple's property names), not the tabs mock data. | done (requested during the review) |
| R-19 | One navigation bar for page views: `.view-nav` (the former `.api-docs-nav`) in `components.css` — sticky white bar, grey-300 border, breadcrumb left, actions right — used by the API docs and the detail page of both apps. Simple's detail breadcrumb moved out of the content column into this bar; tabs' `.header-detail .detail-header` uses it inside the page header. | done (requested during the review) |
| R-21 | Tabs gets simple's "Ort" filter (`city`), so the tree's city level filters in both apps. | done (requested during the review) |
| R-20 | Header density: the Standorte button made the actions collide with the centred search on ~1900px screens (the search was absolutely centred over the row). Three flex columns with a guaranteed gap; below 1720px the button labels and the "Karte" label collapse to icons. | done (requested during the review) |
| R-22 | Table panel vs. tools panel: opening or enlarging the table folds the tools panel when the two would overlap (the reader reopens it with the toggle); the "Menü" toggle is centred under the panel's width also when collapsed (it was left-aligned). | done (requested during the review) |
| R-23 | Country outline: selecting a country in the tree outlines it on the map and zooms to it. Natural Earth 1:10m, one simplified file per country (`assets/countries/<ISO>.geojson`, mostly 20-120 KB, loaded on demand and prefetched for the tree's countries) plus `index.json` with the bounding boxes; identical in both apps, an outline without fill (a tint disturbed the map), under the data layers, re-added after a basemap change. | done (requested during the review) |
| R-24 | Filter drawer header: the reset icon became a labelled tertiary button "Zurücksetzen" (`.filter-panel-reset`) in both apps. | done (requested during the review) |
| R-25 | One resize grip for both side panels (`.panel-resize-handle`, a zero-width sibling on the panel edge): hit area, blue hover bar and the three-line glyph are centred on the border line — inside the panels they were clipped 4px inward, and the drawer had no glyph. Fixed with the panels in tabs' detail view. | done (requested during the review) |
| R-26 | Filter button with active filters: default pill plus the red count only — the grey-900 fill clashed with the open state of the neighbouring Standorte toggle. | done (requested during the review) |
| R-27 | Canton outlines: the 26 Swiss cantons from swissBOUNDARIES3D (© swisstopo, fetched once by the generator and stored as `assets/regions/CH-<code>.geojson`, simplified to 10-15 m, no live query; Natural Earth admin-1 as the fallback and for the German names); a Swiss region node outlines and zooms to its canton, matched by code (simple: `BE`) or German name (tabs: `Kanton Bern`); regions abroad zoom to their objects. | done (requested during the review) |
| R-13 | Logo = home button in both apps: landing state (map view, filters cleared, selection, search and drawer closed, initial extent); in tabs the logo used to switch to the previous view (gallery by default), which looked like a random tab change. | done (requested during the review) |
| R-14 | Tablets: hide the object count (tabs) so the search box keeps at least 240px; consider a 3-column gallery at 1024px. | open |
| R-15 | Replace the `div.info-icon` pseudo-buttons of simple's detail rows by real buttons with `aria-expanded`. | open |
| R-16 | Give both apps a light "no-map" state for the detail page on phones (the mini map loads a second MapLibre instance). | open |

## 4. Implementation

### 4.1 Files

| File | Role |
|------|------|
| `css/tokens.css` | Tokens, reset, base, focus, reduced motion, primitives. **Identical in both prototypes.** |
| `css/components.css` | Every shared component and its responsive rules (header, search, view toggle, map controls, basemap switcher, tools panel/phone menu, location tree, view nav, API documentation, print form, Geokatalog, layers, info panel, context menu, measure, filter drawer, toolbar, dropdowns, tables, pagination, gallery, detail frame, tabs, carousel, lightbox, mini map, address table, toasts, overlay, modals, banner, footer, print). **Identical in both prototypes.** |
| `css/app.css` | App-specific components and composition only. |
| `js/tools-panel.js` | Shared tools panel / phone menu controller (open state, hamburger, backdrop, focus, Escape). **Identical in both prototypes.** |
| `js/location-tree.js` | Shared location tree (left panel, selection filter, ARIA tree). **Identical in both prototypes.** |
| `docs/DESIGNGUIDE.md` | Version 1.2, identical in both prototypes. |
| `test/visual.js` | Headless-browser probe used for this review (`node visual.js both <dir>`, `node visual.js eval "<expr>" <prototype> <viewport> <scenario>`). |

Rule of thumb: a component both apps use is styled once, in `components.css`. `app.css` may position it
(`#list-view .list-table-container` becomes a card, `.detail-card .address-table-wrap` is inset) but never
restyle it. `npm run align` (in `test/`) fails when the copies drift.

### 4.2 Decisions (the value that both apps now use)

| Topic | Decision |
|-------|----------|
| Header controls | 40px on desktop (`--control-height`), 44px on touch screens and phones |
| Search box | absolutely centred > 1366px, flexes ≤ 1366px, max 550/500/400px, full width on phones |
| Header buttons | pill; 12px gap between the actions at every width; labels hidden ≤ 1024px; active filters = grey-900 pill + red badge (corner badge on tablets) |
| Tools panel | 300px, panel grey, `<button>` headers, toggle attached below; collapsed on tablets; slide-in menu (300px, max 85vw) on phones |
| Panel forms | `.print-form` grid, `.custom-select`, red checkboxes, `.panel-btn` grey-900 |
| Info panel | 320px at `right: 60px` (300px / 68px on tablets), preview only with `.has-preview`, bottom sheet at `--z-sheet` on phones, docked right on landscape phones |
| Tables | th 8/16px 12px semibold grey-700, td 8/16px 14px grey-800, hover grey-50, selected row red tint; toolbar 44px min with 32px controls; pagination 12px |
| Badges | `.badge` 4/8px, radius 4px, 12px medium + status colours |
| Tabs | 12/20px, 14px medium grey-500, 2px underline; active red semibold |
| Breadcrumb | 14px grey-600, links grey-700 |
| Carousel | 340px, 240px on short screens and landscape phones, 220px on phones; 44px buttons on touch |
| Mini map / address | `.mini-map-wrapper` with address header, 300px (220px phones); address table 12px uppercase headers, stacked rows < 640px container |
| Toasts | 60px above the bottom (16px + safe area on phones), slide up |
| Footer | grey-100, 1px grey-300 top border, hidden on phones |
| z-index | 400 map overlay · 500 panels · 650 sheet · 1000 header · 1001 popovers · 2000 drawer/search · 2100 menu · 9999 overlay · 10000 toast · 10001 modal |
| Breakpoints | 1366 laptop · 1024 tablet · 767 / landscape-phone mobile · 479 small · `(pointer: coarse)` touch |

### 4.3 Removed

Simple: `#mobile-menu` and its backdrop markup, `populateMobileLayers()`, `initMobileMenu()`, `initMenuToggle()`,
the 32px small-phone header buttons, the `:has` tint for active filters, `.base-table`, the static tab-strip
gradient. Tabs: the inline `:root` token block, `updateMenuTogglePosition()` and its MutationObserver, the
second address-table and carousel definitions, `.filter-pane-*`, `.filter-chip*`, `.gallery-skeleton*`,
per-component checkbox colours, `.print-panel` / `.print-label` / `.print-checkboxes`, `.export-btn` styling.
Tokens: `--success-green`, `--warning-orange`, `--info-blue`, `.icon-btn*`, `.text-overline`, `.base-table`,
`.loading-state`, skeleton classes.

## 5. Verification

- `cd test && npm test` — 9 scenarios, 224 checks, all passing (jsdom harness of both apps; includes the home-button checks).
- `npm run align` — 18 common modules, `data/i18n.json`, `css/tokens.css`, `css/components.css` and `docs/DESIGNGUIDE.md` byte-identical.
- Dead-CSS check over `index.html` + `js/*.js`: no unreferenced class or id in either app (the only reports are the swisstopo legend and Swagger selectors that come from external HTML).
- Headless Edge probe after the change: 108 captures per app, no console errors, no horizontal overflow at any viewport. Every remaining difference in the computed styles of the shared components is content or state (number of view-toggle buttons, which accordion item is open, the selected table row, the open tab) or the documented composition of the detail page (tab strip in the header vs. inline, two columns vs. one). Re-run with `cd test && npm run visual` (static server on port 8123 required).

## 6. This prototype: prototype-simple (minimal scope)

**Header.** The one-line logo (`.logo-title-short`) was added for tablets and phones; the hamburger button
moved into `#header-right`; the filter label carries `.header-btn-label`. The language selector is hidden on
phones — the language pills live in the phone menu.

**Phone menu.** `#mobile-menu` is gone. The tools panel (`#accordion-panel`, now inside `#accordion-wrapper`
next to `#menu-toggle`) is the hamburger menu; it got the `.mobile-menu-header` (title, close) and a
`.mobile-menu-extras` block with the share entry, the language pills and the Quellencode/API links.
`js/ui.js` lost `initMenuToggle()`, `initMobileMenu()`, `populateMobileLayers()` and the `.mobile-view-btn`
sync; it now calls `initToolsPanel()` (shared) and `initPhoneMenuExtras()`. The print form and the Geokatalog
are therefore available on phones too.

**Table panel.** `.table-panel`, `.tbl-toggle` (now grey-900/white), `.tbl-resize-handle` and the table tabs
moved to `app.css`. The three tables lost the `base-table` class.

**Detail page.** The inline tab strip became `.detail-tabs.detail-tabs--inline > .detail-tabs-inner`; the
address table sits in `.address-table-wrap` and `js/detail.js` writes the translated column headers into the
cells' `data-label` so the stacked layout (narrow columns, phones) shows labels. Detail links are blue.
The single-column layout, overlines, cards and grid rows stay simple-only (`app.css`).

**Info panel.** `showInfoPanel()` toggles `has-preview` instead of an inline `display`.

**View nav.** The detail breadcrumb and back button moved out of the 720px content column into the shared
`.view-nav` bar above it (sticky, full width, inner row 720px wide) — the same bar the API documentation
uses; `.api-docs-nav` is only a hook now.

**Search.** Short placeholder on phones (`initResponsiveSearchPlaceholder()`, i18n key `header.search.placeholder.short`);
`clearSearch()` is exported for the home action.

**Login.** `#login-area` / `#login-btn` in the header (mock, `comingSoon()` toast), hidden on phones — the same
element as in tabs; the button styles moved to `components.css`.

**Home.** `goHome()` in `js/ui.js` (logo click) resets filters, selection, search, drawer and the table panel
and flies to the initial extent. The table-panel toggle moved from `js/app.js` to `js/list.js`
(`initTablePanel()`, `setTablePanelOpen()`); closing the panel now removes `table` from the URL instead of
writing `table=closed`.

**Stylesheets.** `css/styles.css` was replaced by `css/components.css` + `css/app.css` (258 lines: filter search, detail cards, simple-only responsive rules).

