// Shared application state

import { filterConfig, mapStyles } from './config.js';

// Initialize activeFilters from filterConfig keys
var activeFilters = {};
Object.keys(filterConfig).forEach(function(k) { activeFilters[k] = []; });

// Load saved map style from localStorage
var savedMapStyle = localStorage.getItem('mapStyle') || 'light-v11';
if (!mapStyles[savedMapStyle]) savedMapStyle = 'light-v11';

export var state = {
  // Data
  portfolioData: null,
  parcelData: null,
  filteredData: null,

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

  // Views
  currentView: 'map',
  previousView: 'map',
  galleryViewDirty: false,
  listViewDirty: false,
  tableOpen: true,
  activeTableTab: 'buildings',

  // Pagination - buildings
  listCurrentPage: 1,
  listRowsPerPage: 50,
  listSearchTerm: '',

  // Pagination - parcels
  parcelCurrentPage: 1,
  parcelRowsPerPage: 50,
  parcelSearchTerm: '',

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
  pendingLayerFetches: {},
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
