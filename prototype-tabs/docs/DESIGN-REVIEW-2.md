# Design Review 2 — Consistency and Polish

**Date:** 2026-09-15 · **Scope:** `prototype-simple` and `prototype-tabs` · **Reviewer:** senior design / UX
**Mode:** refactor only — no feature added or removed; both apps stay independent (every shared file is a
byte-identical copy, checked by `test/check-alignment.js`).

The first review (`DESIGN-REVIEW.md`) made the two prototypes share one design system: one token file,
one component stylesheet, one guide. This second pass looks at the pixels: components, buttons, icons,
shadows, line thickness, contrast, state styles and typography — and at what was still written by hand
instead of taken from a token, and at similar styles that could become one reusable component.

## 1. Method

- Inventory scripts over `tokens.css`, `components.css` and both `app.css` files: every hardcoded colour,
  size, border, shadow, transition and z-index; every rule with an identical declaration set; every
  transparent icon-style button; every hover background; every icon size.
- Rule-by-rule reading of the button, panel, table, tree and lightbox components.
- Verification: the jsdom harness (9 scenarios), the alignment check, the dead-CSS scan, the import check
  and the headless-Edge probe that reads computed metrics of the shared components in both apps.

Starting point (both apps together): 14 overlay colours written as `rgba(…)`, one hex colour, 3 ring
shadows, 4 literal transition durations, 60+ literal `1px solid var(--grey-…)` dividers, ~40 literal
control sizes, 12 hand-rolled icon buttons with four different rest colours (grey-400 to grey-600),
three hover greys used without a rule, disabled opacities of 0.4 / 0.5 / 0.6, and four "loading…" rows
with three class names.

## 2. Findings

