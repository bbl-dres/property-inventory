# Shared table component

Both prototypes use `js/data-table.js` for every data table: building, parcel and
land-cover lists, plus the six detail tabs. Technical ID columns have been removed
from the display and column menus. Record IDs, EGID/EGRID, relationship keys and
exported data remain available in the data model and relevant detail fields.

## Column-width strategy

Use a semantic width role for each column, chosen in its schema definition. The
single `COLUMN_WIDTHS` map is the sizing policy for all tables; individual tabs do
not declare pixel widths or content-dependent sizing.

| Role | Base width | Maximum | Extra space |
|---|---:|---:|---|
| Selection | 48 px | 48 px | Fixed |
| Date / code | 136 px | 136 px | Fixed |
| Amount | 168 px | 168 px | Fixed |
| Number / area | 152 px | 152 px | Fixed |
| Year | 104 px | 104 px | Fixed |
| Status | 144 px | 144 px | Fixed |
| Phone | 176 px | 176 px | Fixed |
| Name | 248 px | 320 px | One share |
| Text | 216 px | 320 px | One share |
| Description | 288 px | 480 px | Two shares |
| Title | 288 px | 720 px | Two shares |
| Email | 288 px | 360 px | One share |

Document titles use the dedicated `title` role to allow longer filenames and names
without increasing the limits for descriptions or contract partners.

Fixed columns have the same width across tabs. Descriptive columns share remaining
container space in the listed proportions, up to their maximums. Once a column reaches
its cap, any remaining space goes to other flexible columns. When every cap is reached,
a presentation-only trailing column takes the remaining space. This keeps the header
background, row borders and hover/selection highlights continuous across the panel.
The spacer is empty, hidden from assistive technology, and has no sorting or data key.
For example, the Costs data columns occupy at most 944 px, with a 320 px cost-type
column. The spacer fills the rest of the panel without stretching data. Widths depend on the column schema and
container, never the current page's contents, so filtering, sorting or changing
buildings does not resize them. A `ResizeObserver` recalculates layout when the
container changes size or a hidden tab becomes visible. Hidden columns are removed
from the width allocation as well as hidden in the header/body. Width budgets are
rounded down from the actual content box and allocated in whole CSS pixels to avoid
accidental overflow at fractional viewport sizes or browser zoom levels.

The component renders a `<colgroup>` and uses `table-layout: fixed`. On narrow
screens it keeps the base widths and scrolls inside the existing table wrapper;
it does not squeeze dates or silently hide data. Every cell and header stays on one
line, with an ellipsis for overflow and the full formatted text in a native hover
hint (`title`). Link and badge markup is excluded from hint text. Dates display as
`DD.MM.YYYY` while sorting uses the original ISO value.
Amounts and numeric measurements are right-aligned with tabular numerals. IDs are
retained in row attributes, so selection does not depend on a visible ID cell.

## Modules and configuration

- `data-table.js`: header/cell generation, width allocation, sorting, search,
  pagination, row activation, checkbox selection and empty states.
- `table.js`: GeoJSON adapter and existing column-menu / toolbar controls.
- `list.js`: each app's building/parcel/land-cover column and data definitions.
- `entity-tables.js` (Tabs): adapters for the six related-record schemas.
- `css/components.css`: shared table appearance, alignment and sort buttons.

Each column supplies `key`, `label` or `labelKey`, `className`, and `width` (a role).
Optional `value(row)` provides the raw sorting value; optional `render(row)` returns
escaped/trusted HTML for links, badges or formatted units. Default rendering escapes
text and preserves zero. Headers and body cells are generated from the same schema.

```js
const table = createDataTable({
  tbodyId: 'contracts-tbody',
  getRows: () => contracts,
  getRowId: row => row.contractId,
  defaultSort: 'type',
  columns: [
    { key: 'type', label: 'Vertragsart', className: 'col-type', width: 'name' },
    { key: 'validFrom', label: 'Beginn', className: 'col-start', width: 'date' }
  ]
});
table.init();
table.render();
```

Sorting uses native buttons with `aria-sort`, locale-aware text/numeric ordering,
and empty values last in both directions. Checkbox selection follows internal row
keys through sorting. Filtering, paging or switching buildings clears selection,
preventing actions on invisible rows. Select-all applies to the current page.
Each instance initializes once and lives for the lifetime of its static prototype
page. The prototypes keep identical local copies, checked by the alignment script.

## Verification

`node test/all.js` covers both adapters, column visibility, row/map selection,
numeric and date sorting, empty results, multi-page data, and checkbox state.
`node test/check-alignment.js` checks the common component and styles.

With a static server on port 8123, `node test/table-layout.js` checks actual browser
widths across every detail tab on desktop, a scaled desktop and phone, including
width caps, single-line cells and full-text hints, header/body alignment, stable
widths after filtering, and scroll containment. `test/visual.js` also supports
the `contracts`, `costs`, `documents`, `contacts`, and `assets` screenshot scenarios.
