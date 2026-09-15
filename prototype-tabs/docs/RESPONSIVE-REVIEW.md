# Responsive & Mobile Design Review — prototype-tabs

**Date:** 2026-09-14
**Scope:** `index.html`, `css/main.css`, `js/app.js`, `docs/DESIGNGUIDE.md`, `README.md`

> **Note (2026-09-15):** this review predates the split of `js/app.js` into ES modules (see [CODE-REVIEW.md](CODE-REVIEW.md)). The layout helpers now live in `js/utils.js`, the menu and sheet code in `js/ui.js`, the search in `js/search.js` and `js/assistant.js`.
**Focus:** responsive layout, touch ergonomics and mobile-specific behaviour of the map, list, gallery, detail (tabs) and filter views
**Reference:** the sibling review [`../../prototype-main/docs/RESPONSIVE-REVIEW.md`](../../prototype-main/docs/RESPONSIVE-REVIEW.md) — same method, same breakpoints, same patterns, so both prototypes stay one design system
**Reviewer:** Claude (senior design / UX review requested by the maintainer)

Every finding was reproduced in a headless Chromium (Playwright, WebGL via SwiftShader) at six viewport sizes and
verified again after the change. Findings marked **Fixed** were implemented in the same change set as this document.
Three changes requested by the maintainer during the review (KI answers in the search suggestions instead of a side
panel; hamburger menu on phones; Mapbox → MapLibre) are documented in §3 because they changed the mobile layout or the map. The screenshot and check
harness lives outside the repository (§5).

## Summary

| Area | Findings | Fixed | Open |
|---|---|---|---|
| Breakpoints & layout | 8 | 8 | 0 |
| Touch ergonomics | 5 | 5 | 0 |
| Mobile interaction patterns | 8 | 8 | 0 |
| Bugs found on the way | 7 | 7 | 0 |
| Product changes requested during the review | 3 | 3 | — |
| Recommendations (not implemented) | 13 | — | 13 |

**Verdict before the changes.** The desktop layout is solid. The phone layout existed on paper (wrapped header,
bottom sheets, full-screen filter) but had never been looked at on a device: two CSS bugs turned the tools toggle into a
full-height black box and pushed the "Filter & KI Assistent" label out of its 40 px circle; on a portrait iPad the header
overflowed so that the Filter button was **off-screen**; the detail page was **clipped** on every screen below ~1100 px
(carousel arrow, address columns, table toolbars unreachable); a phone in landscape got the tablet layout with a 258 px
map; every map control was 29 px. No page errors at any size.

**Verdict after the changes.** Phones in portrait and landscape share one mobile layout with a two-row header, a hamburger
menu for the map tools, a filter sheet with a live result count, a swipe-to-dismiss info sheet and a sticky tab strip on
the detail page; tablets fit their header, start with a clear map and get 44 px controls; nothing is clipped on any
screen. Desktop behaviour is unchanged apart from the three requested changes (§3). What remains open is
functional scope on phones (measuring, printing, a card list instead of the table) rather than layout.

## 1. Method

| Viewport | Size | Emulation | Represents |
|---|---|---|---|
| phone-se | 375 × 667 | touch, DPR 2 | iPhone SE / small Android |
| phone-14 | 390 × 844 | touch, DPR 2 | Current iPhone |
| phone-land | 844 × 390 | touch, DPR 2 | Phone in landscape |
| tablet | 768 × 1024 | touch, DPR 2 | iPad portrait |
| tablet-land | 1024 × 768 | touch, DPR 2 | iPad landscape |
| laptop | 1366 × 768 | mouse | Small laptop (desktop regression) |

Fifteen scenarios per viewport (map, map with selection, tools menu/panel toggled, filter drawer, search, search with
KI answer, external layer added + menu, list, gallery, detail overview, detail measurements, detail contracts, detail
with drawer, basemap switcher, basemap switched to the aerial style): 90 screenshots and a metrics pass per screen (interactive elements below 44 × 44 px,
form fields below 16 px, content wider than the screen — including content clipped by `overflow: hidden`, which
`scrollWidth` does not show —, header and map heights, page errors).

