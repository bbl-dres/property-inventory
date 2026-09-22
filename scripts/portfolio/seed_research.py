"""One-time, reviewable selection of researched properties from BBL catalogues.

Do not rerun over reviewed properties.json: it contains the reviewed geocodes,
publication measurements and photo selections. This script records the initial selection.
"""
import json
from pathlib import Path

HERE = Path(__file__).parent / 'sources'
media = json.loads((HERE / 'media-catalog.json').read_text(encoding='utf-8'))
docs = json.loads((HERE / 'publication-catalog.json').read_text(encoding='utf-8'))
# slug, name, country, region, city, postal code, street, number, media heading, publication index, geocode query
rows = [
    ('bundeshaus-west', 'Bundeshaus West', 'CH', 'BE', 'Bern', '3003', 'Bundesgasse', '1', 'Bern Bundeshaus West', 13, 'Bundesgasse 1 Bern'),
    ('berlin', 'Schweizer Botschaft Berlin', 'DE', 'Berlin', 'Berlin', '10557', 'Otto-von-Bismarck-Allee', '4A', 'Berlin, Deutschland, Botschaft', 90, 'Otto-von-Bismarck-Allee 4A Berlin Germany'),
    ('bbl-fellerstrasse', 'BBL – Fellerstrasse 21', 'CH', 'BE', 'Bern', '3027', 'Fellerstrasse', '21', 'Bern, Bundesamt für Bauten und Logistik', 29, 'Fellerstrasse 21 Bern'),
    ('liebefeld', 'Verwaltungsgebäude Liebefeld', 'CH', 'BE', 'Liebefeld', '3097', 'Schwarzenburgstrasse', '157', 'Bern, Verwaltungsgebäude Liebefeld', 24, 'Schwarzenburgstrasse 157 Liebefeld'),
    ('zollikofen', 'Verwaltungsgebäude Eichenweg 3', 'CH', 'BE', 'Zollikofen', '3052', 'Eichenweg', '3', 'Zollikofen, Verwaltungsgebäude Eichenweg 3', 23, 'Eichenweg 3 Zollikofen'),
    ('landesmuseum', 'Landesmuseum Zürich – Erweiterungsbau', 'CH', 'ZH', 'Zürich', '8001', 'Museumstrasse', '2', 'Zürich, Schweizerisches Landesmuseum', 45, 'Museumstrasse 2 Zürich'),
    ('canberra', 'Schweizer Botschaft Canberra', 'AU', 'Australian Capital Territory', 'Canberra', '2603', 'Melbourne Avenue', '7', 'Canberra, Australien, Botschaft', None, '7 Melbourne Avenue Forrest Australia'),
    ('brasilia', 'Schweizer Botschaft Brasília', 'BR', 'Distrito Federal', 'Brasília', '70448-900', 'SES Avenida das Nações, Quadra 811', 'Lote 41', 'Brasilia, Brasilien, Botschaft', None, 'Embaixada da Suíça Brasília Brazil'),
    ('seoul', 'Schweizer Botschaft Seoul', 'KR', 'Seoul', 'Seoul', '03165', 'Songwol-gil, Jongno-gu', '77', 'Seoul, Südkorea, Botschaft', 70, 'Embassy of Switzerland Seoul South Korea'),
    ('nairobi', 'Schweizer Botschaft Nairobi', 'KE', 'Nairobi County', 'Nairobi', None, 'Rosslyn Green Drive, off Red Hill Road', None, 'Nairobi, Kenia, Botschaft', 73, 'Embassy of Switzerland Nairobi Kenya'),
    ('washington', 'Schweizer Botschaft Washington – Kanzlei', 'US', 'District of Columbia', 'Washington, D.C.', '20008', 'Cathedral Avenue NW', '2900', 'Washington, USA, Botschaft', 66, '2900 Cathedral Avenue NW Washington USA'),
    ('singapore', 'Schweizer Botschaft Singapur', 'SG', 'Singapore', 'Singapore', '288162', 'Swiss Club Link', '1', 'Singapur, Kanzlei', 65, '1 Swiss Club Link Singapore'),
    ('abidjan', 'Schweizer Botschaft Abidjan', 'CI', 'District autonome d’Abidjan', 'Abidjan', None, 'Rue du Bélier, Cocody Ambassades', None, "Abidjan, Republik Côte d'Ivoire, Botschaft", 76, 'Ambassade de Suisse Abidjan Ivory Coast'),
    ('san-francisco', 'Generalkonsulat und Swissnex San Francisco', 'US', 'California', 'San Francisco', '94111', 'The Embarcadero', 'Pier 17, Suite 600', 'San Francisco, USA, Kanzlei', 74, 'Pier 17 San Francisco USA'),
]
addresses = {
    'berlin': 'https://www.eda.admin.ch/countries/germany/de/home/vertretungen/botschaft.html/content/contacts/de/EDAVis/B/184',
    'canberra': 'https://protocol.dfat.gov.au/Public/Missions/191',
    'brasilia': 'https://www.eda.admin.ch/content/dam/countries/countries-content/brazil/en/business-travel-guide-2023_EN.pdf',
    'seoul': 'https://www.eda.admin.ch/countries/korea-republic/de/home/vertretungen/botschaft.html',
    'nairobi': 'https://www.eda.admin.ch/countries/kenia/en/home/services/lost-and-found.html/content/contacts/en/EDAVis/N/180',
    'singapore': 'https://www.eda.admin.ch/countries/singapore/en/home/representations/embassy-singapore.html/content/contacts/en/EDAVis/S/106',
    'abidjan': 'https://www.eda.admin.ch/deza/fr/home/projekte/projekte.html/content/contacts/fr/EDAVis/A/84',
}
out = []
for i, (slug, name, country, region, city, postal, street, number, heading, doc, query) in enumerate(rows):
    p = dict(slug=slug, name=name, country=country, region=region, city=city, postalCode=postal,
             street=street, houseNumber=number, geocodeQuery=query,
             id=['1080/4840/AF', '1080/5210/AA'][i] if i < 2 else f'9900/{9000+i}/AA',
             mediaHeading=heading, photos=media[heading][:3], retrievedAt='2026-09-22')
    if doc is not None:
        p['publication'] = docs[doc]
    p['addressSource'] = addresses.get(slug, p.get('publication', {}).get('url'))
    out.append(p)
target = HERE / 'properties.json'
if target.exists():
    raise SystemExit('Refusing to replace reviewed properties.json; use the committed file.')
target.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
