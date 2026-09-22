"""Fetch pinned, ISC-licensed geometry helpers for both offline prototypes."""
from pathlib import Path
from urllib.request import urlopen
import hashlib

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'polylabel/polylabel.js': 'https://raw.githubusercontent.com/mapbox/polylabel/v2.0.1/polylabel.js',
    'polylabel/LICENSE': 'https://raw.githubusercontent.com/mapbox/polylabel/v2.0.1/LICENSE',
    'tinyqueue/index.js': 'https://raw.githubusercontent.com/mourner/tinyqueue/v3.0.0/index.js',
    'tinyqueue/LICENSE': 'https://raw.githubusercontent.com/mourner/tinyqueue/v3.0.0/LICENSE',
}
for file, url in FILES.items():
    data = urlopen(url, timeout=30).read()
    if file.endswith('polylabel.js'):
        data = data.replace(b"from 'tinyqueue'", b"from '../tinyqueue/index.js'")
    for prototype in ['prototype-simple', 'prototype-tabs']:
        dest = ROOT / prototype / 'vendor' / file
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    print(file, hashlib.sha256(data).hexdigest())
