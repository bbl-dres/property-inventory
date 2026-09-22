// Feature-table adapter plus column controls. Rendering and behavior live in data-table.js.
import { getNestedProperty } from './utils.js';
import { createDataTable, setTableHiddenColumns } from './data-table.js';

export function createFeatureTable(config) {
  return createDataTable({
    ...config,
    getRows: config.getFeatures,
    getRowId: function(feature) { return config.getRowId(feature.properties || {}); },
    searchText: function(feature) {
      return (config.searchFields || []).map(function(key) { return getNestedProperty(feature.properties || {}, key) ?? ''; }).join(' ');
    },
    columns: config.columns.map(function(col) {
      return {
        key: col.sortField || col.field, className: col.cls,
        label: col.label, labelKey: col.labelKey, width: col.width,
        value: function(feature) { return getNestedProperty(feature.properties || {}, col.sortField || col.field); },
        render: col.format ? function(feature) { return col.format(feature.properties[col.field], feature.properties, feature); } : undefined
      };
    })
  });
}

// ===== COLUMN VISIBILITY =====
// Column visibility is driven by one generated stylesheet instead of touching every cell:
// toggling a column is O(1), and freshly rendered rows need no re-application.
const hiddenColumns = new Set();
let columnStyleEl = null;
let columnScope = '';

function updateColumnStylesheet() {
  if (!columnStyleEl) {
    columnStyleEl = document.createElement('style');
    columnStyleEl.id = 'column-visibility-style';
    document.head.appendChild(columnStyleEl);
  }
  let css = '';
  hiddenColumns.forEach(function(cls) {
    if (/^[a-zA-Z0-9_-]+$/.test(cls)) css += columnScope + ' .' + cls + '{display:none;}';
  });
  columnStyleEl.textContent = css;
  setTableHiddenColumns(hiddenColumns, columnScope);
}

export function handleColumnToggle(checkbox) {
  const columnClass = checkbox.getAttribute('data-column');
  if (!columnClass) return;
  if (checkbox.checked) hiddenColumns.delete(columnClass); else hiddenColumns.add(columnClass);
  updateColumnStylesheet();
}

// Seed the hidden set from the initial state of every column checkbox and bind the change events.
//   scopeSelector: selector of the table container the generated rules are limited to
//   menuSelector:  container of the column checkboxes (input[data-column])
export function initColumnVisibility(scopeSelector, menuSelector) {
  columnScope = scopeSelector || '';
  document.querySelectorAll(menuSelector + ' input[type="checkbox"][data-column]').forEach(function(cb) {
    if (!cb.checked) hiddenColumns.add(cb.getAttribute('data-column'));
    cb.addEventListener('change', function() { handleColumnToggle(this); });
  });
  updateColumnStylesheet();
}

// "Alle" / "Keine" for the checkboxes of one column list (the stylesheet is rebuilt once, not per checkbox)
export function toggleAllColumns(listEl, showAll) {
  if (!listEl) return;
  listEl.querySelectorAll('input[type="checkbox"][data-column]').forEach(function(checkbox) {
    checkbox.checked = showAll;
    const columnClass = checkbox.getAttribute('data-column');
    if (!columnClass) return;
    if (showAll) hiddenColumns.delete(columnClass); else hiddenColumns.add(columnClass);
  });
  updateColumnStylesheet();
}

// Column search inside the columns dropdown (filters the checkbox rows and hides empty group labels)
export function initColumnsSearch(inputId, clearId, getActiveList) {
  const input = document.getElementById(inputId);
  const clearBtn = document.getElementById(clearId);
  if (!input) return;

  function filterList() {
    const term = input.value.toLowerCase().trim();
    if (clearBtn) clearBtn.hidden = !term;
    const list = getActiveList();
    if (!list) return;
    list.querySelectorAll('.dropdown-menu-item').forEach(function(item) {
      item.style.display = item.textContent.toLowerCase().indexOf(term) !== -1 ? '' : 'none';
    });
    list.querySelectorAll('.columns-group-label').forEach(function(label) {
      let next = label.nextElementSibling;
      let hasVisible = false;
      while (next && !next.classList.contains('columns-group-label')) {
        if (next.style.display !== 'none') hasVisible = true;
        next = next.nextElementSibling;
      }
      label.style.display = hasVisible ? '' : 'none';
    });
  }

  input.addEventListener('input', filterList);
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      input.value = '';
      clearBtn.hidden = true;
      filterList();
      input.focus();
    });
  }
}

// ===== DROPDOWNS =====

export function closeAllDropdowns() {
  document.querySelectorAll('.dropdown-menu').forEach(function(d) { d.classList.remove('show'); });
}

export function toggleDropdown(dropdownId) {
  const menu = document.getElementById(dropdownId);
  if (!menu) return;
  const isOpen = menu.classList.contains('show');
  closeAllDropdowns();
  if (!isOpen) menu.classList.add('show');
}

// Binds the toolbar dropdown buttons (data-dropdown="<menu id>") and closes menus on outside clicks
export function initDropdowns() {
  document.querySelectorAll('[data-dropdown]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleDropdown(this.getAttribute('data-dropdown'));
    });
  });
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.dropdown-container')) closeAllDropdowns();
  });
}

// Debounced toolbar search input with a clear button
export function initTableSearch(inputId, clearId, onSearch) {
  const input = document.getElementById(inputId);
  const clearBtn = document.getElementById(clearId);
  if (!input) return;
  let timer = null;
  input.addEventListener('input', function() {
    const value = this.value;
    if (clearBtn) clearBtn.hidden = !value;
    clearTimeout(timer);
    timer = setTimeout(function() { onSearch(value); }, 200);
  });
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      clearTimeout(timer);
      input.value = '';
      clearBtn.hidden = true;
      onSearch('');
      input.focus();
    });
  }
}
