// Shared table component: declarative columns, stable widths, sorting, filtering,
// paging, selection and accessible headers. Schema adapters live in list/entity-tables.
import { escapeHtml, formatDate } from './utils.js';
import { t, getLocale, onLangChange } from './i18n.js';

// Text columns share spare space up to a role-specific cap. A presentation-only
// trailing column fills the panel without stretching the data columns.
export const COLUMN_WIDTHS = Object.freeze({
  selection: { width: 48, grow: 0 },
  code: { width: 136, grow: 0 },
  date: { width: 136, grow: 0 },
  year: { width: 104, grow: 0 },
  number: { width: 152, grow: 0 },
  amount: { width: 168, grow: 0 },
  status: { width: 144, grow: 0 },
  phone: { width: 176, grow: 0 },
  name: { width: 248, max: 320, grow: 1 },
  text: { width: 216, max: 320, grow: 1 },
  description: { width: 288, max: 480, grow: 2 },
  title: { width: 288, max: 720, grow: 2 },
  email: { width: 288, max: 360, grow: 1 }
});

function distributeWidths(sizes, available) {
  const widths = sizes.map(function(size) { return size.width; });
  let remaining = Math.max(0, Math.floor(available) - widths.reduce(function(sum, width) { return sum + width; }, 0));
  while (remaining > 0) {
    const flexible = sizes.map(function(size, i) { return i; }).filter(function(i) { return sizes[i].grow && widths[i] < sizes[i].max; });
    if (!flexible.length) break;
    const weight = flexible.reduce(function(sum, i) { return sum + sizes[i].grow; }, 0);
    const budget = remaining;
    flexible.forEach(function(i) {
      const added = Math.min(sizes[i].max - widths[i], Math.floor(budget * sizes[i].grow / weight));
      widths[i] += added;
      remaining -= added;
    });
    // Allocate the final indivisible pixels without rounding the total beyond its container.
    if (remaining === budget) { widths[flexible[0]]++; remaining--; }
  }
  return widths;
}

function contentWidth(element) {
  const style = window.getComputedStyle(element);
  if (!style.width.endsWith('px')) return element.clientWidth;
  let width = parseFloat(style.width);
  if (style.boxSizing === 'border-box') {
    ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].forEach(function(key) { width -= parseFloat(style[key]) || 0; });
  }
  // clientWidth rounds fractional CSS pixels upwards at some browser zoom levels.
  return Math.max(0, Math.floor(width));
}

const instances = new Set();
let hiddenColumns = new Set();

export function setTableHiddenColumns(classes) {
  hiddenColumns = new Set(classes);
  instances.forEach(function(table) { table.layout(); });
}

function isEmpty(value) { return value === null || value === undefined || value === ''; }

function compare(a, b, direction) {
  if (isEmpty(a) || isEmpty(b)) return isEmpty(a) && isEmpty(b) ? 0 : isEmpty(a) ? 1 : -1;
  const numeric = !isNaN(Number(a)) && !isNaN(Number(b));
  return (numeric ? Number(a) - Number(b) : String(a).localeCompare(String(b), getLocale(), { numeric: true, sensitivity: 'base' })) * direction;
}

