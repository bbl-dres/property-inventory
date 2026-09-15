# Responsive & Mobile Design Review — prototype-main

**Date:** 2026-09-14
**Scope:** `index.html`, `css/styles.css`, `css/tokens.css`, the UI modules in `js/` (`ui.js`, `map.js`, `filters.js`, `detail.js`, `utils.js`), `data/i18n.json`
**Focus:** responsive layout, touch ergonomics and mobile-specific behaviour of the map, gallery, detail and filter views
**Reviewer:** Claude (senior design / UX review requested by the maintainer)

Every finding was reproduced in a headless Chromium (Playwright, WebGL via SwiftShader) at six viewport sizes and
verified again after the change. Findings marked **Fixed** were implemented in the same change set as this document.
The screenshot and check harness lives outside the repository (see §5); the numbers below come from its reports.

## Summary

| Area | Findings | Fixed | Open |
|---|---|---|---|
| Breakpoints & layout | 5 | 5 | 0 |
| Touch ergonomics | 4 | 4 | 0 |
| Mobile interaction patterns | 6 | 6 | 0 |
| Bugs found on the way | 2 | 2 | 0 |
| Recommendations (not implemented) | 11 | — | 11 |

**Verdict before the changes.** The desktop layout is solid and the phone layout was clearly designed on purpose
(hamburger menu, horizontal gallery cards, bottom-sheet info panel, full-screen filter). The gaps were in the
*details of touch use*: a phone held sideways got the tablet layout, most map controls and checkboxes were far below
the 44 px target the design guide itself prescribes, the bottom sheet hid the very object the user had just tapped,
and the full-screen filter had no visible way to finish. Tablets inherited desktop defaults (tools panel open, 29 px
controls). No horizontal overflow, no layout breakage and no JavaScript errors were found at any size.

**Verdict after the changes.** Phones in portrait and landscape share one mobile layout; every primary control on
touch devices is at least 44 px; the sheet, filter and menu behave like native patterns (swipe to dismiss, result
count, focus management); tablets start with a clear map. Desktop behaviour is unchanged (verified by regression
checks). What remains open is functional scope on phones (table, print, measure) rather than layout.

## 1. Method

| Viewport | Size | Emulation | Represents |
|---|---|---|---|
| phone-se | 375 × 667 | touch, DPR 2 | iPhone SE / small Android |
| phone-14 | 390 × 844 | touch, DPR 2 | Current iPhone |
| phone-land | 844 × 390 | touch, DPR 2 | Phone in landscape |
| tablet | 768 × 1024 | touch, DPR 2 | iPad portrait |
| tablet-land | 1024 × 768 | touch, DPR 2 | iPad landscape |
| laptop | 1366 × 768 | mouse | Small laptop (desktop regression) |

Twelve scenarios per viewport (map, map with selection, map with table, hamburger menu, filter drawer, search
results, gallery, detail overview, detail measurements, API docs, basemap switcher, tools panel): 72 screenshots and a
metrics pass per screen (document overflow, interactive elements below 44 × 44 px, form fields below 16 px, header and
map heights, page errors). A second script exercises the new behaviours (55 checks, §5).

Reviewed against: the project's own `DESIGNGUIDE.md` (44 px targets, 4.5:1 contrast, breakpoints), WCAG 2.2
(2.5.8 target size, 1.4.10 reflow, 2.5.7 dragging alternatives), and the platform conventions for bottom sheets and
full-screen sheets on iOS and Android.

## 2. Findings

### 2.1 Breakpoints & layout

