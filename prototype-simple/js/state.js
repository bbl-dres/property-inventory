// Shared application state. Module-local state of the common modules (basemap, measure tool,
// external layers, carousel, mini map) lives in the respective module.

import { filterConfig } from './config.js';

const activeFilters = {};
Object.keys(filterConfig).forEach(function(k) { activeFilters[k] = []; });

export const state = {
  // Data
  buildingsData: null,
  parcelData: null,
  landCoverData: null,
  filteredData: null,

  // Feature lookup indexes, built on data load for O(1) lookups
  buildingIndex: new Map(),    // Map<bbl_id, feature>
  parcelIndex: new Map(),      // Map<bbl_id, feature>
  landCoverIndex: new Map(),   // Map<objectid, feature>

  // Selection
  currentDetailBuilding: null,
  selectedBuildingId: null,
  selectedParcelId: null,
  selectedLandCoverId: null,

  // Views
  currentView: 'map',
  previousView: 'map',
  galleryViewDirty: false,
  listViewDirty: false,
  tableOpen: false,
  activeTableTab: 'buildings',

  // Map
  map: null,
  skipFilterZoom: false,
  searchMarker: null,

  // Filters
  activeFilters: activeFilters
};
