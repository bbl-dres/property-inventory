# Design Guide

**BBL GIS Immobilienportfolio**
Version 1.3 | Last Updated: September 2026

One design system for both prototypes (`prototype-simple`, `prototype-tabs`). This guide is identical in both `docs/` folders; see `DESIGN-REVIEW.md` for the review that aligned them.

---

## Design Philosophy

### Vision

Create a **professional, efficient, and accessible** geographic information system that empowers users to manage Switzerland's federal real estate portfolio with clarity and confidence.

### Core Values

| Value | Description |
|-------|-------------|
| **Clarity** | Information hierarchy guides users to what matters most |
| **Efficiency** | Minimize clicks and cognitive load for common tasks |
| **Reliability** | Consistent patterns build user trust and muscle memory |
| **Accessibility** | Every user can access and use the system effectively |
| **Swiss Quality** | Precision, neutrality, and professional excellence |

### Design Language

Our design language is **functional Swiss modernism**—clean lines, purposeful spacing, and restrained color usage that lets content speak for itself. We avoid decorative elements in favor of meaningful visual communication.

---

## Design Principles

### 1. Content First
The map and property data are the heroes. UI elements should support, not compete with, content visibility.

```
DO: Use subtle borders and backgrounds
DON'T: Add heavy shadows or bright colors to UI chrome
```

### 2. Progressive Disclosure
Show essential information immediately; reveal details on demand.

```
DO: Use accordions, tabs, and expandable sections
DON'T: Overwhelm users with all data at once
```

### 3. Spatial Consistency
Maintain predictable spacing relationships throughout the interface.

```
DO: Use the 4px spacing scale consistently
DON'T: Use arbitrary pixel values (13px, 17px, 23px)
```

### 4. Meaningful Color
Reserve color for status, interaction, and emphasis—never decoration.

```
DO: Use status colors to convey building states
DON'T: Add color gradients for visual interest
```

### 5. Accessible by Default
Accessibility is not an afterthought; it's built into every decision.

```
DO: Ensure 4.5:1 contrast ratios, 44px touch targets
DON'T: Rely solely on color to convey information
```

---

## Design Tokens

Design tokens are the foundation of our visual language. All values are defined as CSS custom properties in `:root` for consistency and maintainability.

### Stylesheets

| File | Content | Shared |
|------|---------|--------|
| `css/tokens.css` | Tokens, reset, base typography, focus styles, reduced motion, primitives (`.badge`, `.custom-select`, `.btn-*`, `.icon-btn`, `.panel-header`, empty and loading states) | Byte-identical in both prototypes |
| `css/components.css` | Every component both prototypes use: header, search, view toggle, map controls, basemap switcher, tools panel and phone menu, location tree, info panel, filter drawer, toolbars, tables, table panel, pagination, gallery, view nav, detail page frame, API documentation, carousel, lightbox, mini map, address table, toasts, modals, banner, footer, plus all responsive rules for them | Byte-identical in both prototypes |
| `css/app.css` | What only one prototype has (simple: filter search, single-column detail cards; tabs: header tab strip and drawer offsets, two-column sections, entity tables, share/export panels, KI answers) | Per prototype |

The prototypes stay independent: nothing is loaded across folders. `test/check-alignment.js` reports when
the two copies of `tokens.css` or `components.css` drift apart. A component that both prototypes use is
styled once, in `components.css`; `app.css` may only add composition rules (where a component sits, how
wide its container is), never restyle a shared component.

### Token Categories

| Category | Purpose | Example |
|----------|---------|---------|
| Color | Brand, semantic, and UI colors | `--primary-red`, `--grey-600` |
| Typography | Font sizes, weights, line heights | `--text-base`, `--font-medium` |
| Spacing | Margins, padding, gaps | `--space-4`, `--space-8` |
| Radius | Border corner rounding | `--radius-md`, `--radius-lg` |
| Shadow | Elevation and depth | `--shadow-md`, `--shadow-lg` |
| Motion | Transition timing | `--transition-fast` |
| Layers | Stacking order | `--z-panel`, `--z-modal` |
| Layout | Panel and content widths, page gutter, control sizes | `--drawer-width`, `--page-gutter`, `--control-height`, `--control-sm` |
| Lines | Dividers in three strengths, rings, accent bars | `--border-strong`, `--border-subtle`, `--ring-subtle`, `--accent-bar` |
| Overlays | Controls and text on dark surfaces, veils, scrims | `--on-dark-rest`, `--on-dark-text`, `--veil-light`, `--scrim` |

### Usage Rules

1. **Always use tokens** — Never hardcode values
2. **Semantic naming** — Use purpose-based names when available
3. **Fallback values** — Provide fallbacks for older browsers

```css
/* Correct */
color: var(--grey-900);
padding: var(--space-4);

/* Incorrect */
color: #2D3236;
padding: 16px;
```

---

## Typography

### Font Stack

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

We use system fonts for:
- **Performance** — No font loading delay
- **Native feel** — Matches platform conventions
- **Legibility** — Optimized for screens

The stack is the token `--font-sans` (`--font-mono` for coordinates). `tokens.css` makes buttons, inputs and
selects inherit it (`button, input, select, textarea { font: inherit; color: inherit }`) — without that
reset, controls render in the browser's default Arial 13.33px. Floating map widgets (basemap switcher,
measure display, context menu) set the stack explicitly because the MapLibre container uses Helvetica.

### Type Scale

Based on a **1.25 ratio (Major Third)** for harmonious progression.

| Token | Size | Use Case |
|-------|------|----------|
| `--text-xs` | 12px | Minimum size, captions, badges |
| `--text-sm` | 14px | Body text, table content, UI labels |
| `--text-base` | 16px | Primary body text |
| `--text-lg` | 18px | Section headers, emphasis |
| `--text-xl` | 20px | Page section titles |
| `--text-2xl` | 24px | Primary headings |

### Font Weights

| Token | Weight | Use Case |
|-------|--------|----------|
| `--font-normal` | 400 | Body text |
| `--font-medium` | 500 | Labels, badges |
| `--font-semibold` | 600 | Subheadings, emphasis |
| `--font-bold` | 700 | Primary headings |

### Line Heights

| Token | Value | Use Case |
|-------|-------|----------|
| `--leading-tight` | 1.25 | Headings |
| `--leading-snug` | 1.375 | Subheadings |
| `--leading-normal` | 1.5 | Body text |
| `--leading-relaxed` | 1.625 | Long-form content |

### Heading Hierarchy

