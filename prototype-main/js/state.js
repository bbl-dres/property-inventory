// Shared application state

import { filterConfig, mapStyles } from './config.js';

// Initialize activeFilters from filterConfig keys
const activeFilters = {};
Object.keys(filterConfig).forEach(function(k) { activeFilters[k] = []; });

// Load saved map style from localStorage
let savedMapStyle = localStorage.getItem('mapStyle') || 'positron';
if (!mapStyles[savedMapStyle]) savedMapStyle = 'positron';

export const state = {
  // Data
  buildingsData: null,
  parcelData: null,
  landCoverData: null,
  filteredData: null,

  // Feature lookup indexes — built on data load for O(1) lookups
  buildingIndex: new Map(),    // Map<bbl_id, feature>
  parcelIndex: new Map(),      // Map<bbl_id, feature>
  landCoverIndex: new Map(),   // Map<objectid, feature>

  // Entity data (stubs - not yet loaded from backend)
  allAreaMeasurements: [],
  allDocuments: [],
  allContacts: [],
  allContracts: [],
  allAssets: [],
  allCosts: [],

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

  // Pagination - buildings
  listCurrentPage: 1,
  listRowsPerPage: 50,
  listSearchTerm: '',

  // Pagination - parcels
  parcelCurrentPage: 1,
  parcelRowsPerPage: 50,
  parcelSearchTerm: '',

  // Pagination - land covers
  landCoverCurrentPage: 1,
  landCoverRowsPerPage: 50,
  landCoverSearchTerm: '',

  // Map
  map: null,
  miniMap: null,
  currentMapStyle: savedMapStyle,
  is3D: false,
  skipFilterZoom: false,
  searchMarker: null,

  // Filters
  activeFilters: activeFilters,

  // Swisstopo
  activeSwisstopoLayers: [],
  identifiedFeaturePopup: null,
  geokatalogLoaded: false,

  // Export
  selectedExportFormat: 'geojson',

  // UI
  currentCarouselIndex: 0,
  printPreviewOverlay: null,
  menuOpen: true,
  stylePanelOpen: false,

  // Measurement
  measureState: {
    active: false,
    points: [],
    markers: [],
    labelMarkers: [],
    lineSourceId: 'measure-line-source',
    lineLayerId: 'measure-line',
    isClosed: false
  },

  // Context menu
  contextMenuLngLat: null
};
