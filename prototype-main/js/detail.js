// Detail view: populate fields, info icons, carousel, mini map, entity tables

import { state } from './state.js';
import { placeholderImages } from './config.js';
import { t } from './i18n.js';
import {
  formatNum,
  formatArea,
  formatVolume,
  formatCHF,
  formatDate,
  formatCurrency,
  formatCurrencyWithUnit,
  getContractStatusClassName,
  getStatusClassName
} from './utils.js';

// ===== POPULATE DETAIL VIEW =====

function populateDetailView(building) {
  const props = building.properties;
  const coords = building.geometry.coordinates;

  // Helper to set text by id (silently skip missing elements)
  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = (value !== undefined && value !== null && value !== '') ? value : '\u2013';
  }

  // Breadcrumb: adr_land > adr_ort > bbl_we > bbl_obj
  setText('breadcrumb-country', props.adr_land);
  setText('breadcrumb-city', props.adr_ort);
  setText('breadcrumb-we', props.bbl_we);
  setText('breadcrumb-tobj', props.bbl_obj);

  // --- Tab: \u00dcbersicht ---

  // Stammdaten
  var statusEl = document.getElementById('detail-status');
  if (statusEl) {
    if (props.bbl_stat) {
      statusEl.innerHTML = '<span class="badge status-badge ' + getStatusClassName(props.bbl_stat) + '">' + props.bbl_stat + '</span>';
    } else {
      statusEl.textContent = '\u2013';
    }
  }
  setText('detail-name', props.bbl_bez);
  setText('detail-id', props.bbl_id);
  setText('detail-objektart1', props.bbl_gbda1);
  setText('detail-objektart2', props.bbl_gbda2);
  setText('detail-eigentum', props.bbl_eigen);
  setText('detail-ostr', props.bbl_ostr);
  setText('detail-mietmodell', props.bbl_mietm);
  setText('detail-teilportfolio', props.bbl_port);
  setText('detail-teilportfolio-gruppe', props.bbl_port2);
  setText('detail-baujahr', props.bbl_bjahr);
  setText('detail-vjahr', props.bbl_vjahr);
  setText('detail-awrt', formatCHF(props.bbl_awrt));
  setText('detail-bwrt', formatCHF(props.bbl_bwrt));
  setText('detail-ovtw', props.bbl_ovtw);
  setText('detail-pvtw', props.bbl_pvtw);

  // Adresse
  setText('detail-country', props.adr_land);
  setText('detail-region', props.adr_reg);
  setText('detail-city', props.adr_ort);
  setText('detail-plz', props.adr_plz);
  setText('detail-street', props.adr_str);
  setText('detail-housenumber', props.adr_hsnr);
  // Mini-map address footer
  setText('mini-map-address', props.adr_conct);

  // Koordinaten (combined pairs)
  setText('detail-wgs84', props.wgs84_lat != null && props.wgs84_lon != null
    ? Number(props.wgs84_lat).toFixed(6) + ', ' + Number(props.wgs84_lon).toFixed(6) : null);
  setText('detail-lv95', props.lv95_e != null && props.lv95_n != null
    ? formatNum(props.lv95_e, 0) + ', ' + formatNum(props.lv95_n, 0) : null);
  setText('detail-elev', formatNum(props.egm_elev, 1));

  // Link helper and shared variables (used by multiple sections below)
  const lat = props.wgs84_lat;
  const lon = props.wgs84_lon;
  const lv95e = props.lv95_e;
  const lv95n = props.lv95_n;
  const linkText = 'Auf externer Karte anzeigen';

  function setLink(id, href, label) {
    const el = document.getElementById(id);
    if (!el) return;
    if (href) {
      el.href = href;
      if (label) el.textContent = label + ' \u2197';
    } else {
      el.removeAttribute('href');
      el.textContent = '\u2013';
    }
  }

  // Koordinaten links
  setLink('detail-link-gmaps',
    lat && lon ? 'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lon : null,
    linkText);
  setLink('detail-link-streetview',
    lat && lon ? 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + lat + ',' + lon : null,
    linkText);

  // Amtliche Vermessung
  setText('detail-egid', props.av_egid);
  setText('detail-egrid', props.av_egrid);
  setText('detail-bfs-gem', props.bfs_gem);
  setText('detail-bfs-gemnr', props.bfs_gemnr);
  setLink('detail-link-geoadmin-gwr',
    lv95e && lv95n ? 'https://map.geo.admin.ch/#/map?lang=de&center=' + lv95e + ',' + lv95n + '&z=12&crosshair=marker&topic=ech&layers=ch.swisstopo.amtliches-strassenverzeichnis;ch.bfs.gebaeude_wohnungs_register&bgLayer=ch.swisstopo.swissimage' : null,
    linkText);
  setLink('detail-link-geoadmin-oereb',
    lv95e && lv95n ? 'https://map.geo.admin.ch/#/map?lang=de&center=' + lv95e + ',' + lv95n + '&z=12&crosshair=marker&topic=ech&layers=ch.swisstopo-vd.stand-oerebkataster&bgLayer=ch.swisstopo.swissimage' : null,
    linkText);

  // Bauzone
  setText('detail-zbez', props.av_zbez);
  setText('detail-znut', props.av_znut);
  setLink('detail-link-bauzonen',
    lv95e && lv95n ? 'https://map.geo.admin.ch/#/map?lang=de&center=' + lv95e + ',' + lv95n + '&z=8.589&crosshair=marker&topic=ech&layers=ch.are.bauzonen&bgLayer=ch.swisstopo.swissimage' : null,
    linkText);

  // Denkmalschutz
  setText('detail-hist', props.bbl_hist);
  setText('detail-arch', props.bbl_arch);
  setText('detail-kgs-kat', props.kgs_kat);
  setText('detail-kgs-nr', props.kgs_nr);
  setLink('detail-link-kgs',
    lv95e && lv95n ? 'https://map.geo.admin.ch/#/map?lang=de&center=' + lv95e + ',' + lv95n + '&z=8.589&crosshair=marker&topic=ech&layers=ch.babs.kulturgueter&bgLayer=ch.swisstopo.swissimage' : null,
    linkText);

  // Sonstiges
  setText('detail-objectid', props.objectid);
  setText('detail-etl-ts', formatDate(props.etl_ts));

  // --- Tab: Bemessungen ---
  setText('detail-garea-gf', formatArea(props.garea_gf));
  setText('detail-garea-gfo', formatArea(props.garea_gfo));
  setText('detail-garea-gfu', formatArea(props.garea_gfu));
  setText('detail-garea-acu', props.garea_acu);
  setText('detail-garea-ngf', formatArea(props.garea_ngf));
  setText('detail-garea-nf', formatArea(props.garea_nf));
  setText('detail-garea-hnf', formatArea(props.garea_hnf));
  setText('detail-garea-nnf', formatArea(props.garea_nnf));
  setText('detail-garea-ff', formatArea(props.garea_ff));
  setText('detail-garea-vf', formatArea(props.garea_vf));
  setText('detail-garea-vmf', formatArea(props.garea_vmf));
  setText('detail-garea-ebf', formatArea(props.garea_ebf));

  // Volumes
  setText('detail-gvol-gv', formatVolume(props.gvol_gv));
  setText('detail-gvol-gvo', formatVolume(props.gvol_gvo));
  setText('detail-gvol-gvu', formatVolume(props.gvol_gvu));
  setText('detail-gvol-acu', props.gvol_acu);

  // Floors
  setText('detail-geschosse', props.gastw);
  setText('detail-geschosse-og', props.gastw_og);
  setText('detail-geschosse-ug', props.gastw_ug);
  setText('detail-geschosse-acu', props.gastw_acu);

  // Land areas
  setText('detail-larea-ggf', formatArea(props.larea_ggf));
  setText('detail-larea-gsf', formatArea(props.larea_gsf));
  setText('detail-larea-uf', formatArea(props.larea_uf));
  setText('detail-larea-acu', props.larea_acu);

  // Initialize carousel
  initCarousel();

  // Initialize mini map
  initMiniMap(coords);

  // Initialize info icons (once)
  initInfoIcons();

  // Initialize collapsible sections (once)
  initCollapsibleSections();
}