```css
h1 { font-size: var(--text-2xl); font-weight: var(--font-bold); line-height: var(--leading-tight); }
h2 { font-size: var(--text-xl); font-weight: var(--font-semibold); line-height: var(--leading-snug); }
h3 { font-size: var(--text-lg); font-weight: var(--font-semibold); line-height: var(--leading-snug); }
h4 { font-size: var(--text-base); font-weight: var(--font-semibold); line-height: var(--leading-normal); }
```

---

## Color System

### Color Philosophy

Our color palette is intentionally restrained:
- **Neutral greys** for UI structure
- **Brand red** for primary actions
- **Status colors** for semantic meaning
- **Interactive blue** for links and focus

### Grey Scale

A cool blue-grey palette that feels professional and Swiss.

| Token | Hex | Use Case |
|-------|-----|----------|
| `--grey-900` | #2D3236 | Primary text, headings |
| `--grey-800` | #3D4347 | Dark backgrounds |
| `--grey-700` | #4E555A | Secondary text |
| `--grey-600` | #5E666B | Muted text, icons |
| `--grey-500` | #6C757D | Panel headers, accents |
| `--grey-300` | #C5CCD1 | Borders, dividers |
| `--grey-200` | #DDE2E6 | Light borders |
| `--grey-100` | #F3F5F7 | Light backgrounds |
| `--grey-50` | #F9FAFB | Subtle backgrounds |
| `--white` | #FFFFFF | Base background |

### Brand Colors

| Token | Hex | Use Case |
|-------|-----|----------|
| `--primary-red` | #CC0000 | Primary actions, brand accent |
| `--primary-red-dark` | #AA0000 | Hover state |
| `--accent-panel` | #6C757D | Panel headers |

### Status Colors

Status colors communicate building lifecycle states at a glance.

| Status | Token | Background | Text | Icon |
|--------|-------|------------|------|------|
| In Betrieb | `--status-active` | #E8F5E9 | #1B5E20 | check_circle |
| In Renovation | `--status-renovation` | #FFF3E0 | #E65100 | build |
| In Planung | `--status-planning` | #E3F2FD | #0D47A1 | schedule |
| Ausser Betrieb | `--status-inactive` | #F3F5F7 | #5E666B | close |

### Interactive Colors

| Token | Hex | Use Case |
|-------|-----|----------|
| `--interactive-blue` | #005EA8 | Links, focus rings |
| `--focus-ring` | #005EA8 | Keyboard focus indicator |

### Color Accessibility

All color combinations must meet WCAG AA standards (4.5:1 for normal text).

| Combination | Contrast | Rating |
|-------------|----------|--------|
| Grey-900 on white | 13.6:1 | AAA |
| Grey-600 on white | 5.6:1 | AA |
| Interactive blue on white | 7.8:1 | AAA |
| Status text on status bg | 4.5:1+ | AA |

---

## Spacing & Layout

### Spacing Scale

Based on a **4px base unit** for consistent rhythm.

| Token | Value | Use Case |
|-------|-------|----------|
| `--space-0` | 0 | No spacing |
| `--space-1` | 4px | Minimal gaps |
| `--space-2` | 8px | Tight spacing |
| `--space-3` | 12px | Compact padding |
| `--space-4` | 16px | Standard padding |
| `--space-5` | 20px | Comfortable padding |
| `--space-6` | 24px | Section spacing |
| `--space-8` | 32px | Major sections |
| `--space-10` | 40px | Large gaps |
| `--space-12` | 48px | Page sections |
| `--space-16` | 64px | Major divisions |

### Lines & Dividers

Three divider strengths, always 1px, named by intent — never write `1px solid var(--grey-…)` by hand:

| Token | Colour | Use |
|-------|--------|-----|
| `--border-strong` | grey-300 | Container edges: panels, inputs, cards, table heads, the header and footer |
| `--border-default` | grey-200 | Section dividers inside a container: menu items, filter sections, panel headers |
| `--border-subtle` | grey-100 | Row dividers: table rows, search results, list rows |

Selection and emphasis use 2px (`.style-option`, tab indicators) and the 3px `--accent-bar` (left rule of the
active tree node and of toasts). Floating elements over the map carry a ring instead of a border: the MapLibre
control groups draw their own 2px ring around zoom, compass, home and 3D (the buttons draw nothing of their
own), legend swatches use `--ring-subtle`.

### Control Sizes

| Token | Size | Use |
|-------|------|-----|
| `--control-2xs` | 20px | Count badges, tiny round remove buttons |
| `--control-xs` | 24px | Inline icon buttons in rows (`.icon-btn--xs`), the tree chevron |
| `--control-sm` | 32px | Toolbar controls, panel-header icon buttons, dropdown and pagination buttons |
| `--control-height` | 40px | Header controls, primary / secondary / tertiary buttons, carousel buttons |
| `--control-lg` | 48px | Lightbox navigation, loading spinner |
| `--touch-target-min` | 44px | Every control on touch screens (`pointer: coarse`) |
| `--map-control-size` | 29px | MapLibre's control buttons (external metric) |

Half-step spacing exists for hairlines: `--space-0-5` (2px) and `--space-1-5` (6px, progress bars, the
table resize handle).

### Border Radius

| Token | Value | Use Case |
|-------|-------|----------|
| `--radius-sm` | 4px | Buttons, inputs |
| `--radius-md` | 8px | Cards, panels |
| `--radius-lg` | 12px | Large containers |
| `--radius-full` | 9999px | Pills, badges |

### Shadow System

| Token | Value | Use Case |
|-------|-------|----------|
| `--shadow-sm` | 0 1px 3px rgba(0,0,0,0.1) | Subtle depth |
| `--shadow-md` | 0 2px 8px rgba(0,0,0,0.15) | Cards, dropdowns |
| `--shadow-lg` | 0 4px 12px rgba(0,0,0,0.15) | Floating elements |
| `--shadow-xl` | 0 4px 16px rgba(0,0,0,0.2) | Modals, panels |

### Z-Index Scale

Every stacked element uses one of these tokens; no other z-index values are allowed in shared components.

