# Researched BBL portfolio demo

`prototype-simple` and `prototype-tabs` contain the same 14 publicly documented
buildings/sites in nine countries, exported into their different data models.
Research snapshot: **22 September 2026**. This is a curated demonstration sample,
not a complete or official BBL inventory or a statement of current ownership.

## Implementation plan and result

1. Inspect both schemas and preserve their existing navigation and record relationships.
2. Select buildings from BBL publications and photographs; corroborate overseas
   addresses with EDA. Keep links and project scope beside each fact.
3. Review geocoding candidates. In Switzerland, join the GWR building to the
   cadastral parcel using its EGRID and check spatial containment.
4. Build plausible, internally consistent operational scenarios with fictional
   people, SIA 416 components, separate RICS measures and KBOB document types.
5. Export both schemas deterministically, store photographs locally, expose credits
   and evidence in the UI, and validate data relationships and rendered screens.

All five steps are implemented. The sample contains 42 actual photographs (at
least one interior and exterior per site), 266 measurements, 84 document records,
42 fictional contacts, 84 cost records, 28 contracts and 56 assets. There are 14
parcels and 70 explicitly schematic land-cover polygons in the simple app.

## Evidence and scope

The primary sources are the [BBL media database](https://www.bbl.admin.ch/de/mediendatenbank),
[BBL building publications](https://www.bbl.admin.ch/de/bautendokumentationen),
[EDA representations abroad](https://www.eda.admin.ch/de/schweizer-vertretungen-im-ausland)
and [swisstopo APIs](https://docs.geo.admin.ch/get-started/overview.html).
Individual addresses, publication URLs, photo credits, coordinates, scope notes and
register requests are recorded in [sources/properties.json](sources/properties.json).

| Building / project | Country | Published GF, m² | Published GV, m³ | Reference year |
|---|---|---:|---:|---:|
| Bundeshaus West, Bern | CH | 15,860 | 69,025 | 2010 |
| BBL Fellerstrasse 21, Bern | CH | 21,000 | 77,400 | 2010 |
| Verwaltungsgebäude Liebefeld | CH | 29,900 | 124,500 | 2015 |
| Eichenweg 3, Zollikofen | CH | 33,000 | 114,000 | 2021 |
| Landesmuseum Zürich, extension only | CH | 7,400 | 41,800 | 2016 |
| Embassy Berlin | DE | Scenario | Scenario | — |
| Embassy Canberra | AU | Scenario | Scenario | — |
| Embassy Brasília | BR | Scenario | Scenario | — |
| Embassy Seoul, chancery/residence/reception project | KR | 3,540 | 14,042 | 2019 |
| Embassy Nairobi | KE | 1,512 | 6,120 | 2016 |
| Embassy Washington, chancery only | US | 2,928 | 10,712 | 2022 |
| Embassy Singapore | SG | 1,344 | 6,230 | 2024 |
| Embassy Abidjan | CI | 899 | 3,467 | 2015 |
| Consulate / Swissnex San Francisco, Pier 17 tenant fit-out | US | 1,750 | 7,824 | 2016 |

These 22 published GF/GV values describe historical project scopes, not new 2026
surveys. Other measurement values are scenarios, except the five calculated Swiss
parcel areas. Berlin's publication labels its old/new areas as SIA 116; those
values have deliberately not been relabelled as measured SIA 416 areas.

Construction/refurbishment years are source-backed where available and otherwise
null. Year-only values encoded as January 1 for the target schema retain their
year precision in the source manifest; they are not exact dates. Status, ownership
and internal inventory IDs are demonstration assumptions. No legal ownership is
inferred from an EGRID, building use or a BBL publication. Zoning, certificates,
permit dates and unverified heritage-register values remain null.

## Swiss identifiers and cadastral geometry

| Building | EGID | EGRID | Parcel number |
|---|---|---|---|
| Bundeshaus West | 1230654 | CH127620463518 | 1058 |
| Fellerstrasse 21 | 1243999 | CH373589574684 | 3571 |
| Liebefeld | 191458950 | CH208035154682 | 16 |
| Eichenweg 3 | 191688442 | CH794682373511 | 225 |
| Landesmuseum extension | 302030043 | CH385599917023 | AA8090 |

The register layer is `ch.bfs.gebaeude_wohnungs_register`; the parcel layer is
`ch.kantone.cadastralwebmap-farbe`. The exact GET URLs and unmodified JSON responses
are saved in [sources/swiss-cadastre.json](sources/swiss-cadastre.json).

For each site, `swiss_cadastre.py` fetches the reviewed GWR feature, identifies the
parcel at its entrance coordinate with `tolerance=0`, and saves the response.
`enrich_swiss.py` requires exact equality of the GWR and parcel EGRIDs and checks
that the GWR building coordinate is inside the returned polygon. It transforms
GKODE/GKODN from LV95 to WGS84 for the building marker. Polygon vertices are
preserved; only ring orientation is normalised to GeoJSON convention.

The Landesmuseum extension has its own EGID at **Museumstrasse 6**. The public
visitor address is Museumstrasse 2. Using the visitor address's historic-building
EGID for the extension would be incorrect. The shared parcel includes the historic
museum; its full area is not exclusive to the extension. Other campus parcels can
also include additional buildings.

`GSF` is calculated geodesically from the returned WGS84 polygon and marked
`derived-public-geometry`. It is **not** an official land-register area attribute.
Swiss land cover and footprints remain synthetic illustrations clipped to the
real parcel; they are not official AV building footprints.

Overseas markers use reviewed OpenStreetMap/Nominatim building or site matches.
The manifest includes matched addresses, OSM object URLs and indicative uncertainty
(50 m, or 150 m for Brasília/Pier 17). These are locators, not survey points. Abidjan's
EDA street name differs from the OSM street label; that discrepancy is recorded.
Overseas parcels are basic metric rectangles centred on the site, explicitly marked
as schematic and unrelated to legal boundaries. EGID/EGRID remain null abroad.

## Measurements and other scenarios

The SIA basis is [SIA 416:2003](https://shop.sia.ch/416_2003_dfi/F/Product/).
The generator preserves `GF = NGF + KF`, `NGF = NF + VF + FF`, `NF = HNF + NNF`,
above/below-ground totals for GF/GV, and `GSF = GGF + UF`. Floor counts, floor splits,
net-use ratios and remaining component values are explicit scenarios. Gross floor
area and volume use the published project values when available.

RICS fields use the [Code of Measuring Practice, sixth edition (2015)](https://www.rics.org/profession-standards/rics-standards-and-guidance/sector-standards/real-estate-standards/code-of-measuring-practice):
GEA, GIA and NIA. The seventh edition was still under consultation at the research
date. These are illustrative RICS-based assumptions, not certified measurements or
a universal conversion from SIA. The scenario assumes GEA shares the external floor
envelope with GF, deducts an external-wall allowance for GIA, and deducts further
use exclusions from NF for NIA. Do not use these ratios to convert actual surveys.

Every measurement has its own source/estimate status, unit, standard, scope and
reference date. Public values are labelled `published-source`, calculated Swiss
site areas `derived-public-geometry`, and estimates `synthetic-demo`.

Construction costs, CHF valuations, energy systems, assets, maintenance schedules,
contracts and parking are fictional scenarios scaled to building size and use.
Overseas costs are CHF planning scenarios, not local invoices or exchange-rate
conversions. All people are fictional, visibly marked `(Demo)`, with reserved
`example.invalid` email addresses and no telephone numbers.

Costs use **BKP (SN 506 500:2017)**, with six selected work packages per building:
23, 24, 25, 27, 28 and 29. The classification and public sources are stored in
[cost-classification.json](sources/cost-classification.json). These are one-off
building-services/interior-renewal scenarios in CHF excluding VAT, not annual
operating expenses or actual BBL project costs. They are partial package budgets,
not complete project totals. `generate.py` uses invented CHF/GF rates, country
scenario factors and a museum complexity factor; none are published cost benchmarks.
Classification, standard, scope and the calculation basis travel with each record.

Only the following types from the requested [KBOB/IPB catalogue, version 2016-01](https://www.kbob.admin.ch/dam/de/sd-web/rVvtgYM1wFVT/20171024_KBOB-IPB_Anhang_C_-_Dokumenttypenkatalog_2016_DE.pdf)
are used; exact codes and labels are in [document-types.json](sources/document-types.json):

| Code | Catalogue label |
|---|---|
| O12001 | Publikation |
| B14005 | Flächen/Volumenberechnung |
| O07003 | Wartungsplan |
| O03001 | Betriebsführungshandbuch |
| B14102 | Kostenstatistik |
| B14103 | Energiestatistik |

Each building has one linked real BBL publication (12 PDFs, two media-page links)
and five clearly fictional document-register entries. The latter are metadata only,
with no invented downloads or file sizes. No actual maintenance manuals, contracts,
personal details or operational records have been copied.

## Data models, photographs and licences

The canonical reviewed input is `sources/properties.json`. The generator adapts it
to the simple app's `bbl_*`, `barea_*`, `larea_*`, `adr_*` fields and the tabs app's
camelCase properties, `extensionData` and separate related-entity JSON files.
The simple model embeds the same measurements/documents/contacts under
`demoRelatedRecords`; its existing UI presents only its supported detail fields.
Stable UUIDv5 identifiers preserve relationships across rebuilds. Existing first
building IDs are retained for deep links; inventory IDs are not official BBL IDs.

Photographs are local files in [assets/portfolio](../../assets/portfolio), with
individual [attribution and original links](../../assets/portfolio/ATTRIBUTION.md).
Copyright remains with the credited photographers. Public availability does not
assert an open licence; these photographs are excluded from the repository MIT
licence. The fullscreen gallery displays photo credits; original source links remain
in the attribution file and data. No generated photos were
needed. Historical photographs are not evidence of today's condition.

Geocodes include OpenStreetMap contributions (ODbL). Swiss source data retains its
swisstopo/BFS/cantonal attribution. Third-party material retains its source terms;
the MIT licence applies to repository code, not third-party photographs or source data.

## Reproduce and refresh

From the repository root, install dependencies once, then rebuild **offline**:

```sh
python -m pip install -r scripts/portfolio/requirements.txt
python scripts/portfolio/generate.py
python scripts/portfolio/validate.py
node test/all.js
node test/check-alignment.js
```

No live service is needed to build or run the portfolio. Photos are already checked
in. Basemaps and the apps' existing live search still use their normal providers.
`validate.py` checks both schemas, identifiers, foreign keys, measurement identities,
KBOB labels, fictional contacts, date consistency, photo coverage and credits,
coordinate/parcel containment, geodesic areas and land-cover partitions.

The research scripts also preserve the online workflow:

```sh
python scripts/portfolio/research.py catalog
python scripts/portfolio/research.py publications
python scripts/portfolio/research.py geocode
python scripts/portfolio/research.py review
# Inspect source pages, geocoding candidates and contact sheets before proceeding.
python scripts/portfolio/review_research.py
python scripts/portfolio/swiss_cadastre.py
python scripts/portfolio/research.py photos
python scripts/portfolio/generate.py
python scripts/portfolio/validate.py
```

Downloads are cached by URL under ignored `tmp/portfolio-research/`. To fetch a new
snapshot, archive/rename that cache first. Candidate choices, image indices and PDF
image references in `review_research.py` record this reviewed snapshot; recheck them
when upstream pages change. Update dates and source selections intentionally. The
one-off `seed_research.py` records the original selection and refuses to overwrite
an existing canonical manifest. `enrich_swiss.py` can reapply the saved register
snapshot without network access.

For browser verification, serve the repository on port 8123, then run
`node test/visual.js both visual-out/portfolio`. `VIEWPORTS=desktop,phone-14` and
`SCENARIOS=gallery,detail,detail-tab` select the focused portfolio checks.
