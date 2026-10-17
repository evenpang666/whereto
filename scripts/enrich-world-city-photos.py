"""Replace city-walk illustrations with attributed, local Commons photographs.

python scripts/enrich-world-city-photos.py --source-dir /tmp
Requires Natural Earth's full ne_10m_populated_places.geojson (not _simple).
Entity IDs come from that snapshot; Wikidata coordinates guard against mistaken
entities. Responses are cached, downloads are resumable, and the reviewed output
manifest is consumed by build-world-data.py so rebuilding keeps the photographs.
"""
import argparse
import concurrent.futures
import datetime
import hashlib
import html
import io
import json
import math
import re
import time
import threading
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TODAY = datetime.date.today().isoformat()
HEADERS = {'User-Agent': 'WheretoPhotoBot/1.0 (+https://github.com/evenpang666/whereto; local travel catalogue photo cache)',
           'Accept': 'application/json,image/*;q=0.9,*/*;q=0.8'}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-dir', type=Path, required=True)
parser.add_argument('--cache-dir', type=Path, default=Path('/tmp/whereto-city-photo-cache'))
parser.add_argument('--workers', type=int, default=1)
parser.add_argument('--stage', choices=['all', 'facts', 'metadata', 'download'], default='all')
args = parser.parse_args()
args.cache_dir.mkdir(parents=True, exist_ok=True)
download_lock = threading.Lock()
last_download = 0
MANIFEST = ROOT / 'public/data/world-city-photos.json'
CATALOG = ROOT / 'public/data/world-catalog.json'