| Token | Value | Use Case |
|-------|-------|----------|
| `--z-map-overlay` | 400 | Print crop preview over the map |
| `--z-panel` | 500 | Tools panel, info panel, basemap switcher |
| `--z-sheet` | 650 | Info panel as a bottom sheet (phones) |
| `--z-header` | 1000 | Header, measure display |
| `--z-popover` | 1001 | Context menu, dropdown menus, prototype banner |
| `--z-drawer` | 2000 | Filter drawer (phones), search results |
| `--z-menu` | 2100 | Slide-in phone menu (its backdrop is 2099) |
| `--z-overlay` | 9999 | Loading overlay, lightbox |
| `--z-toast` | 10000 | Toasts |
| `--z-modal` | 10001 | Layer info and topic modals |

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│ Header (90px, 70px on tablets, two 44px rows on phones)
├─────────────────────────────────────────────────────┤
│ ┌ Tools panel (300px) ┐                             │
│ │ Karte drucken … │   Map / List / Gallery / Detail │  Filter drawer
│ └ Menü schliessen ┘                                 │  (450px, resizable
│                                    Info panel (320px)│   300–800px; 340px
│                                                     │   on tablets)
├─────────────────────────────────────────────────────┤
│ Footer (27px, hidden on phones)                     │
└─────────────────────────────────────────────────────┘
```

Layout tokens: `--header-main-height`, `--footer-height`, `--drawer-width` (+ min/max), `--tools-panel-width`,
`--content-max-width` (1500px for lists, galleries and the detail grid), `--control-height` (40px header
controls, 44px on touch screens).

### Grid Systems

**Gallery Grid:**
```css
display: grid;
grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
gap: var(--space-6);
```

**Detail Grid (tabs prototype):**
```css
display: grid;
grid-template-columns: 1fr 1fr;
gap: var(--space-6);
```

**Data Grid (tabs prototype):**
```css
display: grid;
grid-template-columns: 1fr 1fr;
gap: var(--space-8);
```

**Detail Column (simple prototype):** one column (`.detail-single-col`, `--content-max-width` like the API docs) of collapsible cards
(`.detail-overline` + `.detail-card` with `.detail-grid-row` label | value | info icon).

---

## Components

### Buttons

#### Primary Button
For main actions—one per view maximum.

```css
.btn-primary {
  background: var(--grey-900);
  color: white;
  padding: var(--space-2) var(--space-5);
  border-radius: var(--radius-sm);
  min-height: 44px; /* Touch target */
}
```

**States:**
- Hover: `background: var(--grey-700)`
- Active: `background: var(--grey-900)`
- Disabled: `opacity: 0.5; cursor: not-allowed`

#### Secondary Button
For secondary actions alongside primary.

```css
.btn-secondary {
  background: white;
  color: var(--grey-900);
  border: 1px solid var(--grey-300);
  padding: var(--space-2) var(--space-5);
  border-radius: var(--radius-sm);
  min-height: 44px;
}
```

#### Tertiary Button
Text button with an icon, e.g. "Zurücksetzen" in the filter drawer header (`.filter-panel-reset`, 32px high
there) — a labelled button, not an icon, so the reset is obvious. The tabs entity toolbars use it as
`btn-tertiary btn-action`. All three button primitives are `--control-height` (40px) high, 44px on touch screens.
For low-emphasis actions.

```css
.btn-tertiary {
  background: transparent;
  color: var(--grey-700);
  border: none;
  padding: var(--space-2) var(--space-3);
}
```

#### Icon Button

Icon-only button without border: `.icon-btn` (32px, grey-600 icon, hover grey-200 fill and grey-900 icon;
the `title` and `aria-label` carry the name). Modifiers: `--xs` (24px, grey-500, inline in rows), `--md`
(40px), `--lg` (48px), `--round`, `--on-dark` (translucent white on dark surfaces: lightbox). 44px on touch
screens. Used by the panel and drawer close buttons, the info panel actions, the phone-menu and modal close,
the toast close, the search-result and layer info buttons and the search clear buttons — the component class
next to it (`filter-panel-btn`, `toast-close` …) only positions the button.

```html
<button class="icon-btn" id="drawer-close-btn" title="Schliessen" aria-label="Schliessen">
  <span class="material-symbols-outlined" aria-hidden="true">close</span>
</button>
<button class="icon-btn icon-btn--xs search-item-info" title="Info">…</button>
```

#### Header Button (pill)
Standorte, Filter, language and menu buttons in the header. 40px pills with icon and label on wide screens;
below 1200px the labels collapse and the buttons are 40px circles (the `title` and `aria-label` carry the
name), from the tablet breakpoint down 44px circles and the language code is hidden too.

```css
.header-btn {
  background: white;
  border: 1px solid var(--grey-300);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-full);
  height: var(--control-height);       /* 40px, 44px on touch screens */
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
```

The header is three flex columns — logo, search with the view toggle, actions — with a 16px gap between them.
The centre column is 760px wide (the 550px search box and the view toggle); the two side columns share the
rest equally, so the search is centred. Each side is never narrower than its content and the centre column
shrinks first, so the buttons never collide. The actions sit in `#header-right`
with a 12px gap (`--space-3`) at every width: Filter, language (`#lang-selector`,
a dropdown with DE/FR/IT/EN; on phones the pills in the menu), login and, on phones, the menu button. The tabs
prototype shows the same selector but has no translations yet — a choice only warns.

**States:** `.panel-open` (drawer open) — panel-grey fill, white text; `.has-active-filters` — the default
pill with the red `.filter-count` badge on the corner of the icon-only button (Standorte and Filter are icon-only at every width); no
dark fill, which would clash with the open state of the neighbouring toggles.

#### Panel Button
Full-width action at the bottom of a tools-panel form (PDF erstellen, Distanz messen, Exportieren).
Same colours as the primary button, 40px high.

```css
.panel-btn {
  width: 100%;
  min-height: var(--control-height);
  background: var(--grey-900);
  color: white;
  border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center; gap: var(--space-2);
}
```

Red is reserved for selected and active states (tabs, table headers on hover, the active basemap,
the active topic card) and for the brand; buttons are grey-900 or white.

### State Styles

One vocabulary for every control, so a hover never has to be designed twice:

| State | Bordered controls (secondary, back, dropdown, pagination) | Dark controls (primary, panel button, table toggle) | Rows and menu items | Icon buttons |
|-------|------|------|------|------|
| Rest | white, `--border-strong` | grey-900 | — | transparent, grey-600 |
| Hover | grey-100 fill, grey-500 border | grey-700 | grey-50 | grey-200 fill, grey-900 icon |
| Active / pressed | — | grey-900 | red tint (`--primary-red-tint`, hover `-hover`) | — |
| Selected | red border (thumbnails), red 2px indicator (tabs) | — | `.row-active` red tint, tree node grey-100 + 3px rule | — |
| Disabled | `--opacity-disabled` (0.5), `cursor: not-allowed` | same | — | same |
| Focus | 2px `--focus-ring` outline, 2px offset (global `:focus-visible`) | same | same | same |

### Status Badges

`.badge` (tokens.css) is the inline label primitive; `.status-badge` adds the colour variants. Always use
both classes: `class="badge status-badge status-active"`.

```css
.badge {
  display: inline-block;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  line-height: 1;
  white-space: nowrap;
}

.status-badge.status-active {
  background: var(--status-active-bg);
  color: var(--status-active-text);
}
```