export function createDataTable(config) {
  const columns = config.columns;
  const st = { page: 1, rowsPerPage: 50, searchTerm: '', sortField: config.defaultSort || null, sortDir: 'asc' };
  const selected = new Set();
  const searchCache = new WeakMap();
  const textDecoder = document.createElement('template');
  let activeKey = null;
  let initialized = false;
  let observer = null;
  let lastLayout = '';
  const selection = config.selection;

  function body() { return document.getElementById(config.tbodyId); }
  function element() { const b = body(); return b && b.closest('table'); }
  function value(row, col) { return col.value ? col.value(row) : row[col.key]; }
  function rowKey(row) { return String(config.getRowId(row)); }
  function label(col) { return col.labelKey ? t(col.labelKey) : col.label || col.key; }
  function hint(display) {
    textDecoder.innerHTML = display;
    return escapeHtml(textDecoder.content.textContent.replace(/\s+/g, ' ').trim());
  }
  function visibleColumns() { return columns.filter(function(col) { return !hiddenColumns.has(col.className); }); }

  function rows() {
    let data = config.getRows() || [];
    if (st.searchTerm) data = data.filter(function(row) {
      let text = searchCache.get(row);
      if (text === undefined) {
        text = String(config.searchText ? config.searchText(row) : columns.map(function(c) { return value(row, c) ?? ''; }).join(' ')).toLowerCase();
        searchCache.set(row, text);
      }
      return text.includes(st.searchTerm);
    });
    const col = columns.find(function(c) { return c.key === st.sortField; });
    if (col) data = data.slice().sort(function(a, b) { return compare(value(a, col), value(b, col), st.sortDir === 'desc' ? -1 : 1); });
    return data;
  }

  function layout() {
    const table = element();
    if (!table) return;
    const defs = (selection ? [{ key: '_selection', width: 'selection' }] : []).concat(visibleColumns());
    const sizes = defs.map(function(c) { return COLUMN_WIDTHS[c.width] || COLUMN_WIDTHS.text; });
    const minimum = sizes.reduce(function(sum, size) { return sum + size.width; }, 0);
    const available = contentWidth(table.parentElement) || minimum;
    const widths = distributeWidths(sizes, available);
    const used = widths.reduce(function(sum, width) { return sum + width; }, 0);
    defs.push({ key: '_spacer' });
    widths.push(Math.max(0, available - used));
    const signature = defs.map(function(c) { return c.key; }).join('|') + widths.join('|');
    if (signature === lastLayout) return;
    lastLayout = signature;
    let group = table.querySelector('colgroup');
    if (!group) { group = document.createElement('colgroup'); table.prepend(group); }
    group.innerHTML = widths.map(function(width, i) {
      return '<col data-column="' + escapeHtml(defs[i].key) + '" style="width:' + width.toFixed(2) + 'px">';
    }).join('');
    // When all columns are hidden, keep the empty table inside its viewport.
    table.style.width = Math.max(widths.reduce(function(sum, width) { return sum + width; }, 0), 1) + 'px';
    table.style.minWidth = minimum + 'px';
    table.dataset.minimumWidth = String(minimum);
    const empty = table.querySelector('tbody .table-empty-cell, tbody .empty-row td');
    if (empty) empty.colSpan = Math.max(1, defs.length);
  }

  function updateSortIndicator() {
    const table = element();
    if (!table) return;
    table.querySelectorAll('th[data-sort]').forEach(function(th) {
      const active = th.dataset.sort === st.sortField;
      th.classList.toggle('sort-asc', active && st.sortDir === 'asc');
      th.classList.toggle('sort-desc', active && st.sortDir === 'desc');
      th.setAttribute('aria-sort', active ? (st.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
      const icon = th.querySelector('.sort-icon');
      if (icon) icon.textContent = active ? (st.sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more';
    });
  }

  function renderHeaders() {
    const table = element();
    if (!table) return;
    table.classList.add('data-table');
    let head = table.tHead;
    if (!head) head = table.createTHead();
    let row = head.rows[0];
    if (!row) row = head.insertRow();
    row.innerHTML = (selection ? '<th scope="col" class="col-checkbox"><input type="checkbox" id="' + selection.selectAllId + '" aria-label="Alle Zeilen dieser Seite auswählen"></th>' : '') + columns.map(function(col) {
      return '<th scope="col" class="' + col.className + ' sortable" data-sort="' + escapeHtml(col.key) + '" data-width="' + (col.width || 'text') + '">' +
        '<button type="button" class="table-sort-button" title="' + escapeHtml(label(col)) + '"><span class="table-column-label">' + escapeHtml(label(col)) + '</span><span class="material-symbols-outlined sort-icon" aria-hidden="true">unfold_more</span></button></th>';
    }).join('') + '<th class="table-spacer" aria-hidden="true" role="presentation"></th>';
    updateSortIndicator();
    updateSelection();
    layout();
  }

  function updateSelection() {
    const table = element();
    if (!table || !selection) return;
    const checkboxes = Array.from(table.querySelectorAll('tbody input[type="checkbox"]'));
    checkboxes.forEach(function(cb) {
      cb.checked = selected.has(cb.closest('tr').getAttribute(config.rowIdAttr || 'data-id'));
      cb.closest('tr').classList.toggle('selected', cb.checked);
    });
    const count = checkboxes.filter(function(cb) { return cb.checked; }).length;
    const all = document.getElementById(selection.selectAllId);
    if (all) { all.checked = count > 0 && count === checkboxes.length; all.indeterminate = count > 0 && count < checkboxes.length; all.disabled = !checkboxes.length; }
    document.querySelectorAll('.' + selection.actionClass).forEach(function(button) { button.disabled = selected.size === 0; });
  }

  function pagination(current, totalPages, total) {
    const p = config.pagination || {};
    function target(name) { return p[name] ? document.getElementById(p[name]) : null; }
    const info = target('infoId');
    const page = target('pageInfoId');
    if (info) info.textContent = !total ? t(p.emptyKey || 'pagination.empty') : p.pageOnly ? t('pagination.entries.page', { current: current, total: totalPages }) : t(p.infoKey || 'pagination.info', { start: (current - 1) * st.rowsPerPage + 1, end: Math.min(current * st.rowsPerPage, total), total: total });
    if (page) page.textContent = !total ? '' : t('pagination.page', { current: current, total: totalPages });
    const prev = target('prevId'); const next = target('nextId');
    if (prev) prev.disabled = current <= 1;
    if (next) next.disabled = !total || current >= totalPages;
  }

  function render() {
    const tbody = body();
    if (!tbody) return;
    const data = rows();
    const empty = config.empty || {};
    const wrapper = empty.afterSelector && document.querySelector(empty.afterSelector);
    const oldEmpty = wrapper && wrapper.parentElement.querySelector('.empty-state');
    if (oldEmpty) oldEmpty.remove();
    const totalPages = Math.ceil(data.length / st.rowsPerPage);
    st.page = Math.max(1, Math.min(st.page, totalPages || 1));
    if (!data.length) {
      if (empty.type === 'block' && wrapper) {
        tbody.innerHTML = '';
        wrapper.insertAdjacentHTML('afterend', empty.html());
      } else {
        const message = empty.key || ((config.getRows() || []).length ? 'empty.search' : 'detail.empty');
        tbody.innerHTML = '<tr class="empty-row"><td class="table-empty-cell" colspan="' + (visibleColumns().length + (selection ? 1 : 0) + 1) + '"><div class="table-empty-state">' + escapeHtml(t(message)) + '</div></td></tr>';
      }
    } else {
      tbody.innerHTML = data.slice((st.page - 1) * st.rowsPerPage, st.page * st.rowsPerPage).map(function(row) {
        const key = rowKey(row);
        let html = '<tr ' + (config.rowIdAttr || 'data-id') + '="' + escapeHtml(key) + '"' + (config.onRowSelect ? ' tabindex="0"' : '') + (key === activeKey ? ' class="row-active"' : '') + '>';
        if (selection) html += '<td class="col-checkbox"><input type="checkbox" class="' + selection.checkboxClass + '" aria-label="Zeile auswählen"></td>';
        columns.forEach(function(col) {
          const raw = value(row, col);
          const display = col.render ? col.render(row) : col.width === 'date' ? escapeHtml(formatDate(raw) || '—') : escapeHtml(isEmpty(raw) ? '—' : String(raw));
          html += '<td class="' + col.className + '" data-width="' + (col.width || 'text') + '" title="' + hint(display) + '"><span class="table-cell-content">' + display + '</span></td>';
        });
        return html + '<td class="table-spacer" aria-hidden="true" role="presentation"></td></tr>';
      }).join('');
    }
    pagination(data.length ? st.page : 0, totalPages, data.length);
    updateSortIndicator(); updateSelection(); layout();
  }

  function sortBy(key) {
    if (!columns.some(function(col) { return col.key === key; })) return;
    st.sortDir = st.sortField === key && st.sortDir === 'asc' ? 'desc' : 'asc';
    st.sortField = key; st.page = 1; render();
  }

  function setSearchTerm(term) { st.searchTerm = (term || '').toLowerCase().trim(); st.page = 1; selected.clear(); render(); }

  function syncTo(key) {
    const data = rows();
    const index = data.findIndex(function(row) { return rowKey(row) === String(key); });
    if (index < 0) return;
    activeKey = String(key); st.page = Math.floor(index / st.rowsPerPage) + 1; render();
    const row = Array.from(body().rows).find(function(r) { return r.getAttribute(config.rowIdAttr || 'data-id') === activeKey; });
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function init() {
    if (initialized || !element()) return;
    initialized = true;
    const table = element();
    renderHeaders();
    table.tHead.addEventListener('click', function(event) {
      const th = event.target.closest('th[data-sort]');
      if (th) sortBy(th.dataset.sort);
    });
    table.addEventListener('change', function(event) {
      if (!selection || event.target.type !== 'checkbox') return;
      const cb = event.target;
      if (cb.id === selection.selectAllId) {
        table.querySelectorAll('tbody tr[data-id]').forEach(function(row) { if (cb.checked) selected.add(row.dataset.id); else selected.delete(row.dataset.id); });
      } else {
        const key = cb.closest('tr').getAttribute(config.rowIdAttr || 'data-id');
        if (cb.checked) selected.add(key); else selected.delete(key);
      }
      updateSelection();
    });
    body().addEventListener('click', function(event) {
      if (!config.onRowSelect || event.target.closest('a, button, input')) return;
      const row = event.target.closest('tr[' + (config.rowIdAttr || 'data-id') + ']');
      if (!row) return;
      activeKey = row.getAttribute(config.rowIdAttr || 'data-id');
      body().querySelectorAll('tr').forEach(function(r) { r.classList.toggle('row-active', r === row); });
      config.onRowSelect(config.parseRowId ? config.parseRowId(activeKey) : activeKey);
    });
    body().addEventListener('keydown', function(event) {
      if (!config.onRowSelect || event.target.tagName !== 'TR' || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault(); event.target.click();
    });
    const p = config.pagination || {};
    const size = document.getElementById(p.rowsSelectId);
    if (size) {
      st.rowsPerPage = parseInt(size.value, 10) || 50;
      size.addEventListener('change', function() { st.rowsPerPage = Math.max(1, parseInt(size.value, 10) || 50); st.page = 1; selected.clear(); render(); });
    }
    const prev = document.getElementById(p.prevId); const next = document.getElementById(p.nextId);
    if (prev) prev.addEventListener('click', function() { if (st.page > 1) { st.page--; selected.clear(); render(); } });
    if (next) next.addEventListener('click', function() { if (st.page < Math.ceil(rows().length / st.rowsPerPage)) { st.page++; selected.clear(); render(); } });
    const filter = document.getElementById(config.filterId);
    if (filter) filter.addEventListener('input', function() { setSearchTerm(filter.value); });
    if (window.ResizeObserver) { observer = new window.ResizeObserver(layout); observer.observe(table.parentElement); }
    else window.addEventListener('resize', layout);
    onLangChange(function() { if (initialized) { renderHeaders(); render(); } });
    instances.add(api);
  }

  const api = {
    init: init, render: render, renderHeaders: renderHeaders, layout: layout,
    sortBy: sortBy, updateSortIndicator: updateSortIndicator, syncTo: syncTo,
    setSearchTerm: setSearchTerm, getState: function() { return st; },
    resetPage: function() { st.page = 1; },
    reset: function() { st.page = 1; st.searchTerm = ''; selected.clear(); activeKey = null; const filter = document.getElementById(config.filterId); if (filter) filter.value = ''; updateSelection(); }
  };
  return api;
}