Reviewed against: the project's own `DESIGNGUIDE.md` (44 px targets, 4.5:1 contrast, breakpoints), WCAG 2.2
(2.5.8 target size, 1.4.10 reflow, 2.5.7 dragging alternatives), the platform conventions for bottom sheets, side
sheets and full-screen sheets on iOS and Android, and the main prototype's review for consistency.

## 2. Findings

### 2.1 Breakpoints & layout

| ID | Severity | Where | Finding | Status |
|---|---|---|---|---|
| L1 | **High** | `#detail-view`, `.detail-grid`, `.address-table`, `.detail-table-wrapper` | The detail page was **clipped** on every screen narrower than ~1100 px (and on a desktop with the drawer open). The 7-column address table and the entity tables set the min-content width of their flex/grid ancestors (`min-width: auto`), the page grew past the viewport and `#main { overflow: hidden }` cut it off: on a phone the carousel's "next" arrow, the last address columns and the whole toolbar action row (Bearbeiten / Löschen / Hinzufügen) were unreachable; on a portrait iPad the right column ("Objekt Stammdaten") was cut mid-word. | Fixed: `min-width: 0` on the view, grid and columns; the address table becomes stacked label/value rows below a 640 px **container** width (`@container` on its section, so it also works next to the open drawer on a desktop); entity tables scroll inside their wrapper; toolbar actions wrap. |
| L2 | **High** | `.header-main` (tablet, 768 px) | Logo (two lines), 400 px search, view toggle with label, "10 Objekte", the 190 px "Filter & KI Assistent" button and the login button need ~1240 px. On an iPad in portrait the count wrapped and **the Filter and login buttons were off-screen** — the filter could not be opened at all. | Fixed: at ≤ 1024 px a one-line logo ("BBL Liegenschaften Inventar"), icon-only header buttons (44 px, `aria-label`), no view-toggle labels, `white-space: nowrap` on the count, search shrinks to what is left (≥ 190 px). |
| L3 | **High** | all mobile media queries | The mobile layout was selected by width only (`max-width: 767px`). A phone in landscape (844 × 390) got the **tablet** layout: 70 px header that overflowed on the right (Filter button cut off), 35 px banner, footer, the 320 px tools panel open and the 300 px info panel on the right — a 258 px tall map with ~400 px of it visible. | Fixed: the mobile query is now `(max-width: 767px), (max-height: 500px) and (pointer: coarse)` (same as the main prototype); `isMobileLayout()` / `isLandscapePhone()` in `app.js` mirror it. Landscape phones get a single 53 px header row, the hamburger menu, the info panel docked to the right (`min(360px, 55vw)`) and a 313 px map. |
| L4 | Medium | banner, header, footer (phones) | 197 px of chrome on a 667 px screen: two-line banner (41 px), 121 px header with a mostly empty first row (logo hidden below 480 px), 35 px footer with mouse coordinates that never update on touch. | Fixed: one-line short banner (25 px), two 44 px header rows — short title, Filter, menu / search, view toggle — (113 px), footer hidden on phones. Map on the iPhone SE: 470 → 530 px. |
| L5 | Medium | `#accordion-panel`, `#menu-toggle` | The tools panel opened by default: on phones a 60 vh bottom sheet covering 367 of the 470 map pixels (78 %), on tablets a 320 px panel over 42 % of the map width, on landscape phones half the screen. | Fixed: collapsed by default at ≤ 1024 px (tablets: "Menü öffnen" toggle, as in the main prototype); on phones the panel is the hamburger menu (§3, P2). |
| L6 | Medium | `#smart-drawer` in the detail view (phones) | `body.detail-active #smart-drawer.open { top: var(--header-total-height) }` outranked the mobile full-screen rule: the filter drawer opened 214 px down, **its header with the close button off-screen**; the only way out was Escape or Back. | Fixed: the mobile rule now carries the same specificity; the drawer is a full-screen sheet in every view. |
| L7 | Low | `.style-switcher-panel` (phones) | The basemap panel opened upwards as a column of four 70 × 50 px thumbnails and was clipped by the header; the switcher overlapped the info sheet and the tools sheet. | Fixed: 2 × 2 grid with smaller thumbnails, opens within the map; hidden while a sheet or the menu is open. |
| L8 | Low | `#search-results` (phones, tablets) | The dropdown was as wide as the input: 201 px on a phone, 189 px on a portrait iPad, so the new KI question wrapped word by word. | Fixed: spans the header width on phones (`calc(100vw − 32px)`, max 600 px), `clamp(360px, 60vw, 600px)` on tablets. |