Variants: `status-active`, `status-renovation`, `status-planning`, `status-inactive` / `status-expired`,
`status-terminated` (warning colours). `getStatusClassName()` in `js/config.js` maps data values to them.

### Cards

#### Gallery Card
For grid view property display.

```css
.gallery-card {
  background: white;
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s, transform 0.2s;
}

.gallery-card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

#### Detail Section (tabs prototype)
For grouped information display.

```css
.detail-section {
  background: white;
  border: 1px solid var(--grey-300);
  border-radius: var(--radius-sm);
  overflow: hidden;
  container-type: inline-size;         /* its content adapts to the column, not the viewport */
}

.detail-section-title {
  background: var(--grey-100);
  padding: var(--space-3) var(--space-4);
  font-weight: var(--font-semibold);
  border-bottom: 1px solid var(--grey-300);
}
```

#### Detail Card (simple prototype)
Collapsible card with an overline title; rows are label | value | info icon.

```css
.detail-overline { font-size: var(--text-xs); font-weight: var(--font-semibold); text-transform: uppercase;
                   letter-spacing: var(--tracking-wide); color: var(--grey-500); background: var(--grey-50); }
.detail-card     { background: white; border: 1px solid var(--grey-200); border-radius: var(--radius-sm); }
.detail-grid-row { display: grid; grid-template-columns: 1fr 1fr 24px; padding: var(--space-2) var(--space-3); }
```

Overline labels (section titles, layer groups, column groups, dropdown headers) always use
`--text-xs`, semibold, uppercase, `--tracking-wide`, `--grey-500`.

### Tables

One density for every data table (`.list-table` in both prototypes, `.detail-table` of the entity tabs):
compact 37px rows, uppercase-free semibold headers, sticky header row.

```css
.list-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.list-table thead {
  position: sticky;
  top: 0;
  background: var(--grey-100);
}

.list-table th {
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--grey-700);
  border-bottom: 1px solid var(--grey-300);
  text-align: left;
  white-space: nowrap;
}

.list-table th:hover { color: var(--primary-red); }      /* sortable */

.list-table td {
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--grey-100);
  color: var(--grey-800);
}

.list-table tbody tr:hover td { background: var(--grey-50); }
.list-table tbody tr.row-active td { background: var(--primary-red-tint); }
```

The toolbar above a table (`.toolbar`: search box, filter pills, Export and Spalten dropdowns) and the
pagination footer below it use the compact scale too: 32px controls with `--text-xs` labels.

### Tabs

`.detail-tabs > .detail-tabs-inner > button.detail-tab`. The strip sits in the page header (tabs prototype)
or inside the content column (`.detail-tabs--inline`, simple prototype); the tab itself is the same.

```css
.detail-tabs {
  background: white;
  border-bottom: 1px solid var(--grey-300);
  padding: 0 var(--space-6);
}

.detail-tab {
  padding: var(--space-3) var(--space-5);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--grey-500);
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  background: none;
  transition: color 0.2s, border-color 0.2s;
}

.detail-tab:hover { color: var(--grey-900); }

.detail-tab.active {
  color: var(--primary-red);
  border-bottom-color: var(--primary-red);
  font-weight: var(--font-semibold);
}
```

The table tabs of the simple prototype's table panel (`.table-tab`) follow the same rule at `--text-xs`.

### Accordions

Accordion headers are `<button>` elements (keyboard and screen-reader support for free); one item is open
at a time (`js/accordion.js`).

```css
.accordion-header {
  padding: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background 0.2s;
}

.accordion-arrow {
  transition: transform 0.3s;
}

.accordion-header.active .accordion-arrow {
  transform: rotate(90deg);
}

.accordion-content {
  display: none;
  padding: 12px 16px;
}

.accordion-content.show {
  display: block;
}
```

### Form Inputs

Selects use `.custom-select` (tokens.css): 32px minimum height, chevron background, `--text-sm`.
Checkboxes are 16px with the brand-red accent, 20px on touch screens. Text inputs are unstyled inside
their bordered container (search box, toolbar search, filter search); on phones every field is 16px so
iOS Safari does not zoom into the page on focus.

```css
.custom-select {
  appearance: none;
  min-height: 32px;
  padding: var(--space-2) var(--space-8) var(--space-2) var(--space-3);
  border: 1px solid var(--grey-300);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
}

.custom-select:hover { border-color: var(--grey-500); }
.custom-select:focus { border-color: var(--interactive-blue); }

input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--checkbox-accent); }
```

Panel forms (print) are two-column grids: label | control, checkboxes and the panel button spanning both
columns (`.print-form`, `.print-form-row`, `.print-checkbox-label`, `.panel-btn`).

### Dropdowns

```css
.dropdown-btn {                        /* toolbar trigger: 32px, --text-xs */
  display: flex; align-items: center; gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  min-height: 32px;
  border: 1px solid var(--grey-300);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: var(--space-1);
  background: white;
  border: 1px solid var(--grey-200);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  min-width: 200px;
  z-index: var(--z-popover);
}

.dropdown-menu-item,
.context-menu-item {                   /* the map context menu shares the row style */
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-sm);
  transition: background 0.15s;
}

.dropdown-menu-item:hover { background: var(--grey-50); }
```

---

## Patterns

### Map Layers Pattern

Both prototypes draw the same layer stack on the same basemaps (`js/map.js`, ids in `internalLayerIds`):

| Layer | Style |
|-------|-------|
| Basemaps | CARTO Positron (Light, default), Voyager (Standard), Dark Matter (Dark) and "Luftbild": Esri World Imagery worldwide with swisstopo SWISSIMAGE on top inside Switzerland |
| `buildings-clusters` + `buildings-cluster-count` | Clustered up to zoom 14 (radius 50px): blue circles 18/24/32px for <10 / <50 / 50+ objects, white count |
| `buildings-points` | 10px circle in the status colour (`statusColors`), 2px white stroke |
| `buildings-selected` + `buildings-selected-pulse` | 18px red ring (3px) with a pulsing 24px ring around the selected object |
| `buildings-labels` | Object id above the point from zoom 16 (13px bold, white halo) |
| `parcels-fill` / `-outline` / `-highlight` / `-selected` (+ `-outline`) | Blue-grey parcel colour; visible from zoom 12, fading in until 13; hover 35 %, selected 45 % with a 3px outline |
| `landcovers-*` (simple only) | Land-cover polygons from zoom 14 in the land-cover colours |

Clicking a cluster zooms to its expansion zoom; clicking a point selects the object (info panel); clicking
empty map deselects and identifies the external swisstopo layers.

### Home Pattern

The logo (`#logo-area`) is the home button in both prototypes. It returns to the landing state: map view,
all filters cleared, no selection, search and drawer closed, initial map extent (`goHome()` in `js/ui.js`).
Basemap and language are user preferences and stay. The breadcrumb link "Alle Objekte" only clears the
filters and leaves the detail page.