| ID | Severity | Where | Finding | Status |
|---|---|---|---|---|
| L1 | **High** | `styles.css` (all mobile media queries) | The mobile layout was selected by width only (`max-width: 767px`). A phone in landscape (844 × 390) therefore got the **tablet** layout: 70 px header, 35 px banner, the 300 px tools panel open over a **259 px tall map**, footer, table toggle, and a bottom sheet that would have covered everything. | Fixed: the mobile query is now `(max-width: 767px), (max-height: 500px) and (pointer: coarse)`; `isMobileLayout()` in `utils.js` mirrors it for behaviour. Landscape phones now get the 56 px header, hamburger menu and a 310 px map. |
| L2 | **High** | `styles.css`, `ui.js` | On tablets the tools panel ("Karte drucken / Geokatalog / Dargestellte Karten") opened by default and covered 300 of 768 px, i.e. ~40 % of a portrait iPad map. | Fixed: at `max-width: 1024px` the panel starts collapsed ("Menü öffnen"). Desktop unchanged. |
| L3 | Medium | `.prototype-banner` | The prototype notice wrapped to two lines on phones (41 px) which, with the header, took 13 % of an iPhone SE screen for chrome. | Fixed: phones show a one-line short text (`banner.prototype.short`, all four languages); 25 px. |
| L4 | Medium | `#info-panel` (landscape) | With L1 fixed, a 50 vh bottom sheet on a 390 px tall screen would leave ~120 px of map. | Fixed: on landscape phones the panel docks to the right (`min(360px, 55vw)`, full height) and the map keeps the selection to its left. |
| L5 | Low | `.gallery-grid` (landscape) | Landscape phones rendered one column of 800 px wide horizontal cards. | Fixed: two columns on landscape phones. |

### 2.2 Touch ergonomics

| ID | Severity | Where | Finding | Status |
|---|---|---|---|---|
| T1 | **High** | MapLibre controls, `.map-home-btn`, `.map-3d-btn` | Zoom, compass, home and 3D buttons were **29 × 29 px** on every touch device (the design guide requires 44 px). | Fixed: 44 × 44 px under `(pointer: coarse)`; 29 px with a mouse. |
| T2 | **High** | Filter drawer, tools panel, mobile menu | Checkboxes were 16 px in 37 px rows; drawer header buttons 28 px; layer info buttons 24 px; mobile-menu layer rows only toggled on the box itself. | Fixed: 20 px boxes, 44 px rows where the `<label>` carries the hit area (filter and mobile menu), 44 px header buttons with compact header padding. |
| T3 | Medium | Lightbox, carousel, modal close, info-panel actions, pagination, tabs, language pills, back button, "Details anzeigen" | 32–42 px targets throughout. | Fixed: all ≥ 44 px on coarse pointers; tablet header buttons and table tabs 44 px. |
| T4 | Medium | Every text input (12–14 px) | iOS Safari zooms into the page when a field with a font size below 16 px receives focus; the header search, filter search and table search all triggered it. | Fixed: 16 px on the mobile layout. |

### 2.3 Mobile interaction patterns

| ID | Severity | Where | Finding | Status |
|---|---|---|---|---|
| M1 | **High** | `map.js` selection + `#info-panel` | After tapping a building near the lower half of the map, or after a search/URL fly-to (which centres the object), the bottom sheet covered the selected object. The user saw a sheet about something they could no longer see. | Fixed: `smartFlyTo()` passes an `offset` that centres the target in the uncovered part of the map; a tap selection calls `revealSelectionOnMobile()`, which pans only if the object is under the sheet. Works for the bottom sheet and the landscape side panel. Desktop: no offset (verified). |
| M2 | **High** | `#filter-panel` (full-screen on phones) | Twelve filter sections, seven open by default, and the only way out was the small **X at the very top**. There was no feedback on how many objects the filters leave. | Fixed: sticky footer with **"N Objekte anzeigen"** (closes the sheet; count updates live, all languages) and **"Zurücksetzen"**. Hidden on desktop. |
| M3 | Medium | `#info-panel` bottom sheet | No grab handle, no swipe-to-dismiss, no safe-area padding above the home indicator, `50vh` (includes the browser chrome on iOS). | Fixed: handle, swipe down on the header/handle closes the sheet (`initSheetGestures()`), `env(safe-area-inset-bottom)`, `50dvh`. |
| M4 | Medium | Detail page mini map | The MapLibre mini map captured every gesture: a one-finger drag over it panned the map instead of scrolling the page, and on desktop the scroll wheel zoomed the map and trapped page scrolling. | Fixed: `cooperativeGestures: true` with localized hints (two fingers / Ctrl+wheel / ⌘+wheel). |
| M5 | Medium | Map context menu | Share, measure and print live in a right-click menu that touch screens cannot open. | Partially fixed: **Share** is now in the mobile menu (Web Share API, clipboard fallback). Measure and print remain desktop-only, see O2/O3. |
| M6 | Low | Hamburger menu, detail header | No app title on phones (the logo is hidden), focus stayed on the hidden hamburger button while the menu was open, Back button 34 px below a wrapping breadcrumb, drawer resize handle mouse-only. | Fixed: title in the menu header, focus moves to the close button and returns on dismiss, Back button first and 44 px, resize handle uses pointer events (12 px on touch). |

