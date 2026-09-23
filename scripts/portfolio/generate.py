"""Deterministically export one reviewed portfolio into two independent static schemas.

Offline: python scripts/portfolio/generate.py
Requires pyproj and shapely. Source research is in sources/properties.json; see README.md.
"""
from pathlib import Path
import json
import math
import uuid
from pyproj import CRS, Transformer, Geod
from shapely.geometry import shape, mapping, box, MultiPolygon
from shapely.geometry.polygon import orient
from shapely.ops import transform as transform_geometry, unary_union
from shapely.validation import make_valid

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).parent / 'sources'
AS_OF = '2026-09-22'
STAMP = AS_OF + 'T00:00:00Z'
SIA = 'SIA 416:2003'
RICS = 'RICS Code of Measuring Practice, 6th edition (2015)'
SYNTHETIC = 'synthetic-demo'
NAMESPACE = uuid.UUID('1fde1456-cb50-4f6d-bff5-2cbcc2916625')
GEOD = Geod(ellps='WGS84')
LV95 = Transformer.from_crs(4326, 2056, always_xy=True)

# AV land cover types (DM.01-AV-CH BBArt) and their main groups; js/landcover-types.js of both prototypes
# carries the same table with the official AV-WMS fill colours.
LAND_COVER_GROUPS = {
    'Gebaeude': 'gebaeude',
    'Strasse_Weg': 'befestigt', 'Trottoir': 'befestigt', 'Verkehrsinsel': 'befestigt', 'Bahn': 'befestigt',
    'Flugplatz': 'befestigt', 'Wasserbecken': 'befestigt', 'uebrige_befestigte': 'befestigt',
    'Acker_Wiese_Weide': 'humusiert', 'Reben': 'humusiert', 'uebrige_Intensivkultur': 'humusiert',
    'Gartenanlage': 'humusiert', 'Hoch_Flachmoor': 'humusiert', 'uebrige_humusierte': 'humusiert',
    'Gewaesser_stehendes': 'gewaesser', 'Gewaesser_fliessendes': 'gewaesser', 'Schilfguertel': 'gewaesser',
    'geschlossener_Wald': 'bestockt', 'Wytweide_dicht': 'bestockt', 'Wytweide_offen': 'bestockt', 'uebrige_bestockte': 'bestockt',
    'Fels': 'vegetationslos', 'Gletscher_Firn': 'vegetationslos', 'Geroell_Sand': 'vegetationslos',
    'Abbau_Deponie': 'vegetationslos', 'uebrige_vegetationslose': 'vegetationslos'}
AV_NOTICE = 'Bodenbedeckung der amtlichen Vermessung (geodienste.ch WFS ms:LCSF), auf die AV-Parzelle zugeschnitten.'
DEMO_NOTICE = 'Schematische Bodenbedeckung; keine AV-Gebäudegrundrisse.'


def uid(building, kind, key):
    return str(uuid.uuid5(NAMESPACE, f'{building}/{kind}/{key}'))


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def feature(properties, geometry):
    return {'type': 'Feature', 'properties': properties, 'geometry': geometry}


def write_photo_attribution(buildings):
    lines = ['# Portfolio photo attribution', '',
        'Generated from `scripts/portfolio/sources/properties.json` by `generate.py`.', '',
        'These 42 photographs are publicly accessible through BBL. Copyright remains with the',
        'credited photographers. No open licence or transfer of rights is asserted; these',
        'photographs are excluded from the repository MIT licence. Source availability alone',
        'does not establish unrestricted reuse permission. Preserve credits and check the',
        'source terms for any further distribution or use.', '',
        'Images were retrieved on 2026-09-22, resized without enlarging, and saved as JPEG.',
        'Two images were extracted from the linked BBL PDF publications; the rest are from',
        'the BBL media database. All interior/exterior selections were visually reviewed.',
        'No AI-generated photos are included. `no-photo.svg` is an original neutral fallback.', '',
        '| Local image | Building / scene | Credit | Original |',
        '|---|---|---|---|']
    for b in buildings:
        for i, p in enumerate(b['photos'], 1):
            name = f"{b['slug']}-{i}.jpg"
            label = 'PDF, page ' + str(p['page']) if p.get('pdfImageXref') else 'BBL image'
            lines.append(f"| [{name}]({name}) | {b['name']} / {p['scene']} | {p['credit']} | [{label}]({p['url']}) |")
    (ROOT/'assets/portfolio/ATTRIBUTION.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')


def collection(name, features):
    return {'type': 'FeatureCollection', 'name': name, 'dataVersion': AS_OF,
            'description': 'Publicly sourced identities and locations; clearly marked synthetic demonstration records. Not an official BBL inventory.',
            'features': features}


def date(year):
    return f'{year}-01-01T00:00:00Z' if year else None