### View Toggle Pattern

```html
<div class="view-toggle">
  <button class="view-toggle-btn active" data-view="map">
    <span class="material-symbols-outlined">map</span>
    <span class="view-label">Karte</span>
  </button>
  <button class="view-toggle-btn" data-view="gallery">
    <span class="material-symbols-outlined">grid_view</span>
    <span class="view-label">Galerie</span>
  </button>
</div>
```

Both prototypes offer the same two views, map and gallery; tables live in the table panel under the map.

### View Nav Pattern

Page views (detail page, API documentation) start with one sticky bar, `.view-nav`: white, 1px grey-300
bottom border, 12px × `--page-gutter` padding (40px; 20px below 1600px, 16px from 1024px, 12px on phones), breadcrumb on the left and the actions
(`.btn-back`, in tabs also `.btn-edit`) on the right. The inner row is as wide as the content below it
(`--view-nav-max-width`, default `--content-max-width`).
The content below uses the same `--page-gutter` as its side padding, so title, cards and tables start exactly
under the breadcrumb at every width. In tabs
the bar is part of the page header above the tab strip (`.header-detail`), in simple it sticks to the top of the
scrolling view. On phones the back button comes first and spans the width, the breadcrumb wraps below.

```html
<div class="view-nav">
  <div class="detail-header-inner">
    <div class="breadcrumb">…</div>
    <div class="detail-header-actions"><button class="btn-back">…</button></div>
  </div>
</div>
```

### Resizable Side Panels

The tree panel (left) and the filter drawer (right) are resized by the same grip, `.panel-resize-handle`: a
zero-width flex sibling placed on the panel's edge in the markup (`#tree-resize-handle` after `#tree-panel`,
`#filter-resize-handle` before `#filter-panel`). Its 8px hit area (12px on touch screens) and the three-line
glyph straddle the border line exactly; hover or drag turns it blue. It sits above both neighbours
(`--z-panel`) and disappears with a closed panel and on phones. The width lands in `--tree-panel-width` /
`--drawer-width` and is remembered per browser.

### Location Tree Pattern

"Standorte" in the header opens a left panel (`#tree-panel`, 320px) with the portfolio as a tree:
Land → Region → Ort → Wirtschaftseinheit → objects (buildings with their letter code, parcels with their
number). The header button is a plain toggle (`.panel-open` while the panel shows), like the Filter button
without its count. A country, region or city node sets the matching drawer filters (Land, Region, Ort — in the
URL `filter_land=CH&filter_region=BE`): the Filter button counts them, the pills show them, the drawer's
checkboxes follow. Every node shows the number of objects below it; the counts honour the other drawer
filters but not the location filters, so every branch stays reachable. The selected path is highlighted
(bold node, grey path); selecting the same node again removes its filter and folds it (a node row is a
toggle). A country is also outlined on the map (`assets/countries/<ISO>.geojson`, Natural Earth 1:10m, one file per
country loaded on demand, a 2px line in the blue of the parcels without a fill, so the basemap under the objects stays untouched) and the map zooms to it — often a country holds a single site, so the outline says where you are.
Swiss cantons have outlines too (`assets/regions/CH-<code>.geojson`, swissBOUNDARIES3D by swisstopo, simplified to
10–15 m and stored locally; a region filter value is matched by code, name or German name, so both data sets work); regions of other countries and city nodes zoom to their objects. WE nodes are folders (the row toggles them); an object row selects
the object on the map and, while the detail page is open, shows that object's page (a parcel opens the page of
its building). Branches
open one level at a time and every level has one open node: opening a country folds the other, opening a
region folds its siblings, so the tree never shows more than one path. The chevron only folds. One tab stop,
arrow keys, Home/End (ARIA tree). The grip on the right edge (`#tree-resize-handle`) drags the width between 240 and
600px; the width is remembered like the drawer's. On phones the
entry sits in the menu and the panel is a full-screen sheet.

```html
<aside id="tree-panel"><div class="panel-header">…Standorte, close…</div>
  <div class="tree-panel-content"><ul class="tree" role="tree">
    <li class="tree-item" style="--tree-ind: 28px"><div class="tree-node is-path">
      <button class="tree-fold" aria-expanded="true">…</button>
      <button class="tree-row" role="treeitem"><span class="tree-icon">public</span><span class="tree-label">Schweiz</span><span class="tree-count">16</span></button>
    </div><ul class="tree-children" role="group">…</ul></li>
  </ul></div></aside>
```

### Table Panel Pattern

The "Tabelle" toggle (grey-900 pill at the bottom centre of the map) opens a resizable panel under the
map with one tab per data set (Gebäude, Grundstücke; simple also Bodenabdeckung), the toolbar (search,
filter pills, Export and Spalten dropdowns) and the compact `.list-table`. A row selects the object on the
map and the map selection highlights its row. `?table=open` and `?tableTab=` keep the state in the URL;
phones hide the panel (the map keeps the info sheet). The content area is a vertical split: the table dock
(toggle, handle, table) sits below the active view, so the table is available under the map and the
gallery and hidden in the detail and API views; every floating map control is a child of `#map`, so an
open or resized table never covers the tools menu, the object card or the basemap switcher (see
`docs/TABLE-PANEL.md` at the repository root). A row selected under the gallery is shown on the map. The
handle between view and table is a keyboard-operable separator: arrow keys resize the table in 40px steps.

```html
<div id="map">…<button id="tbl-toggle" class="tbl-toggle">…Tabelle</button></div>
<div id="tbl-resize-handle" class="tbl-resize-handle"></div>
<div id="table-panel" class="table-panel collapsed">
  <div class="list-table-container">
    <div class="toolbar"><div class="table-tabs">…</div><div class="toolbar-search">…</div><div class="filter-pills"></div><div class="toolbar-actions">…</div></div>
    <div class="table-tab-content active" id="buildings-table-content">…table + pagination…</div>
    <div class="table-tab-content" id="parcels-table-content">…</div>
  </div>
</div>
```

### Search Pattern

```html
<div class="search-container">
  <button class="search-icon-btn">
    <span class="material-symbols-outlined">search</span>
  </button>
  <input type="search" class="search-input" placeholder="Suchen...">
  <button class="search-clear-btn">
    <span class="material-symbols-outlined">close</span>
  </button>
  <div class="search-scope">                               <!-- desktop and tablet only -->
    <button class="search-scope-btn" aria-haspopup="true" aria-expanded="false">
      <span>Alle</span><span class="material-symbols-outlined">arrow_drop_down</span>
    </button>
  </div>
</div>
<div class="search-scope-menu" role="group" hidden>       <!-- checkboxes, several can be combined -->
  <label class="search-scope-option"><input type="checkbox" value="ask" checked><span>Fragen</span></label>   <!-- tabs prototype -->
  <label class="search-scope-option"><input type="checkbox" value="objects" checked><span>Objekte</span></label> …
</div>
```

