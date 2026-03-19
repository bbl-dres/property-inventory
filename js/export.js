// Export panel, data export, share link, and social sharing functions

import { state } from './state.js';
import { escapeXml, downloadBlob } from './utils.js';
import { showToast } from './ui.js';
import { t } from './i18n.js';

export function initExportPanel() {
  // Format card selection
  document.querySelectorAll('.export-format-card').forEach(function(card) {
    card.addEventListener('click', function() {
      document.querySelectorAll('.export-format-card').forEach(function(c) {
        c.classList.remove('active');
      });
      this.classList.add('active');
      state.selectedExportFormat = this.getAttribute('data-format');
    });
  });

  // Data selection change
  const dataSelection = document.getElementById('export-data-selection');
  if (dataSelection) {
    dataSelection.addEventListener('change', updateExportCount);
  }

  // Export button
  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', performExport);
  }

  // Initial count update
  updateExportCount();
}

export function updateExportCount() {
  const countEl = document.getElementById('export-count');
  const dataSelection = document.getElementById('export-data-selection');
  if (!countEl || !dataSelection) return;

  let count = 0;
  const selection = dataSelection.value;

  if (selection === 'filtered') {
    count = state.filteredData ? state.filteredData.features.length : 0;
  } else if (selection === 'all') {
    count = state.buildingsData ? state.buildingsData.features.length : 0;
  } else if (selection === 'selected') {
    count = state.selectedBuildingId ? 1 : 0;
  }

  countEl.textContent = t('export.count', {count: count, plural: count !== 1 ? 'e' : ''});
}

export function getExportData() {
  const dataSelection = document.getElementById('export-data-selection');
  const selection = dataSelection ? dataSelection.value : 'filtered';

  if (selection === 'filtered') {
    return state.filteredData ? state.filteredData.features : [];
  } else if (selection === 'all') {
    return state.buildingsData ? state.buildingsData.features : [];
  } else if (selection === 'selected' && state.selectedBuildingId) {
    const building = state.buildingsData.features.find(function(b) {
      return b.properties.bbl_id === state.selectedBuildingId;
    });
    return building ? [building] : [];
  }
  return [];
}

export function performExport() {
  const data = getExportData();
  if (data.length === 0) {
    showToast({ type: 'error', message: t('error.export.nodata') });
    return;
  }

  const btn = document.getElementById('export-btn');
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span><span>' + t('export.exporting') + '</span>';
  btn.disabled = true;

  setTimeout(function() {
    try {
      switch (state.selectedExportFormat) {
        case 'geojson':
          exportGeoJSON(data);
          break;
        case 'csv':
          exportCSV(data);
          break;
        case 'kml':
          exportKML(data);
          break;
        case 'shapefile':
          exportShapefile(data);
          break;
      }
      showToast({ type: 'success', message: t('success.export.done') });
    } catch (e) {
      console.error('Export error:', e);
      showToast({ type: 'error', message: t('error.export', {message: e.message}) });
    }

    btn.innerHTML = originalHTML;
    btn.disabled = false;
  }, 300);
}

export function exportGeoJSON(data) {
  const includeCoords = document.getElementById('export-coords').checked;
  const includeParcels = document.getElementById('export-parcels').checked;

  const featureCollection = {
    type: 'FeatureCollection',
    features: data.map(function(feature) {
      const exportFeature = JSON.parse(JSON.stringify(feature));
      if (!includeCoords) {
        delete exportFeature.geometry;
      }
      return exportFeature;
    })
  };

  // Add parcels if requested
  if (includeParcels && state.parcelData && state.parcelData.features) {
    featureCollection.features = featureCollection.features.concat(
      state.parcelData.features.map(function(f) {
        return JSON.parse(JSON.stringify(f));
      })
    );
  }

  const blob = new Blob([JSON.stringify(featureCollection, null, 2)], { type: 'application/geo+json' });
  downloadBlob(blob, 'bbl-portfolio-export.geojson');
}

