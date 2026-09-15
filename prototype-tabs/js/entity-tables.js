// Entity tables of the detail view (Bemessungen, Dokumente, Kontakte, Kosten, Verträge, Ausstattung):
// one generic table factory with sorting, selection, filtering and pagination, six definitions.

import { state } from './state.js';
import { escapeHtml, formatNum, formatCurrency, formatCurrencyWithUnit, getContractStatusClassName } from './utils.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';

// ===== SHARED TABLE UTILITIES =====

function sortTableData(data, column, direction) {
  return data.sort(function(a, b) {
    let valA = a[column];
    let valB = b[column];
    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = typeof valB === 'string' ? valB.toLowerCase() : valB;
    }
    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

function updateTableSelection(config) {
  const checkboxes = document.querySelectorAll('.' + config.checkboxClass);
  const checkedCount = document.querySelectorAll('.' + config.checkboxClass + ':checked').length;
  const selectAll = document.getElementById(config.selectAllId);
  if (selectAll) {
    selectAll.checked = checkedCount === checkboxes.length && checkboxes.length > 0;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
  }
  document.querySelectorAll('#' + config.tableId + ' tbody tr').forEach(function(row) {
    const cb = row.querySelector('.' + config.checkboxClass);
    row.classList.toggle('selected', !!(cb && cb.checked));
  });
  document.querySelectorAll('.' + config.actionClass).forEach(function(btn) {
    btn.disabled = checkedCount === 0;
  });
}

// ===== GENERIC ENTITY TABLE FACTORY =====

function createEntityTable(config) {
  const tableName = config.tableId.replace('-table', '');
  const table = {
    data: [],
    filteredData: [],
    sort: { column: config.defaultSort || 'id', direction: 'asc' },
    pagination: { currentPage: 1, rowsPerPage: 50 }
  };

  function selectionConfig() {
    return { tableId: config.tableId, checkboxClass: config.checkboxClass, selectAllId: config.selectAllId, actionClass: config.actionClass };
  }

  // Rows of one building
  table.load = function(building) {
    if (building && building.properties) {
      const buildingId = building.properties.buildingId;
      table.data = config.dataSource()
        .filter(function(item) { return item.buildingIds && item.buildingIds.indexOf(buildingId) !== -1; })
        .map(config.transform);
    } else {
      table.data = [];
    }
    table.filteredData = table.data.slice();
    table.pagination.currentPage = 1;
    sortTableData(table.filteredData, table.sort.column, table.sort.direction);
  };

  table.render = function() {
    const tbody = document.getElementById(config.tbodyId);
    if (!tbody) return;

    if (table.filteredData.length === 0) {
      const colCount = config.columns.length + 1; // + checkbox column
      const noData = table.data.length === 0;
      tbody.innerHTML = '<tr class="empty-row"><td colspan="' + colCount + '">' +
        '<div class="table-empty-state">' +
        '<span class="material-symbols-outlined">' + (noData ? 'inbox' : 'search_off') + '</span>' +
        '<div class="table-empty-message">' + t(noData ? 'detail.empty' : 'empty.search') + '</div>' +
        '</div></td></tr>';
      table.updatePagination(0, 0);
      return;
    }

    const totalItems = table.filteredData.length;
    const totalPages = Math.ceil(totalItems / table.pagination.rowsPerPage);
    if (table.pagination.currentPage > totalPages) table.pagination.currentPage = totalPages;
    if (table.pagination.currentPage < 1) table.pagination.currentPage = 1;
    const startIndex = (table.pagination.currentPage - 1) * table.pagination.rowsPerPage;
    const endIndex = Math.min(startIndex + table.pagination.rowsPerPage, totalItems);

    let html = '';
    table.filteredData.slice(startIndex, endIndex).forEach(function(item) {
      html += '<tr data-id="' + escapeHtml(item.id) + '">';
      html += '<td class="col-checkbox"><input type="checkbox" class="' + config.checkboxClass + '"></td>';
      config.columns.forEach(function(col) {
        const value = col.render ? col.render(item) : escapeHtml(item[col.key] || '—');
        html += '<td class="' + col.className + '">' + value + '</td>';
      });
      html += '</tr>';
    });
    tbody.innerHTML = html;
    table.updatePagination(table.pagination.currentPage, totalPages);
    updateTableSelection(selectionConfig());
  };

  table.updatePagination = function(currentPage, totalPages) {
    const footer = document.getElementById(tableName + '-pagination');
    if (!footer) return;
    const infoEl = footer.querySelector('.pagination-info');
    const prevBtn = footer.querySelector('.pagination-prev');
    const nextBtn = footer.querySelector('.pagination-next');
    if (infoEl) {
      infoEl.textContent = totalPages === 0 ? t('pagination.entries.empty') : t('pagination.entries.page', { current: currentPage, total: totalPages });
    }
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages || totalPages === 0;
  };

  table.filter = function(term) {
    term = term.toLowerCase().trim();
    table.filteredData = term === '' ? table.data.slice() : table.data.filter(function(item) {
      return config.searchFields.some(function(field) {
        const val = item[field];
        return val != null && String(val).toLowerCase().indexOf(term) !== -1;
      });
    });
    table.pagination.currentPage = 1;
    sortTableData(table.filteredData, table.sort.column, table.sort.direction);
    table.render();
  };

  table.init = function() {
    // Sortable headers
    const headers = document.querySelectorAll('#' + config.tableId + ' th.sortable');
    headers.forEach(function(th) {
      th.addEventListener('click', function() {
        const column = this.dataset.sort;
        if (column === table.sort.column) {
          table.sort.direction = table.sort.direction === 'asc' ? 'desc' : 'asc';
        } else {
          table.sort.column = column;
          table.sort.direction = 'asc';
        }
        headers.forEach(function(header) {
          header.classList.remove('sort-asc', 'sort-desc');
          const icon = header.querySelector('.sort-icon');
          if (icon) icon.textContent = 'unfold_more';
        });
        this.classList.add('sort-' + table.sort.direction);
        const sortIcon = this.querySelector('.sort-icon');
        if (sortIcon) sortIcon.textContent = table.sort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward';
        sortTableData(table.filteredData, table.sort.column, table.sort.direction);
        table.render();
      });
    });

    // Select all + row checkboxes (delegated: rows are re-rendered)
    const selectAll = document.getElementById(config.selectAllId);
    if (selectAll) {
      selectAll.addEventListener('change', function() {
        const isChecked = this.checked;
        document.querySelectorAll('.' + config.checkboxClass).forEach(function(cb) { cb.checked = isChecked; });
        updateTableSelection(selectionConfig());
      });
    }
    const tbody = document.getElementById(config.tbodyId);
    if (tbody) {
      tbody.addEventListener('change', function(e) {
        if (e.target.classList.contains(config.checkboxClass)) updateTableSelection(selectionConfig());
      });
    }

    const filterInput = document.getElementById(config.filterId);
    if (filterInput) {
      filterInput.addEventListener('input', function() { table.filter(this.value); });
    }

    // "Hinzufügen" is a placeholder in the prototype
    const addBtn = document.getElementById(config.addBtnId);
    if (addBtn) {
      addBtn.addEventListener('click', function() {
        showToast({ type: 'info', message: t('detail.coming_soon'), duration: 4000 });
      });
    }

    const footer = document.getElementById(tableName + '-pagination');
    if (footer) {
      const rowsSelect = footer.querySelector('.pagination-rows-select');
      const prevBtn = footer.querySelector('.pagination-prev');
      const nextBtn = footer.querySelector('.pagination-next');
      if (rowsSelect) {
        rowsSelect.addEventListener('change', function() {
          table.pagination.rowsPerPage = parseInt(this.value, 10);
          table.pagination.currentPage = 1;
          table.render();
        });
      }
      if (prevBtn) {
        prevBtn.addEventListener('click', function() {
          if (table.pagination.currentPage > 1) { table.pagination.currentPage--; table.render(); }
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener('click', function() {
          const totalPages = Math.ceil(table.filteredData.length / table.pagination.rowsPerPage);
          if (table.pagination.currentPage < totalPages) { table.pagination.currentPage++; table.render(); }
        });
      }
    }
  };

  return table;
}

// ===== TABLE DEFINITIONS =====

function badge(className, value) {
  return '<span class="badge status-badge ' + className + '">' + escapeHtml(value || '—') + '</span>';
}

export const entityTables = {
  measurements: createEntityTable({
    tableId: 'measurements-table',
    tbodyId: 'measurements-tbody',
    checkboxClass: 'measurement-checkbox',
    selectAllId: 'select-all-measurements',
    actionClass: 'measurements-action',
    filterId: 'measurements-filter',
    addBtnId: 'btn-add-measurement',
    defaultSort: 'id',
    dataSource: function() { return state.allAreaMeasurements; },
    transform: function(m) {
      return {
        id: m.areaMeasurementId,
        areaType: m.type,
        value: m.value,
        unit: m.unit,
        source: (m.extensionData && m.extensionData.source) || 'Manuell',
        accuracy: m.accuracy,
        standard: m.standard,
        validFrom: m.validFrom,
        validUntil: m.validUntil || '—'
      };
    },
    columns: [
      { key: 'id', className: 'col-id' },
      { key: 'areaType', className: 'col-type' },
      { key: 'value', className: 'col-area', render: function(m) { return formatNum(m.value, 0) + ' ' + escapeHtml(m.unit); } },
      { key: 'source', className: 'col-source' },
      { key: 'accuracy', className: 'col-accuracy' },
      { key: 'standard', className: 'col-standard' },
      { key: 'validFrom', className: 'col-from' },
      { key: 'validUntil', className: 'col-until' }
    ],
    searchFields: ['id', 'areaType', 'accuracy', 'standard', 'unit', 'value']
  }),

  documents: createEntityTable({
    tableId: 'documents-table',
    tbodyId: 'documents-tbody',
    checkboxClass: 'document-checkbox',
    selectAllId: 'select-all-documents',
    actionClass: 'documents-action',
    filterId: 'documents-filter',
    addBtnId: 'btn-add-document',
    defaultSort: 'id',
    dataSource: function() { return state.allDocuments; },
    transform: function(d) {
      return {
        id: d.documentId,
        titel: d.name,
        dokumentTyp: d.type,
        dateiformat: d.fileFormat,
        datum: d.validFrom,
        dateigroesse: d.fileSize,
        url: d.url || '#'
      };
    },
    columns: [
      { key: 'id', className: 'col-id' },
      { key: 'titel', className: 'col-title' },
      { key: 'dokumentTyp', className: 'col-type' },
      { key: 'dateiformat', className: 'col-format' },
      { key: 'datum', className: 'col-date' },
      { key: 'dateigroesse', className: 'col-size' }
    ],
    searchFields: ['id', 'titel', 'dokumentTyp', 'dateiformat', 'datum', 'dateigroesse']
  }),

  contacts: createEntityTable({
    tableId: 'contacts-table',
    tbodyId: 'contacts-tbody',
    checkboxClass: 'contact-checkbox',
    selectAllId: 'select-all-contacts',
    actionClass: 'contacts-action',
    filterId: 'contacts-filter',
    addBtnId: 'btn-add-contact',
    defaultSort: 'name',
    dataSource: function() { return state.allContacts; },
    transform: function(contact) {
      return {
        id: contact.contactId,
        name: contact.name,
        rolle: contact.role,
        organisation: contact.organisation,
        telefon: contact.phone,
        email: contact.email
      };
    },
    columns: [
      { key: 'id', className: 'col-contact-id' },
      { key: 'name', className: 'col-contact-name' },
      { key: 'rolle', className: 'col-contact-role' },
      { key: 'organisation', className: 'col-contact-org' },
      { key: 'telefon', className: 'col-contact-phone', render: function(c) {
        return c.telefon ? '<a href="tel:' + escapeHtml(c.telefon) + '">' + escapeHtml(c.telefon) + '</a>' : '—';
      } },
      { key: 'email', className: 'col-contact-email', render: function(c) {
        return c.email ? '<a href="mailto:' + escapeHtml(c.email) + '">' + escapeHtml(c.email) + '</a>' : '—';
      } }
    ],
    searchFields: ['id', 'name', 'rolle', 'organisation', 'telefon', 'email']
  }),

  costs: createEntityTable({
    tableId: 'costs-table',
    tbodyId: 'costs-tbody',
    checkboxClass: 'cost-checkbox',
    selectAllId: 'select-all-costs',
    actionClass: 'costs-action',
    filterId: 'costs-filter',
    addBtnId: 'btn-add-cost',
    defaultSort: 'kostengruppe',
    dataSource: function() { return state.allCosts; },
    transform: function(cost) {
      return {
        id: cost.costId,
        kostengruppe: cost.costGroup,
        kostenart: cost.costType,
        betrag: cost.amount,
        einheit: cost.unit,
        stichtag: cost.referenceDate
      };
    },
    columns: [
      { key: 'id', className: 'col-cost-id' },
      { key: 'kostengruppe', className: 'col-cost-group' },
      { key: 'kostenart', className: 'col-cost-type' },
      { key: 'betrag', className: 'col-cost-amount', render: function(c) { return formatCurrencyWithUnit(c.betrag, c.einheit); } },
      { key: 'einheit', className: 'col-cost-unit' },
      { key: 'stichtag', className: 'col-cost-date' }
    ],
    searchFields: ['id', 'kostengruppe', 'kostenart', 'betrag', 'einheit', 'stichtag']
  }),

  contracts: createEntityTable({
    tableId: 'contracts-table',
    tbodyId: 'contracts-tbody',
    checkboxClass: 'contract-checkbox',
    selectAllId: 'select-all-contracts',
    actionClass: 'contracts-action',
    filterId: 'contracts-filter',
    addBtnId: 'btn-add-contract',
    defaultSort: 'vertragsart',
    dataSource: function() { return state.allContracts; },
    transform: function(contract) {
      return {
        id: contract.contractId,
        vertragsart: contract.type,
        vertragspartner: contract.contractPartner,
        vertragsbeginn: contract.validFrom,
        vertragsende: contract.validUntil,
        betrag: contract.amount,
        status: contract.status
      };
    },
    columns: [
      { key: 'id', className: 'col-contract-id' },
      { key: 'vertragsart', className: 'col-contract-type' },
      { key: 'vertragspartner', className: 'col-contract-partner' },
      { key: 'vertragsbeginn', className: 'col-contract-start' },
      { key: 'vertragsende', className: 'col-contract-end', render: function(c) { return escapeHtml(c.vertragsende || 'unbefristet'); } },
      { key: 'betrag', className: 'col-contract-amount', render: function(c) { return formatCurrency(c.betrag); } },
      { key: 'status', className: 'col-contract-status', render: function(c) { return badge(getContractStatusClassName(c.status), c.status); } }
    ],
    searchFields: ['id', 'vertragsart', 'vertragspartner', 'vertragsbeginn', 'vertragsende', 'betrag', 'status']
  }),

  assets: createEntityTable({
    tableId: 'assets-table',
    tbodyId: 'assets-tbody',
    checkboxClass: 'asset-checkbox',
    selectAllId: 'select-all-assets',
    actionClass: 'assets-action',
    filterId: 'assets-filter',
    addBtnId: 'btn-add-asset',
    defaultSort: 'bezeichnung',
    dataSource: function() { return state.allAssets; },
    transform: function(asset) {
      return {
        id: asset.assetId,
        bezeichnung: asset.name,
        kategorie: asset.category,
        hersteller: asset.manufacturer,
        baujahr: asset.installationYear,
        standort: asset.location
      };
    },
    columns: [
      { key: 'id', className: 'col-asset-id' },
      { key: 'bezeichnung', className: 'col-asset-name' },
      { key: 'kategorie', className: 'col-asset-category', render: function(a) { return '<span class="badge kategorie-badge">' + escapeHtml(a.kategorie || '—') + '</span>'; } },
      { key: 'hersteller', className: 'col-asset-manufacturer' },
      { key: 'baujahr', className: 'col-asset-year' },
      { key: 'standort', className: 'col-asset-location' }
    ],
    searchFields: ['id', 'bezeichnung', 'kategorie', 'hersteller', 'baujahr', 'standort']
  })
};

// Detail tab name -> table
export const entityTabs = {
  measurements: 'measurements',
  documents: 'documents',
  contacts: 'contacts',
  costs: 'costs',
  contracts: 'contracts',
  assets: 'assets'
};

export function initEntityTables() {
  Object.keys(entityTables).forEach(function(name) { entityTables[name].init(); });
}

export function loadEntityTablesForBuilding(building) {
  Object.keys(entityTables).forEach(function(name) { entityTables[name].load(building); });
}

// Render the table of a detail tab (no-op for tabs without a table)
export function renderEntityTable(tab) {
  const name = entityTabs[tab];
  if (name) entityTables[name].render();
}