| # | Area | Finding | Decision |
|---|------|---------|----------|
| P-1 | Colour tokens | White overlays on dark surfaces (lightbox controls, accordion hover, theme switch) used seven alpha values (0.1 … 0.95); veils and scrims used five (white 0.9 / 0.95, black 0.4 / 0.5 / 0.6 / 0.92); the banner was `#b71c1c`, the active row hover `rgba(204,0,0,0.08)`, the tabs category badge `rgba(107,116,124,0.1)`. | Tokens: `--on-dark-rest/-hover/-divider/-muted/-text`, `--veil-light`, `--scrim`, `--scrim-strong`, `--spinner-track`, `--primary-red-tint-hover`; the banner uses `--primary-red-dark`, the category badge `--grey-100`. The `#000` in the tab-strip mask gradients stays: it is an alpha mask, not a colour. |
| P-2 | Line thickness | Dividers were written out 60+ times in three strengths (grey-300 container edges, grey-200 section dividers, grey-100 row dividers) with no name for the intent; two retry buttons used a fourth grey (grey-400). The active tree node used a 3px rule, toasts a 4px one. Legend swatches carried a literal ring. | `--border-strong` / `--border-default` / `--border-subtle` replace every literal divider; `--ring-subtle` names the swatch ring; `--accent-bar: 3px` for the tree node and the toasts; the retry buttons use `--border-strong`. |
| P-3 | Control sizes | Icon buttons were 20, 24, 29, 32, 36, 40 and 48px wide, mostly as literals; `min-height: 32px` appeared four times; spinners, dots and legend swatches had their own numbers. | `--control-2xs` (20), `--control-xs` (24), `--control-sm` (32), `--control-height` (40, existing), `--control-lg` (48), `--map-control-size` (29, MapLibre's), `--dot-size` (10); spinners and swatches use the icon scale. Half-step spacing `--space-0-5` (2px) and `--space-1-5` (6px) replace the remaining 2 / 6px gaps and bars. |
| P-4 | Icon buttons | Twelve icon-only buttons (drawer and tree close, info panel actions, phone-menu close, modal close, measure close, toast close, search-result info, layer info, history remove, toolbar clear, lightbox) each had their own rule set: rest colours grey-400, grey-500 or grey-600, hovers grey-100 / grey-200 / colour-only, sizes 24–48px, and a 12-selector list in the touch block to make them 44px. grey-400 icons on white are 2.5:1 — below the 3:1 for controls. | One primitive `.icon-btn` (32px, grey-600, hover grey-200 + grey-900) with `--xs` (24px, grey-500), `--md` (40px), `--lg` (48px), `--round` and `--on-dark`; the component classes keep only their position or background. The touch rule is one line. Rest contrast is at least 4.5:1 everywhere. |
| P-5 | State styles | Bordered buttons hovered to grey-50 or grey-100, dark buttons to grey-700 or grey-800, the back button changed only its fill; disabled states used three opacities. The Filter pill turned grey-900 when filters were active, which read like the open state of the neighbouring toggle. | Rule: bordered controls hover grey-100 with a grey-500 border; dark controls hover grey-700; rows and menu items hover grey-50; icon buttons hover grey-200; disabled = `--opacity-disabled` (0.5) + `not-allowed`. The active-filter pill keeps its default look and shows the count only (see `DESIGN-REVIEW.md` R-26). |
| P-6 | Buttons in tabs | `.btn-action` (entity toolbars) re-declared the tertiary button, `.share-copy-btn` the secondary one; `.btn-edit` is a dark twin of `.btn-back` (same compact metrics for the view nav). The primitives had `min-height: 44px` on every pointer, which is a touch metric. | `.btn-action` extends `.btn-tertiary`, `.share-copy-btn` extends `.btn-secondary` (markup: both classes); the primitives are `--control-height` (40px) high and 44px on touch screens like every other control. `.btn-edit` stays as the dark bar button next to `.btn-back` (documented). |
| P-7 | Typography | Inputs used `16px` (iOS zoom guard) as a literal seven times; one `line-height: 1.3`; two icons sized with text tokens (`--text-sm`, `--text-lg`); the lightbox arrows were `32px`. | `--text-base`, `--leading-snug`, `--icon-xs` / `--icon-md`, `--icon-2xl`. Type scale, weights and tracking were already token-based everywhere. |
| P-8 | Motion | Four literal durations (0.1s, 0.25s, 0.3s). | `--transition-fast` / `--transition-slow`. |
| P-9 | Loading rows | "Loading…" and error rows existed as `.api-docs-loading`, `.api-docs-error`, `.geokatalog-loading`, `.layer-info-loading` with slightly different padding. | One `.loading-row` (+ `--error`) in markup and scripts of both apps. |
| P-10 | Badges | The gallery tags were a fourth badge implementation (own padding). | `class="badge gallery-tag"`; `.gallery-tag` only sets its colours, like `.kategorie-badge` and `.status-badge`. |
| P-11 | Layers | Tabs' detail view stacked its fixed panels with literal `100` / `101`; a tablet rule for `#login-btn` in tabs duplicated the shared one. | `var(--z-panel)` and `calc(var(--z-panel) + 1)`; the duplicate rule is gone. Small local z-indexes (2, 6, 7, 10, 20) inside components stay: they order children of one stacking context, not app layers. |
| P-12 | Radius | Progress bars used `3px`. | `--radius-sm`. |
| P-13 | Accepted literals | `.sheet-handle` (36 × 4px drag pill), `.tree-row` 36px rows, the 44px table toolbar, the 4px stroke of the loading spinner, the 3px frame of the active basemap thumbnail, MapLibre-driven positions. | Left as they are: single-use metrics without a second consumer; a token would only rename them. |
| P-14 | Shadows | Already tokenised (`--shadow-sm…xl`, `--shadow-sheet`, `--shadow-menu`); the two rings were the only literals (P-2). | — |
| P-15 | Icons | Icon vocabulary is consistent across both apps (`close`, `chevron_right`, `expand_more`, `arrow_back`, `tune`, `account_tree` …); sizes come from the icon scale except the cases in P-7. | — |
| P-17 | Map controls | The home button's icon sat 3px too high and its ring was darker than the zoom buttons': MapLibre's `.maplibregl-ctrl-group button { display: block }` outranks `.map-home-btn { display: flex }`, so the icon rested on the text baseline, and the button drew a second 2px ring on top of the group's. | Rules scoped to the group (`.maplibregl-ctrl-group .map-home-btn`), no own box, ring or hover — the group draws them for every button, as for zoom and compass. |
| P-18 | Page gutter | The view nav padded its bar by 20px around a `--content-max-width` row, while `.api-docs-content` put the same 20px inside its 1500px box and `.detail-content` used 24px: on wide screens the API title started 20px right of the breadcrumb, the detail cards 4px. | One `--page-gutter` token (40px on desktops, 20px on laptops, 16px on tablets, 12px on phones) pads the view nav, the API docs content and the detail content; the content boxes are `--content-max-width` + 2 gutters wide, so content and breadcrumb share the same left edge at every width. |
| P-16 | Cross-app | `app.css` of the two apps share no identical rule (nothing left to move into `components.css`); the tabs entity tables re-declare the list-table metrics on purpose (`.detail-table`: no `nowrap`, fixed id columns) — kept, documented. | — |

## 3. Result

- `tokens.css`: +23 tokens (overlays, lines, control sizes, half-step spacing, disabled opacity) and the
  `.icon-btn` primitive; the button primitives are 40px high (44px on touch screens).
- `components.css`: 5,278 → 5,015 lines; 0 literal colours, 0 literal dividers, 0 literal durations;
  the touch block lists `.icon-btn` once instead of twelve selectors.
- Both `app.css`: dividers, sizes and z-indexes on tokens; `.btn-action` and `.share-copy-btn` extend the
  primitives; the duplicate login rule is gone.
- Markup and scripts of both apps: `icon-btn` on twelve buttons, `badge` on the gallery tags,
  `loading-row` on the four loading rows, `btn-tertiary` / `btn-secondary` on the tabs buttons.
- Guide: version 1.3 — tokens, the Icon Button, the line and state rules (see `DESIGNGUIDE.md`).

## 4. Verification

- jsdom harness: 9 of 9 scenarios pass (simple 146, tabs 147 checks); alignment: every common file identical;
  dead-CSS scan: only the two external Swagger / swisstopo classes; import check clean.
- Headless-Edge probe (`node visual.js probe`, desktop and phone-14): the computed metrics of the shared
  components are equal in both apps except where the content differs by design (table columns, detail page).
- Visible changes are limited to the intent of the findings: icon buttons on white are grey-600 / grey-500
  instead of grey-400 (contrast), dark buttons hover to one grey, the drawer's dropdown and the tabs export
  cards hover to grey-100, the banner is `--primary-red-dark`, gallery tags have the badge's 8px padding,
  the tabs entity toolbar buttons are 40px high.