// ===== COLLAPSIBLE DETAIL SECTIONS =====

let collapsibleSectionsInitialized = false;

function initCollapsibleSections() {
  if (collapsibleSectionsInitialized) return;
  collapsibleSectionsInitialized = true;

  document.querySelectorAll('#detail-view .detail-overline').forEach(function(overline) {
    var chevron = document.createElement('span');
    chevron.className = 'material-symbols-outlined detail-overline-chevron';
    chevron.textContent = 'expand_more';
    overline.appendChild(chevron);

    overline.addEventListener('click', function() {
      this.classList.toggle('collapsed');
    });
  });
}

// ===== INFO TOOLTIPS FOR DETAIL LABELS =====

const labelDescriptions = {
  // Stammdaten
  'Status': 'Aktueller Status des Objekts im SAP-System (bbl_stat)',
  'Bezeichnung': 'Offizielle Objektbezeichnung gem\u00e4ss SAP (bbl_bez)',
  'ID': 'Interne BBL-ID: Buchungskreis / Wirtschaftseinheit / Teilobjekt (bbl_id)',
  'Objektart 1': 'Geb\u00e4udeart Stufe 1 gem\u00e4ss SAP (bbl_gbda1)',
  'Objektart 2': 'Geb\u00e4udeart Stufe 2 gem\u00e4ss SAP (bbl_gbda2)',
  'Art Eigentum': 'Eigentumsverh\u00e4ltnis: Eigentum Bund, Miete, etc. (bbl_eigen)',
  'Objektstrategie': 'Strategische Ausrichtung: Erhalten, Optimieren, Ver\u00e4ussern (bbl_ostr)',
  'Mietmodell': 'Mietmodell gem\u00e4ss SAP: Vollkosten-, Kosten-, Marktmiete (bbl_mietm)',
  'Teilportfolio': 'Teilportfolio-Zuordnung gem\u00e4ss SAP (bbl_port)',
  'Portfoliogruppe': '\u00dcbergeordnete Teilportfoliogruppe (bbl_port2)',
  'Baujahr': 'Erstellungsjahr des Geb\u00e4udes (bbl_bjahr)',
  'Verkaufsjahr': 'Jahr des Verkaufs, leer wenn nicht verkauft (bbl_vjahr)',
  'Anschaffungswert': 'Anschaffungswert in Schweizer Franken (bbl_awrt)',
  'Buchwert': 'Aktueller Buchwert in Schweizer Franken (bbl_bwrt)',
  // Kontakte
  'Verantwortlich': 'Objektverantwortliche Person gem\u00e4ss SAP (bbl_ovtw)',
  'Portfoliomanager': 'Zust\u00e4ndiger Portfoliomanager gem\u00e4ss SAP (bbl_pvtw)',
  // Adresse
  'Adresse': 'Verkettet aus Strasse, Hausnummer, PLZ und Ort (adr_conct)',
  // Koordinaten
  'WGS84': 'Breitengrad und L\u00e4ngengrad im World Geodetic System 1984 (wgs84_lat, wgs84_lon)',
  'LV95': 'Schweizer Landeskoordinaten, aus WGS84 hergeleitet (lv95_e, lv95_n)',
  'EGM H\u00f6he': 'Absolute H\u00f6he \u00fcber Meeresspiegel in Metern, EGM2008-Geoid (egm_elev)',
  // Amtliche Vermessung
  'EGID': 'Eidgen\u00f6ssischer Geb\u00e4udeidentifikator, nur Schweiz (av_egid)',
  'EGRID': 'Eidgen\u00f6ssischer Grundst\u00fccksidentifikator, nur Schweiz (av_egrid)',
  'Gemeindename': 'BFS Gemeindename gem\u00e4ss amtlichem Gemeindeverzeichnis (bfs_gem)',
  'Gemeindenummer': 'BFS Gemeindenummer gem\u00e4ss amtlichem Gemeindeverzeichnis (bfs_gemnr)',
  // Denkmalschutz
  'Hist. Ausstattung': 'Historische Ausstattung gem\u00e4ss SAP (bbl_hist)',
  'Archivw\u00fcrdigkeit': 'Archivw\u00fcrdigkeit gem\u00e4ss SAP (bbl_arch)',
  'KGS Kategorie': 'Kategorie im Schweizerischen Kulturg\u00fcterschutz-Inventar: A, B oder C (kgs_kat)',
  'KGS Nummer': 'Identifikationsnummer im KGS-Inventar (kgs_nr)',
  // Bemessungen
  'Geschossfl\u00e4che GF': 'Brutto-Geschossfl\u00e4che aller Geschosse nach SIA 416 (garea_gf)',
  'GF Oberirdisch': 'Geschossfl\u00e4che der oberirdischen Geschosse (garea_gfo)',
  'GF Unterirdisch': 'Geschossfl\u00e4che der unterirdischen Geschosse (garea_gfu)',
  'Genauigkeit': 'Angabe zur Datenherkunft: Vermessen, Gesch\u00e4tzt, oder AV',
  'Netto-Geschossfl. NGF': 'Nutzbare Fl\u00e4che ohne Konstruktionsfl\u00e4che nach SIA 416 (garea_ngf)',
  'Nutzfl\u00e4che NF': 'Summe Haupt- und Nebennutzfl\u00e4che nach SIA 416 (garea_nf)',
  'Hauptnutzfl\u00e4che HNF': 'Fl\u00e4che f\u00fcr die Hauptnutzung des Geb\u00e4udes nach SIA 416 (garea_hnf)',
  'Nebennutzfl\u00e4che NNF': 'Fl\u00e4che f\u00fcr Nebennutzungen nach SIA 416 (garea_nnf)',
  'Funktionsfl\u00e4che FF': 'Fl\u00e4che f\u00fcr geb\u00e4udetechnische Anlagen nach SIA 416 (garea_ff)',
  'Verkehrsfl\u00e4che VF': 'Erschliessungsfl\u00e4che: Korridore, Treppenh\u00e4user, Aufz\u00fcge (garea_vf)',
  'Vermietbare Fl. VMF': 'Vermietbare Fl\u00e4che nach SIA 416 (garea_vmf)',
  'Energiebezugsfl. EBF': 'Energiebezugsfl\u00e4che nach SIA 380, Grundlage f\u00fcr Energiekennzahlen (garea_ebf)',
  'Geb\u00e4udevolumen GV': 'Gesamtes Geb\u00e4udevolumen nach SIA 416 (gvol_gv)',
  'GV Oberirdisch': 'Volumen der oberirdischen Geb\u00e4udeteile (gvol_gvo)',
  'GV Unterirdisch': 'Volumen der unterirdischen Geb\u00e4udeteile (gvol_gvu)',
  'Anzahl Total': 'Gesamtanzahl Geschosse ober- und unterirdisch (gastw)',
  'Oberirdisch': 'Anzahl Geschosse \u00fcber Terrain (gastw_og)',
  'Unterirdisch': 'Anzahl Geschosse unter Terrain (gastw_ug)',
  'Geb\u00e4udegrundfl\u00e4che GGF': 'Grundrissfl\u00e4che des Geb\u00e4udes am Boden nach SIA 416 (larea_ggf)',
  'Grundst\u00fccksfl\u00e4che GSF': 'Gesamtfl\u00e4che des Grundst\u00fccks nach SIA 416 (larea_gsf)',
  'Umgebungsfl\u00e4che UF': 'Grundst\u00fccksfl\u00e4che abz\u00fcglich Geb\u00e4udegrundfl\u00e4che (larea_uf)',
  // Sonstiges
  'OBJECTID': 'Interne ESRI-System-ID f\u00fcr GIS-Updates (objectid)',
  'ETL Zeitstempel': 'Zeitpunkt der letzten Synchronisation aus den Quellsystemen (etl_ts)',
};

