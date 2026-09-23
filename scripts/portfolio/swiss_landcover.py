"""Fetch the official land cover (AV Bodenbedeckung) around the Swiss parcels.

python scripts/portfolio/swiss_landcover.py
Source: the WFS of the cadastral survey on geodienste.ch (feature type ms:LCSF, German endpoint so the
BBArt values are not translated), queried by the bounding box of each reviewed parcel and reduced to
the polygons that intersect the parcel. Responses are cached like the other research requests; the
kept features are written unclipped to sources/swiss-landcover.json. generate.py clips them to the
parcel and computes the areas, so the export stays deterministic and offline.
Coverage: not every canton publishes its land cover on geodienste.ch (as of March 2025 no access for
JU, LU, NE, NW, OW, VD; partial TI, VS). The five reviewed parcels lie in BE and ZH, both published.
"""
import json
import requests
from shapely.geometry import shape
from research import DATA, fetch, write

WFS = 'https://geodienste.ch/db/av_0/deu'
TYPE = 'ms:LCSF'
PAGE = 1000
RETRIEVED = '2026-09-23'


def request_url(bbox):
    min_lon, min_lat, max_lon, max_lat = bbox
    params = {'SERVICE': 'WFS', 'VERSION': '2.0.0', 'REQUEST': 'GetFeature', 'TYPENAMES': TYPE,
              'SRSNAME': 'urn:ogc:def:crs:EPSG::4326',
              'BBOX': f'{min_lat},{min_lon},{max_lat},{max_lon},urn:ogc:def:crs:EPSG::4326',
              'OUTPUTFORMAT': 'geojson', 'COUNT': str(PAGE)}
    return requests.Request('GET', WFS, params=params).prepare().url


def main():
    properties = json.loads((DATA / 'properties.json').read_text(encoding='utf-8'))
    out = {}
    for b in properties:
        cadastre = b.get('cadastre')
        if b['country'] != 'CH' or not cadastre:
            continue
        parcel = shape(cadastre['geometry'])
        url = request_url(parcel.bounds)
        payload = json.loads(fetch(url))
        features = payload.get('features') or []
        if len(features) >= PAGE:
            raise SystemExit(f"{b['slug']}: the bounding box returned a full page; add paging before trusting the result")
        kept = []
        for f in features:
            geometry = shape(f['geometry'])
            if not geometry.is_valid:
                geometry = geometry.buffer(0)
            if geometry.intersects(parcel) and geometry.intersection(parcel).area > 0:
                kept.append({'properties': f['properties'], 'geometry': f['geometry']})
        out[b['slug']] = {'retrievedAt': RETRIEVED, 'sourceUrl': url, 'service': WFS, 'featureType': TYPE,
                          'crs': 'urn:ogc:def:crs:EPSG::4326', 'egrid': cadastre['egrid'],
                          'returned': len(features), 'intersecting': len(kept),
                          'licence': 'AV land cover © the cantons, distributed via geodienste.ch; see the geodienste.ch and geo.admin.ch terms of use',
                          'features': kept}
        types = {}
        for f in kept:
            types[f['properties']['Art']] = types.get(f['properties']['Art'], 0) + 1
        print(b['slug'], cadastre['egrid'], 'returned', len(features), 'intersecting', len(kept), types, flush=True)
    write('swiss-landcover.json', out)


if __name__ == '__main__':
    main()