The scope button reads "Alle" while every box (or none) is ticked, the name of a single ticked
source, or "N Bereiche". The menu lives outside the search container so it can drop below the box.

### Search Suggestions Pattern

One dropdown, several sources (the "Frage stellen" section with the KI answer exists in the tabs prototype only). Each section names its source on the right; each row is
*icon · title (+ subtitle) · meta or action*. The matched term is highlighted in the title.

```
FRAGE STELLEN ………………………… KI          ← one suggested question, answered inline (Enter or tap)
✦  Wie viele Objekte gibt es in Bern?     ↵ Antwort
   In Bern gibt es 2 Objekte mit total …  [chips that select the object on the map]
OBJEKTE
▦  Bundeshaus West                        Gebäude · Bern CH · 1080/4840/AF
▢  Bundesplatz Parzelle A                 Parzelle · Bern · Nr. BE-3003-1001
ORT ……………………………………… swisstopo
◉  Bern (BE)                              Ort
KARTEN ……………………………… Geokatalog
▤  ISOS Ortsbildaufnahmen                 [+ Als Ebene] ⓘ   ← row adds the layer; ⓘ opens the layer info modal
```

```html
<div class="search-section-header"><span>Objekte</span><span class="search-section-source">…</span></div>
<div class="search-item" role="option">
  <span class="material-symbols-outlined search-item-icon" aria-hidden="true">apartment</span>
  <span class="search-item-main">
    <span class="search-item-title">Bundeshaus <b>West</b></span>
    <span class="search-item-subtitle">Bundesplatz 3, Bern</span>
  </span>
  <span class="search-item-meta">Gebäude · Bern CH · 1080/4840/AF</span>
</div>
<div class="search-answer">…</div>   <!-- follows the KI row; hidden until requested -->
```

The KI answers of the prototype are computed from the loaded data (`suggestAiQuestion()` in `js/assistant.js`),
not by a model; the pattern is what matters: the assistant lives in the search box, not in a side panel.
On phones the dropdown spans the header width and the meta wraps under the title.

### Filter Drawer Pattern

```html
<aside id="filter-panel">                                   <!-- .open: 450px wide, resizable -->
  <div class="filter-panel-resize-handle"></div>
  <div class="panel-header filter-panel-header">
    <span class="panel-header-title"><span class="material-symbols-outlined">filter_list</span><span>Filter</span></span>
    <div class="filter-panel-actions">
      <button class="filter-panel-btn"><span class="material-symbols-outlined">replay</span></button>
      <button class="filter-panel-btn"><span class="material-symbols-outlined">close</span></button>
    </div>
  </div>
  <div class="filter-panel-content">
    <div class="filter-section open">
      <div class="filter-section-header"><span class="filter-section-title">Status</span> …</div>
      <div class="filter-section-content">
        <div class="filter-option"><input type="checkbox" id="f1"><label for="f1">In Betrieb <span class="filter-option-count">8</span></label></div>
      </div>
    </div>
  </div>
  <div class="filter-panel-footer">                          <!-- phones only -->
    <button class="btn-secondary">Zurücksetzen</button>
    <button class="btn-primary">10 Objekte anzeigen</button>
  </div>
</aside>
```

Filters apply instantly; the active ones appear as `.filter-pill`s in the table toolbar and as the red
`.filter-count` badge on the header button.

### Tools Panel Pattern

```html
<div id="mobile-menu-backdrop" class="mobile-menu-backdrop"></div>
<div id="accordion-wrapper">                                <!-- floats at the top left of the map -->
  <aside id="accordion-panel">
    <div class="mobile-menu-header">…title, close button…</div>   <!-- phones only -->
    <div class="accordion-item" data-accordion="print">
      <button class="accordion-header" aria-expanded="false">
        <span class="accordion-arrow"><span class="material-symbols-outlined">chevron_right</span></span>
        <span>Karte drucken</span>
      </button>
      <div class="accordion-content">…</div>
    </div>
    …
    <div class="mobile-menu-extras">…footer links…</div>      <!-- phones only -->
  </aside>
  <div id="menu-toggle" role="button">…Menü schliessen…</div>  <!-- attached below the panel -->
</div>
```

`js/tools-panel.js` (shared) owns the open state: on desktop the toggle collapses the panel, on tablets
it starts collapsed, on phones the same panel is the hamburger menu (see Responsive Patterns).

### Empty State Pattern

```html
<div class="empty-state">
  <span class="material-symbols-outlined empty-icon">search_off</span>
  <h3>Keine Ergebnisse</h3>
  <p>Versuchen Sie andere Suchkriterien</p>
</div>
```

### Loading State Pattern

```html
<div class="loading-overlay"><div class="loading-spinner"></div><div class="loading-text">Daten werden geladen...</div></div>
<span class="spinner inline-spinner"></span> Lade Katalog...        <!-- inside buttons and panel rows -->
```

### Breadcrumb Pattern

```html
<nav class="breadcrumb" aria-label="Breadcrumb">
  <a href="#">Übersicht</a>
  <span class="material-symbols-outlined">chevron_right</span>
  <a href="#">Portfolio</a>
  <span class="material-symbols-outlined">chevron_right</span>
  <span class="current">Gebäude Details</span>
</nav>
```

---

## Accessibility

### Core Requirements

| Requirement | Standard | Implementation |
|-------------|----------|----------------|
| Color Contrast | WCAG AA (4.5:1) | All text meets minimum |
| Touch Targets | 44x44px minimum | Buttons, inputs sized appropriately |
| Focus Indicators | Visible 2px outline | Blue focus ring on all interactive |
| Keyboard Navigation | Full support | Tab order, skip links, ARIA |
| Screen Readers | ARIA labels | Semantic HTML, alt text |

### Skip Link

```html
<a class="skip-link" href="#main-content">
  Zum Hauptinhalt springen
</a>
```

### Focus Visible Styles

```css
*:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
```

### ARIA Usage

| Pattern | ARIA Attributes |
|---------|-----------------|
| Tabs | `role="tablist"`, `role="tab"`, `aria-selected` |
| Accordions | `aria-expanded`, `aria-controls` |
| Modals | `role="dialog"`, `aria-modal`, `aria-labelledby` |
| Live regions | `aria-live="polite"` |
| Icons | `aria-hidden="true"` (decorative) |