// Inject info icons as 3rd column and make rows clickable (run once)
let infoIconsInitialized = false;

function initInfoIcons() {
  if (infoIconsInitialized) return;
  infoIconsInitialized = true;

  document.querySelectorAll('#detail-view .detail-grid-row').forEach(function(row) {
    const label = row.querySelector('.detail-label');
    if (!label) return;
    const desc = labelDescriptions[label.textContent.trim()];
    if (desc) {
      // Add data-desc to row and append icon as 3rd grid cell
      row.setAttribute('data-desc', desc);
      const icon = document.createElement('span');
      icon.className = 'info-icon';
      icon.textContent = 'info';
      icon.title = desc;
      row.appendChild(icon);
    }
  });

  // Event delegation -- clicking anywhere on a row with data-desc toggles popover
  document.getElementById('detail-view').addEventListener('click', function(e) {
    const row = e.target.closest('.detail-grid-row[data-desc]');

    // Click outside any desc row -- close open popover
    if (!row) {
      const open = document.querySelector('.info-popover.active');
      if (open) open.remove();
      return;
    }

    // Don't toggle when clicking links
    if (e.target.closest('a')) return;

    const desc = row.getAttribute('data-desc');

    // Close any existing popover
    const existing = document.querySelector('.info-popover.active');
    if (existing) {
      const wasOnSame = existing.parentElement === row;
      existing.remove();
      if (wasOnSame) return; // toggle off
    }

    // Create popover inside the row (spans all 3 columns)
    const popover = document.createElement('div');
    popover.className = 'info-popover active';
    popover.textContent = desc;
    row.appendChild(popover);
  });
}

