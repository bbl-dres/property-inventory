"""Fetch GWR attributes and exact-point CadastralWebMap parcels for Swiss properties.

python scripts/portfolio/swiss_cadastre.py
Uses the public geo.admin.ch API, caches responses, and does not guess missing IDs.
The GWR EGRID must match the containing parcel's EGRID before automatic acceptance.
"""
import json
import requests
from research import DATA, fetch, write

BASE='https://api3.geo.admin.ch/rest/services/ech/MapServer/'
PARCEL='ch.kantone.cadastralwebmap-farbe'
GWR='ch.bfs.gebaeude_wohnungs_register'


def request(path, **params):
    url=requests.Request('GET',BASE+path,params=params).prepare().url
    return url,json.loads(fetch(url))


def main():
    properties=json.loads((DATA/'properties.json').read_text(encoding='utf-8'))
    geocodes=json.loads((DATA/'geocoding-results.json').read_text(encoding='utf-8'))
    # Preserve the nearby-record query used to distinguish the extension from the
    # historic museum and its public visitor entrance.
    candidates_url,candidates=request('identify',geometry='8.5392,47.3787,8.5416,47.3808',
        geometryType='esriGeometryEnvelope',geometryFormat='geojson',sr=4326,
        layers='all:'+GWR,tolerance=0,limit=200,returnGeometry='true',lang='de')
    write('museum-gwr-candidates.json',{'sourceUrl':candidates_url,**candidates})
    out={}
    for b in properties:
        if b['country']!='CH':
            continue
        # GWR feature includes verified EGID, EGRID and municipality, not just a search label.
        # The 2016 museum extension has its own GWR record (Museumstrasse 6).
        # Reviewed against nearby GWR candidates and the BBL project year/scope.
        feature_id=('302030043_0' if b['slug']=='landesmuseum' else
                    geocodes[b['slug']]['results']['results'][0]['attrs']['featureId'])
        gwr_url,gwr=request(GWR+'/'+feature_id,sr=4326,geometryFormat='geojson')
        point=gwr['feature']['geometry']['coordinates']
        parcel_url,parcels=request('identify',geometry=','.join(map(str,point)),
            geometryType='esriGeometryPoint',geometryFormat='geojson',sr=4326,
            layers='all:'+PARCEL,tolerance=0,returnGeometry='true',lang='de')
        out[b['slug']]={'retrievedAt':'2026-09-22','gwrUrl':gwr_url,'gwr':gwr,
                       'parcelUrl':parcel_url,'parcels':parcels}
        print(b['slug'], 'GWR', gwr['feature']['properties']['egid'],
              'parcels', [f['properties']['egris_egrid'] for f in parcels['results']], flush=True)
    write('swiss-cadastre.json',out)
    from enrich_swiss import main as enrich
    enrich()


if __name__=='__main__':
    main()