### Semantic HTML

```html
<!-- Use semantic elements -->
<header>
<nav>
<main>
<aside>
<section>
<article>
<footer>

<!-- Use buttons for actions -->
<button type="button">Action</button>

<!-- Use links for navigation -->
<a href="/page">Navigate</a>
```

---

## Responsive Design

### Breakpoints

| Name | Media query | Target |
|------|-------------|--------|
| Desktop | `min-width: 1600px` | Spacious header with icon-only location and filter actions, a labelled view toggle and centred search |
| Laptop | `max-width: 1599px` | 72px header; search flexes between full organisation title and the icon-only actions. Primary target: 1280 × 700 CSS pixels (1920 × 1200 at 150% Windows scaling, allowing for browser chrome). |
| Narrow desktop | `max-width: 1199px` | Icon-only view toggle; retain desktop navigation |
| Tablet | `max-width: 1024px` | iPads, small laptops. One-line logo, 44px header buttons without the language code, tools panel starts collapsed. |
| Mobile | `max-width: 767px`, **or** `max-height: 500px and (pointer: coarse)` | Phones in portrait **and** landscape. Two-row header (title + actions / search + view toggle), hamburger menu for the map tools, full-screen filter sheet, bottom-sheet info panel, sticky tab strip on the detail page. |
| Small Mobile | `max-width: 479px` | Small phones |
| Touch | `(pointer: coarse)` | Any touch device, independent of width: 44 px targets, 20 px checkboxes, wider resize handles |

The mobile query is a list on purpose: a phone held sideways is 800–950 px wide but only ~390 px tall,
so a width-only breakpoint would give it the tablet layout. `js/utils.js` exposes the same queries as
`isMobileLayout()`, `isLandscapePhone()` and `isCompactLayout()` for behaviour that has to follow the
layout (menu state, sheet gestures, focus management, map offsets). Change both places together.

Landscape phones additionally dock the info panel to the right (`max-height: 500px and (pointer: coarse) and (min-width: 600px)`).

### Responsive Patterns

**Docked panels:** preserve at least 760px of content when opening both side panels.
`panel-layout.js` reads the current CSS widths, including dragged sizes, and closes
the older panel when there is insufficient room. The floating tools menu folds if
selection or map resizing would make it overlap the object card; the user can
explicitly reopen it. The table sits below the map in the split and cannot overlap either.
The centred "Alle aktiven Filter zurücksetzen" action pushes the tools menu or the object
card down by a row only where the two would overlap on a narrow map (`panel-layout.js`
measures them and sets `reset-over-menu` / `reset-over-card` on `#map-view`); on wide maps
both stay at the top.

**Short screens:** the map table defaults to `clamp(280px, 40vh, 360px)`, capped at
75% of its workspace while reserving at least 160px for the map and resize handle. Drag resizing uses
the same workspace boundary. Object cards
scroll within the available map height, retain every field, and keep the detail
action sticky; below 800px height the photo shrinks (or hides while the table is open). Phone cards retain their
sheet layout.

**Detail reading order:** below 850px of available content (or in the phone layout),
Tabs moves the existing additional/energy sections after master data and address.
This changes DOM reading order as well as the visual order, preserving map and
gallery instances. Simple uses a compact 112px photo strip on the measurements tab.

**Header Transformation (Mobile):** two 44 px rows — title, filter and menu button; search and view toggle.
Landscape phones fold both rows back into one.
```css
@media (max-width: 767px), (max-height: 500px) and (pointer: coarse) {
  .header-main { flex-wrap: wrap; height: auto; padding: 8px 16px; }
  #logo-area   { order: 1; }                   /* short title: "BBL Liegenschaften Inventar" */
  #header-right { order: 2; margin-left: auto; } /* filter, hamburger (language and login hidden) */
  #search-area { order: 3; flex: 0 0 100%; }   /* flex-basis, not width: the laptop rule is flex: 1 */
  .hamburger-btn { display: flex; }            /* 44px bordered circle like the other header buttons */
}
```

**Hamburger Menu (Mobile):** on phones the map tools panel (`#accordion-panel`) is the menu itself,
so print, Geokatalog and the layers (tabs: also share, measure and export) stay available without a second
markup; `.mobile-menu-extras` at the bottom holds what only phones need (simple: share, language pills and the
footer links; tabs: the footer links).
```css
@media (max-width: 767px), (max-height: 500px) and (pointer: coarse) {
  .hamburger-btn { display: flex; width: 44px; height: 44px; }
  #accordion-panel {
    position: fixed; top: 0; right: 0; bottom: 0;
    width: 300px; max-width: 85vw;
    transform: translateX(100%);               /* .collapsed: off-screen, visibility hidden */
    transition: transform var(--transition-slow);
  }
  #accordion-panel:not(.collapsed) { transform: translateX(0); }
  .mobile-menu-backdrop.active { display: block; }
}
```
Tablets and desktop keep the floating panel with the "Menü öffnen" toggle (collapsed by default on tablets).

**Grid Collapse (Mobile):**
```css
@media (max-width: 767px) {
  .detail-grid,
  .data-grid,
  .gallery-grid {
    grid-template-columns: 1fr;
  }
}
```

**Bottom Sheet Pattern (Mobile):**
```css
@media (max-width: 767px), (max-height: 500px) and (pointer: coarse) {
  #info-panel {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 50dvh;                       /* dynamic viewport: excludes the browser chrome */
    padding-bottom: env(safe-area-inset-bottom, 0px);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }
  .sheet-handle { display: block; }          /* 36×4 px pill, signals "swipe down to close" */
}
```
The sheet is dismissed with the close button or by swiping its handle or header down (`initSheetGesture()`
in `js/gestures.js`). When it opens, the map keeps the selected object out from under it
(`revealSelectionOnMobile()` and the fly-to `offset`).

**Full-screen Sheet with Footer (Mobile filter):**
```css
@media (max-width: 767px), (max-height: 500px) and (pointer: coarse) {
  #filter-panel { position: fixed; inset: 0; z-index: var(--z-drawer); }
  .filter-panel-footer { display: flex; }     /* "Zurücksetzen" + "N Objekte anzeigen" (live count) */
}
```

**Touch Targets:**
```css
@media (pointer: coarse) {
  .maplibregl-ctrl-group button { width: 44px; height: 44px; }
  .filter-option { min-height: 44px; }        /* the label carries the hit area */
  input[type="checkbox"] { width: 20px; height: 20px; }
}
```
Visual size may stay small (an 18 px icon, a 10 px carousel dot) as long as the hit area is 44 px.
Inputs use `font-size: 16px` on phones so iOS Safari does not zoom into the page when they receive focus.

