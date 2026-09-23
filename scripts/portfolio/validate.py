"""Offline cross-schema, geometry, measurement, evidence and referential-integrity checks."""
from pathlib import Path
import json
from pyproj import Geod
from shapely.geometry import shape, Point
from shapely.ops import unary_union
from generate import LAND_COVER_GROUPS

ROOT=Path(__file__).resolve().parents[2]
GEOD=Geod(ellps='WGS84')


def read(path):
    return json.loads((ROOT/path).read_text(encoding='utf-8'))


def close(a,b):
    return abs(a-b) < .02


def polygon_area(g):
    assert g['type'] in ['Polygon','MultiPolygon']
    polygons=[g['coordinates']] if g['type']=='Polygon' else g['coordinates']
    for polygon in polygons:
        for i,ring in enumerate(polygon):
            assert ring[0]==ring[-1] and len(ring)>=4
            lon,lat=zip(*ring)
            area,_=GEOD.polygon_area_perimeter(lon,lat)
            assert area>0 if i==0 else area<0, 'GeoJSON ring orientation'
    return abs(GEOD.geometry_area_perimeter(shape(g))[0])


def main():
    source=read('scripts/portfolio/sources/properties.json')
    a=read('prototype-simple/data/buildings.geojson')['features']
    b=read('prototype-tabs/data/buildings.geojson')['features']
    ap=read('prototype-simple/data/parcels.geojson')['features']
    bp=read('prototype-tabs/data/parcels.geojson')['features']
    lc=read('prototype-simple/data/landcovers.geojson')['features']
    tlc=read('prototype-tabs/data/landcovers.geojson')['features']
    landcover_source=read('scripts/portfolio/sources/swiss-landcover.json')
    types=read('scripts/portfolio/sources/document-types.json')['types']
    classification=read('scripts/portfolio/sources/cost-classification.json')
    swiss=read('scripts/portfolio/sources/swiss-cadastre.json')
    ids={x['properties']['bbl_id'] for x in a}
    assert ids=={x['properties']['buildingId'] for x in b}=={x['id'] for x in source}
    assert len(ids)==len(a)==len(b)==14
    assert len({s['country'] for s in source})==9
    entities={}
    for key,file in [('areaMeasurements','area-measurements'),('documents','documents'),('contacts','contacts'),('costs','costs'),('contracts','contracts'),('assets','assets')]:
        rows=read(f'prototype-tabs/data/{file}.json')[key]
        seen=set()
        for row in rows:
            pk={'areaMeasurements':'areaMeasurementId','documents':'documentId','contacts':'contactId','costs':'costId','contracts':'contractId','assets':'assetId'}[key]
            assert row[pk] not in seen
            seen.add(row[pk])
            assert row['buildingIds'] and set(row['buildingIds'])<=ids
            ext=row['extensionData']
            assert ext['dataStatus'] in ['synthetic-demo','published-source','public-source','derived-public-geometry']
            if key=='documents':
                assert types[row['documentTypeCode']]==row['type']
                assert row['url'] is None or row['url'].startswith('https://')
                if ext['dataStatus']=='synthetic-demo':
                    assert row['url'] is None and row['fileSize'] is None and ext['availability']=='metadata-only'
            if key=='contacts':
                assert row['email'].endswith('@example.invalid') and row['phone'] is None
                assert ext['isFictionalPerson'] and '(Demo)' in row['name']
            if key=='costs':
                assert row['amount']>0 and row['currency']=='CHF' and ext['budgetYear']==2026
                assert ext['classification']==classification['classification']=='BKP'
                assert ext['standard']==classification['standard']
                assert classification['groups'][row['costGroup']]==row['costType']
                assert row['unit']=='CHF' and row['period']=='Einmalig'
                assert row['amount']==round(ext['quantityGF']*ext['rateCHFPerGF']/100)*100
                assert ext['dataStatus']=='synthetic-demo'
            if key=='contracts':
                assert row['validFrom'] <= '2026-09-22T00:00:00Z' <= row['validUntil'] and row['status']=='Aktiv'
            if key=='assets':
                assert row['installationYear']<=int(row['lastMaintenanceDate'][:4])
                assert row['lastMaintenanceDate']<'2026-09-22T00:00:00Z'<row['nextMaintenanceDate']
        entities[key]=rows
    for simple,tab,src,parcel,tabparcel in zip(a,b,source,ap,bp):
        p,q= simple['properties'],tab['properties']
        bid=p['bbl_id']
        assert bid == '/'.join([p['bbl_buch'],p['bbl_we'],p['bbl_obj']])
        assert q['extensionData']['sapId'] == dict(companyCode=p['bbl_buch'],economicUnit=p['bbl_we'],objectNumber=p['bbl_obj'])
        pp,pq=parcel['properties'],tabparcel['properties']
        assert pp['bbl_id'] == pq['parcelId'] == '/'.join([pp['bbl_buch'],pp['bbl_we'],pp['bbl_obj']])
        assert pq['extensionData']['sapId'] == dict(companyCode=pp['bbl_buch'],economicUnit=pp['bbl_we'],objectNumber=pp['bbl_obj'])
        assert len(p['bbl_obj']) == 2 and p['bbl_obj'].isalpha()
        assert len(pp['bbl_obj']) == 2 and pp['bbl_obj'].isdigit()
        assert p['demoRelatedRecords']['costs']==[c for c in entities['costs'] if bid in c['buildingIds']]
        assert q['buildingId']==bid and p['bbl_bez']==q['name']==src['name']
        assert simple['geometry']==tab['geometry']
        assert simple['geometry']['coordinates']==src['coordinates']
        lon,lat=src['coordinates']; assert -180<=lon<=180 and -90<=lat<=90
        assert src['geocoding']['reviewed'] and src['geocoding']['sourceUrl'].startswith('https://')
        for entity,rows in entities.items():
            assert any(bid in r['buildingIds'] for r in rows), (bid,entity)
        measurements={r['extensionData']['code']:r for r in entities['areaMeasurements'] if bid in r['buildingIds']}
        v={k:r['value'] for k,r in measurements.items()}
        assert v['GF']==v['NGF']+v['KF']==v['GFO']+v['GFU']
        assert v['NGF']==v['NF']+v['VF']+v['FF']
        assert v['NF']==v['HNF']+v['NNF']
        assert v['GV']==v['GVO']+v['GVU']
        assert close(v['GSF'],v['GGF']+v['UF'])
        assert 0<v['NIA']<v['GIA']<v['GEA'] and v['GIA']!=v['NGF']
        assert p['garea_gf']==v['GF'] and p['garea_ngf']==v['NGF']==q['extensionData']['netFloorArea']
        for code in ['GEA','GIA','NIA']:
            assert p['rics_'+code.lower()]==v[code] and measurements[code]['bmEstimation']
        for code,row in measurements.items():
            assert row['unit']==('m³' if code.startswith('GV') else 'm²')
            if code=='GSF' and src.get('cadastre'):
                assert row['value']==src['cadastre']['geometryAreaM2']
                assert row['extensionData']['dataStatus']=='derived-public-geometry' and not row['bmEstimation']
            elif not row['bmEstimation']:
                assert code in ['GF','GV'] and src['publishedMeasurements'][code]==row['value']
                assert row['extensionData']['sourceUrl']==src['publishedMeasurements']['sourceUrl']
            else:
                assert row['accuracy']=='Geschätzt' and row['accuracyCode']=='GESCHAETZT'
        if src.get('cadastre'):
            cadastre=src['cadastre']
            record=swiss[src['slug']]
            gwr=record['gwr']['feature']['properties']
            matches=[f for f in record['parcels']['results'] if f['properties']['egris_egrid']==gwr['egrid']]
            assert len(matches)==1 and gwr['egid']==cadastre['egid'] and gwr['egrid']==cadastre['egrid']
            assert shape(matches[0]['geometry']).equals(shape(parcel['geometry']))
            assert p['av_egrid']==q['extensionData']['egrid']==cadastre['egrid']
            assert p['av_egid']==q['extensionData']['egid']==cadastre['egid']
            assert parcel['properties']['av_nr']==tabparcel['properties']['plotNumber']==cadastre['parcelNumber']
            assert parcel['properties']['av_egrid']==tabparcel['properties']['egrid']==cadastre['egrid']
            assert parcel['geometry']==cadastre['geometry']
            assert shape(parcel['geometry']).covers(Point(src['coordinates']))
            assert parcel['properties']['provenance']['dataStatus']=='public-source'
        else:
            assert p['av_egrid'] is None and q['extensionData']['egrid'] is None
            assert parcel['properties']['provenance']['dataStatus']=='synthetic-demo'
        if p['adr_land']!='CH':
            assert p['av_egid'] is None and p['lv95_e'] is None and tabparcel['properties']['canton'] is None
        assert p['gastw']==p['gastw_og']+p['gastw_ug']
        assert p['bbl_bjahr'] is None or p['bbl_bjahr']<=2026
        # Every photo is local, sourced, credited and matched to the correct property.
        assert p['photos']==q['extensionData']['photos']
        assert {photo['scene'] for photo in p['photos']}=={'interior','exterior'}
        for photo in p['photos']:
            file=(ROOT/'prototype-simple'/photo['url']).resolve()
            assert file.is_relative_to(ROOT/'assets/portfolio') and file.exists()
            assert file.name.startswith(src['slug']+'-') and file.stat().st_size>2000
            assert photo['credit'] and photo['source'].startswith('https://')
            assert photo['kind']=='public-source-photo'
        assert parcel['geometry']==tabparcel['geometry']
        area=polygon_area(parcel['geometry'])
        assert abs(area-v['GSF'])/v['GSF']<.001
        covers=[f for f in lc if f['properties']['bbl_id']==parcel['properties']['bbl_id']]
        official=bool(src.get('cadastre')) and bool(landcover_source.get(src['slug'],{}).get('features'))
        total=sum(f['properties']['lc_area'] for f in covers)
        # Official AV land cover partitions the parcel up to the boundary precision of the two services
        assert abs(total-v['GSF'])/v['GSF']<.01 if official else close(total,v['GSF'])
        for cover in covers:
            assert abs(polygon_area(cover['geometry'])-cover['properties']['lc_area'])<.05
            assert cover['properties']['av_type'] in LAND_COVER_GROUPS
            assert cover['properties']['provenance']['dataStatus']==('public-source' if official else 'synthetic-demo')
            assert (cover['properties']['av_stat']!='Demo')==official and (cover['properties']['av_egrid']==cadastre['egrid'] if official else cover['properties']['av_egrid'] is None)
        # No land cover outside the official parcel and no overlaps; the synthetic partition is exact
        shapes=[shape(f['geometry']) for f in covers]
        union=unary_union(shapes)
        parcel_shape=shape(parcel['geometry'])
        assert union.difference(parcel_shape).area<1e-11
        assert sum(s.area for s in shapes)-union.area<(union.area*1e-4 if official else 1e-11)
        if not official:
            assert union.symmetric_difference(parcel_shape).area<1e-11
        # The building's own footprint is linked once; the tabs schema carries the same land cover
        own=[f for f in covers if f['properties']['geb_id']==bid]
        assert len(own)==1 and own[0]['properties']['av_type']=='Gebaeude'
        tabs_covers=[f for f in tlc if f['properties']['parcelId']==parcel['properties']['bbl_id']]
        assert [(f['properties']['objectid'],f['properties']['av_type'],f['properties']['lc_area'],f['properties']['geb_id'],f['properties']['av_egid'],f['properties']['av_egrid']) for f in covers]==\
               [(f['properties']['landCoverId'],f['properties']['type'],f['properties']['area'],f['properties']['buildingId'],f['properties']['egid'],f['properties']['egrid']) for f in tabs_covers]
        assert [f['geometry'] for f in covers]==[f['geometry'] for f in tabs_covers]
        assert all(f['properties']['typeGroup']==LAND_COVER_GROUPS[f['properties']['type']] for f in tabs_covers)
        assert tabparcel['properties']['buildingId']==bid
    report={'asOf':'2026-09-22','result':'passed','buildingsPerPrototype':len(a),'countries':9,'photos':42,
            'publishedMeasurements':sum(r['extensionData']['dataStatus']=='published-source' for r in entities['areaMeasurements']),
            'verifiedSwissEGID_EGRID_Parcels':sum(bool(s.get('cadastre')) for s in source),
            'landCoverPolygons':len(lc),'officialLandCoverParcels':sum(bool(r.get('features')) for r in landcover_source.values()),
            'counts':{k:len(v) for k,v in entities.items()},
            'checks':['cross-schema parity','referential integrity','SIA accounting identities','distinct RICS bases','source versus estimate flags',
                      'KBOB codes and labels','fictional contacts','contract and maintenance dates','local attributed interior/exterior photos',
                      'geodesic polygon areas','land-cover containment and partition','official AV land cover clipped to the Swiss parcels','land-cover parity across schemas','verified GWR-to-AV EGRID matches','no invented register IDs']}
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=='__main__':
    main()