def save(file, data):
    temporary = file.with_suffix(file.suffix + '.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(file)


def request(url, parameters=None):
    body = urllib.parse.urlencode(parameters).encode() if parameters else None
    key = hashlib.sha256(url.encode() + (body or b'')).hexdigest()
    cache = args.cache_dir / (key + '.json')
    if cache.exists():
        return json.loads(cache.read_text())
    for attempt in range(4):
        try:
            request_headers = {**HEADERS, **({'Promise-Non-Write-API-Action': 'true'} if body else {})}
            with urllib.request.urlopen(urllib.request.Request(url, data=body, headers=request_headers), timeout=90) as response:
                result = json.load(response)
            if result.get('error'):
                raise ValueError(str(result['error']))
            save(cache, result)
            return result
        except urllib.error.HTTPError as error:
            if attempt == 3:
                raise
            time.sleep(max(5 * (attempt + 1), int(error.headers.get('Retry-After', '10'))))
        except (urllib.error.URLError, TimeoutError):
            if attempt == 3:
                raise
            time.sleep(min(45, 5 * (attempt + 1)))


def distance(a, b):
    lon, lat = map(math.radians, a)
    x, y = map(math.radians, b)
    return 6371 * 2 * math.asin(min(1, math.sqrt(math.sin((lat-y)/2)**2 + math.cos(lat)*math.cos(y)*math.sin((lon-x)/2)**2)))


def download_urls(info):
    """Use canonical thumbnail steps, including small originals and banners.

    Commons returns the original as thumburl when the requested width is larger
    than the original; requesting that original is often rate-limited. A smaller
    canonical thumbnail is both sufficient for cards and cheaper to serve.
    https://www.mediawiki.org/wiki/Common_thumbnail_sizes
    """
    original = urllib.parse.urlsplit(info['url'])._replace(query='').geturl()
    if not original.startswith('https://upload.wikimedia.org/wikipedia/commons/'):
        return [original]
    width, height = info.get('width', 2000), info.get('height', 1500)
    steps = [250, 330, 500, 960, 1280, 1920]
    eligible = [size for size in steps if size < width and size * height / width >= 180]
    if not eligible:
        return [original]
    desired = max(500, math.ceil(180 * width / height))
    size = next((size for size in eligible if size >= desired), eligible[-1])
    relative = original.split('/commons/', 1)[1]
    filename = relative.rsplit('/', 1)[-1]
    make = lambda step: 'https://upload.wikimedia.org/wikipedia/commons/thumb/' + relative + '/' + str(step) + 'px-' + filename
    # 960px remains preferred for normal card photos. Panoramas need more width.
    if size == 500 and 960 in eligible:
        size = 960
    return [make(size)] + ([make(500)] if size != 500 and 500 in eligible else [])


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def plain(value):
    parser = PlainText()
    parser.feed(value or '')
    return re.sub(r'\s+', ' ', ' '.join(parser.parts)).strip()


catalog = json.loads(CATALOG.read_text())
cities = {c['id']: c for c in catalog['cities']}
photos = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
overrides_file = ROOT / 'scripts/data/world-city-photo-overrides.json'
overrides = json.loads(overrides_file.read_text()) if overrides_file.exists() else {}
raw = {str(f['properties']['NE_ID']): f['properties'] for f in
       json.loads((args.source_dir / 'ne_10m_populated_places.geojson').read_text())['features']}
pending = [cities[p['cityId']] for p in catalog['places'] if p['kind'] == 'city-walk' and
           (p['imageKind'] in ['illustration', 'unavailable'] or p['cityId'] in photos)]
specs = {}
for city in pending:
    entity = raw.get(city['id'].removeprefix('world-city-'), {}).get('WIKIDATAID')
    # Natural Earth's El Cayo is San Ignacio, Belize (same historical name).
    if city['englishName'] == 'El Cayo' and city['countryId'] == 'BLZ':
        entity = 'Q724815'
    if entity and re.fullmatch(r'Q[1-9][0-9]*', entity):
        specs[city['id']] = {'city': city, 'qid': entity}

facts_file = args.cache_dir / 'city-facts.json'
facts = json.loads(facts_file.read_text()) if facts_file.exists() else {}
if args.stage in ['all', 'facts']:
    missing = [s['qid'] for key, s in specs.items() if key not in photos and s['qid'] not in facts]
    for start in range(0, len(missing), 100):
        batch = missing[start:start+100]
        query = ('SELECT ?item ?coord ?image ?banner WHERE { VALUES ?item { ' +
                 ' '.join('wd:' + q for q in batch) + ' } OPTIONAL {?item wdt:P625 ?coord} '
                 'OPTIONAL {?item wdt:P18 ?image} OPTIONAL {?item wdt:P948 ?banner} }')
        result = request('https://query.wikidata.org/sparql', {'format': 'json', 'query': query})
        for qid in batch:
            facts[qid] = {'coordinates': [], 'images': [], 'banners': []}
        for row in result['results']['bindings']:
            item = facts[row['item']['value'].rsplit('/', 1)[-1]]
            if 'coord' in row:
                coordinate = list(map(float, re.search(r'Point\(([^ ]+) ([^)]+)\)', row['coord']['value']).groups()))
                if coordinate not in item['coordinates']:
                    item['coordinates'].append(coordinate)
            for field, target in [('image', 'images'), ('banner', 'banners')]:
                if field in row:
                    name = urllib.parse.unquote(row[field]['value'].rsplit('/', 1)[-1])
                    if name not in item[target]:
                        item[target].append(name)
        save(facts_file, facts)
        print('City facts', min(start+100, len(missing)), '/', len(missing), flush=True)
        time.sleep(1)

for city_id, override in overrides.items():
    if city_id in specs and override.get('commonsTitle'):
        fact = facts.setdefault(specs[city_id]['qid'], {'coordinates': [], 'images': [], 'banners': []})
        fact['images'] = [override['commonsTitle']] + [name for name in fact['images'] if name != override['commonsTitle']]

metadata_file = args.cache_dir / 'image-metadata.json'
metadata = json.loads(metadata_file.read_text()) if metadata_file.exists() else {}
if args.stage in ['all', 'metadata']:
    filenames = sorted({name for q in facts.values() for name in q['images'] + q['banners']
                        if name not in metadata and Path(name).suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp']})
    for start in range(0, len(filenames), 50):
        batch = filenames[start:start+50]
        params = {'action': 'query', 'format': 'json', 'prop': 'imageinfo',
                  'iiprop': 'url|extmetadata|mime|size', 'iiurlwidth': 960,
                  'titles': '|'.join('File:' + name for name in batch)}
        # POST avoids overly long Unicode file-title URLs; 50 is the API limit.
        result = (request('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(params))
                  if len(batch) <= 10 else request('https://commons.wikimedia.org/w/api.php', params))
        redirects = {r['from'][5:]: r['to'][5:] for r in result.get('query', {}).get('normalized', [])}
        for page in result.get('query', {}).get('pages', {}).values():
            metadata[page['title'][5:]] = page.get('imageinfo', [None])[0]
        for name in batch:
            metadata[name] = metadata.get(redirects.get(name, name))
        save(metadata_file, metadata)
        print('Image credits', min(start+50, len(filenames)), '/', len(filenames), flush=True)
        time.sleep(1.2)


def acquire(spec):
    global last_download
    city, qid = spec['city'], spec['qid']
    override = overrides.get(city['id'], {})
    old = photos.get(city['id'])
    if old and (ROOT / 'public' / old['image'].lstrip('/')).is_file():
        info = metadata.get(old['imageSource']['title'].removeprefix('Wikimedia Commons · '), {}) or {}
        links = re.findall(r'href="(https?://[^"]+)"', info.get('extmetadata', {}).get('Credit', {}).get('value', ''))
        if links:
            old['imageSource']['sourcePage'] = html.unescape(links[0])
        return city['id'], old, None
    fact = facts.get(qid, {})
    if not fact.get('coordinates') or min(distance(city['center'], c) for c in fact['coordinates']) > 60:
        return city['id'], None, 'entity-coordinate-mismatch'
    reasons = []
    candidates = fact.get('images', []) + fact.get('banners', [])
    if override.get('external'):
        source = override['external']
        filename = source['title'] + '.jpg'
        metadata[filename] = {
            'mime': 'image/jpeg', 'url': source['url'], 'descriptionurl': source['page'], 'displayTitle': source['title'],
            'extmetadata': {key: {'value': source.get(field, '')} for key, field in [
                ('Artist', 'author'), ('LicenseShortName', 'license'), ('LicenseUrl', 'licenseUrl'),
                ('Attribution', 'attribution')]}}
        candidates = [filename] + candidates
    for filename in candidates:
        info = metadata.get(filename)
        if not info or info.get('mime') not in ['image/jpeg', 'image/png', 'image/webp']:
            continue
        # Exclude maps, flags, drawings, logos, seals and pictorial reconstructions.
        if re.search(r'\b(map|mapa|escudo|blason|flag|coat.of.arms|seal|logo|locator|drawing|painting|lithograph|illustration)\b', filename, re.I):
            continue
        meta = info.get('extmetadata', {})
        value = lambda key: plain(meta.get(key, {}).get('value', ''))
        if re.search(r'locator map|location map|coat of arms|blazon|flag of|own drawing|computer.generated|AI.generated', value('ImageDescription'), re.I):
            continue
        license = value('LicenseShortName')
        if not re.fullmatch(r'CC0|Public domain|PDM|FAL|Attribution|KOGL Type 1|CC BY(?:-SA)? [\d.]+(?: [a-z]{2})?', license, re.I):
            reasons.append('license:' + license)
            continue
        author = value('Artist') or override.get('author', '')
        if not author:
            continue
        license_url = value('LicenseUrl') or {
            'Attribution': 'https://commons.wikimedia.org/wiki/Template:Attribution',
            'Public domain': 'https://commons.wikimedia.org/wiki/Commons:Public_domain',
            'CC0': 'https://creativecommons.org/publicdomain/zero/1.0/',
            'PDM': 'https://creativecommons.org/publicdomain/mark/1.0/',
            'FAL': 'https://artlibre.org/licence/lal/en/'}.get(license, '')
        if not license_url:
            continue
        thumbnail = info.get('thumburl', info['url'])
        extension = Path(urllib.parse.urlparse(thumbnail).path).suffix.lower()
        if extension not in ['.jpg', '.jpeg', '.png', '.webp']:
            continue
        # A candidate must never reuse another candidate's orphaned file after
        # interruption (a city can have a main photo and a banner of the same type).
        source_key = hashlib.sha256(info['url'].split('?', 1)[0].encode()).hexdigest()[:10]
        target = ROOT / 'public/media/world/cities' / (city['id'] + '-' + source_key + extension)
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            if target.exists():
                body = target.read_bytes()
            else:
                body = None
                for photo_url in download_urls(info):
                    try:
                        with download_lock:
                            time.sleep(max(0, 1 - (time.monotonic() - last_download)))
                            last_download = time.monotonic()
                        with urllib.request.urlopen(urllib.request.Request(photo_url, headers=HEADERS), timeout=35) as response:
                            if response.headers.get_content_type() not in ['image/jpeg', 'image/png', 'image/webp']:
                                raise ValueError('not a raster image')
                            body = response.read(8_000_001)
                        break
                    except urllib.error.HTTPError as error:
                        if error.code == 429:
                            time.sleep(min(45, max(10, int(error.headers.get('Retry-After', '10')))))
                        if photo_url == download_urls(info)[-1]:
                            raise
            if not 2000 <= len(body) <= 8_000_000:
                raise ValueError('invalid file size')
            with Image.open(io.BytesIO(body)) as image:
                image.load()
                if min(image.size) < 180:
                    raise ValueError('too small')
            target.write_bytes(body)
            date = re.search(r'\d{4}-\d{2}-\d{2}|\b(?:19|20)\d{2}\b', value('DateTimeOriginal'))
            return city['id'], {
                'cityId': city['id'], 'cityName': city['name'], 'countryId': city['countryId'],
                'qid': qid, 'entityCoordinates': min(fact['coordinates'], key=lambda c: distance(city['center'], c)),
                'entityDistanceKm': round(min(distance(city['center'], c) for c in fact['coordinates']), 2),
                'image': '/' + str(target.relative_to(ROOT / 'public')), 'imageKind': 'reference',
                'imageSource': {
                    'title': ('Flickr · ' if override.get('external') else 'Wikimedia Commons · ') + info.get('displayTitle', filename),
                    'url': info['descriptionurl'],
                    'original': info['url'], 'author': author, 'license': license, 'licenseUrl': license_url,
                    'credit': value('Credit'), 'attribution': value('Attribution'),
                    'sourcePage': override.get('sourcePage') or next((html.unescape(url) for url in re.findall(
                        r'href="(https?://[^"]+)"', meta.get('Credit', {}).get('value', ''))), ''),
                    'date': date.group() if date else override.get('date', ''), 'retrievedAt': TODAY,
                    **({'caption': override['caption']} if override.get('caption') else {}),
                    'subjectUrl': 'https://www.wikidata.org/wiki/' + qid,
                    'note': override.get('note') or city['name'] + '城市参考照片，可能包含多处城市景观，不代表完整步行路线；非实时影像。'},
                **({'subjectCoordinates': override['subjectCoordinates']} if override.get('subjectCoordinates') else {}),
                **({'evidenceUrl': override['evidenceUrl']} if override.get('evidenceUrl') else {})}, None
        except Exception as error:
            reasons.append(str(error))
    return city['id'], None, '; '.join(reasons) or 'no-qualified-photo'


if args.stage in ['all', 'download']:
    failures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for number, (city_id, photo, reason) in enumerate(pool.map(acquire, specs.values()), 1):
            if photo:
                photos[city_id] = photo
                save(MANIFEST, photos)
            else:
                failures.append({'cityId': city_id, 'name': cities[city_id]['name'],
                                 'countryId': cities[city_id]['countryId'], 'qid': specs[city_id]['qid'], 'reason': reason})
                print('Pending', cities[city_id]['englishName'], reason, flush=True)
            if number % 25 == 0:
                print('Photos', number, '/', len(specs), 'saved', len(photos), 'pending', len(failures), flush=True)
    for place in catalog['places']:
        photo = photos.get(place['cityId']) if place['kind'] == 'city-walk' else None
        if photo:
            place.update({key: photo[key] for key in ['image', 'imageKind', 'imageSource']})
        elif place['kind'] == 'city-walk' and place['imageKind'] in ['illustration', 'unavailable']:
            place.update(image=None, imageKind='unavailable', imageSource={
                'title': '实景照片待补充', 'url': '', 'note': '暂未找到可核实来源的当地实景照片。'})
    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + '\n')
    report = {'updated': TODAY, 'requested': len(pending), 'photos': len(photos), 'failures': failures,
              'remainingIllustrations': sum(p['imageKind'] == 'illustration' for p in catalog['places']),
              'unavailablePhotos': sum(p['imageKind'] == 'unavailable' for p in catalog['places'])}
    save(ROOT / 'docs/world-city-photo-report.json', report)
    print('DONE', len(photos), 'city photographs;', report['remainingIllustrations'], 'illustrations remain', flush=True)
