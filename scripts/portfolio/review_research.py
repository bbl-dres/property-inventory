"""Apply recorded human-reviewed source selections. No unreviewed first-result geocoding.

The selected candidates were checked against the official address, name, city and
country on 2026-09-22. Bounds are indicative positional uncertainty, not survey accuracy.
Publication values describe the project scope/year, not a new 2026 survey.
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).parent / 'sources'
properties = json.loads((HERE / 'properties.json').read_text(encoding='utf-8'))
geo = json.loads((HERE / 'geocoding-results.json').read_text(encoding='utf-8'))
media = json.loads((HERE / 'media-catalog.json').read_text(encoding='utf-8'))
# GF, GV, publication/project year, construction year, refurbishment year,
# above/below-ground demo storeys, schematic site area, SIA NF/GF scenario ratio.
reviewed = {
    'bundeshaus-west': (15860, 69025, 2010, 1857, 2010, 4, 2, 7100, .62),
    'berlin': (5700, 23000, None, 1871, 2000, 4, 1, 2100, .63),
    'bbl-fellerstrasse': (21000, 77400, 2010, 1966, 2010, 5, 2, 11500, .57),
    'liebefeld': (29900, 124500, 2015, 2015, None, 5, 2, 17000, .65),
    'zollikofen': (33000, 114000, 2021, 2021, None, 7, 2, 10500, .66),
    'landesmuseum': (7400, 41800, 2016, 2016, None, 2, 2, 5500, .54),
    'canberra': (1450, 5600, None, None, None, 2, 0, 6100, .69),
    'brasilia': (2850, 11400, None, None, None, 2, 1, 28500, .67),
    'seoul': (3540, 14042, 2019, 2019, None, 2, 1, 4600, .62),
    'nairobi': (1512, 6120, 2016, 2016, None, 2, 0, 10000, .74),
    'washington': (2928, 10712, 2022, 1959, 2022, 2, 1, 6300, .66),
    'singapore': (1344, 6230, 2024, 1984, 2024, 1, 1, 8000, .66),
    'abidjan': (899, 3467, 2015, 2015, None, 1, 0, 3200, .73),
    'san-francisco': (1750, 7824, 2016, None, 2016, 2, 0, 1800, .72),
}
# 1-based BBL media index, scene. Every picture was visually inspected.
selections = {
    'bundeshaus-west': [(1, 'interior'), (7, 'interior')],
    'berlin': [(1, 'exterior'), (3, 'exterior'), (8, 'interior')],
    'bbl-fellerstrasse': [(3, 'exterior'), (6, 'interior'), (8, 'interior')],
    'liebefeld': [(1, 'exterior'), (3, 'exterior')],
    'zollikofen': [(1, 'exterior'), (3, 'exterior'), (4, 'interior')],
    'landesmuseum': [(4, 'exterior'), (2, 'interior'), (3, 'interior')],
    'canberra': [(1, 'exterior'), (4, 'exterior'), (6, 'interior')],
    'brasilia': [(1, 'exterior'), (7, 'exterior'), (4, 'interior')],
    'seoul': [(3, 'exterior'), (5, 'exterior'), (9, 'interior')],
    'nairobi': [(1, 'exterior'), (5, 'interior'), (7, 'interior')],
    'washington': [(1, 'exterior'), (2, 'exterior'), (7, 'interior')],
    'singapore': [(1, 'exterior'), (6, 'interior'), (9, 'interior')],
    'abidjan': [(2, 'exterior'), (5, 'interior'), (6, 'interior')],
    'san-francisco': [(1, 'exterior'), (4, 'interior'), (7, 'interior')],
}
for p in properties:
    slug = p['slug']
    candidates = geo[slug]['results']
    candidate = (candidates['results'][0]['attrs'] if p['country'] == 'CH'
                 else candidates[1 if slug == 'canberra' else 0])
    p['coordinates'] = [round(float(candidate['lon']), 7), round(float(candidate['lat']), 7)]
    p['geocoding'] = {
        'provider': 'swisstopo SearchServer' if p['country'] == 'CH' else 'OpenStreetMap Nominatim',
        'sourceUrl': geo[slug]['url'], 'retrievedAt': '2026-09-22', 'reviewed': True,
        'precision': 'address-point' if p['country'] == 'CH' else 'building-or-site-centroid',
        'indicativeUncertaintyMetres': 20 if p['country'] == 'CH' else (150 if slug in ['brasilia', 'san-francisco'] else 50),
        'matchedAddress': candidate.get('display_name', candidate.get('label')),
        'note': 'Public address / site locator, not a cadastral or survey point.',
    }
    if p['country'] != 'CH':
        p['geocoding']['osmUrl'] = f"https://www.openstreetmap.org/{candidate['osm_type']}/{candidate['osm_id']}"
    # Do not assign the parent museum's register ID to its extension building.
    p['egid'] = candidate['featureId'].split('_')[0] if p['country'] == 'CH' and slug != 'landesmuseum' else None
    if slug == 'bundeshaus-west':
        p['postalCode'] = '3011'
        p['addressNote'] = '3011 is the physical address postcode from swisstopo; 3003 is the federal postal address.'
    if slug == 'abidjan':
        p['geocoding']['note'] += ' OSM uses Rue des Ambassades; EDA gives Rue du Bélier in the same Cocody embassy site.'
    gf, gv, year, built, refurb, above, below, site, nf = reviewed[slug]
    p['publishedMeasurements'] = ({'GF': gf, 'GV': gv, 'standard': 'SIA 416:2003',
                                    'referenceYear': year, 'page': 1, 'sourceUrl': p['publication']['url']}
                                   if year else {})
    p['scenario'] = {'grossFloorArea': gf, 'buildingVolume': gv, 'aboveGroundFloors': above,
                     'belowGroundFloors': below, 'siteArea': site, 'netUsableRatio': nf,
                     'constructionYear': built, 'lastRefurbishmentYear': refurb}
    p['scope'] = {
        'landesmuseum': 'Erweiterungsbau 2016 only (7,400 m²), excludes the 4,400 m² Kunstgewerbeschulflügel and the historic museum. Point is the public site entrance.',
        'berlin': 'Historic palace plus 2000 extension. BBL lists 2,897 + 2,804 m² under SIA 116; the 5,700 m² SIA 416 scenario is an estimate, not a relabelled measured area.',
        'san-francisco': 'Swiss tenant fit-out in Pier 17 (1,750 m²); not the entire pier or building. Schematic polygon is an illustrative tenant site.',
        'washington': 'Chancery only; excludes the ambassador residence and the rest of the campus.',
        'seoul': '2019 project comprising chancery, residence and shared reception areas.',
        'bbl-fellerstrasse': '2010 refurbishment project scope; offices and retained logistics spaces. Storey split is a scenario, not the publication’s aggregate storey figure.',
    }.get(slug, 'Publicly documented building/site; operational records and schematic parcel are demonstration assumptions.')
    p['factSources'] = {'identity': 'https://www.bbl.admin.ch/de/mediendatenbank',
                        'address': p['addressSource'], 'coordinates': p['geocoding']['sourceUrl']}
    if built:
        p['factSources']['constructionYear'] = ('https://www.schweiz-deutschland.eda.admin.ch/de/das-botschaftsgebaeude'
                                                 if slug == 'berlin' else p['publication']['url'])
    if refurb:
        p['factSources']['lastRefurbishmentYear'] = p['publication']['url']
    p['photos'] = [dict(media[p['mediaHeading']][i-1], scene=scene, mediaIndex=i) for i, scene in selections[slug]]
    if slug == 'bundeshaus-west':
        p['photos'].insert(0, {'url': p['publication']['url'], 'source': p['publication']['url'],
                              'pdfImageXref': 2, 'page': 1, 'credit': '© Rudolf Steiner, Biel',
                              'scene': 'exterior', 'alt': 'Bundeshaus West – Nordfassade, Aufnahme der BBL-Publikation 2010'})
    if slug == 'liebefeld':
        p['photos'].append({'url': p['publication']['url'], 'source': p['publication']['url'],
                            'pdfImageXref': 19, 'page': 2, 'credit': '© Rolf Siegenthaler, Bern',
                            'scene': 'interior', 'alt': 'Verwaltungsgebäude Liebefeld – Wartezone Konferenzbereich, BBL-Publikation 2015'})
    for photo in p['photos']:
        photo['alt'] = photo.get('alt') or p['name'] + (' – Aussenansicht' if photo['scene'] == 'exterior' else ' – Innenansicht')
        photo['kind'] = 'public-source-photo'
        photo['rights'] = 'Copyright retained by credited photographer; publicly accessible BBL source, no open licence asserted. Not covered by repository MIT licence.'

(HERE / 'properties.json').write_text(json.dumps(properties, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
text = (HERE.parents[2] / 'tmp/portfolio-research/kbob-catalog-extract.txt').read_text(encoding='utf-8')
used = ['O03001', 'O07003', 'O12001', 'B14005', 'B14102', 'B14103']
types = {m.group(1): m.group(2).strip() for m in re.finditer(r'(?m)^([A-Z][0-9]{5})\s*\n([^\n]+)', text) if m.group(1) in used}
assert len(types) == len(used)
(HERE / 'document-types.json').write_text(json.dumps({'edition': 'KBOB/IPB Anhang C, Version 2016-01',
    'sourceUrl': 'https://www.kbob.admin.ch/dam/de/sd-web/rVvtgYM1wFVT/20171024_KBOB-IPB_Anhang_C_-_Dokumenttypenkatalog_2016_DE.pdf',
    'types': types}, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(f'Reviewed {len(properties)} properties; {len(types)} KBOB document types.')
if (HERE / 'swiss-cadastre.json').exists():
    from enrich_swiss import main as enrich
    enrich()
