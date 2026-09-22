"""Read the public data-catalog vocabularies; no login, writes or private keys.

Usage: python scripts/reference-data/fetch.py
The publishable key is the public browser application's connection setting.
"""
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
BASE = 'https://zicluerzbevodlmtbxow.supabase.co/rest/v1'
PUBLIC_KEY = 'sb_publishable_i-F2Z-SvidOUNYK92vps8g_qf0oTRfT'


def read(table, query):
    url = BASE + '/' + table + '?' + urlencode(query)
    request = Request(url, headers={'apikey': PUBLIC_KEY, 'Accept-Profile': 'catalog',
                                   'Prefer': 'count=exact', 'Accept': 'application/json'})
    with urlopen(request, timeout=60) as response:
        return json.load(response), response.headers.get('Content-Range'), url


def main():
    snapshot = {'retrievedAt': datetime.now(timezone.utc).isoformat(), 'baseUrl': BASE,
                'schema': 'catalog', 'requests': [], 'tables': {}}
    before, _, _ = read('catalog_state', {'select': 'version'})
    for table in ['code_list', 'code_value', 'business_object', 'business_attribute']:
        rows = []
        while True:
            data, content_range, url = read(table, {'order': 'id.asc', 'limit': 500, 'offset': len(rows)})
            snapshot['requests'].append({'url': url, 'contentRange': content_range})
            rows.extend(data)
            total = int(content_range.split('/')[-1])
            if len(rows) == total:
                break
            if not data or len(rows) > total:
                raise RuntimeError('Incomplete collection: ' + table)
        snapshot['tables'][table] = rows
        print(table, len(rows))
    after, _, _ = read('catalog_state', {'select': 'version'})
    if before != after:
        raise RuntimeError('Catalogue changed during pagination; retry before publishing a snapshot')
    snapshot['catalogVersion'] = str(before[0]['version'])
    target = ROOT / 'sources' / 'catalog.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