def scenario_metrics(b):
    s = b['scenario']
    gf, gv = s['grossFloorArea'], s['buildingVolume']
    nf = round(gf * s['netUsableRatio'])
    # Component scenarios, not a universal conversion between standards.
    ff = round(gf * (.09 if b['slug'] == 'landesmuseum' else .035))
    vf = round(gf * (.17 if b['slug'] == 'landesmuseum' else .13))
    ngf = nf + ff + vf
    kf = gf - ngf
    nnf = round(nf * (.23 if b['slug'] == 'landesmuseum' else .16))
    underground = round(gf * s['belowGroundFloors'] / (s['aboveGroundFloors'] + s['belowGroundFloors']))
    ext_walls = round(gf * .065)
    nia_exclusions = round(nf * (.09 if b['country'] == 'CH' else .07))
    footprint = round(gf / (s['aboveGroundFloors'] + s['belowGroundFloors']))
    return {'GF': gf, 'GFO': gf-underground, 'GFU': underground, 'KF': kf, 'NGF': ngf,
            'NF': nf, 'HNF': nf-nnf, 'NNF': nnf, 'FF': ff, 'VF': vf,
            'GV': gv, 'GVU': round(gv*underground/gf), 'GVO': gv-round(gv*underground/gf),
            'GSF': s['siteArea'], 'GGF': footprint, 'UF': round(s['siteArea']-footprint,2),
            'GEA': gf, 'GIA': gf-ext_walls, 'NIA': nf-nia_exclusions,
            'ricsExternalWalls': ext_walls, 'ricsUseExclusions': nia_exclusions}


def polygon_parts(g, min_part=0):
    if g.geom_type == 'GeometryCollection':
        g = unary_union([p for p in g.geoms if p.geom_type in ['Polygon', 'MultiPolygon']])
    if min_part and g.geom_type == 'MultiPolygon':
        parts = [p for p in g.geoms if p.area >= min_part]
        g = MultiPolygon(parts) if len(parts) > 1 else parts[0] if parts else g.__class__()
    return g


def to_wgs84(g, transform):
    g = transform_geometry(transform.transform, g)
    return orient(g, sign=1) if g.geom_type == 'Polygon' else MultiPolygon([orient(p, sign=1) for p in g.geoms])


def official_covers(record, projected, forward, transform):
    """Clip the official land cover polygons to the parcel (metric local CRS); geodesic areas in m²."""
    covers = []
    for f in record['features']:
        g = transform_geometry(forward.transform, shape(f['geometry']))
        if not g.is_valid:
            g = make_valid(g)
        # Boundary slivers (the parcel and land-cover services differ in precision): parts < 0.05 m², pieces < 0.5 m²
        piece = polygon_parts(projected.intersection(g), 0.05)
        if piece.is_empty or piece.area < 0.5:
            continue
        piece = to_wgs84(piece, transform)
        p = f['properties']
        covers.append((p['Art'], round(abs(GEOD.geometry_area_perimeter(piece)[0]), 2), mapping(piece),
                       {'egid': str(p['GWR_EGID']) if p.get('GWR_EGID') not in [None, ''] else None,
                        'quality': p.get('Qualitaet'), 'canton': p.get('Kanton'), 'municipalityNumber': p.get('BFSNr')}))
    # Deterministic order: by type, largest piece first
    covers.sort(key=lambda c: (c[0], -c[1]))
    return covers


def geometry_for(b, metrics, record=None):
    lon, lat = b['coordinates']
    local = CRS.from_proj4(f'+proj=aeqd +lat_0={lat} +lon_0={lon} +datum=WGS84 +units=m')
    transform = Transformer.from_crs(local, 'EPSG:4326', always_xy=True)

    if b.get('cadastre'):
        # Keep the official parcel's vertices. The land cover is the official AV land cover clipped to
        # this parcel where the canton publishes it (sources/swiss-landcover.json); otherwise it stays an
        # explicitly synthetic illustration, clipped to the real parcel and never labelled AV.
        parcel = b['cadastre']['geometry']
        forward = Transformer.from_crs(4326,local,always_xy=True)
        projected = transform_geometry(forward.transform,shape(parcel))
        if record and record.get('features'):
            return parcel, official_covers(record, projected, forward, transform)
        low, high = 0, max(projected.bounds[2]-projected.bounds[0],projected.bounds[3]-projected.bounds[1])
        for _ in range(45):
            radius=(low+high)/2
            footprint=projected.intersection(box(-radius,-radius,radius,radius))
            area=abs(GEOD.geometry_area_perimeter(transform_geometry(transform.transform,footprint))[0])
            if area<metrics['GGF']: low=radius
            else: high=radius
        footprint=projected.intersection(box(-high,-high,high,high))
        remainder=projected.difference(footprint)
        minx,miny,maxx,maxy=projected.bounds
        quadrants=[box(minx,miny,0,0),box(0,miny,maxx,0),box(minx,0,0,maxy),box(0,0,maxx,maxy)]
        parts=[('Gebaeude',footprint)]+[(('uebrige_befestigte' if i<2 else 'Gartenanlage'),remainder.intersection(q)) for i,q in enumerate(quadrants)]
        covers=[]
        for kind,g in parts:
            if g.is_empty: continue
            g=to_wgs84(polygon_parts(g),transform)
            area=round(abs(GEOD.geometry_area_perimeter(g)[0]),2)
            covers.append((kind,area,mapping(g),{}))
        # Independent per-piece rounding can introduce a centiare of drift.
        kind,area,g,extra=covers[-1]
        covers[-1]=(kind,round(area+metrics['GSF']-sum(x[1] for x in covers),2),g,extra)
        return parcel,covers

    def rect(x0, y0, x1, y1):
        ring = [[round(v, 9) for v in transform.transform(x, y)]
                for x, y in [(x0,y0),(x1,y0),(x1,y1),(x0,y1),(x0,y0)]]
        return {'type': 'Polygon', 'coordinates': [ring]}

    half = math.sqrt(metrics['GSF']) / 2
    # Centred indicative footprint; surrounding rectangles partition the entire perimeter.
    bx = math.sqrt(metrics['GGF']) / 2
    by = bx
    parcel = rect(-half,-half,half,half)
    covers = [('Gebaeude',metrics['GGF'],rect(-bx,-by,bx,by),{}),
              ('uebrige_befestigte',(half-bx)*2*by,rect(-half,-by,-bx,by),{}),
              ('uebrige_befestigte',(half-bx)*2*by,rect(bx,-by,half,by),{}),
              ('Gartenanlage',(half-by)*2*half,rect(-half,by,half,half),{}),
              ('Gartenanlage',(half-by)*2*half,rect(-half,-half,half,-by),{})]
    return parcel, covers


