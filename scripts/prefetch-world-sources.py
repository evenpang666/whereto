"""Batch public Wikidata facts and Commons credits before photo enrichment.
Run: python scripts/prefetch-world-sources.py --cache-dir /tmp/whereto-world-source-cache
Curated TSV rows may include a verified QID; IDs avoid ambiguous page redirects.
"""
import argparse, hashlib, json, re, time, urllib.parse, urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--cache-dir',type=Path,default=Path('/tmp/whereto-world-source-cache'))
args=parser.parse_args();cache=args.cache_dir;cache.mkdir(parents=True,exist_ok=True)
headers={'User-Agent':'Whereto-local-catalog/1.0 (public travel facts and image attribution)','Accept':'application/json'}
def cache_file(url):return cache/(hashlib.sha256(url.encode()).hexdigest()+'.json')
def summary_url(title):return 'https://en.wikipedia.org/api/rest_v1/page/summary/'+urllib.parse.quote(title.replace(' ','_'),safe='')
def request(url,data=None):
 for attempt in range(3):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,data=data,headers=headers),timeout=60) as response:return json.load(response)
  except Exception:
   if attempt==2:raise
   time.sleep(45)
specs=[]
for line in (root/'scripts/data/world-destinations.tsv').read_text().splitlines():
 if not line or line.startswith('#'):continue
 fields=line.split('|');specs.append((fields[2],fields[5] if len(fields)>5 else None))
for seed in json.loads((root/'public/data/world-landmarks.json').read_text()):
 title=seed.get('wikipediaTitle',seed['englishName'])
 if title not in {t for t,q in specs}:specs.append((title,seed['qid']))
missing=[(t,q) for t,q in specs if not cache_file(summary_url(t)).exists()]
if missing:
 pairs=' '.join('('+json.dumps(t,ensure_ascii=False)+'@en wd:'+q+')' for t,q in missing if q)
 titles=' '.join(json.dumps(t,ensure_ascii=False)+'@en' for t,q in missing if not q)
 branches=[]
 if pairs:branches.append('{ VALUES (?title ?item) { '+pairs+' } }')
 if titles:branches.append('{ VALUES ?title { '+titles+' } ?article schema:name ?title; schema:isPartOf <https://en.wikipedia.org/>; schema:about ?item. }')
 query='SELECT ?title ?item ?coord ?image ?article WHERE { '+' UNION '.join(branches)+' ?item wdt:P625 ?coord. OPTIONAL { ?item wdt:P18 ?image } OPTIONAL { ?article schema:about ?item; schema:isPartOf <https://en.wikipedia.org/> } }'
 result=request('https://query.wikidata.org/sparql',urllib.parse.urlencode({'format':'json','query':query}).encode())
 for row in result['results']['bindings']:
  title=row['title']['value'];file=cache_file(summary_url(title))
  if file.exists():continue
  lon,lat=map(float,re.search(r'Point\(([^ ]+) ([^\)]+)\)',row['coord']['value']).groups())
  data={'title':title,'wikibase_item':row['item']['value'].rsplit('/',1)[-1],'coordinates':{'lon':lon,'lat':lat},
   'content_urls':{'desktop':{'page':row.get('article',{}).get('value','https://www.wikidata.org/wiki/'+row['item']['value'].rsplit('/',1)[-1])}},'factsSource':'Wikidata SPARQL; CC0'}
  if 'image' in row:data['commonsTitle']=urllib.parse.unquote(row['image']['value'].rsplit('/',1)[-1])
  file.write_text(json.dumps(data,ensure_ascii=False))
names=set()
for title,qid in specs:
 file=cache_file(summary_url(title))
 if not file.exists():continue
 data=json.loads(file.read_text());original=data.get('originalimage',{}).get('source','')
 if data.get('commonsTitle'):names.add(data['commonsTitle'])
 elif '/wikipedia/commons/' in original:
  path=urllib.parse.urlparse(original).path;names.add(urllib.parse.unquote(path.split('/')[-2 if '/thumb/' in path else -1]))
def image_url(name):return 'https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','format':'json','prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':960,'titles':'File:'+name})
names=sorted(n for n in names if not cache_file(image_url(n)).exists())
for i in range(0,len(names),20):
 params={'action':'query','format':'json','prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':960,'titles':'|'.join('File:'+n for n in names[i:i+20])}
 data=request('https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(params))
 for page in data.get('query',{}).get('pages',{}).values():
  if page.get('imageinfo'):cache_file(image_url(page['title'][5:])).write_text(json.dumps({'query':{'pages':{str(page['pageid']):page}}}))
 print('Cached image metadata',min(i+20,len(names)),'/',len(names),flush=True)
 time.sleep(1.2)
unresolved=[t for t,q in specs if not cache_file(summary_url(t)).exists()]
if unresolved:raise ValueError('Unresolved source titles: '+str(unresolved))
print('Source cache ready for',len(specs),'destinations.')
