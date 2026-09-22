"""Refresh public-source research; generated app data never requires network access.

Usage: python scripts/portfolio/research.py catalog|publications|geocode|photos
Requires requests, beautifulsoup4, pymupdf, pillow (see requirements.txt).
"""
from pathlib import Path
import argparse
import hashlib
import json
import time
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'scripts/portfolio/sources'
CACHE = ROOT / 'tmp/portfolio-research'
MEDIA = 'https://www.bbl.admin.ch/de/mediendatenbank'
DOCS = 'https://www.bbl.admin.ch/de/bautendokumentationen'
KBOB = 'https://www.kbob.admin.ch/dam/de/sd-web/rVvtgYM1wFVT/20171024_KBOB-IPB_Anhang_C_-_Dokumenttypenkatalog_2016_DE.pdf'
SESSION = requests.Session()
SESSION.headers['User-Agent'] = 'PropertyInventoryResearch/1.0 (public BBL portfolio prototype; cached one-off research)'


def fetch(url):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / hashlib.sha256(url.encode()).hexdigest()
    if not path.exists():
        response = SESSION.get(url, timeout=60)
        response.raise_for_status()
        path.write_bytes(response.content)
    return path.read_bytes()


def write(name, value):
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def catalog():
    soup = BeautifulSoup(fetch(MEDIA), 'html.parser')
    groups, heading = {}, None
    for node in soup.select('h3,h4,figure'):
        if node.name in ('h3', 'h4'):
            heading = node.get_text(' ', strip=True)
        else:
            img = node.find('img')
            if img and 'imgix.net' in img.get('src', ''):
                groups.setdefault(heading, []).append({
                    'url': img['src'], 'alt': img.get('alt', ''),
                    'credit': node.get_text(' ', strip=True), 'source': MEDIA,
                })
    write('media-catalog.json', groups)
    soup = BeautifulSoup(fetch(DOCS), 'html.parser')
    docs = [{'title': a.get_text(' ', strip=True), 'url': urljoin(DOCS, a['href'])}
            for a in soup.select('a[href]') if '.pdf' in a['href'].lower()]
    write('publication-catalog.json', docs)
    import fitz
    pdf = fitz.open(stream=fetch(KBOB), filetype='pdf')
    (CACHE / 'kbob-catalog-extract.txt').write_text('\n'.join(p.get_text() for p in pdf), encoding='utf-8')
    print(f'{len(groups)} photo groups, {len(docs)} publications; KBOB text extracted')


def publications():
    import fitz
    properties = json.loads((DATA / 'properties.json').read_text(encoding='utf-8'))
    for b in properties:
        url = b.get('publication', {}).get('url')
        if not url:
            continue
        pdf = fitz.open(stream=fetch(url), filetype='pdf')
        text = '\n'.join(f'--- Page {i+1} ---\n{p.get_text()}' for i, p in enumerate(pdf))
        (CACHE / f"{b['slug']}.txt").write_text(text, encoding='utf-8')
        print(b['slug'], len(pdf), 'pages')


def geocode():
    properties = json.loads((DATA / 'properties.json').read_text(encoding='utf-8'))
    results = {}
    for b in properties:
        q = b['geocodeQuery']
        if b['country'] == 'CH':
            url = requests.Request('GET', 'https://api3.geo.admin.ch/rest/services/api/SearchServer',
                                   params={'searchText': q, 'type': 'locations', 'origins': 'address', 'limit': 3, 'sr': 4326}).prepare().url
        else:
            url = requests.Request('GET', 'https://nominatim.openstreetmap.org/search',
                                   params={'q': q, 'format': 'jsonv2', 'limit': 3, 'addressdetails': 1}).prepare().url
        try:
            results[b['slug']] = {'query': q, 'url': url, 'results': json.loads(fetch(url))}
        except requests.RequestException as exc:
            results[b['slug']] = {'query': q, 'url': url, 'error': str(exc)}
        time.sleep(1.1)  # Nominatim public endpoint: at most one request per second.
    write('geocoding-results.json', results)
    print('Geocoding candidates saved; inspect matches before updating properties.json.')


def photos():
    from io import BytesIO
    from PIL import Image
    properties = json.loads((DATA / 'properties.json').read_text(encoding='utf-8'))
    dest = ROOT / 'assets/portfolio'
    dest.mkdir(parents=True, exist_ok=True)
    for b in properties:
        for i, p in enumerate(b['photos']):
            if p.get('pdfImageXref'):
                import fitz
                pdf = fitz.open(stream=fetch(p['url']), filetype='pdf')
                content = pdf.extract_image(p['pdfImageXref'])['image']
            else:
                content = fetch(p['url'])
            image = Image.open(BytesIO(content)).convert('RGB')
            image.thumbnail((1400, 1000))
            image.save(dest / f"{b['slug']}-{i+1}.jpg", quality=85, optimize=True)
        print(b['slug'], len(b['photos']), 'photos')


def review():
    """Render contact sheets for manual exterior/interior selection, and source PDFs."""
    from io import BytesIO
    from PIL import Image, ImageDraw
    import fitz
    properties = json.loads((DATA / 'properties.json').read_text(encoding='utf-8'))
    catalog = json.loads((DATA / 'media-catalog.json').read_text(encoding='utf-8'))
    for b in properties:
        images = catalog[b['mediaHeading']]
        sheet = Image.new('RGB', (1000, 210 * ((len(images)+3)//4)), 'white')
        draw = ImageDraw.Draw(sheet)
        for i, p in enumerate(images):
            img = Image.open(BytesIO(fetch(p['url']))).convert('RGB')
            img.thumbnail((245, 175))
            x, y = i % 4 * 250, i // 4 * 210
            sheet.paste(img, (x, y))
            draw.text((x+4, y+180), f"{b['slug']} {i+1}", fill='black')
        sheet.save(CACHE / f"{b['slug']}-photos.jpg")
        if b.get('publication'):
            pdf = fitz.open(stream=fetch(b['publication']['url']), filetype='pdf')
            pdf[0].get_pixmap(matrix=fitz.Matrix(1.4, 1.4)).save(CACHE / f"{b['slug']}-source.png")
        print(b['slug'], 'review sheet ready', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['catalog', 'publications', 'geocode', 'photos', 'review'])
    args = parser.parse_args()
    globals()[args.command]()