// ===== CAROUSEL =====

function getCarouselImages() {
  const props = state.currentDetailBuilding ? state.currentDetailBuilding.properties : {};
  const images = props.img_url;
  return (images && images.length > 0) ? images : placeholderImages;
}

let carouselClickInitialized = false;

function initCarousel() {
  state.currentCarouselIndex = 0;
  const images = getCarouselImages();
  updateCarouselImage();

  // Click on carousel image to open lightbox
  if (!carouselClickInitialized) {
    carouselClickInitialized = true;
    document.getElementById('carousel-image').addEventListener('click', function() {
      openLightbox(state.currentCarouselIndex);
    });
  }

  // Create dots
  const dotsContainer = document.getElementById('carousel-dots');
  dotsContainer.innerHTML = '';
  images.forEach(function(_, index) {
    const dot = document.createElement('div');
    dot.className = 'carousel-dot' + (index === 0 ? ' active' : '');
    dot.onclick = function() {
      state.currentCarouselIndex = index;
      updateCarouselImage();
    };
    dotsContainer.appendChild(dot);
  });
}

function updateCarouselImage() {
  const images = getCarouselImages();
  const imageEl = document.getElementById('carousel-image');
  const imgUrl = images[state.currentCarouselIndex];
  imageEl.style.backgroundImage = "url('" + imgUrl.replace(/'/g, "\\'").replace(/\)/g, '\\)') + "')";

  // Update dots
  document.querySelectorAll('.carousel-dot').forEach(function(dot, index) {
    dot.classList.toggle('active', index === state.currentCarouselIndex);
  });
}

function carouselPrev() {
  const images = getCarouselImages();
  state.currentCarouselIndex = (state.currentCarouselIndex - 1 + images.length) % images.length;
  updateCarouselImage();
}

function carouselNext() {
  const images = getCarouselImages();
  state.currentCarouselIndex = (state.currentCarouselIndex + 1) % images.length;
  updateCarouselImage();
}


// ===== FULLSCREEN LIGHTBOX =====

let lightboxInitialized = false;
let lightboxIndex = 0;

function getFilenameFromUrl(url) {
  try {
    var parts = url.split('/');
    var last = parts[parts.length - 1].split('?')[0];
    return last || 'image';
  } catch (e) {
    return 'image';
  }
}

function openLightbox(index) {
  var images = getCarouselImages();
  if (!images || images.length === 0) return;

  lightboxIndex = index;
  var lightbox = document.getElementById('lightbox');
  lightbox.classList.add('active');
  updateLightbox();
  document.body.style.overflow = 'hidden';

  if (!lightboxInitialized) {
    lightboxInitialized = true;

    document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
    lightbox.querySelector('.lightbox-backdrop').addEventListener('click', closeLightbox);

    document.getElementById('lightbox-prev').addEventListener('click', function(e) {
      e.stopPropagation();
      lightboxPrev();
    });
    document.getElementById('lightbox-next').addEventListener('click', function(e) {
      e.stopPropagation();
      lightboxNext();
    });
    document.getElementById('lightbox-download').addEventListener('click', function(e) {
      e.stopPropagation();
      var images = getCarouselImages();
      var url = images[lightboxIndex];
      var a = document.createElement('a');
      a.href = url;
      a.download = getFilenameFromUrl(url);
      a.target = '_blank';
      a.rel = 'noopener';
      a.click();
    });

    document.addEventListener('keydown', function(e) {
      var lightbox = document.getElementById('lightbox');
      if (!lightbox.classList.contains('active')) return;
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        closeLightbox();
      } else if (e.key === 'ArrowLeft') {
        lightboxPrev();
      } else if (e.key === 'ArrowRight') {
        lightboxNext();
      }
    });
  }
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('active');
  document.body.style.overflow = '';
}

function lightboxPrev() {
  var images = getCarouselImages();
  lightboxIndex = (lightboxIndex - 1 + images.length) % images.length;
  updateLightbox();
}

function lightboxNext() {
  var images = getCarouselImages();
  lightboxIndex = (lightboxIndex + 1) % images.length;
  updateLightbox();
}

