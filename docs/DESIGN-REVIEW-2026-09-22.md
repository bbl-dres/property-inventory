# Design and responsive review — Simple and Tabs

Review scope: the two existing prototypes, preserving their different detail
layouts and shared design tokens. Examined map, search, gallery, tree/filter
panels, detail navigation, tables, previews and API documentation. Browser
coverage uses Edge/Chromium at 1920×1080, 1366×768, 768×1024, 375×667, 390×844
and 844×390, with touch emulation for tablet/phone sizes.

## Findings and fixes

| Priority | Finding | Resolution |
|---|---|---|
| High | Tabs positioned detail panels using an assumed header height. The tree overlapped the header initially and left a large gap after scrolling. | Shared `panel-layout.js` measures the actual header bottom on resize, header changes and scrolling. The fixed tree fills the remaining viewport. |
| High | Simple's detail content could extend beyond the viewport with the tree open. A saved wide panel could leave either prototype too little content space. | Shrinkable flex containers, bounded panel widths and container queries respond to the available content width. Cards and label/value rows stack when necessary. |
| High | Phone panels looked modal but allowed background focus and scrolling. Closing the tree targeted a hidden desktop button. | Fullscreen panels now use dialog semantics, background `inert`, scroll locking and a Tab focus boundary. Closing restores an available header control. |
| Medium | Master-data filtering in detail view implied a change to the open object although it filters the portfolio. | Entering detail closes the filter panel, disables its button and rejects programmatic opening. Returning to the portfolio re-enables it. Existing filters remain intact; the location tree remains available. |
| Medium | Detail tabs used roving tab stops without arrow-key navigation; unsupported URL tab names could leave a blank detail page. | Left/Right, Home/End, named tab-panel relationships and a fallback to Overview. |
| Medium | Simple's collapsible section headers worked only with a mouse. | Focusable controls with Enter/Space activation, `aria-expanded`, `aria-controls` and visible keyboard focus. |
| Medium | Phone table action bars consumed several rows before any records were visible. | Narrow table cards show secondary actions as 44 px icon buttons, retaining accessible names and hover hints. Add remains labelled. Table content retains single-line cells and local horizontal scrolling. |
| Medium | Long map info-card labels painted into their values, especially “Bewirtschaftungsstatus”. | A capped label column, ellipsis, full hover hints and explicit spacing. Values can wrap within their remaining width. |
| Medium | Search results could remain open over another view, including API documentation. | View changes dismiss results and cancel pending searches while preserving the search text. |
| Medium | External-layer info buttons used bare browser button styles. | `layer-info-button.js` renders internal, external and mobile controls with the same icon, size, color, hover/focus tokens and accessible name. |
| Medium | Toast notifications could cover the map's Tabelle button. | Toast positioning reserves a 16 px gap above the actual button and follows map/table resizing, with phone safe-area spacing. |
| Medium | Table checkboxes inherited inline baseline alignment and sat above the text's visual centre. | Block-level checkboxes with zero vertical margin let the shared table cell's middle alignment centre both header and row controls. |
| Usability | Preview arrows in the footer were harder to discover. | Shared previous/next buttons are centred vertically at the left/right sides of the preview canvas for documents and images. Zoom and counters stay in the footer. |
| Usability | Mini-map addresses provided no direct external map action. | Address headers are links to Google Maps at the building's coordinates, in a new tab with `noopener noreferrer`. |
| Usability | The API page repeated Swagger's heading and introductory content. | Removed `.api-docs-header` from both prototypes; Swagger provides its own header. |

On portfolio views, opening a second panel below 1280 px closes the other panel.
On larger screens both can dock, with bounded widths. Detail mode only permits
the location tree. No data columns were removed or expanded to fill empty space.

## Verification

Reproducible checks, from the repository root:

```powershell
python -m http.server 8123
# In another terminal:
node test/all.js
node test/check-alignment.js
node test/design-review.js --check
node test/document-preview-layout.js
node test/table-layout.js
node test/parcel-labels.js
node test/parcel-labels-layout.js
node test/overlay-layout.js
```

`test/design-review.js` exercises 16 interface states per prototype and viewport,
records panel/header/content bounds and console errors, and checks mobile sheet
focus. Screenshots and measurements go to ignored `visual-out/design-review/`
(override with `REVIEW_OUT`). The preview check covers 210 image/document cases,
including all 84 document records per prototype, mobile metadata, side arrows,
fit, page bounds, keyboard close and document opener focus. Separate tests check
table geometry, parcel labels and the new detail/navigation behavior.

Results: all 21 regression scenarios, 192 interface states plus 12 browser-error
records, 210 previews, 18 table layouts and 50 geometry checks passed. The parcel
browser check additionally covers eight rendered parcel/info-card views and
checks dot clearance, zoom 15, layer toggles and basemap restoration. Overlay
checks compare computed internal/external icon styles and exercise toast spacing
with the table open/closed at desktop, 125% CSS scale, tablet and phone sizes.

This is a browser and code review, not a certification of accessibility or a
physical-device compatibility audit. Safari/iOS, Android browser chrome and
screen-reader announcements still merit device testing. Demo edit/upload actions
remain outside the functional scope. Wide data tables intentionally scroll
inside their cards; the page itself should not scroll horizontally.

Related: [parcel label placement](PARCEL-LABELS.md),
[shared preview](DOCUMENT-PREVIEW.md), [reference-data findings](REFERENCE-DATA.md).
