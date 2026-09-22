// Configuration: status colours, filter categories, placeholder images, internal layer metadata.
// Basemaps live in basemaps.js (identical in every prototype).

import { t } from './i18n.js';

// ===== STATUS =====

import { statusLegendItems } from './reference-data.js';
export { statusColors, getStatusClassName, statusLegendItems } from './reference-data.js';

// ===== FILTERS =====

// Filter categories: key -> feature property. Labels come from the col.* translations of the property.
export const filterConfig = {
  status: { property: 'bbl_stat' },
  eigentum: { property: 'bbl_eigen' },
  strategie: { property: 'bbl_ostr' },
  mietmodell: { property: 'bbl_mietm' },
  teilportfolio: { property: 'bbl_port' },
  portfoliogruppe: { property: 'bbl_port2' },
  gebaeudeart: { property: 'bbl_gbda1' },
  land: { property: 'adr_land' },
  region: { property: 'adr_reg' },
  ort: { property: 'adr_ort' },
  gemeinde: { property: 'bfs_gem' },
  kgskat: { property: 'kgs_kat' }
};

export function filterLabel(filterKey) {
  return filterConfig[filterKey] ? t('col.' + filterConfig[filterKey].property) : filterKey;
}

// ===== IMAGES =====

export const placeholderImages = ['../assets/portfolio/no-photo.svg'];

// ===== MAP LAYERS =====

export const parcelColor = '#1976d2';
export const landCoverOutlineColor = '#689F38';
export const landCoverColors = {
  'Gebaeude': '#8BC34A',
  'befestigt': '#9E9E9E',
  'humusiert': '#66BB6A',
  'Gewaesser': '#42A5F5'
};

// Map layer ids of each internal dataset (shown/hidden together by the "Interne Karten" toggles)
export const internalLayerIds = {
  buildings: ['buildings-clusters', 'buildings-cluster-count', 'buildings-points', 'buildings-selected', 'buildings-selected-pulse', 'buildings-labels', 'buildings-label-obstacles'],
  landcovers: ['landcovers-fill', 'landcovers-outline', 'landcovers-highlight', 'landcovers-selected', 'landcovers-selected-outline'],
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
  },
  landcovers: {
    title: 'Bodenabdeckung (Bundesamt für Bauten und Logistik BBL)',
    description: 'Gebäudefussabdrücke und Bodenabdeckungsflächen aus der amtlichen Vermessung der Schweiz. Verknüpft mit Gebäuden und Grundstücken über EGID/EGRID.',
    source: 'BBL / Amtliche Vermessung',
    geometryType: 'Polygon',
    format: 'GeoJSON',
    legendHtml: function() {
      return legendHtml(Object.keys(landCoverColors).map(function(type) {
        return { swatch: rect(rgba(landCoverColors[type], 0.25), landCoverColors[type]), label: type };
      }));
    }
  }
};