### 2.2 Touch ergonomics

| ID | Severity | Where | Finding | Status |
|---|---|---|---|---|
| T1 | **High** | Map controls (`.maplibregl-ctrl-group button`), `.map-home-btn` | Zoom, compass and home were **29 × 29 px** on every touch device (the design guide requires 44 px). | Fixed: 44 × 44 px under `(pointer: coarse)`; 29 px with a mouse. |
| T2 | **High** | Filter rows, table checkboxes, drawer/info-panel buttons, tabs, pagination, carousel, detail actions, view toggle | Filter checkboxes 18 px in 37 px rows, table checkboxes 16 px, drawer and info-panel buttons 28 px, detail tabs 37 px, Back/Bearbeiten 34 px, pagination 32 px, carousel arrows 40 px and dots 10 px, view-toggle buttons 37 px wide. | Fixed: all ≥ 44 px on coarse pointers (the filter `<label>` carries the row's hit area, 20 px boxes; dots keep 10 px but get a 34 px pseudo-element hit area; small inline icons such as layer info/remove get a 44 px pseudo-element). |
| T3 | Medium | Every text input and select (14 px) | iOS Safari zooms into the page when a field below 16 px receives focus: header search, table filters, share link, print/export selects, pagination select. | Fixed: 16 px on the mobile layout. |
| T4 | Medium | `.gallery-card:hover`, `.style-option:hover`, `.share-icon-btn:hover` | Hover lifts (`transform`) stick after a tap on touch screens; there was no `prefers-reduced-motion` rule at all (the design guide prescribes one). | Fixed: transforms guarded by `@media (hover: hover)`; reduced-motion block added (as in the main prototype). |
| T5 | Low | `.smart-drawer-resize-handle` | 6 px wide, `mousedown` only — unusable with a pen or finger on tablets; pointless on phones. | Fixed: pointer events with pointer capture, `touch-action: none`, 12 px on touch, disabled on phones. |

### 2.3 Mobile interaction patterns

| ID | Severity | Where | Finding | Status |
|---|---|---|---|---|
| M1 | **High** | `selectBuilding()`, `selectParcel()`, info panel | After a search or URL fly-to (which centres the object) and after tapping an object in the lower half of the map, the bottom sheet covered the selected object. | Fixed: fly-to passes an `offset` that centres the target in the uncovered part of the map (`getInfoPanelOffset()`), a tap selection calls `revealSelectionOnMobile()`, which pans only if the object is under the sheet; works for the bottom sheet and the landscape side panel. Desktop: no offset. |
| M2 | **High** | `#smart-drawer` (full-screen on phones) | Six filter sections, all open, and the only way to finish was the X at the top; no feedback on how many objects the filters leave. | Fixed: sticky footer with **"N Objekte anzeigen"** (closes the sheet, count updates live) and **"Zurücksetzen"**; focus moves to the close button when the sheet opens and back to the header button when it closes. |
| M3 | Medium | `#info-panel` bottom sheet | 70 vh (80 vh below 480 px, `vh` includes the browser chrome), no grab handle, no swipe-to-dismiss, no safe-area padding, preview image took 100–140 px of the sheet. | Fixed: `50dvh`, handle, swipe down on handle or header closes the sheet (`initSheetGesture()`), `env(safe-area-inset-bottom)`, preview image hidden on phones (the same rule already applied to short desktops). |
| M4 | Medium | Detail page mini map | Captured every gesture: a one-finger drag over it panned the map instead of scrolling the page; on desktop the scroll wheel zoomed the map and trapped page scrolling. | Fixed: `cooperativeGestures: true` with German hints (two fingers / Ctrl+wheel / ⌘+wheel). |
| M5 | Medium | `.detail-tabs`, `#header` in the detail view (phones) | Seven tabs need 680 px; on a phone "Ausstattung", "Dokumente" and "Kontakte" were cut off with no affordance, and because the whole 289 px header scrolls away, switching tabs on a 5 500 px long page meant scrolling back to the top. | Fixed: the header is `position: sticky` with a negative top (`updateDetailHeaderOffset()`), so it collapses on scroll until only the tab strip stays pinned; the strip scrolls horizontally with scroll-snap, fades at the right edge while more tabs are hidden and scrolls the active tab into view; tabs are 44 px and got `role="tab"`, `aria-selected` and keyboard activation. |
| M6 | Medium | Entity tables (phones) | UUID column wrapped to three lines per row (`word-break: break-all`), toolbar actions were off-screen (L1), the pagination footer wrapped "Zeilen pro Seite" and "Seite 1 von 1" mid-phrase. | Fixed: ID columns hidden on phones (still exported), toolbar wraps with "Hinzufügen" right-aligned, pagination wraps cleanly, rows-per-page hidden below 480 px. |
| M7 | Low | Carousel, search placeholder | No swipe on the image carousel; "Suche nach Objekten, Orten oder Karten" was cut to "Suche nach Objekten, O" in the phone field. | Fixed: horizontal swipe changes the image (`initCarousel()`), arrows got `aria-label`s; a short placeholder ("Objekt, Ort oder Karte") on phones. |
| M8 | Low | `#logo-title` | No app title on small phones (the logo was hidden below 480 px, the first header row was empty). | Fixed: short title "BBL Liegenschaften Inventar" on phones and tablets (main prototype: title in the menu header; here the header has room for it). |

### 2.4 Bugs found on the way

| ID | Severity | Where | Finding | Status |
|---|---|---|---|---|
| B1 | **High** | `css/main.css`, `#menu-toggle` | The mobile rule set `bottom: 10px` while `updateMenuTogglePosition()` kept setting an inline `top`: the toggle stretched into a 146 × 204 px black box over the map when the panel was open, and into a **full-height black column** through the middle of the map when it was collapsed. | Fixed (the phone layout no longer uses the toggle; tablets/desktop keep the JS positioning, phones clear the inline `top`). |
| B2 | **High** | `.header-btn span:not(.material-symbols-outlined)` | The rule that hides the button label on phones targeted a `<span>` that did not exist (the label was a bare text node): "Filter & KI Assistent" rendered on three lines through the 40 px circle. The same dead rule existed for the drawer tabs. | Fixed: the label is a `<span class="header-btn-label">`; the tab rule is gone with the tabs (§3). |
| B3 | Medium | `resetFilters()` | Selected `#filter-pane input` — an element that does not exist (the drawer is `#smart-drawer`). **Reset did not uncheck the boxes**; desktop too. The same bug was found in the main prototype (its B1). | Fixed. |
| B4 | Low | Info-panel share fallback | `showToast('Link in Zwischenablage kopiert')` passed a string to a function that expects an options object → an empty toast. | Fixed. |
| B5 | Low | Tokens | `var(--primary)` (undefined) on the Geokatalog checkbox accent, the legend border and legend links; `var(--grey-400)` (undefined) on the toast close button. | Fixed: `--primary-red` / `--interactive-blue`; `--grey-400: #A0A8AE` added as in `prototype-main/css/tokens.css`. |
| B6 | Low | `css/main.css` | ~150 lines of legacy `#filter-pane` styles and the AI-panel styles (`#ai-assistant-panel`, `.ai-chat-*`) were dead. | AI-panel styles removed with the panel (§3); the `#filter-pane` block is left for a separate cleanup (O7). |
| B7 | Low | `selectBuilding()` / `#info-preview-image` | The preview image was shown with an inline `style.display = 'block'`, which overrode the stylesheet's `@media (max-height: 800px)` rule: on short desktops the secondary rows were hidden as intended but the 140 px image stayed, and on phones it pushed "Details anzeigen" out of the 50 dvh sheet. | Fixed: a class on the panel (`has-preview`) instead of an inline style; the media rules apply again. |

### 2.5 Verified without change

- No JavaScript errors in any of the 90 after-screens; none in the 90 before-screens either.
- Gallery on phones (horizontal cards, 120 px image), 60 dvh search dropdown, full-width toasts, `10 Objekte` count on tablets, list view on tablets, layer-info modal (90 dvh), print styles.
- Contrast and type scale follow the design guide; the smallest running text is 12 px.
- The existing `@media (max-height: 800px)` rule that hides the preview image and secondary rows so that "Details anzeigen" stays visible on short desktops.

## 3. Product changes requested during the review

| ID | Request | Implementation |
|---|---|---|
| P1 | **KI answers in the search suggestions instead of a side panel** (wireframe supplied). | The drawer's "KI Assistent" tab and the embedded stack-ai chat are gone; the drawer is "Filter Stammdaten" only, every option shows its object count ("Verwaltungsgebäude 2"), the header button reads "Filter" and turns dark with a red badge while filters are active. The search dropdown follows the wireframe: sections *Frage stellen (KI)*, *Objekte* (buildings **and parcels**), *Ort (swisstopo)*, *Karten (Geokatalog)*, each row *icon · title · meta or "+ Als Ebene"*, matched term highlighted, a scope select ("Alle / Objekte / Orte / Karten / Fragen") in the search box (desktop and tablet). The KI row shows one suggested question for the typed term — building area, objects in a place, objects in Renovation/Planung, total floor area, oldest object, or a fallback for question-like input — and answers it inline (tap or Enter) from the loaded data with chips that select the object on the map. It is explicitly a mock (a note says so); the pattern is what is being tested. Not taken from the wireframe: the language selector (this prototype is German only) and the avatar with initials (login is a stub). |
| P3 | **Migrate the map from Mapbox GL JS to MapLibre GL JS** (queued by the maintainer after the review; the tabs prototype was the only one still on Mapbox). | Done in six phases, see §3.1. |
| P2 | **Hamburger menu on phones** like the main prototype, with the external layers inside it. | On phones (only) the tools panel `#accordion-panel` *is* the menu: a 300 px sheet sliding in from the right with a title bar and close button, a backdrop, focus management and Escape. Everything the panel offers is therefore in the menu — Teilen, Drucken, Export, Geokatalog and **Dargestellte Karten** with the Swisstopo layers added from the search (verified: an ISOS layer added on a phone is listed, can be toggled, removed and inspected). "Zeichnen & Messen" is hidden on phones because measuring needs the right-click menu. Tablets and desktop keep the floating panel with the "Menü öffnen" toggle. Note: the main prototype's own menu still does not list external layers (`populateMobileAccordion()` is unwired, its review O2); the same approach — reuse the panel instead of copying its content — would fix it there. |

### 3.1 Mapbox → MapLibre migration (P3)

**Inventory.** One CDN script + stylesheet and a public access token in `app.js`; 14 `mapboxgl.*` call sites
(main map, mini map, `NavigationControl`, `ScaleControl`, `LngLatBounds`, 5 × `Marker`, `Popup`, the home-button
control); four `mapbox://` styles and the Static Images API for the basemap thumbnails; the mini map's 3D buildings
from Mapbox's `composite` source (`height` / `min_height`); five `.mapboxgl-*` selector groups in the stylesheet.
Everything else the app uses (`flyTo` with `offset`, `panBy`, `queryRenderedFeatures`, `setFilter`, `setPaintProperty`,
`getStyle`, raster sources for the Swisstopo layers, `style.load`) has the same API in MapLibre.

**Plan and result, by phase.**

| Phase | Change | Notes |
|---|---|---|
| 1 Library | `vendor/maplibre-gl/` (MapLibre GL JS 5.19, BSD-3) copied from `prototype-main`; the Mapbox CDN tags and the access token are gone. | Same build in both prototypes; the site works offline from the repo except for tiles. |
| 2 Basemaps | The four Mapbox styles became the main prototype's set: CARTO Positron ("Light", default), CARTO Voyager ("Standard"), swisstopo SWISSIMAGE raster ("Luftbild"), CARTO Dark Matter ("Dark"). `mapStyles` mirrors `prototype-main/js/config.js`. | Mapbox "Hybrid" (aerial + streets) has no free equivalent. A saved `mapStyle` with an old Mapbox id falls back to Light. |
| 3 Thumbnails | Four local PNGs in `assets/basemaps/`, rendered from the styles themselves (160 × 120 @2x). | The Mapbox Static Images API needed the token; CARTO's raster tiles are watermarked "API KEY REQUIRED" (the main prototype still uses them — its O5). |
| 4 API and CSS | `mapboxgl.` → `maplibregl.`; `.mapboxgl-*` → `.maplibregl-*` (controls, popup, home button container); cooperative-gesture hint keys (`CooperativeGesturesHandler.*`). | MapLibre's default control size is the same 29 px, so the 44 px touch rule (T1) carries over unchanged. |
| 5 Mini map 3D | `fill-extrusion` from the first vector source of the CARTO style (`building` layer, `render_height` / `render_min_height`), the basemap's flat building layers hidden meanwhile — the same approach as `show3DBuildings()` in the main prototype. | Guarded: a symbol layer without `layout` no longer throws when the label layer is looked up. |
| 6 Verification | Harness run on phone and laptop: library reported as MapLibre, zero page errors, all four thumbnails load, `portfolio-points` / `portfolio-selected` / `parcels-fill` present before and after switching to the SWISSIMAGE style, a Swisstopo layer added from the search is listed and drawn, the mini map's `3d-buildings` layer exists; then the full 6-viewport audit (§5). | |

**Known differences.** No globe at low zoom (MapLibre renders Mercator by default, like the main prototype); "Standard"
is OpenMapTiles cartography instead of Mapbox Streets; "Luftbild" covers Switzerland only (swisstopo, zoom ≥ 8) — the
foreign objects of the portfolio sit on an empty background in that style, exactly as in the main prototype (O13).

## 4. Recommendations (not implemented)

| ID | Recommendation |
|---|---|
| O1 | **Table on phones.** The list view is a horizontally scrolling table with four columns; a card list (one card per row, sort menu, export in the menu) is the phone pattern — same as O1 of the main prototype. |
| O2 | **Measuring on touch.** Needs an entry point (menu item or long-press) and drag handles on pointer events; the markers already use a `::after` hit area on desktop. Until then the item is hidden on phones. |
| O3 | **Print on phones.** "Drucken" is in the menu and works, but the print-preview frame is drawn on the map behind the open menu. Either close the menu when the preview appears or document print as a desktop feature. |
| O4 | **Search sheet on phones.** With the keyboard open on a 667 px screen the dropdown shows two or three rows. A full-screen search sheet (input at top, results below, "Abbrechen") is the platform pattern. |
| O5 | **Home-screen use.** For standalone use add `viewport-fit=cover` and `theme-color`; the `env(safe-area-inset-bottom)` paddings are in place and are no-ops today. |
| O6 | **Tablet portrait with the drawer open** leaves a 428 px map. Below ~900 px the drawer could overlay the map instead of pushing it (main prototype O9). |
| O7 | **Legacy CSS.** Remove the `#filter-pane` block (B6); rename `.btn-back` where it styles the "Hinzufügen" buttons. |
| O8 | **Add the harness to the repo** (`test/responsive/`, `playwright-core` as dev dependency) so the numbers in §5 are reproducible in CI — the same recommendation as the main prototype's O10; one harness could serve both. |
| O9 | **Real KI.** `suggestAiQuestion()` is a switchboard of six intents over the loaded data. When a real assistant is wired in, keep the UI (question row, inline answer, chips) and replace only that function; add a loading state to the answer block. |
| O10 | **Language selector and account menu** from the wireframe ("DE ▾", "DM") need i18n data and a user model that this prototype does not have; the main prototype has both. |
| O11 | **Remaining sub-44 px elements** are secondary or exempt: inline breadcrumb links (18 px, WCAG 2.5.8 inline exception), map attribution links and logo, footer links on tablets, inputs inside 44 px containers, the answer chips (28 px, inline), the 12 px resize handle (a drag affordance, not a target). |
| O12 | **Manual pass on devices.** iOS Safari specifics (input zoom, `dvh`, swipe on the sheet, safe-area padding, `position: sticky` with the collapsing header), Android Chrome long-press behaviour, and screen-reader announcements for the sheet, the menu and the inline answer. |
| O13 | **Worldwide aerial imagery.** SWISSIMAGE ends at the Swiss border; the embassies and consulates abroad have no aerial view. A worldwide provider (licence check needed) could be layered under SWISSIMAGE in the same style. Applies to both prototypes. |

## 5. Verification

Both runs use the same harness and metrics; the "before" run was made against the original files checked out from
git, the "after" run against the final state including the MapLibre migration (§3.1). 90 screens each, zero page
errors in both.

**Before → after, interactive elements below 44 × 44 px on screen** (audit metric; inputs inside 44 px containers,
inline links and map attribution included):

| Viewport | Map | Map + selection | Filter | Search | List | Gallery | Detail | Detail table | Detail + filter | Basemap |
|---|---|---|---|---|---|---|---|---|---|---|
| phone-se 375 × 667 | 13 → 7 | 17 → 7 | 33 → 14 | 13 → 7 | 13 → 5 | 7 → 4 | 22 → 11 | 21 → 10 | 35 → 12 | 13 → 7 |
| phone-14 390 × 844 | 13 → 7 | 17 → 7 | 39 → 17 | 13 → 7 | 13 → 5 | 7 → 4 | 23 → 11 | 23 → 13 | 46 → 15 | 13 → 7 |
| phone-land 844 × 390 | 14 → 7 | 17 → 7 | 14 → 10 | 14 → 8 | 12 → 6 | 6 → 4 | 10 → 7 | 15 → 8 | 15 → 8 | 14 → 7 |
| tablet 768 × 1024 | 13 → 8 | 17 → 8 | 13 → 22 ¹ | 14 → 8 | 11 → 7 | 5 → 5 | 16 → 12 | 20 → 16 | 16 → 24 ¹ | 13 → 8 |
| tablet-land 1024 × 768 | 15 → 9 | 19 → 9 | 41 → 19 | 16 → 10 | 13 → 8 | 7 → 6 | 18 → 13 | 22 → 15 | 37 → 21 | 15 → 9 |
| laptop 1366 × 768 (mouse) | 15 → 15 | 19 → 19 | 40 → 38 | 16 → 16 | 13 → 14 | 7 → 8 | 18 → 19 | 23 → 24 | 39 → 38 | 15 → 15 |

¹ On the portrait iPad the filter drawer could not be opened at all before the change (L2: the button was off-screen),
so the "before" number is the map screen; the "after" number counts the 20 px checkboxes inside their 44 px rows.

The remaining counts are the search input (40 px inside its 44 px container), the view-toggle buttons (42 px inside
the 44 px bordered group), 20 px checkboxes inside 44 px rows, breadcrumb links, carousel dots (34 px pseudo-element
hit area), the answer chips, and the map attribution and footer links (O11). The laptop row is unchanged by design:
the touch rules apply to coarse pointers only (29 px map controls, 40 px header buttons, 28 px panel buttons with a mouse).

**Content wider than the screen — clipped by `overflow: hidden`, i.e. unreachable — before → after** (widest element's
right edge):

| Viewport | Map | Map + selection | Filter | Search | List | Gallery | Detail | Detail table | Detail + filter | Basemap |
|---|---|---|---|---|---|---|---|---|---|---|
| phone-se 375 × 667 | ok → ok | ok → ok | ok → ok | ok → ok | ok → ok | ok → ok | 455 px → ok | 1066 px → ok | 803 px → ok | ok → ok |
| phone-14 390 × 844 | ok → ok | ok → ok | ok → ok | ok → ok | ok → ok | ok → ok | 455 px → ok | 1066 px → ok | 803 px → ok | ok → ok |
| phone-land 844 × 390 | ok → ok | ok → ok | ok → ok | ok → ok | ok → ok | ok → ok | ok → ok | 1082 px → ok | 1265 px → ok | ok → ok |
| tablet 768 × 1024 | ok → ok | ok → ok | ok → ok | ok → ok | ok → ok | ok → ok | ok → ok | 1082 px → ok | ok → ok | ok → ok |
| tablet-land 1024 × 768 | ok → ok | ok → ok | ok → ok | ok → ok | ok → ok | ok → ok | ok → ok | 1082 px → ok | 1265 px → ok | ok → ok |
| laptop 1366 × 768 (mouse) | ok → ok | ok → ok | ok → ok | ok → ok | ok → ok | ok → ok | ok → ok | ok → ok | 1383 px → ok | ok → ok |

(The tablet header overflow of L2 is not in this table: the harness measured it as the off-screen Filter button — right
edge 999 px on a 768 px screen — before the change; 696 px after.)

**Chrome and map height (px), before → after:**

| Viewport | Banner | Header (map view) | Header (detail view) | Map height | Footer |
|---|---|---|---|---|---|
| phone-se 375 × 667 | 41 → 25 | 121 → 113 | 248 → 261 ² | 470 → 530 | 35 → 0 |
| phone-14 390 × 844 | 41 → 25 | 121 → 113 | 248 → 261 ² | 647 → 707 | 35 → 0 |
| phone-land 844 × 390 | 35 → 25 | 70 → 53 | 186 → 171 | 258 → 313 | 27 → 0 |
| tablet 768 × 1024 | 35 → 35 | 70 → 70 | 186 → 196 | 892 → 892 | 27 → 27 |
| tablet-land 1024 × 768 | 35 → 35 | 70 → 70 | 186 → 196 | 636 → 636 | 27 → 27 |
| laptop 1366 × 768 (mouse) | 35 → 35 | 90 → 90 | 214 → 214 | 616 → 616 | 27 → 27 |

² The detail header on phones grew by 13 px because Back/Bearbeiten and the tabs are now 44 px; in return it collapses to
the 48 px tab strip as soon as the page scrolls (M5), so the effective chrome while reading is 48 px instead of 289 px.

**Text fields below 16 px on phones (all screens): 55 → 0.**

**Functional checks (from the harness metrics):** phone — two-row header with 44 px controls, hamburger menu 300 px
from the right with backdrop, menu lists a Swisstopo layer added from the search, info sheet 323 px (50 dvh) with handle
and "Details anzeigen" on screen, selected building above the sheet after fly-to, filter sheet with footer, KI question
row with inline answer, basemap panel within the map; landscape — 53 px header, menu from the right, info panel docked
right at full height (360 × 313 px), map 313 px; tablet — header fits (Filter button at x = 652), panel collapsed with
"Menü öffnen", 44 px map controls, info panel clear of the controls, entity-table toolbar wraps, data grid one column
next to the open drawer; desktop regression — 90 px header, panel open, 29 px controls, resize handle 6 px, fly-to
centred with no offset, search scope select and KI answer, layers present after a basemap switch to SWISSIMAGE.

**Not verified here (needs real devices):** iOS Safari specifics (input zoom, `dvh`, swipe gesture on the sheet,
safe-area padding, sticky header), Android Chrome long-press behaviour, and screen-reader announcements for the sheet,
the menu and the inline answer. A manual pass on an iPhone and an iPad is recommended before publishing.

## 6. Files changed

| File | Change |
|---|---|
| `css/main.css` | Responsive section rewritten: tablet block (compact header, collapsed panel), `(pointer: coarse)` block (44 px targets, 20 px checkboxes), mobile block (two-row header, hamburger menu, full-screen filter sheet with footer, info bottom sheet, sticky detail header, tab strip, table/pagination/toolbar wrapping, compact basemap switcher), landscape-phone block, small-phone block; base additions (`min-width: 0` fixes, container query for the address table, sheet handle, dot hit areas, hover guards, reduced motion); search dropdown and scope select styles; drawer header without tabs; header button active state; filter option counts; dead AI-panel CSS removed; tokens (`--grey-400`, `--primary` fixes). |
| `index.html` | Short banner text, short logo title, header button label span, hamburger button, menu header and backdrop, sheet handle, filter footer, drawer title instead of tabs (AI iframe removed), search scope select, `data-label`s on the address table, `role="tab"` on the detail tabs, `aria-label`s. |
| `js/app.js` | `isMobileLayout()` / `isLandscapePhone()` / `isCompactLayout()`; menu state (collapsed by default on compact layouts, hamburger/backdrop/Escape/focus on phones, no inline `top` on phones); `getInfoPanelOffset()`, `revealSelectionOnMobile()`, `initSheetGesture()`; drawer footer count and focus management; pointer-event resize; sticky header offset; tab strip fade, scroll-into-view, keyboard; carousel swipe; cooperative gestures on the mini map; short placeholder; `resetFilters` selector (B3); toast call (B4); search rewritten (scope, parcels, sections, highlighting, `suggestAiQuestion()`, inline answer, Enter); drawer tab code removed; filter option counts. |
| `docs/DESIGNGUIDE.md` | v1.1: breakpoint table, header/hamburger/bottom-sheet/filter-footer/touch-target/sticky-tab/container-query patterns, search suggestions pattern. |
| `README.md` | Focus bullets (KI in the search box, mobile), tech table (MapLibre), docs tree, link to this review. |
| `vendor/maplibre-gl/` | MapLibre GL JS 5.19 + CSS + licence, copied from `prototype-main`. |
| `assets/basemaps/` | Four basemap thumbnails rendered from the styles. |