function updateLightbox() {
  var images = getCarouselImages();
  var url = images[lightboxIndex];
  document.getElementById('lightbox-image').src = url;
  document.getElementById('lightbox-counter').textContent = (lightboxIndex + 1) + ' / ' + images.length;
  document.getElementById('lightbox-filename').textContent = getFilenameFromUrl(url);

  // Sync carousel
  state.currentCarouselIndex = lightboxIndex;
  updateCarouselImage();
}

// ===== MINI MAP =====

function initMiniMap(coords) {
  // Destroy existing map if any
  if (state.miniMap) {
    state.miniMap.remove();
    state.miniMap = null;
  }

  // Create new mini map
  state.miniMap = new maplibregl.Map({
    container: 'mini-map',
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    center: coords,
    zoom: 17,
    pitch: 50,
    bearing: -17
  });

  // Add 3D buildings layer and marker
  state.miniMap.on('load', function() {
    // Find the vector tile source (CARTO uses 'carto')
    const sources = state.miniMap.getStyle().sources;
    let vectorSourceId = null;
    for (const key in sources) {
      if (sources[key].type === 'vector') {
        vectorSourceId = key;
        break;
      }
    }

    if (vectorSourceId) {
      // Find first label layer to insert 3D buildings below,
      // and hide the basemap's own building layers (2D fill + built-in 3D)
      // to prevent double-rendering that causes a "transparent" look
      const layers = state.miniMap.getStyle().layers;
      let labelLayerId;
      for (let i = 0; i < layers.length; i++) {
        var layer = layers[i];
        if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
          if (!labelLayerId) labelLayerId = layer.id;
        }
        if (layer['source-layer'] === 'building' && layer.id !== '3d-buildings') {
          state.miniMap.setLayoutProperty(layer.id, 'visibility', 'none');
        }
      }

      state.miniMap.addLayer({
        'id': '3d-buildings',
        'source': vectorSourceId,
        'source-layer': 'building',
        'type': 'fill-extrusion',
        'minzoom': 15,
        'filter': ['!=', ['get', 'hide_3d'], true],
        'paint': {
          'fill-extrusion-color': '#d0d0d0',
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 5],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 1
        }
      }, labelLayerId);
    }

    // Add marker
    new maplibregl.Marker({ color: '#c00' })
      .setLngLat(coords)
      .addTo(state.miniMap);
  });

  // Add navigation controls
  state.miniMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  // Force resize after container settles its width
  state.miniMap.on('load', function() { state.miniMap.resize(); });
  setTimeout(function() { if (state.miniMap) state.miniMap.resize(); }, 300);
}

// ===== SHARED TABLE UTILITIES =====

