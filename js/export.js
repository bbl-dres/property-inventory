// Export panel and data export functions

import { state } from './state.js';
import { escapeXml, downloadBlob } from './utils.js';
import { showToast } from './toast.js';

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
  var dataSelection = document.getElementById('export-data-selection');
  if (dataSelection) {
    dataSelection.addEventListener('change', updateExportCount);
  }

  // Export button
  var exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', performExport);
  }

  // Initial count update
  updateExportCount();
}

export function updateExportCount() {
  var countEl = document.getElementById('export-count');
  var dataSelection = document.getElementById('export-data-selection');
  if (!countEl || !dataSelection) return;

  var count = 0;
  var selection = dataSelection.value;

  if (selection === 'filtered') {
    count = state.filteredData ? state.filteredData.features.length : 0;
  } else if (selection === 'all') {
    count = state.portfolioData ? state.portfolioData.features.length : 0;
  } else if (selection === 'selected') {
    count = state.selectedBuildingId ? 1 : 0;
  }

  countEl.textContent = count + ' Objekt' + (count !== 1 ? 'e' : '') + ' werden exportiert';
}

export function getExportData() {
  var dataSelection = document.getElementById('export-data-selection');
  var selection = dataSelection ? dataSelection.value : 'filtered';

  if (selection === 'filtered') {
    return state.filteredData ? state.filteredData.features : [];
  } else if (selection === 'all') {
    return state.portfolioData ? state.portfolioData.features : [];
  } else if (selection === 'selected' && state.selectedBuildingId) {
    var building = state.portfolioData.features.find(function(b) {
      return b.properties.bbl_id === state.selectedBuildingId;
    });
    return building ? [building] : [];
  }
  return [];
}

export function performExport() {
  var data = getExportData();
  if (data.length === 0) {
    showToast({ type: 'error', message: 'Keine Daten zum Exportieren vorhanden' });
    return;
  }

  var btn = document.getElementById('export-btn');
  var originalHTML = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span><span>Exportiere...</span>';
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
      showToast({ type: 'success', message: 'Export erfolgreich abgeschlossen' });
    } catch (e) {
      console.error('Export error:', e);
      showToast({ type: 'error', message: 'Fehler beim Export: ' + e.message });
    }

    btn.innerHTML = originalHTML;
    btn.disabled = false;
  }, 300);
}

export function exportGeoJSON(data) {
  var includeCoords = document.getElementById('export-coords').checked;
  var includeParcels = document.getElementById('export-parcels').checked;

  var featureCollection = {
    type: 'FeatureCollection',
    features: data.map(function(feature) {
      var exportFeature = JSON.parse(JSON.stringify(feature));
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

  var blob = new Blob([JSON.stringify(featureCollection, null, 2)], { type: 'application/geo+json' });
  downloadBlob(blob, 'bbl-portfolio-export.geojson');
}

export function exportCSV(data) {
  var allFields = document.getElementById('export-all-fields').checked;
  var visibleOnly = document.getElementById('export-visible-only').checked;
  var includeCoords = document.getElementById('export-coords').checked;

  // Define columns
  var columns = ['bbl_id', 'bbl_bez', 'adr_conct', 'adr_ort', 'adr_land', 'bbl_stat', 'garea_ngf'];

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
  var csvContent = columns.join(';') + '\n';

  data.forEach(function(feature) {
    var props = feature.properties || {};
    var row = columns.map(function(col) {
      if (col === 'longitude' && feature.geometry && feature.geometry.coordinates) {
        return feature.geometry.coordinates[0];
      }
      if (col === 'latitude' && feature.geometry && feature.geometry.coordinates) {
        return feature.geometry.coordinates[1];
      }
      var value = props[col];
      if (value === null || value === undefined) return '';
      // Escape quotes and wrap in quotes if contains separator
      var strValue = String(value);
      if (strValue.includes(';') || strValue.includes('"') || strValue.includes('\n')) {
        strValue = '"' + strValue.replace(/"/g, '""') + '"';
      }
      return strValue;
    });
    csvContent += row.join(';') + '\n';
  });

  var blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' }); // BOM for Excel
  downloadBlob(blob, 'bbl-portfolio-export.csv');
}

export function exportKML(data) {
  var includeCoords = document.getElementById('export-coords').checked;

  var kmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
  kmlContent += '<kml xmlns="http://www.opengis.net/kml/2.2">\n';
  kmlContent += '  <Document>\n';
  kmlContent += '    <name>BBL Immobilienportfolio</name>\n';
  kmlContent += '    <description>Export vom ' + new Date().toLocaleDateString('de-CH') + '</description>\n';

  // Define styles for different statuses
  var statusStyles = {
    'Aktiv': { color: 'ff50af4c', icon: 'grn-circle' },
    'In Renovation': { color: 'ff0098ff', icon: 'orange-circle' },
    'In Planung': { color: 'fff39621', icon: 'blu-circle' },
    'Verkauft': { color: 'ff9e9e9e', icon: 'grey-circle' }
  };

  Object.keys(statusStyles).forEach(function(status) {
    var style = statusStyles[status];
    kmlContent += '    <Style id="style-' + status.replace(/\s/g, '-') + '">\n';
    kmlContent += '      <IconStyle>\n';
    kmlContent += '        <color>' + style.color + '</color>\n';
    kmlContent += '        <scale>1.0</scale>\n';
    kmlContent += '        <Icon><href>http://maps.google.com/mapfiles/kml/paddle/' + style.icon + '.png</href></Icon>\n';
    kmlContent += '      </IconStyle>\n';
    kmlContent += '    </Style>\n';
  });

  data.forEach(function(feature) {
    var props = feature.properties || {};
    var coords = feature.geometry && feature.geometry.coordinates ? feature.geometry.coordinates : [0, 0];
    var status = props.bbl_stat || 'Aktiv';

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

  var blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
  downloadBlob(blob, 'bbl-portfolio-export.kml');
}

export function exportShapefile(data) {
  // Shapefile export requires external library or server-side processing
  // For now, we'll export as GeoJSON with a note about conversion
  showToast({ type: 'info', title: 'Shapefile-Export', message: 'GeoJSON wird erstellt. Konvertieren Sie mit QGIS oder ogr2ogr zu Shapefile.' });

  var includeCoords = document.getElementById('export-coords').checked;

  var featureCollection = {
    type: 'FeatureCollection',
    name: 'bbl_portfolio',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
    features: data.map(function(feature) {
      var exportFeature = JSON.parse(JSON.stringify(feature));
      // Flatten properties for shapefile compatibility (10 char field names)
      if (exportFeature.properties) {
        var props = exportFeature.properties;
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

  var blob = new Blob([JSON.stringify(featureCollection, null, 2)], { type: 'application/geo+json' });
  downloadBlob(blob, 'bbl-portfolio-for-shapefile.geojson');
}
