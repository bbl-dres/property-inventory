// Share (URL and copy panel), the export panel (GeoJSON, CSV, KML, Shapefile-ready GeoJSON)
// and the quick export of the table toolbar.

import { state } from './state.js';
import { escapeXml, downloadBlob, extractYear, formatNum } from './utils.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';
import { getCurrentBasemapUrlValue } from './basemaps.js';
import { closeAllDropdowns } from './table.js';
import { statusColors } from './config.js';

// ===== SHARE URL =====

// Current URL plus basemap, map position and the selected object (building or parcel)
export function getShareUrl() {
  const baseUrl = window.location.origin + window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  params.set('basemap', getCurrentBasemapUrlValue());

  if (state.map) {
    const center = state.map.getCenter();
    params.set('lng', center.lng.toFixed(5));
    params.set('lat', center.lat.toFixed(5));
    params.set('zoom', state.map.getZoom().toFixed(2));
  }

  params.delete('id');
  params.delete('parcelId');
  if (state.selectedBuildingId) {
    params.set('id', state.selectedBuildingId);
  } else if (state.selectedParcelId) {
    params.set('parcelId', state.selectedParcelId);
  }

  return baseUrl + '?' + params.toString();
}

// ===== SHARE PANEL ("Teilen" accordion) =====

export function updateShareLink() {
  const input = document.getElementById('share-link-input');
  if (input) input.value = getShareUrl();
}

export const shareActions = { copyShareLink };

function flashCopied(button) {
  if (!button) return;
  button.textContent = t('accordion.share.copied');
  button.classList.add('copied');
  setTimeout(function() {
    button.textContent = t('accordion.share.copy');
    button.classList.remove('copied');
  }, 2000);
}

export function copyShareLink() {
  const input = document.getElementById('share-link-input');
  const button = document.querySelector('.share-copy-btn');
  if (!input) return;
  input.value = getShareUrl();
  if (navigator.clipboard) {
    navigator.clipboard.writeText(input.value)
      .then(function() { flashCopied(button); })
      .catch(function() {
        showToast({ type: 'error', title: t('error.copy.title'), message: t('error.copy.message'), duration: 3000 });
      });
  } else {
    // Older browsers
    input.select();
    document.execCommand('copy');
    flashCopied(button);
  }
}

// ===== EXPORT DATA =====

// Flat attribute accessors used by the CSV export
const CSV_COLUMNS = [
  { key: 'buildingId', get: function(p) { return p.buildingId; } },
  { key: 'name', get: function(p) { return p.name; } },
  { key: 'address', get: function(p) { return p.streetName; } },
  { key: 'postalCode', get: function(p) { return p.postalCode; } },
  { key: 'city', get: function(p) { return p.city; } },
  { key: 'country', get: function(p) { return p.country; } },
  { key: 'region', get: function(p) { return p.stateProvincePrefecture; } },
  { key: 'status', get: function(p) { return p.status; } },
  { key: 'netFloorArea', get: function(p) { return (p.extensionData || {}).netFloorArea; } },
  { key: 'typeOfOwnership', get: function(p) { return p.typeOfOwnership; } },
  { key: 'portfolio', get: function(p) { return (p.extensionData || {}).portfolio; } },
  { key: 'portfolioGroup', get: function(p) { return (p.extensionData || {}).portfolioGroup; } },
  { key: 'primaryTypeOfBuilding', get: function(p) { return p.primaryTypeOfBuilding; } },
  { key: 'secondaryTypeOfBuilding', get: function(p) { return p.secondaryTypeOfBuilding; } },
  { key: 'energyClass', get: function(p) { return p.energyEfficiencyClass; } },
  { key: 'constructionYear', get: function(p) { return extractYear(p.constructionYear); } },
  { key: 'yearOfLastRefurbishment', get: function(p) { return extractYear(p.yearOfLastRefurbishment); } },
  { key: 'parkingSpaces', get: function(p) { return p.parkingSpaces; } },
  { key: 'evChargingStations', get: function(p) { return p.electricVehicleChargingStations; } },
  { key: 'monumentProtection', get: function(p) { return p.monumentProtection; } }
];
const CSV_BASIC_KEYS = ['buildingId', 'name', 'address', 'city', 'country', 'status', 'energyClass', 'netFloorArea'];

