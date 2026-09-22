"""Build identical offline metadata for both prototypes from a reviewed API snapshot."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).parent / 'sources' / 'catalog.json'
LISTS = ['profile-bemessungsgenauigkeit', 'profile-bemessungsstandard', 'profile-messeinheit',
         'profile-bemessungsart', 'r-sia-flaeche', 'profile-eigentumsart', 'r-bbl-teilportfolio',
         'r-bbl-gebaeudeart-1', 'r-bbl-gebaeudeart-2', 'r-bbl-mietmodell', 'r-gwr-status',
         'r-kbob-dokumenttyp', 'r-iso-land']


def labels(row, prefix='name'):
    return {lang: row[prefix + '_' + lang] for lang in ['de', 'fr', 'it', 'en'] if row.get(prefix + '_' + lang)}


def build():
    snapshot = json.loads(SOURCE.read_text(encoding='utf-8'))
    tables = snapshot['tables']
    meta = {'schemaVersion': 1, 'source': {'name': 'BBL Data Catalog / prototype-oblique',
            'api': snapshot['baseUrl'], 'schema': snapshot['schema'], 'retrievedAt': snapshot['retrievedAt'],
            'catalogVersion': snapshot['catalogVersion'], 'snapshot': '../../scripts/reference-data/sources/catalog.json'},
            'valueLists': {}, 'bindings': {}}
    for name in LISTS:
        row = next(r for r in tables['code_list'] if r['identifier'] == name)
        assert not row['is_archived'] and row['status'] != 'retired', name
        values = sorted((v for v in tables['code_value'] if v['code_list_id'] == row['id'] and not v['is_archived']),
                        key=lambda v: (v.get('sort_order') is None, v.get('sort_order') or 0, v['code']))
        meta['valueLists'][name] = {'id': row['id'], 'labels': labels(row), 'status': row['status'],
            'version': row['version'], 'descriptions': labels(row, 'description'),
            'normativeReferences': row['normative_references'], 'documentationLinks': row['documentation_links'],
            'values': [{'id': v['id'], 'code': v['code'], 'labels': labels(v),
                        'descriptions': labels(v, 'description'), 'parentId': v['parent_code_value_id']} for v in values]}
    # Local operational categories are explicitly separate from physical GSTAT.
    meta['valueLists']['local-operating-status'] = {'labels': {'de': 'Bewirtschaftungsstatus'}, 'status': 'local-demo',
        'descriptions': {'de': 'Keine bestätigte Werteliste im Katalog. Nur lokale Szenarien, getrennt von GWR Gebäudestatus.'},
        'values': [{'code': code, 'labels': {'de': label}, 'color': color, 'className': cls} for code, label, color, cls in [
            ('ACTIVE', 'In Betrieb', '#2e7d32', 'status-active'), ('RENOVATION', 'In Renovation', '#ef6c00', 'status-renovation'),
            ('PLANNING', 'In Planung', '#1976d2', 'status-planning'), ('INACTIVE', 'Ausser Betrieb', '#6C757D', 'status-inactive')]]}
    bindings = {
        'building.ownership': ('profile-eigentumsart', 'bbl_eigen', 'typeOfOwnership'),
        'building.portfolio': ('r-bbl-teilportfolio', 'bbl_port', 'extensionData.portfolio'),
        'building.type1': ('r-bbl-gebaeudeart-1', 'bbl_gbda1', 'primaryTypeOfBuilding'),
        'building.type2': ('r-bbl-gebaeudeart-2', 'bbl_gbda2', 'secondaryTypeOfBuilding'),
        'building.rentalModel': ('r-bbl-mietmodell', 'bbl_mietm', 'extensionData.rentalModel'),
        'building.physicalStatus': ('r-gwr-status', 'gwr_stat', 'extensionData.gwrStatus'),
        'building.operatingStatus': ('local-operating-status', 'bbl_stat', 'status'),
        'measurement.accuracy': ('profile-bemessungsgenauigkeit', 'demoRelatedRecords.areaMeasurements[].accuracy', 'areaMeasurements[].accuracy'),
        'measurement.standard': ('profile-bemessungsstandard', 'demoRelatedRecords.areaMeasurements[].standard', 'areaMeasurements[].standard'),
        'document.type': ('r-kbob-dokumenttyp', 'demoRelatedRecords.documents[].type', 'documents[].type')}
    for key, (name, simple, tabs) in bindings.items():
        meta['bindings'][key] = {'valueList': name, 'paths': {'prototype-simple': simple, 'prototype-tabs': tabs}}
    for proto in ['prototype-simple', 'prototype-tabs']:
        (ROOT / proto / 'data/meta.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Built', len(meta['valueLists']), 'value lists for both prototypes')
    return meta


if __name__ == '__main__':
    build()