def main():
    buildings = json.loads((SOURCE / 'properties.json').read_text(encoding='utf-8'))
    catalogue = json.loads((SOURCE / 'document-types.json').read_text(encoding='utf-8'))
    cost_classification = json.loads((SOURCE / 'cost-classification.json').read_text(encoding='utf-8'))
    meta = json.loads((ROOT / 'prototype-tabs/data/meta.json').read_text(encoding='utf-8'))
    swiss_register = json.loads((SOURCE / 'swiss-cadastre.json').read_text(encoding='utf-8'))
    landcover_source = SOURCE / 'swiss-landcover.json'
    landcover_records = json.loads(landcover_source.read_text(encoding='utf-8')) if landcover_source.exists() else {}
    def label(list_name, code):
        return next(v['labels']['de'] for v in meta['valueLists'][list_name]['values'] if v['code'] == code)
    simple, tabs, simple_parcels, tabs_parcels, landcovers, tabs_landcovers = [], [], [], [], [], []
    entities = {k: [] for k in ['areaMeasurements','documents','contacts','costs','contracts','assets']}
    first = ['Mira','Levin','Nora','Elio','Jana','Silvan','Lina','Noé','Alina','Milo','Lea','Jonas','Sina','Flurin']
    last = ['Waldner','Feldmann','Birchler','Sommer','Linden','Tanner','Moser','Auer','Keller','Bachmann','Vogt','Steiner','Berger','Frei']
    measurement_names = {'GF':'Geschossfläche GF','GFO':'Geschossfläche oberirdisch','GFU':'Geschossfläche unterirdisch',
        'KF':'Konstruktionsfläche KF','NGF':'Nettogeschossfläche NGF','NF':'Nutzfläche NF','HNF':'Hauptnutzfläche HNF',
        'NNF':'Nebennutzfläche NNF','FF':'Funktionsfläche FF','VF':'Verkehrsfläche VF','GV':'Gebäudevolumen GV',
        'GVO':'Gebäudevolumen oberirdisch','GVU':'Gebäudevolumen unterirdisch','GSF':'Grundstücksfläche GSF',
        'GGF':'Gebäudegrundfläche GGF','UF':'Umgebungsfläche UF','GEA':'Gross External Area (GEA)',
        'GIA':'Gross Internal Area (GIA)','NIA':'Net Internal Area (NIA)'}
    for index,b in enumerate(buildings):
        bid, s = b['id'], b['scenario']
        book, site, obj = bid.split('/')
        siteid, pid = f'{book}/{site}', f'{book}/{site}/01'
        m = scenario_metrics(b)
        published = b['publishedMeasurements']
        cadastre = b.get('cadastre')
        museum = b['slug'] == 'landesmuseum'
        diplomatic = b['country'] != 'CH'
        leased = b['slug'] == 'san-francisco'
        representation = b['slug'] == 'bundeshaus-west'
        portfolio_code = '006' if museum else '002' if diplomatic else '008' if representation else '001'
        type1_code = '10' if museum else '16' if diplomatic else '19' if representation else '06'
        type2_code = '10.01' if museum else '16.07' if leased else '16.03' if diplomatic else '19.00' if representation else '06.01'
        portfolio = label('r-bbl-teilportfolio', portfolio_code)
        portfolio_group = 'Kultur und Denkmäler' if museum else ('EDA Auslandsvertretungen' if diplomatic else 'Bundesverwaltung')
        primary_type = label('r-bbl-gebaeudeart-1', type1_code)
        secondary_type = label('r-bbl-gebaeudeart-2', type2_code)
        ownership_code = 'Anmiete' if leased else 'Eigentum'
        physical_status = str(swiss_register[b['slug']]['gwr']['feature']['properties']['gstat']) if cadastre else None
        reference_codes = {'building.ownership': ownership_code, 'building.portfolio': portfolio_code,
            'building.type1': type1_code, 'building.type2': type2_code, 'building.rentalModel': None,
            'building.operatingStatus': 'ACTIVE', 'building.physicalStatus': physical_status}
        number_first = b['country'] in ['AU','US','KR','SG']
        street_parts = [b['houseNumber'],b['street']] if number_first else [b['street'],b['houseNumber']]
        locality_parts = [b['city'],b['postalCode']] if number_first else [b['postalCode'],b['city']]
        address = ' '.join(str(x) for x in street_parts if x) + ', ' + ' '.join(x for x in locality_parts if x)
        photos = [dict(p, url=f"../assets/portfolio/{b['slug']}-{j+1}.jpg", originalUrl=p['url']) for j,p in enumerate(b['photos'])]
        image_urls = [p['url'] for p in photos]
        tropical = b['country'] in ['BR','SG','CI']
        heating = 'Kälteanlage / reversible Wärmepumpe' if tropical else 'Luft-Wasser-Wärmepumpe' if diplomatic else 'Fernwärmeübergabe'
        provenance = {
            'dataset': 'bbl-public-portfolio-demo', 'asOf': AS_OF, 'notOfficialInventory': True,
            'factSources': b['factSources'], 'geocoding': b['geocoding'], 'scope': b['scope'],
            'publishedMeasurements': published, 'cadastre': cadastre,
            'syntheticFields': ['inventoryIds','ownershipScenario','statusScenario','valuations','SIA area breakdown',
                                'RICS measurements','storeySplit','landcoverGeometry','energySystems',
                                'parking','contacts','costs','contracts','assets','mockDocuments'],
            'unknownFieldsLeftNull': ['zoning','energyCertificate','buildingPermitDate','heritageRegisterNumber'] + ([] if cadastre else ['EGID','EGRID']),
            'notice': 'Standort öffentlich belegt. Publizierte GF/GV separat belegt; übrige Gebäudebemessungen und Betriebsdaten sind Demowerte. ' + ('EGID, EGRID und Parzelle aus GWR/AV; Grundstücksfläche aus Polygon berechnet.' if cadastre else 'Grundstück schematisch.'),
        }
        if not cadastre: provenance['syntheticFields'].append('parcelGeometry')
        provenance['referenceData'] = {'catalogVersion': meta['source']['catalogVersion'],
            'classificationAssignments': 'Demo assignments to catalogue codes; not confirmed SAP master data.',
            'physicalStatus': {'sourceUrl': cadastre['gwrSourceUrl'], 'dataStatus': 'public-source'} if cadastre else None}
        common = {'buildingIds':[bid], 'validFrom':STAMP, 'validUntil':None}
        building_contacts = []
        for j, role in enumerate(['Objektverantwortung','Portfoliomanagement','Facility Management']):
            n = (index+j*5) % len(first)
            person = f'{first[n]} {last[(index+j*3)%len(last)]} (Demo)'
            contact = dict(common, contactId=uid(bid,'contact',j), name=person, role=role,
                organisation=['Portfolio Team (Demo)','Portfolio Team (Demo)','Arealservice Muster AG (fiktiv)'][j],
                phone=None, email=f'{b["slug"]}.{j+1}@example.invalid', isPrimary=j==0,
                legacyId=f'DEMO-{site}-K{j+1}', extensionData={'dataStatus':SYNTHETIC,'isFictionalPerson':True})
            entities['contacts'].append(contact)
            building_contacts.append(contact)
        measurements = []
        for code,name in measurement_names.items():
            real = code in ['GF','GV'] and code in published
            derived = code == 'GSF' and bool(cadastre)
            accuracy_code = 'UNBEKANNT' if real else 'GEMESSEN' if derived else 'GESCHAETZT'
            standard_code = 'ANDERE_REGEL' if derived or code in ['GEA','GIA','NIA'] else 'SIA_416'
            standard_detail = cadastre['areaMethod'] if derived else RICS if code in ['GEA','GIA','NIA'] else SIA
            measurement = dict(common, areaMeasurementId=uid(bid,'measurement',code), type=name,
                value=m[code], unit='m³' if code.startswith('GV') else 'm²',
                validFrom=date(published['referenceYear']) if real else STAMP,
                bmEstimation=None if real else not derived, accuracy=label('profile-bemessungsgenauigkeit', accuracy_code),
                accuracyCode=accuracy_code, standard=label('profile-bemessungsstandard', standard_code), standardCode=standard_code,
                legacyId=f'DEMO-{site}-{code}', extensionData={
                    'code':code, 'standardDetail': standard_detail,
                    'dataStatus':'published-source' if real else 'derived-public-geometry' if derived else SYNTHETIC,
                    'source':f"BBL Bautendokumentation {published['referenceYear']}, S. 1" if real else 'swisstopo CadastralWebMap · Polygonfläche' if derived else 'Plausibles Demo-Szenario',
                    'sourceUrl':published.get('sourceUrl') if real else cadastre['parcelSourceUrl'] if derived else None,
                    'scope':b['scope'], 'originalUnit':'m³' if code.startswith('GV') else 'm²',
                    'assumption':cadastre['areaMethod']+'; '+cadastre['note'] if derived else 'Independently modelled measurement basis; no certified survey or universal SIA/RICS conversion.' if not real else None})
            measurements.append(measurement)
        entities['areaMeasurements'].extend(measurements)
        building_documents = []
        for j,code in enumerate(['O12001','B14005','O07003','O03001','B14102','B14103']):
            public = code == 'O12001'
            pub = b.get('publication')
            title = label('r-kbob-dokumenttyp', code)
            assert title == catalogue['types'][code], 'KBOB source mismatch: ' + code
            doc = dict(common, documentId=uid(bid,'document',code),
                name=(f"BBL Bautendokumentation – {b['name']}" if pub else f"BBL Bildpublikation – {b['name']}") if public else f'{title} 2026 – {b["name"]} (Demo)',
                type=title, documentTypeCode=code, fileFormat=('PDF' if pub else 'HTML') if public else 'PDF',
                fileSize=(re_file_size(pub['title']) if pub else None) if public else None,
                url=(pub['url'] if pub else b['factSources']['identity']) if public else None,
                description='Öffentliche BBL-Publikation; historischer Projektstand.' if public else 'Fiktiver Dokumentregistereintrag; keine Originaldatei vorhanden.',
                version='Publizierte Fassung' if public else '0.1 Demo', legacyId=f'DEMO-{site}-{code}',
                # Publication title contains project year, not a fabricated exact publication date.
                validFrom=None if public else STAMP,
                extensionData={'dataStatus':'public-source' if public else SYNTHETIC,
                    'availability':'external-publication' if public else 'metadata-only',
                    'catalogue':catalogue['edition'], 'catalogueUrl':catalogue['sourceUrl'],
                    'documentTypeCode':code})
            building_documents.append(doc)
        entities['documents'].extend(building_documents)
        # CHF-denominated scenario budgets; foreign figures are not currency conversions.
        country_factor = {'CH':1,'DE':.85,'AU':.9,'BR':.55,'KR':.8,'KE':.55,'US':1.15,'SG':.95,'CI':.55}[b['country']]
        # Selected capital-renewal packages, not annual utilities or maintenance.
        # Rates are invented scenario assumptions, not CRB cost benchmarks.
        cost_rates = {'23':150, '24':220 if tropical else 180, '25':70, '27':240, '28':180, '29':120}
        for j,(code, kind) in enumerate(cost_classification['groups'].items()):
            rate = round(cost_rates[code] * country_factor * (1.3 if museum else 1), 3)
            entities['costs'].append(dict(costId=uid(bid,'cost','BKP-'+code), buildingIds=[bid],
                costGroup=code, costType=kind, amount=round(m['GF']*rate/100)*100,
                unit='CHF',currency='CHF',period='Einmalig',referenceDate=STAMP,legacyId=f'DEMO-{site}-C{j+1}',
                extensionData={'dataStatus':SYNTHETIC,'budgetYear':2026,'costCenter':f'DEMO-{site}',
                    'classification':cost_classification['classification'], 'standard':cost_classification['standard'],
                    'classificationSourceUrl':cost_classification['sourceUrl'],
                    'groupSourceUrl':cost_classification['groupSourceUrl'],
                    'project':'Erneuerung Gebäudetechnik und Innenausbau (Demo)',
                    'scope':'Selected BKP work packages only; not a complete project budget or actual BBL project.',
                    'basis':'Invented one-off CHF scenario, excluding VAT; not actual expenditure, a cost benchmark or FX conversion.',
                    'rateCHFPerGF':rate,'quantityGF':m['GF']}))
        for j,(kind,rate) in enumerate([('Wartungsvertrag',16),('Reinigungsvertrag',18)]):
            entities['contracts'].append(dict(common, contractId=uid(bid,'contract',kind), type=kind,
                validFrom='2026-01-01T00:00:00Z',validUntil='2028-12-31T00:00:00Z',
                contractPartner=['Haustechnik Muster AG (fiktiv)','Arealservice Muster AG (fiktiv)'][j],
                amount=round(m['NGF']*rate*country_factor/100)*100,currency='CHF',status='Aktiv',legacyId=f'DEMO-{site}-V{j+1}',
                extensionData={'dataStatus':SYNTHETIC,'paymentTerms':'Jahresbetrag, quartalsweise Zahlung','autoRenewal':False}))
        # Modern plant/LED scenario: assume replacements in older buildings.
        install = min(2024, max(2016, s['lastRefurbishmentYear'] or s['constructionYear'] or 2018))
        for j,(name,cat,interval) in enumerate([(heating,'HVAC','Jährlich'),('Lüftungsanlage mit Wärmerückgewinnung','HVAC','Halbjährlich'),
                ('LED-Grundbeleuchtung','Elektro','Jährlich'),('Trinkwasserstation','Sanitär','Jährlich')]):
            entities['assets'].append(dict(assetId=uid(bid,'asset',j),buildingIds=[bid],name=name,category=cat,
                manufacturer='Muster Gebäudetechnik (fiktiv)',installationYear=install,location='Technikbereich (Demo)',
                status='In Betrieb',serialNumber=f'DEMO-{site}-{j+1:03d}',maintenanceInterval=interval,
                lastMaintenanceDate='2026-06-15T00:00:00Z',nextMaintenanceDate='2026-12-15T00:00:00Z' if interval=='Halbjährlich' else '2027-06-15T00:00:00Z',
                legacyId=f'DEMO-{site}-A{j+1}',extensionData={'dataStatus':SYNTHETIC,'warrantyUntil':None,'technicalLifespan':20}))
        coords = {'type':'Point','coordinates':b['coordinates']}
        lv = Transformer.from_crs(4326,2056,always_xy=True).transform(*b['coordinates']) if b['country']=='CH' else (None,None)
        plotname = f"Parzelle {cadastre['parcelNumber']} – {b['name']}" if cadastre else f'Demo-Perimeter – {b["name"]}'
        ownership = label('profile-eigentumsart', ownership_code)
        value = round(m['GF'] * (8500 if museum else 5200) * country_factor / 100000)*100000
        simple_props = dict(bbl_stat=label('local-operating-status','ACTIVE'),bbl_id=bid,bbl_buch=book,bbl_we=site,bbl_obj=obj,bbl_bez=b['name'],
            referenceCodes=reference_codes,gwr_stat=label('r-gwr-status', physical_status) if physical_status else None,
            adr_land=b['country'],adr_reg=b['region'],adr_ort=b['city'],adr_plz=b['postalCode'],adr_str=b['street'],adr_hsnr=b['houseNumber'],adr_conct=address,
            wgs84_lon=b['coordinates'][0],wgs84_lat=b['coordinates'][1],lv95_e=round(lv[0],2) if lv[0] else None,lv95_n=round(lv[1],2) if lv[1] else None,egm_elev=None,
            bbl_eigen=ownership,bbl_ostr='Erhalten',bbl_mietm=None,
            bbl_bjahr=s['constructionYear'],bbl_vjahr=None,bbl_port=portfolio,bbl_port2=portfolio_group,bbl_awrt=value,bbl_bwrt=round(value*.64/100000)*100000,
            bbl_gbda1=primary_type,bbl_gbda2=secondary_type,bbl_ovtw=building_contacts[0]['name'],bbl_pvtw=building_contacts[1]['name'],
            av_egid=b['egid'],av_egrid=b.get('egrid'),bfs_gem=('Köniz' if b['slug']=='liebefeld' else b['city']) if b['country']=='CH' else None,
            bfs_gemnr={'Bern':'351','Liebefeld':'355','Zollikofen':'361','Zürich':'261'}.get(b['city']),av_zbez=None,av_znut=None,
            bbl_hist=None,bbl_arch=None,kgs_kat=None,kgs_nr=None,
            garea_gf=m['GF'],garea_gfo=m['GFO'],garea_gfu=m['GFU'],garea_acu='GF publiziert; Aufteilung Demo' if published else 'Demo-Schätzung',
            garea_ngf=m['NGF'],garea_kf=m['KF'],garea_nf=m['NF'],garea_hnf=m['HNF'],garea_nnf=m['NNF'],garea_ff=m['FF'],garea_vf=m['VF'],
            garea_vmf=None,garea_ebf=None,gvol_gv=m['GV'],gvol_gvo=m['GVO'],gvol_gvu=m['GVU'],gvol_acu='GV publiziert; Aufteilung Demo' if published else 'Demo-Schätzung',
            gastw=s['aboveGroundFloors']+s['belowGroundFloors'],gastw_og=s['aboveGroundFloors'],gastw_ug=s['belowGroundFloors'],gastw_acu='Demo-Schätzung',
            larea_ggf=m['GGF'],larea_gsf=m['GSF'],larea_uf=m['UF'],larea_acu='GSF aus AV; GGF/UF Demo' if cadastre else 'Demo-Perimeter, nicht AV',
            rics_gea=m['GEA'],rics_gia=m['GIA'],rics_nia=m['NIA'],rics_standard=RICS,
            objectid=index+1,etl_ts=STAMP,img_url=image_urls,photos=photos,provenance=provenance,
            # Simple has no entity tables; preserve rich records without changing its flat GIS keys.
            demoRelatedRecords={'areaMeasurements':measurements,'documents':building_documents,'contacts':building_contacts,
                                'costs':[c for c in entities['costs'] if bid in c['buildingIds']]})
        simple.append(feature(simple_props,coords))
        ext = dict(numberOfFloors=s['aboveGroundFloors']+s['belowGroundFloors'],responsiblePerson=building_contacts[0]['name'],
            sapId=dict(companyCode=book,economicUnit=site,objectNumber=obj),
            referenceCodes=reference_codes,gwrStatus=simple_props['gwr_stat'],rentalModel=None,
            egid=b['egid'],egrid=b.get('egrid'),portfolio=portfolio,portfolioGroup=portfolio_group,heatingGenerator=heating,
            heatingSource='Elektrizität (Demo)' if diplomatic else 'Fernwärme (Demo)',hotWater='Zentrale Versorgung (Demo)',
            plotName=plotname,plotId=cadastre['parcelNumber'] if cadastre else f'DEMO-{site}',netFloorArea=m['NGF'],grossFloorArea=m['GF'],photos=photos,provenance=provenance,
            # Exact public year only; date-shaped legacy fields below use Jan 1 as a transport convention.
            yearPrecision='year; January 1 is not a known completion date')
        tabs.append(feature(dict(buildingId=bid,siteId=siteid,name=b['name'],primaryTypeOfBuilding=primary_type,
            secondaryTypeOfBuilding=secondary_type,typeOfOwnership=ownership,validFrom=None,validUntil=None,
            constructionYear=date(s['constructionYear']),buildingPermitDate=None,yearOfLastRefurbishment=date(s['lastRefurbishmentYear']),
            parkingSpaces=round(m['HNF']/180),electricVehicleChargingStations=max(0,round(m['HNF']/1800)),monumentProtection=None,
            status='In Betrieb',energyEfficiencyClass=None,streetName=address,houseNumber=b['houseNumber'],postalCode=b['postalCode'],
            city=b['city'],stateProvincePrefecture={'BE':'Kanton Bern','ZH':'Kanton Zürich'}.get(b['region'],b['region']),country=b['country'],extensionData=ext,legacyId=bid),coords))
        landcover_record=landcover_records.get(b['slug']) if cadastre else None
        official_landcover=bool(landcover_record and landcover_record.get('features'))
        polygon,covers=geometry_for(b,m,landcover_record)
        def cover_sum(*groups):
            return round(sum(area for kind,area,g,extra in covers if LAND_COVER_GROUPS.get(kind) in groups),2)
        geom_prov=({'dataStatus':'public-source','geometryMethod':'swisstopo CadastralWebMap polygon; original vertices, ring orientation normalised',
                   'notice':'AV-Parzellengeometrie; Fläche aus Polygon berechnet. Eigentumsangabe ist Demo.',
                   'sourceUrl':cadastre['parcelSourceUrl'],'gwrSourceUrl':cadastre['gwrSourceUrl'],'egrid':b['egrid'],'buildingId':bid,
                   'retrievedAt':cadastre['retrievedAt'],'areaMethod':cadastre['areaMethod']}
                  if cadastre else {'dataStatus':SYNTHETIC,'geometryMethod':'metric rectangles in local azimuthal equidistant CRS',
                   'notice':'Schematischer Demo-Perimeter; keine amtliche Parzelle, keine Eigentumsgrenze.', 'buildingId':bid})
        simple_parcels.append(feature(dict(bbl_stat=label('local-operating-status','ACTIVE'),bbl_id=pid,bbl_buch=book,bbl_we=site,bbl_obj='01',bbl_bez=plotname,
            bbl_port=portfolio,bbl_mietm=simple_props['bbl_mietm'],bbl_eigen=ownership,bbl_awrt=None,bbl_bwrt=None,bbl_hgart=False,
            **{k:v for k,v in simple_props.items() if k.startswith('adr_') or k in ['wgs84_lat','wgs84_lon','lv95_e','lv95_n','bfs_gem','bfs_gemnr']},
            egm_elev=None,av_stat='AV / GWR' if cadastre else 'Demo',av_egrid=b.get('egrid'),av_nr=cadastre['parcelNumber'] if cadastre else f'DEMO-{site}',larea_ggf=m['GGF'],larea_gsf=m['GSF'],larea_uf=m['UF'],
            larea_buf=cover_sum('befestigt'),larea_uuf=cover_sum('humusiert','gewaesser','bestockt','vegetationslos'),
            larea_acu='GSF und Bodenbedeckung aus AV (geodienste.ch)' if official_landcover else 'GSF aus AV; Bodenbedeckung Demo' if cadastre else 'Demo-Perimeter, nicht AV',
            larea_ver=cover_sum('gebaeude','befestigt'),larea_gre=cover_sum('humusiert','bestockt'),av_zbez=None,av_znut=None,
            fid=None,fid_src=None,objectid=index+1,etl_ts=STAMP,provenance=geom_prov),polygon))
        tabs_parcels.append(feature(dict(parcelId=pid,buildingId=bid,plotNumber=cadastre['parcelNumber'] if cadastre else f'DEMO-{site}',egrid=b.get('egrid'),name=plotname,
            municipality=cadastre['municipality'] if cadastre else b['city'],canton=b['region'] if b['country']=='CH' else None,area=m['GSF'],landUseZone=None,
            ownershipType=ownership,provenance=geom_prov,
            extensionData=dict(sapId=dict(companyCode=book,economicUnit=site,objectNumber='01'))),polygon))
        for kind,area,g,extra in covers:
            objectid=len(landcovers)+1
            point=shape(g).representative_point()
            lv95=LV95.transform(point.x,point.y) if b['country']=='CH' else None
            # The building's own footprint: the official piece carrying its EGID, or the schematic footprint
            own_footprint=kind=='Gebaeude' and (extra.get('egid')==b['egid'] if official_landcover else True)
            if official_landcover:
                lc_prov={'dataStatus':'public-source','buildingId':bid,'notice':AV_NOTICE,
                    'geometryMethod':'AV land cover polygon (WFS, EPSG:4326) clipped to the AV parcel in a local azimuthal equidistant CRS; geodesic area',
                    'sourceUrl':landcover_record['sourceUrl'],'retrievedAt':landcover_record['retrievedAt'],'licence':landcover_record['licence'],
                    'quality':extra.get('quality'),'canton':extra.get('canton'),'municipalityNumber':extra.get('municipalityNumber')}
            else:
                lc_prov={'dataStatus':SYNTHETIC,'buildingId':bid,'notice':DEMO_NOTICE,
                    'geometryMethod':'synthetic footprint and surroundings clipped to real AV parcel' if cadastre else 'metric rectangles'}
            status=extra.get('quality') or 'AV' if official_landcover else 'Demo'
            landcovers.append(feature(dict(bbl_id=pid,geb_id=bid if own_footprint else None,av_stat=status,av_egid=extra.get('egid'),
                av_egrid=b.get('egrid') if official_landcover else None,av_type=kind,lc_area=round(area,2),
                wgs84_lat=round(point.y,8),wgs84_lon=round(point.x,8),lv95_e=round(lv95[0],2) if lv95 else None,lv95_n=round(lv95[1],2) if lv95 else None,
                fid=None,fid_src='geodienste.ch ms:LCSF' if official_landcover else None,objectid=objectid,etl_ts=STAMP,provenance=lc_prov),g))
            tabs_landcovers.append(feature(dict(landCoverId=objectid,parcelId=pid,buildingId=bid if own_footprint else None,type=kind,
                typeGroup=LAND_COVER_GROUPS.get(kind,'befestigt'),area=round(area,2),egid=extra.get('egid'),egrid=b.get('egrid') if official_landcover else None,
                surveyStatus=status,canton=extra.get('canton') if official_landcover else (b['region'] if b['country']=='CH' else None),
                municipalityNumber=extra.get('municipalityNumber'),provenance=lc_prov),g))
    save(ROOT/'prototype-simple/data/buildings.geojson',collection('BBL_GIS_IMMO_Building',simple))
    save(ROOT/'prototype-simple/data/parcels.geojson',collection('BBL_GIS_IMMO_Parcel',simple_parcels))
    save(ROOT/'prototype-simple/data/landcovers.geojson',collection('BBL_GIS_IMMO_LandCover',landcovers))
    save(ROOT/'prototype-tabs/data/buildings.geojson',collection('BBL_Immobilienportfolio',tabs))
    save(ROOT/'prototype-tabs/data/parcels.geojson',collection('BBL_Parzellen',tabs_parcels))
    save(ROOT/'prototype-tabs/data/landcovers.geojson',collection('BBL_Bodenbedeckung',tabs_landcovers))
    for key,values in entities.items():
        filename = 'area-measurements' if key=='areaMeasurements' else key
        save(ROOT/f'prototype-tabs/data/{filename}.json',{'dataVersion':AS_OF,key:values})
    for proto in ['prototype-simple','prototype-tabs']:
        save(ROOT/f'{proto}/data/portfolio-provenance.json',{'asOf':AS_OF,'buildingCount':len(buildings),
            'sourceManifest':'../../scripts/portfolio/sources/properties.json','methodology':'../../scripts/portfolio/README.md',
            'documentCatalogue':catalogue,'costClassification':cost_classification,
            'landCover':{'swissSource':'Amtliche Vermessung, Bodenbedeckung (WFS ms:LCSF) via geodienste.ch, clipped to the reviewed AV parcels',
                'sourceManifest':'../../scripts/portfolio/sources/swiss-landcover.json','retrievedAt':next(iter(landcover_records.values()))['retrievedAt'] if landcover_records else None,
                'officialParcels':sum(1 for r in landcover_records.values() if r.get('features')),
                'notice':'Overseas parcels carry schematic demonstration polygons (synthetic-demo). AV land cover © the cantons via geodienste.ch.'},
            'copyright':'Photos retain individual copyrights; OSM geocodes © OpenStreetMap contributors, ODbL. Swiss address geocodes © swisstopo.'})
    write_photo_attribution(buildings)
    print(f'Generated {len(buildings)} buildings per prototype, {len(landcovers)} land-cover polygons; '+', '.join(f'{len(v)} {k}' for k,v in entities.items()))


def re_file_size(title):
    import re
    match=re.search(r'PDF\s+([\d.]+\s+(?:MB|kB))',title)
    return match.group(1) if match else None


if __name__=='__main__':
    main()
