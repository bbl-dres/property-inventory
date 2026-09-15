// Data tables (shared): a factory for paginated, searchable feature tables with row selection,
// stylesheet-driven column visibility and the toolbar dropdowns.

import { escapeHtml, getNestedProperty } from './utils.js';
import { t } from './i18n.js';

// ===== FEATURE TABLE FACTORY =====
//
// config = {
//   tbodyId:        '<tbody id>'
//   rowIdAttr:      'data-id'                       attribute carrying the row key
//   getRowId:       props => key                    row key from feature properties
//   parseRowId:     str => key                      (optional) key from the attribute string
//   columns:        [{ field, cls, format(value, props, feature) }]
//   getFeatures:    () => feature[]                 base data (already filtered by the app)
//   searchFields:   ['bbl_id', ...]                 properties searched by the toolbar search
//   onRowSelect:    key => void                     click / Enter / Space on a row
//   pagination:     { infoId, pageInfoId, prevId, nextId, rowsSelectId, infoKey, emptyKey }
//   empty:          { type: 'row', colspan, key } | { type: 'block', afterSelector, html: () => string }
// }
export function createFeatureTable(config) {
  const st = { page: 1, rowsPerPage: 50, searchTerm: '' };
  // Lower-cased search strings are computed once per feature (WeakMap: no property pollution)
  const searchTextCache = new WeakMap();

  function getSearchText(feature) {
    let text = searchTextCache.get(feature);
    if (text === undefined) {
      const p = feature.properties || {};
      text = (config.searchFields || []).map(function(f) {
        const v = getNestedProperty(p, f); // dot paths reach into nested objects
        return v == null ? '' : String(v);
      }).join(' ').toLowerCase();
      searchTextCache.set(feature, text);
    }
    return text;
  }

  function visibleFeatures() {
    let features = config.getFeatures() || [];
    if (st.searchTerm) {
      features = features.filter(function(f) { return getSearchText(f).indexOf(st.searchTerm) !== -1; });
    }
    return features;
  }

  function parseId(str) {
    return config.parseRowId ? config.parseRowId(str) : str;
  }

  function renderEmpty(tbody) {
    const empty = config.empty || { type: 'row', colspan: (config.columns || []).length, key: 'empty.title' };
    if (empty.type === 'block') {
      tbody.innerHTML = '';
      const wrapper = document.querySelector(empty.afterSelector);
      const parent = wrapper ? wrapper.parentElement : null;
      if (parent && !parent.querySelector('.empty-state')) {
        wrapper.insertAdjacentHTML('afterend', empty.html());
      }
    } else {
      tbody.innerHTML = '<tr><td colspan="' + empty.colspan + '" class="table-empty-cell">' + t(empty.key) + '</td></tr>';
    }
  }

  function clearEmpty() {
    const empty = config.empty;
    if (!empty || empty.type !== 'block') return;
    const wrapper = document.querySelector(empty.afterSelector);
    const parent = wrapper ? wrapper.parentElement : null;
    const existing = parent ? parent.querySelector('.empty-state') : null;
    if (existing) existing.remove();
  }

  function updatePagination(currentPage, totalPages, totalItems) {
    const p = config.pagination || {};
    const infoEl = document.getElementById(p.infoId);
    const pageInfoEl = document.getElementById(p.pageInfoId);
    const prevBtn = document.getElementById(p.prevId);
    const nextBtn = document.getElementById(p.nextId);

    if (infoEl) {
      if (totalItems === 0) {
        infoEl.textContent = t(p.emptyKey || 'pagination.empty');
      } else {
        const start = (currentPage - 1) * st.rowsPerPage + 1;
        const end = Math.min(currentPage * st.rowsPerPage, totalItems);
        infoEl.textContent = t(p.infoKey || 'pagination.info', { start: start, end: end, total: totalItems });
      }
    }
    if (pageInfoEl) {
      pageInfoEl.textContent = totalItems === 0 ? '' : t('pagination.page', { current: currentPage, total: totalPages });
    }
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
  }

  function render() {
    const tbody = document.getElementById(config.tbodyId);
    if (!tbody) return;
    const features = visibleFeatures();

    if (features.length === 0) {
      renderEmpty(tbody);
      updatePagination(0, 0, 0);
      return;
    }
    clearEmpty();

    const totalItems = features.length;
    const totalPages = Math.ceil(totalItems / st.rowsPerPage);
    if (st.page > totalPages) st.page = totalPages;
    if (st.page < 1) st.page = 1;
    const startIndex = (st.page - 1) * st.rowsPerPage;
    const endIndex = Math.min(startIndex + st.rowsPerPage, totalItems);

    let html = '';
    features.slice(startIndex, endIndex).forEach(function(feature) {
      const props = feature.properties || {};
      html += '<tr ' + config.rowIdAttr + '="' + escapeHtml(config.getRowId(props)) + '" tabindex="0" role="row">';
      config.columns.forEach(function(col) {
        const val = props[col.field];
        let display = (val !== null && val !== undefined && val !== '') ? escapeHtml(String(val)) : '–';
        if (col.format) display = col.format(val, props, feature);
        html += '<td class="' + col.cls + '">' + display + '</td>';
      });
      html += '</tr>';
    });
    tbody.innerHTML = html;
    updatePagination(st.page, totalPages, totalItems);
  }

  function highlightRow(tbody, row) {
    tbody.querySelectorAll('tr.row-active').forEach(function(r) { r.classList.remove('row-active'); });
    if (row) row.classList.add('row-active');
  }

  // Highlight the row of a key: jump to its page, mark it and scroll it into view
  function syncTo(key) {
    const features = visibleFeatures();
    let index = -1;
    for (let i = 0; i < features.length; i++) {
      if (config.getRowId(features[i].properties || {}) === key) { index = i; break; }
    }
    if (index === -1) return;
    const targetPage = Math.floor(index / st.rowsPerPage) + 1;
    if (st.page !== targetPage) {
      st.page = targetPage;
      render();
    }
    const tbody = document.getElementById(config.tbodyId);
    if (!tbody) return;
    const row = Array.prototype.find.call(tbody.querySelectorAll('tr[' + config.rowIdAttr + ']'), function(r) {
      return parseId(r.getAttribute(config.rowIdAttr)) === key;
    });
    highlightRow(tbody, row);
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function init() {
    const tbody = document.getElementById(config.tbodyId);
    if (tbody) {
      tbody.addEventListener('click', function(e) {
        const row = e.target.closest('tr[' + config.rowIdAttr + ']');
        if (!row) return;
        highlightRow(tbody, row);
        if (config.onRowSelect) config.onRowSelect(parseId(row.getAttribute(config.rowIdAttr)));
      });
      tbody.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const row = e.target.closest('tr[' + config.rowIdAttr + ']');
        if (!row) return;
        e.preventDefault();
        row.click();
      });
    }

    const p = config.pagination || {};
    const rowsSelect = document.getElementById(p.rowsSelectId);
    const prevBtn = document.getElementById(p.prevId);
    const nextBtn = document.getElementById(p.nextId);
    if (rowsSelect) {
      st.rowsPerPage = parseInt(rowsSelect.value, 10) || st.rowsPerPage;
      rowsSelect.addEventListener('change', function() {
        st.rowsPerPage = parseInt(this.value, 10);
        st.page = 1;
        render();
      });
    }
    if (prevBtn) {
      prevBtn.addEventListener('click', function() {
        if (st.page > 1) { st.page--; render(); }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function() {
        const totalPages = Math.ceil(visibleFeatures().length / st.rowsPerPage);
        if (st.page < totalPages) { st.page++; render(); }
      });
    }
  }

  return {
    render: render,
    init: init,
    syncTo: syncTo,
    setSearchTerm: function(term) {
      st.searchTerm = (term || '').toLowerCase().trim();
      st.page = 1;
      render();
    },
    resetPage: function() { st.page = 1; },
    getState: function() { return st; }
  };
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

// "Alle" / "Keine" for the checkboxes of one column list
export function toggleAllColumns(listEl, showAll) {
  if (!listEl) return;
  listEl.querySelectorAll('input[type="checkbox"][data-column]').forEach(function(checkbox) {
    checkbox.checked = showAll;
    handleColumnToggle(checkbox);
  });
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
      input.value = '';
      clearBtn.hidden = true;
      onSearch('');
      input.focus();
    });
  }
}
