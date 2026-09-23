// Share URL and the quick export of the table toolbar (CSV, GeoJSON).

import { state } from './state.js';
import { downloadBlob, extractYear } from './utils.js';
import { t, onLangChange } from './i18n.js';
import { showToast } from './toast.js';
import { getCurrentBasemapUrlValue } from './basemaps.js';
import { closeAllDropdowns } from './table.js';

// ===== SHARE URL =====

// Current URL plus basemap, map position and the selected object (building, parcel or land cover)
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
  params.delete('landCoverId');
  if (state.selectedBuildingId) {
    params.set('id', state.selectedBuildingId);
  } else if (state.selectedParcelId) {
    params.set('parcelId', state.selectedParcelId);
  } else if (state.selectedLandCoverId != null) {
    params.set('landCoverId', state.selectedLandCoverId);
  }

  return baseUrl + '?' + params.toString();
}

// ===== QUICK EXPORT (table toolbar) =====

// Flat attribute accessors of the CSV export
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
  onLangChange(updateFilteredExportHeader);
}
