// Configuration: status colours, filter categories, placeholder images, internal layer metadata.
// Basemaps live in basemaps.js (identical in every prototype).

import { t, tf, getLang } from './i18n.js';
import { LAND_COVER_GROUPS, LAND_COVER_TYPES, LAND_COVER_OUTLINE, landCoverColor, landCoverGroupLabel, landCoverTypeLabel } from './landcover-types.js';

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
export const landCoverOutlineColor = LAND_COVER_OUTLINE; // fills per type: landcover-types.js (official AV-WMS colours)

// Map layer ids of each internal dataset (shown/hidden together by the "Interne Karten" toggles)
export const internalLayerIds = {
  buildings: ['buildings-clusters', 'buildings-cluster-count', 'buildings-points', 'buildings-selected', 'buildings-selected-pulse', 'buildings-labels', 'buildings-label-obstacles'],
  landcovers: ['landcovers-fill', 'landcovers-outline', 'landcovers-selected', 'landcovers-selected-outline'],
  parcels: ['parcels-fill', 'parcels-outline', 'parcels-selected', 'parcels-selected-outline', 'parcels-labels']
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

// Land cover legend: the 26 official types in their main groups, with the AV-WMS fills (no fill = white swatch)
function landCoverLegendHtml() {
  let html = '<div class="legend-footer"><span>' + t('print.legend') + '</span></div><div class="internal-legend">';
  LAND_COVER_GROUPS.forEach(function(group) {
    html += '<div class="internal-legend-group">' + landCoverGroupLabel(group) + '</div>';
    Object.keys(LAND_COVER_TYPES).forEach(function(type) {
      if (LAND_COVER_TYPES[type] !== group) return;
      html += '<div class="internal-legend-item"><span class="internal-legend-rect" style="background: ' + (landCoverColor(type) || 'transparent') + '; border: 1px solid ' + LAND_COVER_OUTLINE + ';"></span><span>' + landCoverTypeLabel(type) + '</span></div>';
    });
  });
  return html + '</div>';
}

// Links of the layer info modal: the federal geoportal and the subject portal of the cadastral survey
function geoportalUrl(layerId) {
  return 'https://map.geo.admin.ch/#/map?lang=' + getLang() + '&layers=' + layerId;
}

function cadastrePortalUrl() {
  const lang = getLang();
  return 'https://www.cadastre.ch/' + (['de', 'fr', 'it'].indexOf(lang) !== -1 ? lang : 'de');
}
// Metadata of the internal datasets for the layer info modal ("Interne Karten"): title, description,
// source, legend, the four links (metadata, detailed description, download, subject portal) of the
// official layer info of map.geo.admin.ch; the data date comes from the loaded data (app.js).
export const internalLayers = {
  buildings: {
    get title() { return t('layer.buildings.title'); },
    get description() { return t('layer.buildings.description'); },
    get source() { return t('layer.buildings.source'); },
    geometryType: 'Point',
    format: 'GeoJSON',
    links: {
      get metadata() { return 'https://www.i14y.admin.ch/' + getLang() + '/catalog/dataservices/60f54f01-bd80-423b-8581-581b7bcd6b38/description'; },
      description: 'https://www.bfs.admin.ch/bfs/de/home/register/gebaeude-wohnungsregister.html',
      download: 'https://www.housing-stat.ch/__publicdata',
      get portal() { return geoportalUrl('ch.bfs.gebaeude_wohnungs_register'); }
    },
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
    links: {
      get metadata() { return 'https://www.geocat.ch/datahub/dataset/cf93dfb6-ffff-43ce-bd9b-271baba2d217'; },
      description: 'https://www.cadastre-manual.admin.ch/de/informationsebene-liegenschaften',
      download: 'https://www.geodienste.ch/services/av',
      get portal() { return geoportalUrl('ch.kantone.cadastralwebmap-farbe'); }
    },
    legendHtml: function() {
      return legendHtml([{ swatch: rect(rgba(parcelColor, 0.15), parcelColor), label: t('info.title.parcel') }]);
    }
  },
  landcovers: {
    get title() { return t('layer.landcovers.title'); },
    get description() { return t('layer.landcovers.description'); },
    get source() { return t('layer.landcovers.source'); },
    geometryType: 'Polygon',
    format: 'GeoJSON',
    links: {
      get metadata() { return 'https://www.geocat.ch/datahub/dataset/d929eef4-791d-4728-9d56-226b6952cf1f'; },
      description: 'https://www.cadastre-manual.admin.ch/de/informationsebene-bodenbedeckung-and-einzelobjekte',
      download: 'https://www.geodienste.ch/services/av',
      get portal() { return cadastrePortalUrl(); }
    },
    legendHtml: landCoverLegendHtml
  }
};