**Sticky Tab Strip (Mobile detail page, tabs prototype):** `#header` is `position: sticky` with a negative
`top` (`--header-sticky-offset`, set by `updateDetailHeaderOffset()`), so the header collapses on scroll
until only the tab strip is pinned. In both prototypes the strip scrolls horizontally on phones, snaps to
tabs and fades at the right edge while more tabs are hidden (`.can-scroll-right`).

**Wide Tables in Narrow Columns:** the address table becomes stacked label/value rows below a
container width of 640 px (`@container` on `.address-table-wrap`; cells carry `data-label`), so it also
works next to the open drawer on a desktop. Entity tables scroll horizontally in their wrapper; flex/grid
children that contain tables need `min-width: 0`, otherwise they push the page past the viewport.

### Mobile-First Approach

Write base styles for mobile, then enhance for larger screens:

```css
/* Mobile-first base */
.component {
  padding: var(--space-3);
}

/* Tablet enhancement */
@media (min-width: 768px) {
  .component {
    padding: var(--space-4);
  }
}

/* Desktop enhancement */
@media (min-width: 1025px) {
  .component {
    padding: var(--space-5);
  }
}
```

---

## Motion & Animation

### Timing Guidelines

| Duration | Use Case |
|----------|----------|
| 0.15s | Micro-interactions (hover, focus) |
| 0.2s | Standard transitions (background, color) |
| 0.25s | Panel slides |
| 0.3s | Larger transitions (accordion, panels) |

### Easing Functions

| Easing | Use Case |
|--------|----------|
| `ease` | General purpose |
| `ease-in-out` | Panel open/close |
| `linear` | Spinners, continuous |

### Common Transitions

```css
/* Hover effects */
transition: background 0.2s;
transition: background 0.2s, border-color 0.2s;

/* Panel animations */
transition: width 0.3s ease, min-width 0.3s ease;
transition: opacity 0.25s ease, transform 0.25s ease;

/* Card hover lift */
transition: box-shadow 0.2s, transform 0.2s;
```

### Animations

**Spinner:**
```css
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.spinner {
  animation: spin 1s linear infinite;
}
```

**Panel Slide-In:**
```css
.panel {
  opacity: 0;
  transform: translateX(10px);
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.panel.show {
  opacity: 1;
  transform: translateX(0);
}
```

### Motion Reduction

Respect user preferences for reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Iconography

### Icon Library

We use **Google Material Symbols Outlined** for consistent, professional iconography. The font is
self-hosted in `assets/icons/` (static build of the complete icon set, Apache 2.0), so the page makes
no request to Google Fonts and every icon name works offline.

```html
<link rel="stylesheet" href="assets/icons/material-symbols-outlined.css">
```

### Usage

```html
<span class="material-symbols-outlined" aria-hidden="true">icon_name</span>
```

### Icon Sizes

| Context | Size | Token |
|---------|------|-------|
| Inline text | 16px | `--text-base` |
| Buttons | 18px | — |
| Header | 20px | — |
| Navigation | 24px | — |
| Empty states | 64px | — |

### Common Icons

| Action | Icon |
|--------|------|
| Search | `search` |
| Filter | `filter_list` |
| Close | `close` |
| Menu | `menu` |
| Expand | `expand_more` |
| Chevron | `chevron_right` |
| Map | `map` |
| List | `view_list` |
| Grid | `grid_view` |
| Info | `info` |
| Edit | `edit` |
| Delete | `delete` |
| Download | `download` |
| Share | `share` |

### Icon Accessibility

Decorative icons should be hidden from screen readers:

```html
<!-- Decorative icon -->
<span class="material-symbols-outlined" aria-hidden="true">info</span>

<!-- Icon-only button needs label -->
<button aria-label="Close panel">
  <span class="material-symbols-outlined" aria-hidden="true">close</span>
</button>
```

---

## Best Practices

### Do's

- **Use design tokens** — Never hardcode colors, spacing, or typography values
- **Maintain consistency** — Same component = same styling throughout
- **Test on devices** — Verify responsive behavior on real devices
- **Check accessibility** — Test with keyboard and screen readers
- **Keep it simple** — Avoid unnecessary decorative elements
- **Optimize performance** — Use CSS transforms for animations

### Don'ts

- **Don't use arbitrary values** — No 13px, 17px, or custom colors
- **Don't skip focus states** — Every interactive element needs visible focus
- **Don't rely on color alone** — Always pair with text/icons
- **Don't animate layout properties** — Avoid animating width, height, margin
- **Don't nest too deep** — Keep CSS specificity manageable
- **Don't duplicate styles** — Reuse existing component classes

### Code Style

```css
/* Component structure */
.component {
  /* Layout */
  display: flex;
  align-items: center;

  /* Spacing */
  padding: var(--space-4);
  gap: var(--space-2);

  /* Visual */
  background: white;
  border: 1px solid var(--grey-300);
  border-radius: var(--radius-md);

  /* Typography */
  font-size: var(--text-sm);
  color: var(--grey-900);

  /* Interactive */
  cursor: pointer;
  transition: background 0.2s;
}

.component:hover {
  background: var(--grey-50);
}
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | Kebab-case | `.gallery-card` |
| Modifiers | BEM-inspired | `.btn-primary` |
| States | Simple classes | `.active`, `.show`, `.open` |
| Layout | Semantic | `.header`, `.main`, `.sidebar` |
| Utilities | Purpose-based | `.visually-hidden`, `.text-center` |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.3 | Sep 2026 | Polish review (see `DESIGN-REVIEW-2.md`): tokens for overlays, lines and control sizes, the `.icon-btn` primitive, one state vocabulary, `.loading-row`, badge reuse; 0 literal colours or dividers left in the stylesheets |
| 1.2 | Sep 2026 | Design review (see `DESIGN-REVIEW.md`): one stylesheet set for both prototypes (`tokens.css` + `components.css` identical, `app.css` per app), z-index scale, header button and panel button specs, one table density, 2px tabs, `.badge` primitive, phone menu = tools panel in both apps, inverted table toggle |
| 1.1 | Sep 2026 | Responsive review: landscape-phone breakpoint, touch-target rules, two-row phone header, hamburger menu, bottom-sheet / filter-footer / sticky-tab patterns, container query for the address table; search suggestions with inline KI answer (see `RESPONSIVE-REVIEW.md`) |
| 1.0 | Dec 2024 | Initial design guide release |

---

## Contributing

When adding new components or patterns:

1. Follow existing token usage and naming conventions
2. Ensure WCAG AA accessibility compliance
3. Test across all breakpoints
4. Document in this guide
5. Update version history

---

*This guide is a living document. Update it as the design system evolves.*
