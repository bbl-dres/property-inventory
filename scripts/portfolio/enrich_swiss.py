"""Apply reviewed, matching GWR/cadastral snapshots to the shared source manifest (offline)."""
from pathlib import Path
import json
from pyproj import Transformer, Geod
from shapely.geometry import shape, Point, mapping
from shapely.geometry.polygon import orient

DATA=Path(__file__).parent/'sources'
EXPECTED={'bundeshaus-west':'1230654','bbl-fellerstrasse':'1243999','liebefeld':'191458950',
          'zollikofen':'191688442','landesmuseum':'302030043'}


def main():
    path=DATA/'properties.json'
    buildings=json.loads(path.read_text(encoding='utf-8'))
    records=json.loads((DATA/'swiss-cadastre.json').read_text(encoding='utf-8'))
    transform=Transformer.from_crs(2056,4326,always_xy=True)
    geod=Geod(ellps='WGS84')
    for b in buildings:
        if b['country']!='CH':
            continue
        record=records[b['slug']]
        p=record['gwr']['feature']['properties']
        assert p['egid']==EXPECTED[b['slug']], 'Unreviewed GWR feature'
        matches=[f for f in record['parcels']['results'] if f['properties']['egris_egrid']==p['egrid']]
        assert len(matches)==1, 'Ambiguous or missing GWR-to-parcel EGRID match'
        f=matches[0]
        polygon=shape(f['geometry'])
        assert polygon.is_valid and polygon.geom_type=='Polygon'
        polygon=orient(polygon,sign=1)
        point=list(transform.transform(p['gkode'],p['gkodn']))
        assert polygon.covers(Point(point)), 'GWR building coordinate outside the matched parcel'
        b['coordinates']=[round(x,8) for x in point]
        b['egid'],b['egrid']=p['egid'],p['egrid']
        area=abs(geod.geometry_area_perimeter(polygon)[0])
        b['cadastre']={'egid':p['egid'],'egrid':p['egrid'],'parcelNumber':f['properties']['number'],
            'municipality':p['ggdename'],'municipalityNumber':p['ggdenr'],
            'geometry':mapping(polygon),'geometryAreaM2':round(area,2),
            'areaMethod':'WGS84 geodesic area of returned cadastral polygon; not a land-register area attribute',
            'gwrSourceUrl':record['gwrUrl'],'parcelSourceUrl':record['parcelUrl'],
            'parcelFeatureId':f['featureId'],'registerDataDate':p['gexpdat'],'retrievedAt':record['retrievedAt'],
            'matchMethod':'GWR EGRID equals exact-point cadastral EGRID; GWR building coordinate contained in polygon',
            'geoportalUrl':f['properties']['geoportal_url'],'officialGeometry':True,
            'note':'Parcel may contain additional buildings. Cadastral geometry is not evidence of ownership.'}
        b['scenario']['siteArea']=round(area,2)
        b['geocoding']={'provider':'swisstopo / BFS GWR','sourceUrl':record['gwrUrl'],'retrievedAt':record['retrievedAt'],
            'reviewed':True,'precision':'gwr-building-coordinate','coordinateSourceCode':p['gksce'],
            'matchedAddress':p['strname_deinr']+', '+p['plz_plz6'].split('/')[0]+' '+p['ggdename'],
            'note':'GWR building position (GKODE/GKODN), transformed LV95 to WGS84; not the entrance point.'}
        b['factSources'].update({'coordinates':record['gwrUrl'],'EGID':record['gwrUrl'],
                                'EGRID':record['parcelUrl'],'parcelGeometry':record['parcelUrl']})
        if b['scope'].startswith('Publicly documented building/site;'):
            b['scope']='Publicly documented building/site. The matched AV parcel may include additional buildings; operational records and land cover are demonstration assumptions.'
        if b['slug']=='landesmuseum':
            b['houseNumber']='6'
            b['publicVisitorAddress']='Museumstrasse 2, 8001 Zürich'
            b['addressSource']=record['gwrUrl']
            b['factSources']['address']=record['gwrUrl']
            b['scope']='2016 extension only (7,400 m²); its own GWR EGID 302030043 is at Museumstrasse 6. Public visitor address: Museumstrasse 2. Parcel AA8090 also contains the historic museum; its full parcel area is not exclusive to the extension.'
        print(b['slug'],b['egid'],b['egrid'],b['cadastre']['parcelNumber'],round(area,2),'m²')
    path.write_text(json.dumps(buildings,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':
    main()