function csvCell(value) {
  if (value === null || value === undefined) return '';
  let str = String(value);
  if (str.indexOf(';') !== -1 || str.indexOf('"') !== -1 || str.indexOf('\n') !== -1) {
    str = '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Semicolon-separated CSV with BOM (opens correctly in Excel with German locale settings)
export function featuresToCsv(features, columns, includeCoords) {
  const header = columns.map(function(c) { return c.key; });
  if (includeCoords) header.push('longitude', 'latitude');
  let csv = header.join(';') + '\n';
  features.forEach(function(feature) {
    const props = feature.properties || {};
    const row = columns.map(function(c) { return csvCell(c.get(props)); });
    if (includeCoords) {
      const coords = feature.geometry && feature.geometry.coordinates;
      row.push(coords ? coords[0] : '', coords ? coords[1] : '');
    }
    csv += row.join(';') + '\n';
  });
  return csv;
}

function downloadCsv(features, columns, includeCoords, filename) {
  const blob = new Blob(['﻿' + featuresToCsv(features, columns, includeCoords)], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, filename);
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/geo+json' });
  downloadBlob(blob, filename);
}

function stripGeometry(features, includeCoords) {
  return features.map(function(feature) {
    const copy = JSON.parse(JSON.stringify(feature));
    if (!includeCoords) delete copy.geometry;
    return copy;
  });
}

function exportGeoJSON(features, options) {
  let exported = stripGeometry(features, options.includeCoords);
  if (options.includeParcels && state.parcelData && state.parcelData.features) {
    exported = exported.concat(stripGeometry(state.parcelData.features, true));
  }
  downloadJson({ type: 'FeatureCollection', features: exported }, 'bbl-portfolio-export.geojson');
}

function exportCSV(features, options) {
  const columns = options.allFields ? CSV_COLUMNS : CSV_COLUMNS.filter(function(c) { return CSV_BASIC_KEYS.indexOf(c.key) !== -1; });
  downloadCsv(features, columns, options.includeCoords, 'bbl-portfolio-export.csv');
}

// KML colours are aabbggrr
function kmlColor(hex) {
  const h = hex.replace('#', '');
  return 'ff' + h.substring(4, 6) + h.substring(2, 4) + h.substring(0, 2);
}

function exportKML(features, options) {
  let kml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  kml += '<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n';
  kml += '    <name>BBL Immobilienportfolio</name>\n';
  kml += '    <description>Export vom ' + new Date().toLocaleDateString('de-CH') + '</description>\n';

  Object.keys(statusColors).forEach(function(status) {
    kml += '    <Style id="style-' + status.replace(/\s/g, '-') + '">\n      <IconStyle>\n';
    kml += '        <color>' + kmlColor(statusColors[status]) + '</color>\n        <scale>1.0</scale>\n';
    kml += '        <Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-circle.png</href></Icon>\n';
    kml += '      </IconStyle>\n    </Style>\n';
  });

  features.forEach(function(feature) {
    const props = feature.properties || {};
    const ext = props.extensionData || {};
    const coords = feature.geometry && feature.geometry.coordinates ? feature.geometry.coordinates : [0, 0];
    const status = props.status || 'In Betrieb';
    kml += '    <Placemark>\n';
    kml += '      <name>' + escapeXml(props.name || 'Unbekannt') + '</name>\n';
    kml += '      <description><![CDATA[\n';
    kml += '        <b>Adresse:</b> ' + escapeXml(props.streetName || '') + '<br>\n';
    kml += '        <b>Stadt:</b> ' + escapeXml(props.city || '') + '<br>\n';
    kml += '        <b>Status:</b> ' + escapeXml(status) + '<br>\n';
    kml += '        <b>Energieklasse:</b> ' + escapeXml(props.energyEfficiencyClass || '-') + '<br>\n';
    kml += '        <b>Fläche NGF:</b> ' + (ext.netFloorArea ? formatNum(ext.netFloorArea, 0) + ' m²' : '-') + '\n';
    kml += '      ]]></description>\n';
    kml += '      <styleUrl>#style-' + status.replace(/\s/g, '-') + '</styleUrl>\n';
    if (options.includeCoords) {
      kml += '      <Point>\n        <coordinates>' + coords[0] + ',' + coords[1] + ',0</coordinates>\n      </Point>\n';
    }
    kml += '    </Placemark>\n';
  });

  kml += '  </Document>\n</kml>';
  downloadBlob(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }), 'bbl-portfolio-export.kml');
}

// Shapefile needs a converter (QGIS, ogr2ogr): a GeoJSON with shapefile-compatible field names is produced
function exportShapefile(features, options) {
  showToast({ type: 'info', title: 'Shapefile-Export', message: 'GeoJSON wird erstellt. Konvertieren Sie mit QGIS oder ogr2ogr zu Shapefile.' });
  const exported = features.map(function(feature) {
    const props = feature.properties || {};
    const ext = props.extensionData || {};
    const copy = { type: 'Feature', properties: {
      bldg_id: props.buildingId,
      name: (props.name || '').substring(0, 254),
      address: (props.streetName || '').substring(0, 254),
      city: (props.city || '').substring(0, 80),
      country: (props.country || '').substring(0, 80),
      status: (props.status || '').substring(0, 50),
      energy_cls: props.energyEfficiencyClass,
      area_m2: ext.netFloorArea,
      built_year: extractYear(props.constructionYear),
      portfolio: (ext.portfolio || '').substring(0, 80)
    } };
    if (options.includeCoords) copy.geometry = feature.geometry;
    return copy;
  });
  downloadJson({
    type: 'FeatureCollection',
    name: 'bbl_portfolio',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
    features: exported
  }, 'bbl-portfolio-for-shapefile.geojson');
}

