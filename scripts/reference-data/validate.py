"""Check active catalogue values, exact labels, code preservation and schema parity."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8'))

def main():
    meta = read('prototype-simple/data/meta.json')
    assert meta == read('prototype-tabs/data/meta.json')
    source = read('scripts/reference-data/sources/catalog.json')
    assert meta['source']['catalogVersion'] == source['catalogVersion']
    by_id = {v['id']: v for v in source['tables']['code_value']}
    for key, values in meta['valueLists'].items():
        if key.startswith('local-'):
            assert values['status'] == 'local-demo'
            continue
        original = next(v for v in source['tables']['code_list'] if v['id'] == values['id'])
        assert not original['is_archived'] and original['status'] != 'retired'
        assert {v['id'] for v in values['values']} == {v['id'] for v in by_id.values() if v['code_list_id'] == values['id'] and not v['is_archived']}
        for v in values['values']:
            assert v['code'] == by_id[v['id']]['code'] and v['labels']['de'] == by_id[v['id']]['name_de']

    def label(list_name, code):
        return next(v['labels']['de'] for v in meta['valueLists'][list_name]['values'] if v['code'] == code)
    def get(obj, path):
        for key in path.split('.'):
            obj = obj[key]
        return obj
    a = read('prototype-simple/data/buildings.geojson')['features']
    b = read('prototype-tabs/data/buildings.geojson')['features']
    for simple, tabs in zip(a, b):
        p, q = simple['properties'], tabs['properties']
        assert p['referenceCodes'] == q['extensionData']['referenceCodes']
        for key, code in p['referenceCodes'].items():
            binding = meta['bindings'][key]
            expected = label(binding['valueList'], code) if code else None
            assert get(p, binding['paths']['prototype-simple']) == get(q, binding['paths']['prototype-tabs']) == expected
        assert p['gwr_stat'] == ('Bestehend' if p['adr_land'] == 'CH' else None)
        rows = [m for m in read('prototype-tabs/data/area-measurements.json')['areaMeasurements'] if p['bbl_id'] in m['buildingIds']]
        assert rows == p['demoRelatedRecords']['areaMeasurements']
        for m in rows:
            assert m['accuracy'] == label('profile-bemessungsgenauigkeit', m['accuracyCode'])
            assert m['standard'] == label('profile-bemessungsstandard', m['standardCode'])
            assert m['extensionData']['standardDetail']
            status = m['extensionData']['dataStatus']
            if status == 'published-source':
                assert m['accuracyCode'] == 'UNBEKANNT' and m['bmEstimation'] is None
            elif status == 'derived-public-geometry':
                assert m['accuracyCode'] == 'GEMESSEN' and m['standardCode'] == 'ANDERE_REGEL'
            else:
                assert m['accuracyCode'] == 'GESCHAETZT'
    for doc in read('prototype-tabs/data/documents.json')['documents']:
        assert doc['type'] == label('r-kbob-dokumenttyp', doc['documentTypeCode'])
    print('PASS reference data: active catalogue members, exact labels/codes, unknowns, evidence and cross-schema parity')

if __name__ == '__main__':
    main()
