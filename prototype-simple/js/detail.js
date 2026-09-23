// Detail view: fields, carousel and mini map.

import { placeholderImages, getStatusClassName } from './config.js';
import { escapeHtml, setText, formatNum, formatArea, formatVolume, formatCHF, formatDate } from './utils.js';
import { showCarousel } from './carousel.js';
import { showMiniMap } from './mini-map.js';
import { onLangChange } from './i18n.js';

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

// Row labels of the stacked address layout (narrow columns): the translated column headers.
// Only labelled cells take part; the marker column stays without a label.
function translateAddressLabels() {
  const table = document.querySelector('.address-table');
  if (!table) return;
  const headers = table.querySelectorAll('thead th');
  table.querySelectorAll('tbody td').forEach(function(cell, index) {
    if (cell.hasAttribute('data-label')) cell.dataset.label = headers[index]?.textContent.trim() || '';
  });
}
onLangChange(translateAddressLabels);

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
  translateAddressLabels();

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
  setText('detail-gwr-status', props.gwr_stat);
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
}
