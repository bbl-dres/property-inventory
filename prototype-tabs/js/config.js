// Configuration: status colours, filter categories, placeholder images, internal layer metadata.
// Basemaps live in basemaps.js (identical in every prototype).

import { t } from './i18n.js';

// ===== STATUS =====

import { statusLegendItems } from './reference-data.js';
export { statusColors, getStatusClassName, statusLegendItems } from './reference-data.js';

// ===== FILTERS =====

// Filter categories: key -> feature property (dot paths reach into extensionData)
export const filterConfig = {
  status: { property: 'status', label: 'Bewirtschaftungsstatus' },
  eigentum: { property: 'typeOfOwnership', label: 'Art Eigentum' },
  teilportfolio: { property: 'extensionData.portfolio', label: 'Teilportfolio' },
  gebaeudeart: { property: 'primaryTypeOfBuilding', label: 'Gebäudeart' },
  land: { property: 'country', label: 'Land' },
  region: { property: 'stateProvincePrefecture', label: 'Region' },
  ort: { property: 'city', label: 'Ort' }
};

export function filterLabel(filterKey) {
  return filterConfig[filterKey] ? filterConfig[filterKey].label : filterKey;
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
    title: 'Gebäude (Bundesamt für Bauten und Logistik BBL)',
    description: 'Interner Datensatz des BBL-Immobilienportfolios. Enthält sämtliche Gebäude mit Standort, Nutzungstyp, Eigentumsverhältnissen, Baujahr und weiteren Attributen.',
    source: 'BBL Immobilienportfolio',
    geometryType: 'Point',
    format: 'GeoJSON',
    legendHtml: function() {
      return legendHtml(statusLegendItems().map(function(item) { return { swatch: circle(item.color), label: item.label }; }));
    }
  },
  parcels: {
    title: 'Grundstücke (Bundesamt für Bauten und Logistik BBL)',
    description: 'Interner Datensatz der BBL-Parzellen. Enthält Grundstücksinformationen mit Flächenangaben, Nutzungszonen und Eigentumsverhältnissen.',
    source: 'BBL Parzellen',
    geometryType: 'Polygon',
    format: 'GeoJSON',
    legendHtml: function() {
      return legendHtml([{ swatch: rect(rgba(parcelColor, 0.15), parcelColor), label: t('info.title.parcel') }]);
    }
  }
};
