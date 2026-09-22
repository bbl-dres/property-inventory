# Document preview

Adapted from `service-portal/js/ui/doc-viewer.js` and its viewer styles (MIT,
copyright 2026 Digital Real Estate and Support). The original licence is retained
in each prototype's `vendor/service-portal/LICENSE`.

Both prototypes use identical standalone `media-preview.js`, `document-pages.js`
and `css/media-preview.css`, with `document-preview.js` as the document entry point.
Images and documents share the exact same header, footer, zoom, metadata and modal
lifecycle. Colors use the existing image preview's `scrim`, `scrim-strong` and
`on-dark-*` tokens, with the common `icon-btn--on-dark` controls. The header offers
download, disabled demo upload, info and close. Images download the local asset;
public documents link to the original. Download stays disabled for mock records
without an original file. Photo credit remains visible in the fullscreen header
and in the info panel. They require no portal runtime, PDF library or
remote document request. The preview renders local HTML demonstration sheets;
it does **not** display the contents of the public BBL PDFs. Public-source records
offer **Original öffnen**. No simulated file download is presented as a real one.

Entry points:

- Tabs: click a document row, or select a row and choose **Vorschau**. Previous /
  next follows the current filter and sort order across pages, within the building.
- Simple: click a row in the **Dokumente** section of the overview. Previous /
  next follows that building's alphabetically sorted document list.

Document titles have no underline. Checkboxes remain independent of row activation;
Enter/Space on a focused row opens the preview and closing restores focus.

Previous/next arrows sit at the left and right sides of the preview canvas in
both viewers, inset 32–64 px from the edges to clear the document scrollbar;
zoom and the page/image counter remain in the shared footer.
The viewer supports previous/next documents, scrollable pages, page count, zoom,
fit to width, a metadata panel and the original public-source link where available.
Keyboard: Left/Right changes document, +/− zooms, 0 fits, Escape closes, and Tab stays
inside the dialog. Background content is inert while open; closing restores the
previous scroll lock and focus. View/building changes close the viewer.

The six existing KBOB types have distinct example content. Area calculations and
cost statistics use the selected building's existing measurement and BKP records.
Maintenance/operating text and the normalized energy profile are explicitly mock
examples. Public publications get a one-page reference cover, not a fabricated copy
of the original. Preview notices stay inside the viewer, not on document rows.

The data generator also embeds the same cost records in Simple's
`demoRelatedRecords.costs`; `validate.py` checks parity with the Tabs cost register.
Existing document URLs, availability and source/demo metadata retain their meaning.

Validation: document-preview scenarios in `test/scenarios/`, the cross-prototype
alignment check, portfolio validation and `node test/document-preview-layout.js`
(requires a static server on port 8123). The browser check covers all 84 records
in both prototypes, desktop/mobile controls, sheet bounds and keyboard closing;
it saves review screenshots under the ignored `visual-out/document-preview/`.