const exporters = { geojson: exportGeoJSON, csv: exportCSV, kml: exportKML, shapefile: exportShapefile };

// ===== EXPORT PANEL ("Export" accordion) =====

let selectedExportFormat = 'geojson';

function checked(id, fallback) {
  const el = document.getElementById(id);
  return el ? el.checked : fallback;
}

function panelOptions() {
  return {
    includeCoords: checked('export-coords', true),
    allFields: checked('export-all-fields', true),
    includeParcels: checked('export-parcels', false)
  };
}

// Features of the selected scope (filtered view, everything, or the selected building)
export function getExportData() {
  const selectionEl = document.getElementById('export-data-selection');
  const selection = selectionEl ? selectionEl.value : 'filtered';
  if (selection === 'all') return state.buildingsData ? state.buildingsData.features : [];
  if (selection === 'selected') {
    const building = state.selectedBuildingId ? state.buildingIndex.get(state.selectedBuildingId) : null;
    return building ? [building] : [];
  }
  return state.filteredData ? state.filteredData.features : [];
}

export function updateExportCount() {
  const countEl = document.getElementById('export-count');
  if (!countEl) return;
  const count = getExportData().length;
  countEl.textContent = t('export.count', { count: count, plural: count !== 1 ? 'e' : '' });
}

export function performExport() {
  const features = getExportData();
  if (features.length === 0) {
    showToast({ type: 'error', message: t('error.export.nodata') });
    return;
  }
  const btn = document.getElementById('export-btn');
  const originalHTML = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = '<span class="spinner inline-spinner" aria-hidden="true"></span><span>' + t('export.exporting') + '</span>';
    btn.disabled = true;
  }
  setTimeout(function() {
    try {
      const exporter = exporters[selectedExportFormat] || exporters.geojson;
      exporter(features, panelOptions());
      showToast({ type: 'success', message: t('success.export.done') });
    } catch (e) {
      console.error('[export] error:', e);
      showToast({ type: 'error', message: t('error.export', { message: e.message }) });
    }
    if (btn) {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }
  }, 300);
}

export function initExportPanel() {
  document.querySelectorAll('.export-format-card').forEach(function(card) {
    card.addEventListener('click', function() {
      document.querySelectorAll('.export-format-card').forEach(function(c) { c.classList.remove('active'); });
      this.classList.add('active');
      selectedExportFormat = this.getAttribute('data-format');
    });
  });
  const dataSelection = document.getElementById('export-data-selection');
  if (dataSelection) dataSelection.addEventListener('change', updateExportCount);
  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) exportBtn.addEventListener('click', performExport);
  updateExportCount();
}

// ===== QUICK EXPORT (table toolbar) =====

// format: 'csv' | 'excel' (CSV tuned for Excel) | 'geojson'; scope: 'all' | 'filtered'
export function quickExport(format, scope) {
  const source = scope === 'all' ? state.buildingsData : state.filteredData;
  const features = source ? source.features : [];

  if (features.length === 0) {
    showToast({ type: 'error', message: t('error.export.nodata') });
    return;
  }

  try {
    if (format === 'csv' || format === 'excel') {
      downloadCsv(features, CSV_COLUMNS, true, 'bbl-portfolio-export.csv');
    } else if (format === 'geojson') {
      downloadJson({ type: 'FeatureCollection', features: features }, 'bbl-portfolio-export.geojson');
    }
    showToast({ type: 'success', message: t('success.export', { count: features.length }) });
  } catch (e) {
    console.error('[export] error:', e);
    showToast({ type: 'error', message: t('error.export', { message: e.message }) });
  }
  closeAllDropdowns();
}

// "Gefiltert exportieren" header of the export dropdown shows the filtered count
export function updateFilteredExportHeader() {
  const header = document.getElementById('export-filtered-header');
  if (!header) return;
  const filtered = state.filteredData ? state.filteredData.features.length : 0;
  const total = state.buildingsData ? state.buildingsData.features.length : 0;
  header.textContent = filtered === total ? t('export.filtered') : t('export.filtered.count', { count: filtered });
}

export function initQuickExportMenu() {
  document.querySelectorAll('#export-dropdown-menu .dropdown-menu-item[data-export-format]').forEach(function(item) {
    item.addEventListener('click', function() {
      quickExport(this.dataset.exportFormat, this.dataset.exportScope || 'filtered');
    });
  });
  updateFilteredExportHeader();
}
