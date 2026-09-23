// Configuration: status colours, filter categories, placeholder images, internal layer metadata.
// Basemaps live in basemaps.js (identical in every prototype).

import { t, tf } from './i18n.js';

// ===== STATUS =====

import { statusLegendItems } from './reference-data.js';
export { statusColors, getStatusClassName, statusLegendItems } from './reference-data.js';

// ===== FILTERS =====

// Filter categories: key -> feature property (dot paths reach into extensionData)
export const filterConfig = {
  status: { property: 'status', labelKey: 'col.bbl_stat' },
  eigentum: { property: 'typeOfOwnership', labelKey: 'col.bbl_eigen' },
  teilportfolio: { property: 'extensionData.portfolio', labelKey: 'col.bbl_port' },
  gebaeudeart: { property: 'primaryTypeOfBuilding', labelKey: 'field.buildingType' },
  land: { property: 'country', labelKey: 'col.adr_land' },
  region: { property: 'stateProvincePrefecture', labelKey: 'col.adr_reg' },
  ort: { property: 'city', labelKey: 'col.adr_ort' }
};

export function filterLabel(filterKey) {
  return filterConfig[filterKey] ? t(filterConfig[filterKey].labelKey) : filterKey;
}

// ===== IMAGES =====

export const placeholderImages = ['../assets/portfolio/no-photo.svg'];

// ===== ENTITY DATA (loaded next to the buildings) =====

export const entityDataFiles = {
  allAreaMeasurements: { url: 'data/area-measurements.json', key: 'areaMeasurements' },
  allDocuments: { url: 'data/documents.json', key: 'documents' },
  allContacts: { url: 'data/contacts.json', key: 'contacts' },
  allContracts: { url: 'data/contracts.json', key: 'contracts' },
  allAssets: { url: 'data/assets.json', key: 'assets' },
  allCosts: { url: 'data/costs.json', key: 'costs' }
};

// ===== MAP LAYERS =====

export const parcelColor = '#1976d2';

// Map layer ids of each internal dataset (shown/hidden together by the "Interne Karten" toggles)
export const internalLayerIds = {
  buildings: ['buildings-clusters', 'buildings-cluster-count', 'buildings-points', 'buildings-selected', 'buildings-selected-pulse', 'buildings-labels', 'buildings-label-obstacles'],
  parcels: ['parcels-fill', 'parcels-outline', 'parcels-highlight', 'parcels-selected', 'parcels-selected-outline', 'parcels-labels']
};

function legendHtml(items) {
  return '<div class="legend-footer"><span>' + t('print.legend') + '</span></div>' +
    '<div class="internal-legend">' +
    items.map(function(item) {
      return '<div class="internal-legend-item">' + item.swatch + '<span>' + item.label + '</span></div>';
    }).join('') +
    '</div>';
}

function circle(color) {
  return '<span class="internal-legend-circle" style="background: ' + color + ';"></span>';
}

function rect(fill, stroke) {
  return '<span class="internal-legend-rect" style="background: ' + fill + '; border: 2px solid ' + stroke + ';"></span>';
}

function rgba(hex, alpha) {
  const h = hex.replace('#', '');
  return 'rgba(' + parseInt(h.substring(0, 2), 16) + ', ' + parseInt(h.substring(2, 4), 16) + ', ' + parseInt(h.substring(4, 6), 16) + ', ' + alpha + ')';
}

// Metadata of the internal datasets for the layer info modal ("Interne Karten")
export const internalLayers = {
  buildings: {
    get title() { return t('layer.buildings.title'); },
    get description() { return t('layer.buildings.description'); },
    get source() { return t('layer.buildings.source'); },
    geometryType: 'Point',
    format: 'GeoJSON',
    legendHtml: function() {
      return legendHtml(statusLegendItems().map(function(item) { return { swatch: circle(item.color), label: tf('print.legend.' + String(item.code).toLowerCase(), item.label) }; }));
    }
  },
  parcels: {
    get title() { return t('layer.parcels.title'); },
    get description() { return t('layer.parcels.description'); },
    get source() { return t('layer.parcels.source'); },
    geometryType: 'Polygon',
    format: 'GeoJSON',
    legendHtml: function() {
      return legendHtml([{ swatch: rect(rgba(parcelColor, 0.15), parcelColor), label: t('info.title.parcel') }]);
    }
  }
};