// Generic sort function for table data
function sortTableData(data, column, direction) {
  return data.sort(function(a, b) {
    let valA = a[column];
    let valB = b[column];
    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }
    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

// Generic selection update for detail tables
function updateTableSelection(config) {
  const checkboxes = document.querySelectorAll('.' + config.checkboxClass);
  const checkedCount = document.querySelectorAll('.' + config.checkboxClass + ':checked').length;
  const selectAll = document.getElementById(config.selectAllId);

  if (selectAll) {
    selectAll.checked = checkedCount === checkboxes.length && checkboxes.length > 0;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
  }

  document.querySelectorAll('#' + config.tableId + ' tbody tr').forEach(function(row) {
    const cb = row.querySelector('.' + config.checkboxClass);
    row.classList.toggle('selected', cb && cb.checked);
  });

  document.querySelectorAll('.' + config.actionClass).forEach(function(btn) {
    btn.disabled = checkedCount === 0;
  });
}

// Generic sort column click handler setup
function initTableSorting(config) {
  document.querySelectorAll('#' + config.tableId + ' th.sortable').forEach(function(th) {
    th.addEventListener('click', function() {
      const column = this.dataset.sort;

      if (column === config.state.column) {
        config.state.direction = config.state.direction === 'asc' ? 'desc' : 'asc';
      } else {
        config.state.column = column;
        config.state.direction = 'asc';
      }

      document.querySelectorAll('#' + config.tableId + ' th.sortable').forEach(function(header) {
        header.classList.remove('sort-asc', 'sort-desc');
        const icon = header.querySelector('.sort-icon');
        if (icon) icon.textContent = 'unfold_more';
      });

      this.classList.add('sort-' + config.state.direction);
      const sortIcon = this.querySelector('.sort-icon');
      if (sortIcon) {
        sortIcon.textContent = config.state.direction === 'asc' ? 'arrow_upward' : 'arrow_downward';
      }

      config.onSort();
    });
  });
}

// Generic select-all checkbox setup
function initSelectAll(config) {
  const selectAll = document.getElementById(config.selectAllId);
  if (selectAll) {
    selectAll.addEventListener('change', function() {
      const isChecked = this.checked;
      document.querySelectorAll('.' + config.checkboxClass).forEach(function(cb) {
        cb.checked = isChecked;
      });
      config.onUpdate();
    });
  }
}

// ===== GENERIC ENTITY TABLE FACTORY =====

function createEntityTable(config) {
  // Extract table name from tableId (e.g., 'measurements-table' -> 'measurements')
  const tableName = config.tableId.replace('-table', '');

  const table = {
    data: [],
    filteredData: [],
    sort: { column: config.defaultSort || 'id', direction: 'asc' },
    pagination: {
      currentPage: 1,
      rowsPerPage: 50
    },
    tableConfig: {
      tableId: config.tableId,
      checkboxClass: config.checkboxClass,
      selectAllId: config.selectAllId,
      actionClass: config.actionClass,
      state: null, // Will be set below
      onSort: null,
      onUpdate: null
    }
  };

  // Set up circular references
  table.tableConfig.state = table.sort;
  table.tableConfig.onSort = function() {
    sortTableData(table.filteredData, table.sort.column, table.sort.direction);
    table.render();
  };
  table.tableConfig.onUpdate = function() {
    updateTableSelection(table.tableConfig);
  };

  // Load data for a building
  table.load = function(building) {
    if (building && building.properties) {
      const buildingId = building.properties.bbl_id;
      table.data = config.dataSource()
        .filter(function(item) {
          return item.buildingIds && item.buildingIds.includes(buildingId);
        })
        .map(config.transform);
    } else {
      table.data = [];
    }
    table.filteredData = table.data.slice();
    // Reset pagination when loading new data
    table.pagination.currentPage = 1;
  };

  // Render table rows with empty state and pagination support
  table.render = function() {
    const tbody = document.getElementById(config.tbodyId);
    if (!tbody) return;

    // Check for empty state
    if (table.filteredData.length === 0) {
      const colCount = config.columns.length + 1; // +1 for checkbox column
      const emptyMessage = table.data.length === 0
        ? t('detail.empty')
        : t('empty.search');
      const emptyIcon = table.data.length === 0 ? 'inbox' : 'search_off';

      tbody.innerHTML = '<tr class="empty-row"><td colspan="' + colCount + '">' +
        '<div class="table-empty-state">' +
        '<span class="material-symbols-outlined">' + emptyIcon + '</span>' +
        '<div class="table-empty-message">' + emptyMessage + '</div>' +
        '</div></td></tr>';
      table.updatePagination(0, 0);
      return;
    }

    // Pagination calculations
    const totalItems = table.filteredData.length;
    const totalPages = Math.ceil(totalItems / table.pagination.rowsPerPage);

    // Ensure current page is valid
    if (table.pagination.currentPage > totalPages) {
      table.pagination.currentPage = totalPages;
    }
    if (table.pagination.currentPage < 1) {
      table.pagination.currentPage = 1;
    }

    const startIndex = (table.pagination.currentPage - 1) * table.pagination.rowsPerPage;
    const endIndex = Math.min(startIndex + table.pagination.rowsPerPage, totalItems);

    // Get paginated slice of data
    const paginatedData = table.filteredData.slice(startIndex, endIndex);

    let html = '';
    paginatedData.forEach(function(item) {
      html += '<tr data-id="' + item.id + '">';
      html += '<td class="col-checkbox"><input type="checkbox" class="' + config.checkboxClass + '"></td>';
      config.columns.forEach(function(col) {
        const value = col.render ? col.render(item) : (item[col.key] || '\u2014');
        html += '<td class="' + col.className + '">' + value + '</td>';
      });
      html += '</tr>';
    });
    tbody.innerHTML = html;

    // Update pagination UI
    table.updatePagination(table.pagination.currentPage, totalPages);

    document.querySelectorAll('.' + config.checkboxClass).forEach(function(cb) {
      cb.addEventListener('change', function() {
        updateTableSelection(table.tableConfig);
      });
    });
  };

  // Update pagination UI
  table.updatePagination = function(currentPage, totalPages) {
    const paginationFooter = document.getElementById(tableName + '-pagination');
    if (!paginationFooter) return;

    const infoEl = paginationFooter.querySelector('.pagination-info');
    const prevBtn = paginationFooter.querySelector('.pagination-prev');
    const nextBtn = paginationFooter.querySelector('.pagination-next');

    if (infoEl) {
      if (totalPages === 0) {
        infoEl.textContent = t('pagination.entries.empty');
      } else {
        infoEl.textContent = t('pagination.entries.page', {current: currentPage, total: totalPages});
      }
    }

    if (prevBtn) {
      prevBtn.disabled = currentPage <= 1;
    }

    if (nextBtn) {
      nextBtn.disabled = currentPage >= totalPages || totalPages === 0;
    }
  };

  // Filter data based on search term
  table.filter = function(term) {
    term = term.toLowerCase().trim();
    if (term === '') {
      table.filteredData = table.data.slice();
    } else {
      table.filteredData = table.data.filter(function(item) {
        return config.searchFields.some(function(field) {
          const val = item[field];
          if (val == null) return false;
          return String(val).toLowerCase().includes(term);
        });
      });
    }
    // Reset to first page when filtering
    table.pagination.currentPage = 1;
    sortTableData(table.filteredData, table.sort.column, table.sort.direction);
    table.render();
  };

  // Initialize event handlers
  table.init = function() {
    initTableSorting(table.tableConfig);
    initSelectAll(table.tableConfig);

    const filterInput = document.getElementById(config.filterId);
    if (filterInput) {
      filterInput.addEventListener('input', function() {
        table.filter(this.value);
      });
    }

    const addBtn = document.getElementById(config.addBtnId);
    if (addBtn) {
      addBtn.addEventListener('click', function() {
        alert(config.addBtnMessage);
      });
    }

    // Initialize pagination event listeners
    const paginationFooter = document.getElementById(tableName + '-pagination');
    if (paginationFooter) {
      const rowsSelect = paginationFooter.querySelector('.pagination-rows-select');
      const prevBtn = paginationFooter.querySelector('.pagination-prev');
      const nextBtn = paginationFooter.querySelector('.pagination-next');

      if (rowsSelect) {
        rowsSelect.addEventListener('change', function() {
          table.pagination.rowsPerPage = parseInt(this.value, 10);
          table.pagination.currentPage = 1;
          table.render();
        });
      }

      if (prevBtn) {
        prevBtn.addEventListener('click', function() {
          if (table.pagination.currentPage > 1) {
            table.pagination.currentPage--;
            table.render();
          }
        });
      }

      if (nextBtn) {
        nextBtn.addEventListener('click', function() {
          const totalPages = Math.ceil(table.filteredData.length / table.pagination.rowsPerPage);
          if (table.pagination.currentPage < totalPages) {
            table.pagination.currentPage++;
            table.render();
          }
        });
      }
    }
  };

  return table;
}

// ===== ENTITY TABLE DEFINITIONS =====

const measurementsTable = createEntityTable({
  tableId: 'measurements-table',
  tbodyId: 'measurements-tbody',
  checkboxClass: 'measurement-checkbox',
  selectAllId: 'select-all-measurements',
  actionClass: 'measurements-action',
  filterId: 'measurements-filter',
  addBtnId: 'btn-add-measurement',
  addBtnMessage: 'Bemessung hinzuf\u00fcgen - kommt bald...',
  defaultSort: 'id',
  dataSource: function() { return state.allAreaMeasurements; },
  transform: function(m) {
    return {
      id: m.areaMeasurementId,
      areaType: m.type,
      value: m.value,
      unit: m.unit,
      source: (m.extensionData && m.extensionData.source) || 'Manuell',
      accuracy: m.accuracy,
      standard: m.standard,
      validFrom: m.validFrom,
      validUntil: m.validUntil || '\u2014'
    };
  },
  columns: [
    { key: 'id', className: 'col-id' },
    { key: 'areaType', className: 'col-type' },
    { key: 'value', className: 'col-area', render: function(m) {
      return Number(m.value).toLocaleString('de-CH') + ' ' + m.unit;
    }},
    { key: 'source', className: 'col-source' },
    { key: 'accuracy', className: 'col-accuracy' },
    { key: 'standard', className: 'col-standard' },
    { key: 'validFrom', className: 'col-from' },
    { key: 'validUntil', className: 'col-until' }
  ],
  searchFields: ['id', 'areaType', 'accuracy', 'standard', 'unit', 'value']
});

const documentsTable = createEntityTable({
  tableId: 'documents-table',
  tbodyId: 'documents-tbody',
  checkboxClass: 'document-checkbox',
  selectAllId: 'select-all-documents',
  actionClass: 'documents-action',
  filterId: 'documents-filter',
  addBtnId: 'btn-add-document',
  addBtnMessage: 'Dokument hinzuf\u00fcgen - kommt bald...',
  defaultSort: 'id',
  dataSource: function() { return state.allDocuments; },
  transform: function(d) {
    return {
      id: d.documentId,
      titel: d.name,
      dokumentTyp: d.type,
      dateiformat: d.fileFormat,
      datum: d.validFrom,
      dateigroesse: d.fileSize,
      url: d.url || '#'
    };
  },
  columns: [
    { key: 'id', className: 'col-id' },
    { key: 'titel', className: 'col-title' },
    { key: 'dokumentTyp', className: 'col-type' },
    { key: 'dateiformat', className: 'col-format' },
    { key: 'datum', className: 'col-date' },
    { key: 'dateigroesse', className: 'col-size' }
  ],
  searchFields: ['id', 'titel', 'dokumentTyp', 'dateiformat', 'datum', 'dateigroesse']
});

const contactsTable = createEntityTable({
  tableId: 'contacts-table',
  tbodyId: 'contacts-tbody',
  checkboxClass: 'contact-checkbox',
  selectAllId: 'select-all-contacts',
  actionClass: 'contacts-action',
  filterId: 'contacts-filter',
  addBtnId: 'btn-add-contact',
  addBtnMessage: 'Kontakt hinzuf\u00fcgen - kommt bald...',
  defaultSort: 'name',
  dataSource: function() { return state.allContacts; },
  transform: function(contact) {
    return {
      id: contact.contactId,
      name: contact.name,
      rolle: contact.role,
      organisation: contact.organisation,
      telefon: contact.phone,
      email: contact.email
    };
  },
  columns: [
    { key: 'id', className: 'col-contact-id' },
    { key: 'name', className: 'col-contact-name' },
    { key: 'rolle', className: 'col-contact-role' },
    { key: 'organisation', className: 'col-contact-org' },
    { key: 'telefon', className: 'col-contact-phone', render: function(contact) {
      return '<a href="tel:' + contact.telefon + '">' + contact.telefon + '</a>';
    }},
    { key: 'email', className: 'col-contact-email', render: function(contact) {
      return '<a href="mailto:' + contact.email + '">' + contact.email + '</a>';
    }}
  ],
  searchFields: ['id', 'name', 'rolle', 'organisation', 'telefon', 'email']
});

const costsTable = createEntityTable({
  tableId: 'costs-table',
  tbodyId: 'costs-tbody',
  checkboxClass: 'cost-checkbox',
  selectAllId: 'select-all-costs',
  actionClass: 'costs-action',
  filterId: 'costs-filter',
  addBtnId: 'btn-add-cost',
  addBtnMessage: 'Kosten hinzuf\u00fcgen - kommt bald...',
  defaultSort: 'kostengruppe',
  dataSource: function() { return state.allCosts; },
  transform: function(cost) {
    return {
      id: cost.costId,
      kostengruppe: cost.costGroup,
      kostenart: cost.costType,
      betrag: cost.amount,
      einheit: cost.unit,
      stichtag: cost.referenceDate
    };
  },
  columns: [
    { key: 'id', className: 'col-cost-id' },
    { key: 'kostengruppe', className: 'col-cost-group' },
    { key: 'kostenart', className: 'col-cost-type' },
    { key: 'betrag', className: 'col-cost-amount', render: function(cost) {
      return formatCurrencyWithUnit(cost.betrag, cost.einheit);
    }},
    { key: 'einheit', className: 'col-cost-unit', render: function(cost) {
      return cost.einheit || '\u2014';
    }},
    { key: 'stichtag', className: 'col-cost-date', render: function(cost) {
      return cost.stichtag || '\u2014';
    }}
  ],
  searchFields: ['id', 'kostengruppe', 'kostenart', 'betrag', 'einheit', 'stichtag']
});

const contractsTable = createEntityTable({
  tableId: 'contracts-table',
  tbodyId: 'contracts-tbody',
  checkboxClass: 'contract-checkbox',
  selectAllId: 'select-all-contracts',
  actionClass: 'contracts-action',
  filterId: 'contracts-filter',
  addBtnId: 'btn-add-contract',
  addBtnMessage: 'Vertrag hinzuf\u00fcgen - kommt bald...',
  defaultSort: 'vertragsart',
  dataSource: function() { return state.allContracts; },
  transform: function(contract) {
    return {
      id: contract.contractId,
      vertragsart: contract.type,
      vertragspartner: contract.contractPartner,
      vertragsbeginn: contract.validFrom,
      vertragsende: contract.validUntil,
      betrag: contract.amount,
      status: contract.status
    };
  },
  columns: [
    { key: 'id', className: 'col-contract-id' },
    { key: 'vertragsart', className: 'col-contract-type' },
    { key: 'vertragspartner', className: 'col-contract-partner' },
    { key: 'vertragsbeginn', className: 'col-contract-start', render: function(contract) {
      return contract.vertragsbeginn || '\u2014';
    }},
    { key: 'vertragsende', className: 'col-contract-end', render: function(contract) {
      return contract.vertragsende || 'unbefristet';
    }},
    { key: 'betrag', className: 'col-contract-amount', render: function(contract) {
      return formatCurrency(contract.betrag);
    }},
    { key: 'status', className: 'col-contract-status', render: function(contract) {
      return '<span class="badge status-badge ' + getContractStatusClassName(contract.status) + '">' + contract.status + '</span>';
    }}
  ],
  searchFields: ['id', 'vertragsart', 'vertragspartner', 'vertragsbeginn', 'vertragsende', 'betrag', 'status']
});

const assetsTable = createEntityTable({
  tableId: 'assets-table',
  tbodyId: 'assets-tbody',
  checkboxClass: 'asset-checkbox',
  selectAllId: 'select-all-assets',
  actionClass: 'assets-action',
  filterId: 'assets-filter',
  addBtnId: 'btn-add-asset',
  addBtnMessage: 'Ausstattung hinzuf\u00fcgen - kommt bald...',
  defaultSort: 'bezeichnung',
  dataSource: function() { return state.allAssets; },
  transform: function(asset) {
    return {
      id: asset.assetId,
      bezeichnung: asset.name,
      kategorie: asset.category,
      hersteller: asset.manufacturer,
      baujahr: asset.installationYear,
      standort: asset.location
    };
  },
  columns: [
    { key: 'id', className: 'col-asset-id' },
    { key: 'bezeichnung', className: 'col-asset-name' },
    { key: 'kategorie', className: 'col-asset-category', render: function(asset) {
      return '<span class="badge kategorie-badge">' + asset.kategorie + '</span>';
    }},
    { key: 'hersteller', className: 'col-asset-manufacturer' },
    { key: 'baujahr', className: 'col-asset-year' },
    { key: 'standort', className: 'col-asset-location' }
  ],
  searchFields: ['id', 'bezeichnung', 'kategorie', 'hersteller', 'baujahr', 'standort']
});

// ===== ENTITY TABLE INIT / LOAD / RENDER WRAPPERS =====

function initAllEntityTables() {
  measurementsTable.init();
  documentsTable.init();
  contactsTable.init();
  costsTable.init();
  contractsTable.init();
  assetsTable.init();
}

function loadMeasurementsForBuilding(building) { measurementsTable.load(building); }
function loadDocumentsForBuilding(building) { documentsTable.load(building); }
function loadContactsForBuilding(building) { contactsTable.load(building); }
function loadCostsForBuilding(building) { costsTable.load(building); }
function loadContractsForBuilding(building) { contractsTable.load(building); }
function loadAssetsForBuilding(building) { assetsTable.load(building); }

function renderMeasurementsTable() { measurementsTable.render(); }
function renderDocumentsTable() { documentsTable.render(); }
function renderContactsTable() { contactsTable.render(); }
function renderCostsTable() { costsTable.render(); }
function renderContractsTable() { contractsTable.render(); }
function renderAssetsTable() { assetsTable.render(); }

// ===== EXPORTS =====

export {
  populateDetailView,
  carouselPrev,
  carouselNext,
  initAllEntityTables,
  loadMeasurementsForBuilding,
  loadDocumentsForBuilding,
  loadContactsForBuilding,
  loadCostsForBuilding,
  loadContractsForBuilding,
  loadAssetsForBuilding,
  renderMeasurementsTable,
  renderDocumentsTable,
  renderContactsTable,
  renderCostsTable,
  renderContractsTable,
  renderAssetsTable
};