### 2.4 Bugs found on the way

| ID | Severity | Where | Finding | Status |
|---|---|---|---|---|
| B1 | Medium | `filters.js` | Three selectors targeted `#filter-pane`, an element that does not exist (the drawer is `#filter-panel`). **Reset did not uncheck the boxes** and the URL → checkbox sync did not run. Found while wiring the mobile reset button; affected desktop too. | Fixed. |
| B2 | Low | `ui.js` | After a language change the tools-panel toggle always read "Menü schliessen", even while collapsed (the `data-i18n` key was static). Became visible with L2. | Fixed: the key follows the state. |

### 2.5 Verified without change

- No horizontal overflow at any viewport in any scenario (before and after).
- Phones: horizontal gallery cards with 120 px image, stacked label/value rows in the detail page, table panel and footer hidden, 60 vh search dropdown, full-width toasts — all appropriate.
- `body { height: 100dvh }`, `prefers-reduced-motion`, hover lifts guarded by `(hover: hover)`, dropdown widths capped below 480 px, lightbox and layer-info modal fit the viewport.
- Contrast and type scale follow the design guide; the smallest running text is 12 px.

## 3. Recommendations (not implemented)

| ID | Recommendation |
|---|---|
| O1 | **List view on phones.** The table panel is hidden below 768 px, so sorting, column selection and export are desktop/tablet-only. The gallery covers browsing but not sorting. A sortable card list (one card per row, sort menu, export in the hamburger menu) would close the gap without a table. |
| O2 | **Print and Geokatalog on phones.** Both live in the hidden tools panel. `populateMobileAccordion()` in `ui.js` was meant to expose them in the menu but targets a container that does not exist and is never called: either wire it (Geokatalog as a full-screen sheet) or delete it. Print-to-PDF is arguably a desktop feature and can be documented as such. |
| O3 | **Measure tool on touch.** Needs an entry point (menu item or long-press) and drag handles that work with `pointer` events; the markers already use `::after` hit areas. |
| O4 | **Search on phones.** The dropdown works, but with the keyboard open on a 667 px screen it shows two or three results. A full-screen search sheet (input at top, results below, "Abbrechen") is the platform pattern. |
| O5 | **Basemap thumbnails** (`.style-option img`) come from CARTO's static-map API and render an "API KEY REQUIRED" watermark on every device. Ship four local 128 × 96 px thumbnails instead; this also removes an external request. |
| O6 | **Home-screen use.** If the app is opened as a web app (standalone), add `viewport-fit=cover` and `theme-color`; the `env(safe-area-inset-bottom)` paddings are already in place and are no-ops today. |
| O7 | **Container queries for cards.** The gallery card switches to its horizontal layout by *viewport* width. Its natural trigger is the column width; `@container (max-width: 320px)` would keep it correct inside any future side-by-side layout. |
| O8 | **Mini-map hint language.** MapLibre reads the `locale` strings once at construction; after a language switch the gesture hint keeps the previous language until the mini map is recreated. |
| O9 | **Tablet portrait with the filter drawer open** leaves a 428 px map. Below ~900 px the drawer could overlay the map (as on phones) instead of pushing it. |
| O10 | **Add the harness to the repo.** Like the jsdom harness of the code review (R9), the Playwright screenshot/metrics harness lives outside the repository. `test/responsive/` with `playwright-core` as a dev dependency would make the numbers in §5 reproducible in CI. |
| O11 | **Remaining sub-44 px elements** are secondary or exempt: inline breadcrumb links (18 px, WCAG 2.5.8 inline exception), the MapLibre attribution link, the footer links on tablets (hidden on phones), and checkboxes whose rows carry the hit area. Carousel dots are 10 px but have a 44 px `::after` hit area. |

## 4. Behaviour changes to be aware of

1. Landscape phones now use the mobile layout (hamburger menu, no tools panel, no table). Previously they showed the tablet layout.
2. On tablets the tools panel starts collapsed; the "Menü öffnen" toggle opens it. Desktop unchanged.
3. Filter reset now visually unchecks the boxes (B1). This was a bug, not a design choice.
4. The mini map on the detail page needs two fingers (touch) or Ctrl/⌘ + wheel (desktop) to pan and zoom.
5. On phones, selecting an object may pan the map so the object stays visible beside the sheet.

