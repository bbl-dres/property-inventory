// Detail view: fields, collapsible sections, info tooltips, carousel and mini map.

import { placeholderImages, getStatusClassName } from './config.js';
import { escapeHtml, setText, formatNum, formatArea, formatVolume, formatCHF, formatDate } from './utils.js';
import { showCarousel } from './carousel.js';
import { showMiniMap } from './mini-map.js';

// ===== POPULATE =====

function geoAdminLink(e, n, layers, zoom) {
  if (!e || !n) return null;
  return 'https://map.geo.admin.ch/#/map?lang=de&center=' + e + ',' + n + '&z=' + (zoom || 12) + '&crosshair=marker&topic=ech&layers=' + layers + '&bgLayer=ch.swisstopo.swissimage';
}

function setLink(id, href) {
  const el = document.getElementById(id);
  if (!el) return;
  if (href) {
    el.href = href;
    el.classList.remove('disabled');
  } else {
    el.removeAttribute('href');
    el.classList.add('disabled');
  }
}

export function populateDetailView(building) {
  const props = building.properties;
  const coords = building.geometry.coordinates;

  // Breadcrumb: adr_land > adr_ort > bbl_we > bbl_obj
  setText('breadcrumb-country', props.adr_land);
  setText('breadcrumb-city', props.adr_ort);
  setText('breadcrumb-we', props.bbl_we);
  setText('breadcrumb-tobj', props.bbl_obj);

  // Master data
  const statusEl = document.getElementById('detail-status');
  if (statusEl) {
    statusEl.innerHTML = props.bbl_stat
      ? '<span class="badge status-badge ' + getStatusClassName(props.bbl_stat) + '">' + escapeHtml(props.bbl_stat) + '</span>'
      : '–';
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

  // Address
  setText('detail-country', props.adr_land);
  setText('detail-region', props.adr_reg);
  setText('detail-city', props.adr_ort);
  setText('detail-plz', props.adr_plz);
  setText('detail-street', props.adr_str);
  setText('detail-housenumber', props.adr_hsnr);
  setText('mini-map-address', props.adr_conct);
  // Row labels of the stacked address layout (narrow columns): the translated column headers
  document.querySelectorAll('.address-table').forEach(function(table) {
    const heads = table.querySelectorAll('thead th');
    table.querySelectorAll('tbody td').forEach(function(td, i) {
      if (heads[i]) td.setAttribute('data-label', heads[i].textContent.trim());
    });
  });

  // Coordinates
  setText('detail-wgs84', props.wgs84_lat != null && props.wgs84_lon != null
    ? Number(props.wgs84_lat).toFixed(6) + ', ' + Number(props.wgs84_lon).toFixed(6) : null);
  setText('detail-lv95', props.lv95_e != null && props.lv95_n != null
    ? formatNum(props.lv95_e, 0) + ', ' + formatNum(props.lv95_n, 0) : null);
  setText('detail-elev', formatNum(props.egm_elev, 1));

  const lat = props.wgs84_lat;
  const lon = props.wgs84_lon;
  const lv95e = props.lv95_e;
  const lv95n = props.lv95_n;
  setLink('detail-link-gmaps', lat && lon ? 'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lon : null);
  setLink('detail-link-streetview', lat && lon ? 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + lat + ',' + lon : null);

  // Official survey
  setText('detail-egid', props.av_egid);
  setText('detail-egrid', props.av_egrid);
  setText('detail-bfs-gem', props.bfs_gem);
  setText('detail-bfs-gemnr', props.bfs_gemnr);
  setLink('detail-link-geoadmin-gwr', geoAdminLink(lv95e, lv95n, 'ch.swisstopo.amtliches-strassenverzeichnis;ch.bfs.gebaeude_wohnungs_register', 12));
  setLink('detail-link-geoadmin-oereb', geoAdminLink(lv95e, lv95n, 'ch.swisstopo-vd.stand-oerebkataster', 12));

  // Zoning
  setText('detail-zbez', props.av_zbez);
  setText('detail-znut', props.av_znut);
  setLink('detail-link-bauzonen', geoAdminLink(lv95e, lv95n, 'ch.are.bauzonen', 8.589));

  // Heritage protection
  setText('detail-hist', props.bbl_hist);
  setText('detail-arch', props.bbl_arch);
  setText('detail-kgs-kat', props.kgs_kat);
  setText('detail-kgs-nr', props.kgs_nr);
  setLink('detail-link-kgs', geoAdminLink(lv95e, lv95n, 'ch.babs.kulturgueter', 8.589));

  // Other
  setText('detail-objectid', props.objectid);
  setText('detail-etl-ts', formatDate(props.etl_ts));

  // Tab: Bemessungen
  setText('detail-garea-gf', formatArea(props.garea_gf));
  setText('detail-garea-gfo', formatArea(props.garea_gfo));
  setText('detail-garea-gfu', formatArea(props.garea_gfu));
  setText('detail-garea-acu', props.garea_acu);
  setText('detail-garea-ngf', formatArea(props.garea_ngf));
  setText('detail-garea-kf', formatArea(props.garea_kf));
  setText('detail-rics-gea', formatArea(props.rics_gea));
  setText('detail-rics-gia', formatArea(props.rics_gia));
  setText('detail-rics-nia', formatArea(props.rics_nia));
  setText('detail-garea-nf', formatArea(props.garea_nf));
  setText('detail-garea-hnf', formatArea(props.garea_hnf));
  setText('detail-garea-nnf', formatArea(props.garea_nnf));
  setText('detail-garea-ff', formatArea(props.garea_ff));
  setText('detail-garea-vf', formatArea(props.garea_vf));
  setText('detail-garea-vmf', formatArea(props.garea_vmf));
  setText('detail-garea-ebf', formatArea(props.garea_ebf));
  setText('detail-gvol-gv', formatVolume(props.gvol_gv));
  setText('detail-gvol-gvo', formatVolume(props.gvol_gvo));
  setText('detail-gvol-gvu', formatVolume(props.gvol_gvu));
  setText('detail-gvol-acu', props.gvol_acu);
  setText('detail-geschosse', props.gastw);
  setText('detail-geschosse-og', props.gastw_og);
  setText('detail-geschosse-ug', props.gastw_ug);
  setText('detail-geschosse-acu', props.gastw_acu);
  setText('detail-larea-ggf', formatArea(props.larea_ggf));
  setText('detail-larea-gsf', formatArea(props.larea_gsf));
  setText('detail-larea-uf', formatArea(props.larea_uf));
  setText('detail-larea-acu', props.larea_acu);

  showCarousel((props.img_url && props.img_url.length > 0) ? props.img_url : placeholderImages, props.photos);
  showMiniMap(coords);
  initInfoIcons();
  initCollapsibleSections();
}

// ===== COLLAPSIBLE SECTIONS =====

let collapsibleSectionsInitialized = false;

function initCollapsibleSections() {
  if (collapsibleSectionsInitialized) return;
  collapsibleSectionsInitialized = true;
  document.querySelectorAll('#detail-view .detail-overline').forEach(function(overline) {
    const chevron = document.createElement('span');
    chevron.className = 'material-symbols-outlined detail-overline-chevron';
    chevron.textContent = 'expand_more';
    overline.appendChild(chevron);
    overline.addEventListener('click', function() { this.classList.toggle('collapsed'); });
  });
}

// ===== INFO TOOLTIPS FOR DETAIL LABELS =====

const labelDescriptions = {
  // Stammdaten
  'Status': 'Aktueller Status des Objekts im SAP-System (bbl_stat)',
  'Bezeichnung': 'Offizielle Objektbezeichnung gemäss SAP (bbl_bez)',
  'ID': 'Interne BBL-ID: Buchungskreis / Wirtschaftseinheit / Teilobjekt (bbl_id)',
  'Objektart 1': 'Gebäudeart Stufe 1 gemäss SAP (bbl_gbda1)',
  'Objektart 2': 'Gebäudeart Stufe 2 gemäss SAP (bbl_gbda2)',
  'Art Eigentum': 'Eigentumsverhältnis: Eigentum Bund, Miete, etc. (bbl_eigen)',
  'Objektstrategie': 'Strategische Ausrichtung: Erhalten, Optimieren, Veräussern (bbl_ostr)',
  'Mietmodell': 'Mietmodell gemäss SAP: Vollkosten-, Kosten-, Marktmiete (bbl_mietm)',
  'Teilportfolio': 'Teilportfolio-Zuordnung gemäss SAP (bbl_port)',
  'Portfoliogruppe': 'Übergeordnete Teilportfoliogruppe (bbl_port2)',
  'Baujahr': 'Erstellungsjahr des Gebäudes (bbl_bjahr)',
  'Verkaufsjahr': 'Jahr des Verkaufs, leer wenn nicht verkauft (bbl_vjahr)',
  'Anschaffungswert': 'Anschaffungswert in Schweizer Franken (bbl_awrt)',
  'Buchwert': 'Aktueller Buchwert in Schweizer Franken (bbl_bwrt)',
  // Kontakte
  'Verantwortlich': 'Objektverantwortliche Person gemäss SAP (bbl_ovtw)',
  'Portfoliomanager': 'Zuständiger Portfoliomanager gemäss SAP (bbl_pvtw)',
  // Adresse
  'Adresse': 'Verkettet aus Strasse, Hausnummer, PLZ und Ort (adr_conct)',
  // Koordinaten
  'WGS84': 'Breitengrad und Längengrad im World Geodetic System 1984 (wgs84_lat, wgs84_lon)',
  'LV95': 'Schweizer Landeskoordinaten, aus WGS84 hergeleitet (lv95_e, lv95_n)',
  'EGM Höhe': 'Absolute Höhe über Meeresspiegel in Metern, EGM2008-Geoid (egm_elev)',
  // Amtliche Vermessung
  'EGID': 'Eidgenössischer Gebäudeidentifikator, nur Schweiz (av_egid)',
  'EGRID': 'Eidgenössischer Grundstücksidentifikator, nur Schweiz (av_egrid)',
  'Gemeindename': 'BFS Gemeindename gemäss amtlichem Gemeindeverzeichnis (bfs_gem)',
  'Gemeindenummer': 'BFS Gemeindenummer gemäss amtlichem Gemeindeverzeichnis (bfs_gemnr)',
  // Denkmalschutz
  'Hist. Ausstattung': 'Historische Ausstattung gemäss SAP (bbl_hist)',
  'Archivwürdigkeit': 'Archivwürdigkeit gemäss SAP (bbl_arch)',
  'KGS Kategorie': 'Kategorie im Schweizerischen Kulturgüterschutz-Inventar: A, B oder C (kgs_kat)',
  'KGS Nummer': 'Identifikationsnummer im KGS-Inventar (kgs_nr)',
  // Bemessungen
  'Geschossfläche GF': 'Brutto-Geschossfläche aller Geschosse nach SIA 416 (garea_gf)',
  'GF Oberirdisch': 'Geschossfläche der oberirdischen Geschosse (garea_gfo)',
  'GF Unterirdisch': 'Geschossfläche der unterirdischen Geschosse (garea_gfu)',
  'Genauigkeit': 'Angabe zur Datenherkunft: Vermessen, Geschätzt, oder AV',
  'Netto-Geschossfl. NGF': 'Nutzbare Fläche ohne Konstruktionsfläche nach SIA 416 (garea_ngf)',
  'Nutzfläche NF': 'Summe Haupt- und Nebennutzfläche nach SIA 416 (garea_nf)',
  'Hauptnutzfläche HNF': 'Fläche für die Hauptnutzung des Gebäudes nach SIA 416 (garea_hnf)',
  'Nebennutzfläche NNF': 'Fläche für Nebennutzungen nach SIA 416 (garea_nnf)',
  'Funktionsfläche FF': 'Fläche für gebäudetechnische Anlagen nach SIA 416 (garea_ff)',
  'Verkehrsfläche VF': 'Erschliessungsfläche: Korridore, Treppenhäuser, Aufzüge (garea_vf)',
  'Vermietbare Fl. VMF': 'Vermietbare Fläche nach SIA 416 (garea_vmf)',
  'Energiebezugsfl. EBF': 'Energiebezugsfläche nach SIA 380, Grundlage für Energiekennzahlen (garea_ebf)',
  'Gebäudevolumen GV': 'Gesamtes Gebäudevolumen nach SIA 416 (gvol_gv)',
  'GV Oberirdisch': 'Volumen der oberirdischen Gebäudeteile (gvol_gvo)',
  'GV Unterirdisch': 'Volumen der unterirdischen Gebäudeteile (gvol_gvu)',
  'Anzahl Total': 'Gesamtanzahl Geschosse ober- und unterirdisch (gastw)',
  'Oberirdisch': 'Anzahl Geschosse über Terrain (gastw_og)',
  'Unterirdisch': 'Anzahl Geschosse unter Terrain (gastw_ug)',
  'Gebäudegrundfläche GGF': 'Grundrissfläche des Gebäudes am Boden nach SIA 416 (larea_ggf)',
  'Grundstücksfläche GSF': 'Gesamtfläche des Grundstücks nach SIA 416 (larea_gsf)',
  'Umgebungsfläche UF': 'Grundstücksfläche abzüglich Gebäudegrundfläche (larea_uf)',
  // Sonstiges
  'OBJECTID': 'Interne ESRI-System-ID für GIS-Updates (objectid)',
  'ETL Zeitstempel': 'Zeitpunkt der letzten Synchronisation aus den Quellsystemen (etl_ts)'
};

// Inject info icons as third column and make rows clickable (run once)
let infoIconsInitialized = false;

function initInfoIcons() {
  if (infoIconsInitialized) return;
  infoIconsInitialized = true;

  document.querySelectorAll('#detail-view .detail-grid-row').forEach(function(row) {
    const label = row.querySelector('.detail-label');
    if (!label) return;
    const desc = labelDescriptions[label.textContent.trim()];
    if (!desc) return;
    row.setAttribute('data-desc', desc);
    const icon = document.createElement('span');
    icon.className = 'info-icon';
    icon.textContent = 'info';
    icon.title = desc;
    row.appendChild(icon);
  });

  // Clicking anywhere on a row with a description toggles its popover
  document.getElementById('detail-view').addEventListener('click', function(e) {
    const row = e.target.closest('.detail-grid-row[data-desc]');
    const open = document.querySelector('.info-popover.active');
    if (!row) {
      if (open) open.remove();
      return;
    }
    if (e.target.closest('a')) return;
    if (open) {
      const wasOnSame = open.parentElement === row;
      open.remove();
      if (wasOnSame) return;
    }
    const popover = document.createElement('div');
    popover.className = 'info-popover active';
    popover.textContent = row.getAttribute('data-desc');
    row.appendChild(popover);
  });
}
