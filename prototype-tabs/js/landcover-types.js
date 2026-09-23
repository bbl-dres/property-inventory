// AV land cover (Bodenbedeckung, DM.01-AV-CH "BBArt"), identical in both prototypes: the 26 types, their six
// main groups and the official fill colours. The colours are the "Bodenbedeckung (farbig)" table of the
// KKVA/KGK-CGC recommendation "AV-WMS – Web Map Service mit den Daten der Amtlichen Vermessung, Empfehlungen
// für die Realisierung" (version 1.5, 31 March 2010), the definition behind the nationwide geodienste.ch
// service "AV: Standard (farbig)": pastel fills, a black 1px outline, no fill for the vegetationslos types.
// The data pipeline (scripts/portfolio/generate.py) carries the same type table.

import { tf } from './i18n.js';

export const LAND_COVER_GROUPS = ['gebaeude', 'befestigt', 'humusiert', 'gewaesser', 'bestockt', 'vegetationslos'];

export const LAND_COVER_TYPES = {
  Gebaeude: 'gebaeude',
  Strasse_Weg: 'befestigt',
  Trottoir: 'befestigt',
  Verkehrsinsel: 'befestigt',
  Bahn: 'befestigt',
  Flugplatz: 'befestigt',
  Wasserbecken: 'befestigt',
  uebrige_befestigte: 'befestigt',
  Acker_Wiese_Weide: 'humusiert',
  Reben: 'humusiert',
  uebrige_Intensivkultur: 'humusiert',
  Gartenanlage: 'humusiert',
  Hoch_Flachmoor: 'humusiert',
  uebrige_humusierte: 'humusiert',
  Gewaesser_stehendes: 'gewaesser',
  Gewaesser_fliessendes: 'gewaesser',
  Schilfguertel: 'gewaesser',
  geschlossener_Wald: 'bestockt',
  Wytweide_dicht: 'bestockt',
  Wytweide_offen: 'bestockt',
  uebrige_bestockte: 'bestockt',
  Fels: 'vegetationslos',
  Gletscher_Firn: 'vegetationslos',
  Geroell_Sand: 'vegetationslos',
  Abbau_Deponie: 'vegetationslos',
  uebrige_vegetationslose: 'vegetationslos'
};

// Fill RGB of the AV-WMS colour definition; null = no fill (0,0,0,0)
export const LAND_COVER_COLORS = {
  Gebaeude: '#FFC8C8',            // 255,200,200
  Strasse_Weg: '#DCDCDC',         // 220,220,220
  Trottoir: '#DCDCDC',
  Verkehrsinsel: '#DCDCDC',
  Bahn: '#F0E6C8',                // 240,230,200
  Flugplatz: '#DCDCDC',
  Wasserbecken: '#96C8FF',        // 150,200,255
  uebrige_befestigte: '#F0F0F0',  // 240,240,240
  Acker_Wiese_Weide: '#F0FFC8',   // 240,255,200
  Reben: '#FFFFC8',               // 255,255,200
  uebrige_Intensivkultur: '#FFFFC8',
  Gartenanlage: '#F0FFC8',
  Hoch_Flachmoor: '#C8FFF0',      // 200,255,240
  uebrige_humusierte: '#F0FFC8',
  Gewaesser_stehendes: '#96C8FF',
  Gewaesser_fliessendes: '#96C8FF',
  Schilfguertel: '#C8FFF0',
  geschlossener_Wald: '#A0F0A0',  // 160,240,160
  Wytweide_dicht: '#C8F0A0',      // 200,240,160
  Wytweide_offen: '#C8F0A0',
  uebrige_bestockte: '#C8F0A0',
  Fels: null,
  Gletscher_Firn: null,
  Geroell_Sand: null,
  Abbau_Deponie: null,
  uebrige_vegetationslose: null
};

// Outline "Rand (0,0,0), solid, 1px" of every land cover polygon
export const LAND_COVER_OUTLINE = '#000000';

// Main group of a type; a group name passes through, anything unknown counts as sealed surface
export function landCoverGroup(type) {
  return LAND_COVER_TYPES[type] || (LAND_COVER_GROUPS.indexOf(type) !== -1 ? type : 'befestigt');
}

// Fill colour of a type (null for the vegetationslos types, which have no fill)
export function landCoverColor(type) {
  return LAND_COVER_COLORS[type] === undefined ? LAND_COVER_COLORS.uebrige_befestigte : LAND_COVER_COLORS[type];
}

// MapLibre paint expression: the fill colour of a feature by its type property. noFill replaces the
// transparent fill of the vegetationslos types (a highlight layer needs a colour there).
export function landCoverColorExpression(typeProperty, noFill) {
  const expr = ['match', ['get', typeProperty]];
  Object.keys(LAND_COVER_TYPES).forEach(function(type) {
    expr.push(type, landCoverColor(type) || noFill || 'rgba(0, 0, 0, 0)');
  });
  expr.push(LAND_COVER_COLORS.uebrige_befestigte);
  return expr;
}

export function landCoverTypeLabel(type) {
  return type ? tf('landcover.type.' + type, type) : '—';
}

export function landCoverGroupLabel(group) {
  return tf('landcover.group.' + group, group);
}
