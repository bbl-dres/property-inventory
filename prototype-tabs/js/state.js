// Shared application state. Module-local state of the common modules (basemap, measure tool,
// external layers, carousel, mini map) lives in the respective module.

import { filterConfig } from './config.js';

const activeFilters = {};
Object.keys(filterConfig).forEach(function(k) { activeFilters[k] = []; });

export const state = {
  // Data
  buildingsData: null,
  parcelData: null,
  filteredData: null,

  // Entity tables of the detail view (one JSON file each, see config.entityDataFiles)
  allAreaMeasurements: [],
  allDocuments: [],
  allContacts: [],
  allContracts: [],
  allAssets: [],
  allCosts: [],

  // Feature lookup indexes, built on data load for O(1) lookups
  buildingIndex: new Map(),    // Map<buildingId, feature>
  parcelIndex: new Map(),      // Map<parcelId, feature>

  // Selection
  currentDetailBuilding: null,
  selectedBuildingId: null,
  selectedParcelId: null,

  // Views: map, gallery, detail; the table panel lives under the map
  currentView: 'map',
  previousView: 'map',
  galleryViewDirty: false,
  listViewDirty: false,
  tableOpen: false,
  activeTableTab: 'buildings',

  // Map
  map: null,
  skipFilterZoom: false,
  pendingFilterZoom: false, // a filter was applied while the map was hidden: zoom to its result when the map shows again
  searchMarker: null,

  // Filters
  activeFilters: activeFilters
};
