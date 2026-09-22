// Schema adapters for the reusable data table; IDs remain internal row keys.
import { state } from './state.js';
import { escapeHtml, formatNum, formatCurrency, formatCurrencyWithUnit, formatDate, getContractStatusClassName } from './utils.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';
import { createDataTable } from './data-table.js';
import { openDocumentPreview, documentTitleLink } from './document-preview.js';

function createEntityTable(config) {
  let records = [];
  let currentBuilding = null;
  const name = config.tableId.replace('-table', '');
  const table = createDataTable({
    tbodyId: config.tbodyId, columns: config.columns, defaultSort: config.defaultSort,
    getRows: function() { return records; }, getRowId: function(row) { return row.id; },
    onRowSelect: config.preview ? function(id) {
      const rows = table.getRows();
      const row = rows.find(record => record.id === id);
      if (!row) return;
      Array.from(document.getElementById(config.tbodyId).rows).find(el => el.dataset.id === id)?.focus();
      config.preview(row, rows, currentBuilding);
    } : undefined,
    searchText: function(row) { return config.searchFields.map(function(key) { return row[key] ?? ''; }).join(' '); },
    filterId: config.filterId,
    selection: { checkboxClass: config.checkboxClass, selectAllId: config.selectAllId, actionClass: config.actionClass },
    pagination: { infoId: name + '-page-info', prevId: name + '-prev', nextId: name + '-next', rowsSelectId: name + '-page-size', pageOnly: true, emptyKey: 'pagination.entries.empty' }
  });
  return {
    render: table.render,
    load: function(building) {
      currentBuilding = building;
      const id = building && building.properties.buildingId;
      records = id ? config.dataSource().filter(function(row) { return row.buildingIds && row.buildingIds.includes(id); }).map(config.transform) : [];
      table.reset();
    },
    init: function() {
      table.init();
      if (config.preview) {
        document.getElementById(config.tbodyId).addEventListener('click', function(event) {
          const trigger = event.target.closest('[data-preview-document]');
          if (!trigger || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          const rows = table.getRows();
          const row = rows.find(function(record) { return record.id === trigger.dataset.previewDocument; });
          if (row) config.preview(row, rows, currentBuilding);
        });
        document.getElementById(config.previewBtnId).addEventListener('click', function() {
          const selected = table.getSelectedRows();
          if (selected.length) config.preview(selected[0], table.getRows(), currentBuilding);
        });
      }
      const add = document.getElementById(config.addBtnId);
      if (add) add.addEventListener('click', function() { showToast({ type: 'info', message: t('detail.coming_soon'), duration: 4000 }); });
    }
  };
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
    defaultSort: 'areaType',
    dataSource: function() { return state.allAreaMeasurements; },
    transform: function(m) {
      return {
        id: m.areaMeasurementId,
        areaType: m.type,
        value: m.value,
        unit: m.unit,
        source: (m.extensionData && m.extensionData.source) || '',
        accuracy: m.accuracy,
        standard: [m.standard, m.extensionData?.standardDetail].filter(Boolean).join(' · '),
        validFrom: m.validFrom,
        validUntil: m.validUntil || '—'
      };
    },
    columns: [
      { key: 'areaType', className: 'col-type', labelKey: 'field.measurementType', width: 'name' },
      { key: 'value', className: 'col-area', labelKey: 'field.value', width: 'number', render: function(m) { return formatNum(m.value, 0) + ' ' + escapeHtml(m.unit); } },
      { key: 'source', className: 'col-source', labelKey: 'field.source', width: 'text', render: function(m) { return escapeHtml(m.source || t('field.manual')); } },
      { key: 'accuracy', className: 'col-accuracy', labelKey: 'detail.label.accuracy', width: 'text' },
      { key: 'standard', className: 'col-standard', labelKey: 'field.standard', width: 'text' },
      { key: 'validFrom', className: 'col-from', labelKey: 'field.validFrom', width: 'date' },
      { key: 'validUntil', className: 'col-until', labelKey: 'field.validUntil', width: 'date' }
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
    previewBtnId: 'btn-preview-document',
    preview: function(row, rows, building) {
      const p = building.properties;
      openDocumentPreview(row.document, rows.map(function(r) { return r.document; }), {
        buildingName: p.name, address: p.streetName,
        measurements: state.allAreaMeasurements.filter(function(m) { return m.buildingIds.includes(p.buildingId); }),
        costs: state.allCosts.filter(function(c) { return c.buildingIds.includes(p.buildingId); })
      });
    },
    defaultSort: 'titel',
    dataSource: function() { return state.allDocuments; },
    transform: function(d) {
      return {
        id: d.documentId,
        document: d,
        titel: d.name,
        dokumentTyp: (d.documentTypeCode ? d.documentTypeCode + ' · ' : '') + d.type,
        dateiformat: d.fileFormat,
        datum: d.validFrom,
        dateigroesse: d.fileSize,
        url: d.url,
        availability: (d.extensionData || {}).availability
      };
    },
    columns: [
      { key: 'titel', className: 'col-title', labelKey: 'field.title', width: 'title', render: function(d) {
        return documentTitleLink(d.document);
      } },
      { key: 'dokumentTyp', className: 'col-type', labelKey: 'col.lc.av_type', width: 'text' },
      { key: 'dateiformat', className: 'col-format', labelKey: 'field.format', width: 'code' },
      { key: 'datum', className: 'col-date', labelKey: 'field.date', width: 'date' },
      { key: 'dateigroesse', className: 'col-size', labelKey: 'field.size', width: 'number' }
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
      { key: 'name', className: 'col-contact-name', labelKey: 'info.label.name', width: 'name' },
      { key: 'rolle', className: 'col-contact-role', labelKey: 'field.role', width: 'text' },
      { key: 'organisation', className: 'col-contact-org', labelKey: 'field.organisation', width: 'name' },
      { key: 'telefon', className: 'col-contact-phone', labelKey: 'field.phone', width: 'phone', render: function(c) {
        return c.telefon ? '<a href="tel:' + escapeHtml(c.telefon) + '">' + escapeHtml(c.telefon) + '</a>' : '—';
      } },
      { key: 'email', className: 'col-contact-email', labelKey: 'field.email', width: 'email', render: function(c) {
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
        kostengruppe: [cost.extensionData && cost.extensionData.classification, cost.costGroup].filter(Boolean).join(' '),
        kostenart: cost.costType,
        betrag: cost.amount,
        einheit: cost.unit,
        stichtag: cost.referenceDate
      };
    },
    columns: [
      { key: 'kostengruppe', className: 'col-cost-group', labelKey: 'field.costGroup', width: 'code' },
      { key: 'kostenart', className: 'col-cost-type', labelKey: 'field.costType', width: 'name' },
      { key: 'betrag', className: 'col-cost-amount', labelKey: 'field.amount', width: 'amount', render: function(c) { return formatCurrencyWithUnit(c.betrag, c.einheit); } },
      { key: 'einheit', className: 'col-cost-unit', labelKey: 'field.unit', width: 'code' },
      { key: 'stichtag', className: 'col-cost-date', labelKey: 'field.referenceDate', width: 'date' }
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
      { key: 'vertragsart', className: 'col-contract-type', labelKey: 'field.contractType', width: 'name' },
      { key: 'vertragspartner', className: 'col-contract-partner', labelKey: 'field.contractPartner', width: 'description' },
      { key: 'vertragsbeginn', className: 'col-contract-start', labelKey: 'field.start', width: 'date' },
      { key: 'vertragsende', className: 'col-contract-end', labelKey: 'field.end', width: 'date', render: function(c) { return escapeHtml(formatDate(c.vertragsende) || t('field.indefinite')); } },
      { key: 'betrag', className: 'col-contract-amount', labelKey: 'field.annualAmount', width: 'amount', render: function(c) { return formatCurrency(c.betrag); } },
      { key: 'status', className: 'col-contract-status', labelKey: 'field.status', width: 'status', render: function(c) { return badge(getContractStatusClassName(c.status), c.status); } }
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
      { key: 'bezeichnung', className: 'col-asset-name', labelKey: 'col.parcel.name', width: 'description' },
      { key: 'kategorie', className: 'col-asset-category', labelKey: 'field.category', width: 'code', render: function(a) { return '<span class="badge kategorie-badge">' + escapeHtml(a.kategorie || '—') + '</span>'; } },
      { key: 'hersteller', className: 'col-asset-manufacturer', labelKey: 'field.manufacturer', width: 'name' },
      { key: 'baujahr', className: 'col-asset-year', labelKey: 'col.bbl_bjahr', width: 'year' },
      { key: 'standort', className: 'col-asset-location', labelKey: 'detail.section.location', width: 'text' }
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