## 5. Verification

**Before → after, elements below 44 × 44 px on screen (audit metric; inputs inside 44 px containers and inline links included):**

| Viewport | Map | Map + selection | Filter | Menu | Detail | Gallery |
|---|---|---|---|---|---|---|
| phone-se 375 × 667 | 7 → 1 | 7 → 1 | 20 → 10 | 14 → 4 | 12 → 6 | 2 → 1 |
| phone-14 390 × 844 | 7 → 1 | 11 → 1 | 23 → 13 | 14 → 6 | 12 → 6 | 2 → 1 |
| phone-land 844 × 390 | 24 → 1 | 31 → 1 | 29 → 1 | 24 → 1 | 10 → 4 | 7 → 1 |
| tablet 768 × 1024 | 25 → 6 | 33 → 8 | 42 → 17 | 25 → 6 | 14 → 7 | 7 → 5 |
| tablet-land 1024 × 768 | 25 → 6 | 33 → 8 | 38 → 15 | 25 → 6 | 14 → 7 | 7 → 5 |
| laptop 1366 × 768 (mouse) | 25 → 25 | 33 → 33 | 37 → 37 | 25 → 25 | 14 → 14 | 7 → 7 |

The remaining counts are the header search input (40 px inside its 44 px container), 20 px checkboxes inside 44 px
label rows, breadcrumb links, carousel dots (44 px pseudo-element hit area) and, on tablets, the attribution and footer
links (O11). The laptop row is unchanged by design: the touch rules only apply to coarse pointers.

**Other metrics:** phone header 48 → 56 px (44 px controls), banner 41 → 25 px, landscape-phone map 259 → 310 px, no
horizontal overflow, zero page errors in all 72 after-screens.

**Functional checks (55, all passing):** phone — header/banner/16 px inputs/44 px controls, sheet shown with
handle, selected building above the sheet after fly-to (y = 171 of 342 visible px) and after a simulated tap near the
bottom edge, swipe-down closes the sheet, menu title/share/focus, label toggles layer box, filter footer count
11 → 10 → 11 with check/reset, apply closes the sheet, Back button 44 px above the breadcrumb, mini map cooperative
gestures; landscape — mobile header, tools panel hidden, side panel docked right at full height, building left of it,
two gallery columns; tablet — panel collapsed with correct label before and after a language change, 44 px controls,
20 px checkboxes, long banner text, footer hidden; desktop regression — 90 px header, panel open, 29 px controls,
handle hidden, panel floating top-right, fly-to centred with no offset, reset unchecks boxes, drawer resize works
with pointer events.

**Not verified here (needs real devices):** iOS Safari specifics (input zoom, `dvh`, swipe gesture on the sheet,
safe-area padding), Android Chrome long-press behaviour, and screen-reader announcements for the sheet and menu.
A manual pass on an iPhone and an iPad is recommended before publishing.

## 6. Files changed

| File | Change |
|---|---|
| `css/styles.css` | Mobile media query extended to landscape phones (6 places); new section "Mobile & touch refinements" at the end: touch targets, 56 px phone header, 16 px inputs, short banner, bottom-sheet handle/safe area/`dvh`, filter footer, landscape side panel, compact basemap switcher. |
| `index.html` | Short banner text, sheet handle, filter footer, mobile-menu title and Share entry, translatable hamburger label. |
| `data/i18n.json` | `banner.prototype.short`, `filter.apply`, `minimap.gesture.*` (de/fr/it/en). |
| `js/utils.js` | `isMobileLayout()` (same media query as the stylesheet). |
| `js/ui.js` | Tools panel collapsed on tablets, toggle label i18n fix, menu focus management and Share, `shareCurrentView()` shared with the info panel, `initSheetGestures()`, `<label>` rows in the mobile menu. |
| `js/map.js` | `getInfoPanelOffset()`, `revealSelectionOnMobile()`, fly-to `offset`. |
| `js/filters.js` | Mobile footer wiring and count, `#filter-pane` → `#filter-panel` (B1), pointer-event resize, focus into the sheet on phones. |
| `js/detail.js` | Cooperative gestures on the mini map. |
| `docs/DESIGNGUIDE.md` | Breakpoint table, bottom-sheet and touch-target patterns updated to match the implementation (v1.1). |
| `README.md` | Mobile feature bullet and link to this review. |
