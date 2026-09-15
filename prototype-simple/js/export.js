// Share URL and the quick export of the table toolbar (CSV, GeoJSON).

import { state } from './state.js';
import { downloadBlob } from './utils.js';
import { t } from './i18n.js';
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

const QUICK_EXPORT_COLUMNS = ['bbl_id', 'bbl_bez', 'bbl_stat', 'bbl_eigen', 'bbl_port',
  'adr_land', 'adr_ort', 'adr_conct', 'garea_ngf', 'wgs84_lat', 'wgs84_lon'];

// Semicolon-separated CSV with BOM (opens correctly in Excel with German locale settings)
export function featuresToCsv(features, columns) {
  let csv = columns.join(';') + '\n';
  features.forEach(function(feature) {
    const props = feature.properties || {};
    const coords = feature.geometry && feature.geometry.coordinates;
    const row = columns.map(function(col) {
      if (col === 'wgs84_lat' && coords) return coords[1];
      if (col === 'wgs84_lon' && coords) return coords[0];
      const value = props[col];
      if (value === null || value === undefined) return '';
      let str = String(value);
      if (str.indexOf(';') !== -1 || str.indexOf('"') !== -1 || str.indexOf('\n') !== -1) {
        str = '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    });
    csv += row.join(';') + '\n';
  });
  return csv;
}

export function downloadCsv(features, columns, filename) {
  const blob = new Blob(['﻿' + featuresToCsv(features, columns)], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, filename);
}

export function downloadGeoJson(features, filename) {
  const collection = { type: 'FeatureCollection', features: features };
  const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/geo+json' });
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
      downloadCsv(features, QUICK_EXPORT_COLUMNS, 'bbl-portfolio-export.csv');
    } else if (format === 'geojson') {
      downloadGeoJson(features, 'bbl-portfolio-export.geojson');
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
