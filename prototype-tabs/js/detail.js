// Detail view: fields of the overview tab, carousel, mini map and the entity tables.

import { placeholderImages } from './config.js';
import { setText, formatDate, extractYear, formatBoolean } from './utils.js';
import { showCarousel } from './carousel.js';
import { showMiniMap } from './mini-map.js';
import { loadEntityTablesForBuilding } from './entity-tables.js';

// Street and house number from "Strasse Nr, PLZ Ort" or "Nr Street, City, State PLZ"
function parseAddress(address) {
  const result = { street: '', number: '', plz: '' };
  if (!address) return result;

  const commaParts = String(address).split(',');
  const streetPart = commaParts[0].trim();
  if (commaParts.length > 1) {
    const plzMatch = commaParts.slice(1).join(',').match(/\b(\d{4,5})\b/);
    if (plzMatch) result.plz = plzMatch[1];
  }

  const endNumberMatch = streetPart.match(/^(.+?)\s+(\d+[A-Za-z]?)$/);   // European: "Strasse 123"
  const startNumberMatch = streetPart.match(/^(\d+[A-Za-z]?)\s+(.+)$/);  // US/UK: "123 Street"
  if (endNumberMatch) {
    result.street = endNumberMatch[1];
    result.number = endNumberMatch[2];
  } else if (startNumberMatch) {
    result.number = startNumberMatch[1];
    result.street = startNumberMatch[2];
  } else {
    result.street = streetPart;
  }
  return result;
}

function numberOrDash(value) {
  return value !== undefined && value !== null ? String(value) : null;
}

export function populateDetailView(building) {
  const props = building.properties;
  const ext = props.extensionData || {};
  const coords = building.geometry.coordinates;

  // Breadcrumb
  setText('breadcrumb-name', props.name);
  setText('breadcrumb-country', props.country);
  setText('breadcrumb-region', props.stateProvincePrefecture);

  // Master data
  setText('detail-name', props.name);
  setText('detail-id', props.buildingId);
  setText('detail-teilportfolio', ext.portfolio);
  setText('detail-baujahr', extractYear(props.constructionYear));

  // Address
  const addressParts = parseAddress(props.streetName);
  setText('detail-country', props.country);
  setText('detail-region', props.stateProvincePrefecture);
  setText('detail-city', props.city);
  setText('detail-plz', props.postalCode);
  setText('detail-street', addressParts.street);
  setText('detail-housenumber', props.houseNumber);

  // Building data
  setText('detail-sanierung', extractYear(props.yearOfLastRefurbishment));
  setText('detail-ladestationen', numberOrDash(props.electricVehicleChargingStations));
  setText('detail-denkmalschutz', formatBoolean(props.monumentProtection));
  setText('detail-parkplaetze', numberOrDash(props.parkingSpaces));
  setText('detail-geschosse', numberOrDash(ext.numberOfFloors));
  setText('detail-baubewilligung', formatDate(props.buildingPermitDate));

  // Energy
  setText('detail-energieklasse', props.energyEfficiencyClass);
  setText('detail-waermeerzeuger', ext.heatingGenerator);
  setText('detail-waermequelle', ext.heatingSource);
  setText('detail-warmwasser', ext.hotWater);

  // Parcel
  setText('detail-grundstueck-name', ext.plotName);
  setText('detail-grundstueck-id', ext.plotId);
  setText('detail-egid', ext.egid);
  setText('detail-egrid', ext.egrid);
  setText('detail-gueltig-von', formatDate(props.validFrom));
  setText('detail-gueltig-bis', formatDate(props.validUntil) || 'Keine Angabe');

  // Classification
  setText('detail-objektart1', props.primaryTypeOfBuilding);
  setText('detail-teilportfolio-gruppe', ext.portfolioGroup);
  setText('detail-objektart2', props.secondaryTypeOfBuilding);
  setText('detail-eigentum', props.typeOfOwnership);

  loadEntityTablesForBuilding(building);
  showCarousel(placeholderImages);
  showMiniMap(coords);
}
