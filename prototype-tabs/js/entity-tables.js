// Schema adapters for the reusable data table; IDs remain internal row keys.
import { state } from './state.js';
import { escapeHtml, formatNum, formatCurrency, formatCurrencyWithUnit, formatDate, getContractStatusClassName } from './utils.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';
import { createDataTable } from './data-table.js';

function createEntityTable(config) {
  let records = [];
  const name = config.tableId.replace('-table', '');
  const table = createDataTable({
    tbodyId: config.tbodyId, columns: config.columns, defaultSort: config.defaultSort,
    getRows: function() { return records; }, getRowId: function(row) { return row.id; },
    searchText: function(row) { return config.searchFields.map(function(key) { return row[key] ?? ''; }).join(' '); },
    filterId: config.filterId,
    selection: { checkboxClass: config.checkboxClass, selectAllId: config.selectAllId, actionClass: config.actionClass },
    pagination: { infoId: name + '-page-info', prevId: name + '-prev', nextId: name + '-next', rowsSelectId: name + '-page-size', pageOnly: true, emptyKey: 'pagination.entries.empty' }
  });
  return {
    render: table.render,
    load: function(building) {
      const id = building && building.properties.buildingId;
      records = id ? config.dataSource().filter(function(row) { return row.buildingIds && row.buildingIds.includes(id); }).map(config.transform) : [];
      table.reset();
    },
    init: function() {
      table.init();
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
        source: (m.extensionData && m.extensionData.source) || 'Manuell',
        accuracy: m.accuracy,
        standard: m.standard,
        validFrom: m.validFrom,
        validUntil: m.validUntil || '—'
      };
    },
    columns: [
      { key: 'areaType', className: 'col-type', label: "Bemessungsart", width: 'name' },
      { key: 'value', className: 'col-area', label: "Wert", width: 'number', render: function(m) { return formatNum(m.value, 0) + ' ' + escapeHtml(m.unit); } },
      { key: 'source', className: 'col-source', label: "Herkunft", width: 'text' },
      { key: 'accuracy', className: 'col-accuracy', label: "Genauigkeit", width: 'text' },
      { key: 'standard', className: 'col-standard', label: "Standard", width: 'text' },
      { key: 'validFrom', className: 'col-from', label: "Gültig von", width: 'date' },
      { key: 'validUntil', className: 'col-until', label: "Gültig bis", width: 'date' }
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
    defaultSort: 'titel',
    dataSource: function() { return state.allDocuments; },
    transform: function(d) {
      return {
        id: d.documentId,
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
      { key: 'titel', className: 'col-title', label: "Titel", width: 'title', render: function(d) {
        return d.url && /^https:\/\//.test(d.url)
          ? '<a href="' + escapeHtml(d.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(d.titel) + '</a>'
          : escapeHtml(d.titel);
      } },
      { key: 'dokumentTyp', className: 'col-type', label: "Typ", width: 'text' },
      { key: 'dateiformat', className: 'col-format', label: "Format", width: 'code' },
      { key: 'datum', className: 'col-date', label: "Datum", width: 'date' },
      { key: 'dateigroesse', className: 'col-size', label: "Grösse", width: 'number' }
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
      { key: 'name', className: 'col-contact-name', label: "Name", width: 'name' },
      { key: 'rolle', className: 'col-contact-role', label: "Rolle", width: 'text' },
      { key: 'organisation', className: 'col-contact-org', label: "Organisation", width: 'name' },
      { key: 'telefon', className: 'col-contact-phone', label: "Telefon", width: 'phone', render: function(c) {
        return c.telefon ? '<a href="tel:' + escapeHtml(c.telefon) + '">' + escapeHtml(c.telefon) + '</a>' : '—';
      } },
      { key: 'email', className: 'col-contact-email', label: "E-Mail", width: 'email', render: function(c) {
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
      { key: 'kostengruppe', className: 'col-cost-group', label: "Kostengruppe", width: 'code' },
      { key: 'kostenart', className: 'col-cost-type', label: "Kostenart", width: 'name' },
      { key: 'betrag', className: 'col-cost-amount', label: "Betrag", width: 'amount', render: function(c) { return formatCurrencyWithUnit(c.betrag, c.einheit); } },
      { key: 'einheit', className: 'col-cost-unit', label: "Einheit", width: 'code' },
      { key: 'stichtag', className: 'col-cost-date', label: "Stichtag", width: 'date' }
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
      { key: 'vertragsart', className: 'col-contract-type', label: "Vertragsart", width: 'name' },
      { key: 'vertragspartner', className: 'col-contract-partner', label: "Vertragspartner", width: 'description' },
      { key: 'vertragsbeginn', className: 'col-contract-start', label: "Beginn", width: 'date' },
      { key: 'vertragsende', className: 'col-contract-end', label: "Ende", width: 'date', render: function(c) { return escapeHtml(formatDate(c.vertragsende) || 'unbefristet'); } },
      { key: 'betrag', className: 'col-contract-amount', label: "Betrag/Jahr", width: 'amount', render: function(c) { return formatCurrency(c.betrag); } },
      { key: 'status', className: 'col-contract-status', label: "Status", width: 'status', render: function(c) { return badge(getContractStatusClassName(c.status), c.status); } }
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
      { key: 'bezeichnung', className: 'col-asset-name', label: "Bezeichnung", width: 'description' },
      { key: 'kategorie', className: 'col-asset-category', label: "Kategorie", width: 'code', render: function(a) { return '<span class="badge kategorie-badge">' + escapeHtml(a.kategorie || '—') + '</span>'; } },
      { key: 'hersteller', className: 'col-asset-manufacturer', label: "Hersteller", width: 'name' },
      { key: 'baujahr', className: 'col-asset-year', label: "Baujahr", width: 'year' },
      { key: 'standort', className: 'col-asset-location', label: "Standort", width: 'text' }
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
