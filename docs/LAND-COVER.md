# Land cover (Bodenabdeckung) in both prototypes

Findings of the land-cover investigation (September 2026) and what was implemented. Both prototypes now
carry the same land-cover feature layer; the Swiss parcels use official survey data, the overseas parcels
keep schematic demonstration polygons.

## Starting point

- `prototype-simple` had a "Bodenabdeckung" layer, table tab and info panel with 70 synthetic polygons
  (a building footprint plus four surrounding rectangles per parcel, clipped to the real parcel in
  Switzerland). `prototype-tabs` had no land cover at all.
- The layer was switched on by default and coloured with an ad-hoc palette of four types.

## Investigation: real data

### Switzerland: the landcover-survey repository

[bbl-dres/landcover-survey](https://github.com/bbl-dres/landcover-survey) calculates land-cover areas per
Swiss cadastral parcel. Its web app fetches the official land cover of the cadastral survey (Amtliche
Vermessung, information layer *Bodenbedeckung*, INTERLIS `BBArt`) live from the **WFS of geodienste.ch**,
feature type `ms:LCSF`, queried by the parcel's bounding box and clipped to the parcel with Turf.js; the
parcel geometry comes from the geo.admin.ch `find` service by EGRID. Its Python CLI does the same from a
local AV GeoPackage.

What we reused:

| Item | Source in landcover-survey | Used here |
|---|---|---|
| WFS request | `web/js/processor.js` (`GetFeature`, `TYPENAMES=ms:LCSF`, WGS84 bbox, `OUTPUTFORMAT=geojson`, paging with `COUNT`/`STARTINDEX`) | `scripts/portfolio/swiss_landcover.py` |
| 26 BBArt types, six main groups, DE/FR/IT names | `data/landcover.json` | `js/landcover-types.js` (both prototypes), `data/i18n.json` (English added) |
| Sliver handling | drop tiny clipped pieces | generator drops parts < 0.05 m² and pieces < 0.5 m² |

Coverage (state March 2025 per the survey app's manual): 20 cantons publish their land cover freely on
geodienste.ch (AG, AI, AR, BE, BL, BS, FR, GE, GL, GR, SG, SH, SO, SZ, TG, UR, ZG, ZH), TI and VS partially;
JU, LU, NE, NW, OW and VD require a contract. All five reviewed Swiss parcels lie in BE and ZH.

Result for the five Swiss parcels (retrieved 2026-09-23, quality `AV93`):

| Parcel | EGRID | WFS polygons in the bbox | Intersecting the parcel | Types |
|---|---|---|---:|---|
| Bundeshaus West, Bern | CH127620463518 | 30 | 18 | Gebäude, Gartenanlage, Strasse/Weg, Trottoir, übrige befestigte |
| Fellerstrasse 21, Bern | CH373589574684 | 11 | 8 | Gebäude, Gartenanlage, Bahn, übrige befestigte |
| Liebefeld, Köniz | CH208035154682 | 156 | 46 | Gebäude, Gartenanlage, Acker/Wiese/Weide, übrige humusierte, Strasse/Weg, Trottoir, übrige befestigte |
| Eichenweg 3, Zollikofen | CH794682373511 | 30 | 13 | Gebäude, Gartenanlage, übrige humusierte, Bahn, Trottoir, übrige befestigte |
| Landesmuseum, Zürich | CH385599917023 | 31 | 18 | Gebäude, Gartenanlage, übrige humusierte, Strasse/Weg, Trottoir, übrige befestigte |

The clipped pieces of each parcel sum to the parcel area within 0.01 % (Bundeshaus West: 9,892.99 m² of
9,893.02 m²). The piece carrying the building's own EGID (`GWR_EGID`) is linked to the building; the other
`Gebäude` pieces belong to other buildings on the same parcel (Liebefeld has 15).

### Official representation and colours

The cadastral survey has two official representation models and one web recommendation:

| Document | Colours for land cover |
|---|---|
| swisstopo directive *Darstellung des Planes für das Grundbuch* (9 March 2007, state 1 February 2014), [Weisung-GB-de.pdf](https://www.cadastre-manual.admin.ch/dam/de/sd-web/pysw2JgMIIer/Weisung-GB-de.pdf) | Black/white plan with hatchings and symbols; the coloured variant is optional and defines only greys |
| swisstopo directive *Darstellungsmodell für den Basisplan der amtlichen Vermessung* (DMAV, 1 August 2024), [240801_Basisplan_DE.pdf](https://www.cadastre-manual.admin.ch/dam/de/sd-web/hjNRml-W3Qoz/240801_Basisplan_DE.pdf) | Table 11: Gebäude rosa (255,191,191), water blau (179,230,255), forest grün (156,255,156) at 50 % transparency, Wytweide grün (191,255,140), Gletscher blau (135,176,191), Strasse/Bahn white; the other types have symbols or no fill; building outline braun (161,51,0) |
| KKVA/KGK-CGC recommendation *AV-WMS – Empfehlungen für die Realisierung* (version 1.5, 31 March 2010), [download](https://www.kgk-cgc.ch/download_file/692/0), referenced by the [cadastre manual](https://www.cadastre-manual.admin.ch/de/web-map-service-av-wms) | Table *Bodenbedeckung (farbig)*: one RGB fill per BBArt type with a black 1px outline, no fill for the vegetationslos types; the definition behind the nationwide geodienste.ch service *AV: Standard (farbig)* |

Both prototypes use the AV-WMS table, the official colour definition for a web map, in
`js/landcover-types.js`: Gebäude 255,200,200; Strasse/Weg, Trottoir, Verkehrsinsel, Flugplatz 220,220,220;
Bahn 240,230,200; Wasserbecken and Gewässer 150,200,255; übrige befestigte 240,240,240; Acker/Wiese/Weide,
Gartenanlage, übrige humusierte 240,255,200; Reben and übrige Intensivkultur 255,255,200; Hoch-/Flachmoor and
Schilfgürtel 200,255,240; geschlossener Wald 160,240,160; Wytweide and übrige bestockte 200,240,160; Fels,
Gletscher/Firn, Geröll/Sand, Abbau/Deponie and übrige vegetationslose without fill. The map draws the fills
at 80 % over the basemap with the black outline; the legend of the layer info lists all 26 types by group.

### Metadata of the layer info

The info modal of the internal datasets carries the four links of the official layer info of
map.geo.admin.ch instead of placeholders, and the data date of the loaded data:

| Dataset | Metadata | Detailed description | Download | Thematic portal | Data date |
|---|---|---|---|---|---|
| Bodenabdeckung | [geocat.ch datahub d929eef4](https://www.geocat.ch/datahub/dataset/d929eef4-791d-4728-9d56-226b6952cf1f) (Amtliche Vermessung on geodienste.ch, KGK-CGC) | [cadastre manual, Bodenbedeckung](https://www.cadastre-manual.admin.ch/de/informationsebene-bodenbedeckung-and-einzelobjekte) | [geodienste.ch/services/av](https://www.geodienste.ch/services/av) | [cadastre.ch](https://www.cadastre.ch/de) | retrieval date of the WFS data (2026-09-23) |
| Grundstücke | [geocat.ch datahub cf93dfb6](https://www.geocat.ch/datahub/dataset/cf93dfb6-ffff-43ce-bd9b-271baba2d217) (CadastralWebMap) | [cadastre manual, Liegenschaften](https://www.cadastre-manual.admin.ch/de/informationsebene-liegenschaften) | geodienste.ch | map.geo.admin.ch with `ch.kantone.cadastralwebmap-farbe` | data version (2026-09-22) |
| Gebäude | [I14Y data service 60f54f01](https://www.i14y.admin.ch/de/catalog/dataservices/60f54f01-bd80-423b-8581-581b7bcd6b38/description) (GWR, language-aware) | [BFS, Gebäude- und Wohnungsregister](https://www.bfs.admin.ch/bfs/de/home/register/gebaeude-wohnungsregister.html) | [housing-stat.ch public data](https://www.housing-stat.ch/__publicdata) | map.geo.admin.ch with `ch.bfs.gebaeude_wohnungs_register` | data version (2026-09-22) |

The links come from `internalLayers` in `js/config.js` (both prototypes); the swisstopo layer info of
map.geo.admin.ch (`api3.geo.admin.ch/rest/services/api/MapServer/<layer>/legend`) was used to find the
official geocat records and portals. The data model DM.01-AV-CH is documented in the
[cadastre manual](https://www.cadastre-manual.admin.ch/de/datenmodell-der-amtlichen-vermessung-dm01-av-ch);
it will be replaced by DMAV by 31 December 2027.

### Worldwide

Two options were checked for the nine overseas sites:

- **OpenStreetMap via the Overpass API** would give real vector land use (`landuse`, `natural`, `building`)
  that maps onto the BBArt groups. Every Overpass endpoint tried (overpass-api.de, lz4.overpass-api.de,
  kumi.systems, private.coffee) answered `406` or was unreachable from the research machine, so no OSM land
  cover was fetched. The pipeline is ready for it: `official_covers()` in `generate.py` clips any GeoJSON
  polygon set to a parcel, and the source file format of `swiss-landcover.json` (raw features per site)
  would be reused.
- **ESA WorldCover (10 m raster, 2021)** could be offered as an external WMS overlay for a low-resolution
  worldwide picture. The Terrascope WMS was not reachable from the research machine either, and a raster
  overlay would not fit the feature layer (table rows, selection, areas), so it was not added.

The overseas parcels therefore keep three schematic polygons per parcel, now typed with real BBArt values
(`Gebaeude`, `uebrige_befestigte`, `Gartenanlage`) and marked `synthetic-demo` / `Demo`.

## What changed

### Data pipeline (`scripts/portfolio`)

- `swiss_landcover.py` (new): one WFS request per Swiss parcel (cached like the other research requests),
  keeps the polygons that intersect the parcel and writes them unclipped to
  `sources/swiss-landcover.json` with the request URL, counts and licence note.
- `generate.py`: clips those polygons to the parcel in a local metric CRS, computes geodesic areas, sorts
  deterministically, links the building's own footprint by EGID, sums the parcel's SIA 416 land areas by
  main group (BUF = befestigt; UUF = humusiert, Gewässer, bestockt, vegetationslos; sealed = Gebäude +
  befestigt; green = humusiert + bestockt) and writes `data/landcovers.geojson` for **both** prototypes:
  the Simple schema (`bbl_id`, `geb_id`, `av_type`, `av_stat`, `av_egid`, `av_egrid`, `lc_area`, …) and the
  Tabs schema (`landCoverId`, `parcelId`, `buildingId`, `type`, `typeGroup`, `area`, `egid`, `egrid`,
  `surveyStatus`, `canton`, `municipalityNumber`). Every feature carries a `provenance` block
  (`public-source` with source URL, retrieval date and licence, or `synthetic-demo`).
- `validate.py`: containment, no overlaps, area sums (1 % for official data, exact for the synthetic
  partition), valid BBArt types, exactly one own footprint per building, and parity of both schemas.
- Result: 136 polygons per prototype, 91 official (`AV93`) and 45 schematic (`Demo`).

### Application (both prototypes, identical behaviour)

- `js/landcover-types.js` (common, byte-identical): the 26 types, six groups, the official AV-WMS fill
  colours, a MapLibre colour expression and translated labels.
- Layer: official fills per type at 80 % with a black 1px outline, hover and selection highlights; **hidden by default** (the
  "Bodenabdeckung" checkbox under *Interne Karten* starts unchecked). Selecting a land cover from the table
  or a `?landCoverId=` link switches the layer on; the same now applies to parcels.
- Table tab "Bodenabdeckung" with translated type and main group, area, AV status and (Tabs) parcel,
  building, EGID, EGRID and canton columns; info panel with parcel id, type, main group, area, building id,
  EGID, EGRID and AV status; share URLs and URL restore carry the selection; the layer-info modal shows a
  translated title, description, source, the official metadata links, the data date and a legend of the
  26 types by group.
- Translations: `landcover.group.*`, `landcover.type.*`, `layer.landcovers.*`, `info.label.landcover_group`,
  `col.lc.group`, `col.lc.egid`, `col.lc.egrid` in DE/FR/IT/EN.

### Tests

jsdom: land cover loaded, hidden by default, table pagination, selection reveals the layer and syncs the
table and URL, partial-data behaviour without the file, translated info rows (both prototypes).
Browser: laptop suite and design review matrix unchanged; screenshots of the layer over Bern in both apps.

## Attribution

AV land cover © the cantons, distributed via geodienste.ch; data model DM.01-AV-CH © swisstopo. See the
geodienste.ch and geo.admin.ch terms of use. The schematic overseas polygons are demonstration data.