export function exportCSV(data) {
  const allFields = document.getElementById('export-all-fields').checked;
  const visibleOnly = document.getElementById('export-visible-only').checked;
  const includeCoords = document.getElementById('export-coords').checked;

  // Define columns
  let columns = ['bbl_id', 'bbl_bez', 'adr_conct', 'adr_ort', 'adr_land', 'bbl_stat', 'garea_ngf'];

  if (allFields && !visibleOnly) {
    columns = ['bbl_id', 'bbl_bez', 'bbl_stat', 'bbl_eigen', 'bbl_gbda1', 'bbl_gbda2',
              'bbl_ostr', 'bbl_port', 'bbl_port2', 'bbl_bjahr',
              'adr_land', 'adr_reg', 'adr_ort', 'adr_plz', 'adr_str', 'adr_hsnr',
              'av_egid', 'av_egrid', 'bfs_gem', 'bfs_gemnr',
              'bbl_awrt', 'bbl_bwrt', 'garea_gf', 'garea_ngf', 'garea_ebf'];
  }

  if (includeCoords) {
    columns.push('longitude', 'latitude');
  }

  // Build CSV content
  let csvContent = columns.join(';') + '\n';

  data.forEach(function(feature) {
    const props = feature.properties || {};
    const row = columns.map(function(col) {
      if (col === 'longitude' && feature.geometry && feature.geometry.coordinates) {
        return feature.geometry.coordinates[0];
      }
      if (col === 'latitude' && feature.geometry && feature.geometry.coordinates) {
        return feature.geometry.coordinates[1];
      }
      const value = props[col];
      if (value === null || value === undefined) return '';
      // Escape quotes and wrap in quotes if contains separator
      let strValue = String(value);
      if (strValue.includes(';') || strValue.includes('"') || strValue.includes('\n')) {
        strValue = '"' + strValue.replace(/"/g, '""') + '"';
      }
      return strValue;
    });
    csvContent += row.join(';') + '\n';
  });

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' }); // BOM for Excel
  downloadBlob(blob, 'bbl-portfolio-export.csv');
}

export function exportKML(data) {
  const includeCoords = document.getElementById('export-coords').checked;

  let kmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
  kmlContent += '<kml xmlns="http://www.opengis.net/kml/2.2">\n';
  kmlContent += '  <Document>\n';
  kmlContent += '    <name>BBL Immobilienportfolio</name>\n';
  kmlContent += '    <description>Export vom ' + new Date().toLocaleDateString('de-CH') + '</description>\n';

  // Define styles for different statuses
  const statusStyles = {
    'Aktiv': { color: 'ff50af4c', icon: 'grn-circle' },
    'In Renovation': { color: 'ff0098ff', icon: 'orange-circle' },
    'In Planung': { color: 'fff39621', icon: 'blu-circle' },
    'Verkauft': { color: 'ff9e9e9e', icon: 'grey-circle' }
  };

  Object.keys(statusStyles).forEach(function(status) {
    const style = statusStyles[status];
    kmlContent += '    <Style id="style-' + status.replace(/\s/g, '-') + '">\n';
    kmlContent += '      <IconStyle>\n';
    kmlContent += '        <color>' + style.color + '</color>\n';
    kmlContent += '        <scale>1.0</scale>\n';
    kmlContent += '        <Icon><href>http://maps.google.com/mapfiles/kml/paddle/' + style.icon + '.png</href></Icon>\n';
    kmlContent += '      </IconStyle>\n';
    kmlContent += '    </Style>\n';
  });

  data.forEach(function(feature) {
    const props = feature.properties || {};
    const coords = feature.geometry && feature.geometry.coordinates ? feature.geometry.coordinates : [0, 0];
    const status = props.bbl_stat || 'Aktiv';

    kmlContent += '    <Placemark>\n';
    kmlContent += '      <name>' + escapeXml(props.bbl_bez || 'Unbekannt') + '</name>\n';
    kmlContent += '      <description><![CDATA[\n';
    kmlContent += '        <b>Adresse:</b> ' + escapeXml(props.adr_conct || '') + '<br>\n';
    kmlContent += '        <b>Ort:</b> ' + escapeXml(props.adr_ort || '') + '<br>\n';
    kmlContent += '        <b>Status:</b> ' + escapeXml(status) + '<br>\n';
    kmlContent += '        <b>GF:</b> ' + (props.garea_gf ? Number(props.garea_gf).toLocaleString('de-CH') + ' m\u00B2' : '-') + '\n';
    kmlContent += '      ]]></description>\n';
    kmlContent += '      <styleUrl>#style-' + status.replace(/\s/g, '-') + '</styleUrl>\n';

    if (includeCoords) {
      kmlContent += '      <Point>\n';
      kmlContent += '        <coordinates>' + coords[0] + ',' + coords[1] + ',0</coordinates>\n';
      kmlContent += '      </Point>\n';
    }

    kmlContent += '    </Placemark>\n';
  });

  kmlContent += '  </Document>\n';
  kmlContent += '</kml>';

  const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
  downloadBlob(blob, 'bbl-portfolio-export.kml');
}

export function exportShapefile(data) {
  // Shapefile export requires external library or server-side processing
  // For now, we'll export as GeoJSON with a note about conversion
  showToast({ type: 'info', title: 'Shapefile-Export', message: 'GeoJSON wird erstellt. Konvertieren Sie mit QGIS oder ogr2ogr zu Shapefile.' });

  const includeCoords = document.getElementById('export-coords').checked;

  const featureCollection = {
    type: 'FeatureCollection',
    name: 'bbl_portfolio',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
    features: data.map(function(feature) {
      const exportFeature = JSON.parse(JSON.stringify(feature));
      // Flatten properties for shapefile compatibility (10 char field names)
      if (exportFeature.properties) {
        const props = exportFeature.properties;
        exportFeature.properties = {
          bbl_id: props.bbl_id,
          bbl_bez: (props.bbl_bez || '').substring(0, 254),
          bbl_stat: (props.bbl_stat || '').substring(0, 50),
          adr_conct: (props.adr_conct || '').substring(0, 254),
          adr_ort: (props.adr_ort || '').substring(0, 80),
          adr_land: (props.adr_land || '').substring(0, 80),
          bbl_port: (props.bbl_port || '').substring(0, 80),
          garea_gf: props.garea_gf,
          bbl_bjahr: props.bbl_bjahr
        };
      }
      if (!includeCoords) {
        delete exportFeature.geometry;
      }
      return exportFeature;
    })
  };

  const blob = new Blob([JSON.stringify(featureCollection, null, 2)], { type: 'application/geo+json' });
  downloadBlob(blob, 'bbl-portfolio-for-shapefile.geojson');
}

// ===== SHARE LINK AND SOCIAL SHARING =====

export function getShareUrl() {
  const baseUrl = window.location.origin + window.location.pathname;
  const params = new URLSearchParams(window.location.search);

  // Add current map position if map exists
  if (state.map) {
    const center = state.map.getCenter();
    const zoom = state.map.getZoom();
    params.set('lng', center.lng.toFixed(5));
    params.set('lat', center.lat.toFixed(5));
    params.set('zoom', zoom.toFixed(2));
  }

  // Add selected building or parcel if one is selected
  if (state.selectedBuildingId) {
    params.set('id', state.selectedBuildingId);
    params.delete('parcelId');
  } else if (state.selectedParcelId) {
    params.set('parcelId', state.selectedParcelId);
    params.delete('id');
  } else {
    params.delete('id');
    params.delete('parcelId');
  }

  return baseUrl + '?' + params.toString();
}

export function updateShareLink() {
  const input = document.getElementById('share-link-input');
  if (input) {
    input.value = getShareUrl();
  }
}

export function shareViaEmail() {
  const url = getShareUrl();
  const subject = encodeURIComponent(t('share.email.subject'));
  const body = encodeURIComponent(t('share.email.body') + '\n\n' + url);
  window.open('mailto:?subject=' + subject + '&body=' + body, '_self');
}

export function shareViaFacebook() {
  const url = encodeURIComponent(getShareUrl());
  window.open('https://www.facebook.com/sharer/sharer.php?u=' + url, '_blank', 'width=600,height=400');
}

export function shareViaLinkedIn() {
  const url = encodeURIComponent(getShareUrl());
  window.open('https://www.linkedin.com/sharing/share-offsite/?url=' + url, '_blank', 'width=600,height=400');
}

export function shareViaX() {
  const url = encodeURIComponent(getShareUrl());
  const text = encodeURIComponent(t('share.email.subject'));
  window.open('https://twitter.com/intent/tweet?url=' + url + '&text=' + text, '_blank', 'width=600,height=400');
}

export function copyShareLink() {
  const input = document.getElementById('share-link-input');
  const button = document.querySelector('.share-copy-btn');

  if (input && navigator.clipboard) {
    navigator.clipboard.writeText(input.value).then(function() {
      button.textContent = t('accordion.share.copied');
      button.classList.add('copied');
      setTimeout(function() {
        button.textContent = t('accordion.share.copy');
        button.classList.remove('copied');
      }, 2000);
    });
  } else if (input) {
    // Fallback for older browsers
    input.select();
    document.execCommand('copy');
    button.textContent = t('accordion.share.copied');
    button.classList.add('copied');
    setTimeout(function() {
      button.textContent = t('accordion.share.copy');
      button.classList.remove('copied');
    }, 2000);
  }
}
