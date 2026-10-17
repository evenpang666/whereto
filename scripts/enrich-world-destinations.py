"""Fetch curated landmark facts and openly licensed Commons images.
Run after reviewing scripts/data/world-destinations.tsv. Uses no model or API key.
Caches raw responses in --cache-dir; stores only facts, source/credit metadata,
and local images in the project. Rebuild world data afterwards.
"""
import argparse, concurrent.futures, hashlib, html, json, re, time, urllib.parse, urllib.request, urllib.error, threading
from pathlib import Path
from html.parser import HTMLParser

root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--cache-dir',type=Path,default=Path('/tmp/whereto-world-source-cache'))
parser.add_argument('--workers',type=int,default=3)
parser.add_argument('--limit',type=int)
parser.add_argument('--refresh',action='store_true')
args=parser.parse_args();args.cache_dir.mkdir(parents=True,exist_ok=True)
headers={'User-Agent':'Whereto-local-catalog/1.0 (travel discovery; public data and image attribution)','Accept':'application/json,image/*;q=0.9,*/*;q=0.8'}
seed_path=root/'public/data/world-landmarks.json'
existing=json.loads(seed_path.read_text())

class PlainText(HTMLParser):
 def __init__(self):super().__init__();self.text=[]
 def handle_data(self,data):self.text.append(data)
def plain(value):
 p=PlainText();p.feed(value or '');return re.sub(r'\s+',' ',' '.join(p.text)).strip()
request_lock=threading.Lock()
last_request=0
def fetch(url,cache=True):
 global last_request
 file=args.cache_dir/(hashlib.sha256(url.encode()).hexdigest()+'.json')
 if cache and file.exists():return json.loads(file.read_text())
 for attempt in range(3):
  try:
   with request_lock:
    delay=1.1-(time.monotonic()-last_request)
    if delay>0:time.sleep(delay)
    last_request=time.monotonic()
   with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=35) as response:
    data=json.load(response)
   if cache:file.write_text(json.dumps(data,ensure_ascii=False))
   return data
  except urllib.error.HTTPError as e:
   if attempt==2 or e.code not in [429,502,503,504]:raise
   time.sleep(min(45,int(e.headers.get('Retry-After','15'))))
  except Exception:
   if attempt==2:raise
   time.sleep(2*(attempt+1))

def summary(title):
 return fetch('https://en.wikipedia.org/api/rest_v1/page/summary/'+urllib.parse.quote(title.replace(' ','_'),safe=''))

def photo_date(value):
 text=plain(value)
 match=re.search(r'\d{4}-\d{2}-\d{2}',text) or re.search(r'\b(?:19|20)\d{2}\b',text)
 return match.group() if match else ''

def image_for(seed, data):
 # The summary photo identifies the subject; Commons supplies author and licence.
 original=data.get('originalimage',{}).get('source','')
 if data.get('commonsTitle'):filename=data['commonsTitle']
 else:
  if not original or '/wikipedia/commons/' not in original:return None
  path=urllib.parse.urlparse(original).path
  filename=urllib.parse.unquote(path.split('/')[-2 if '/thumb/' in path else -1])
 url='https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','format':'json','prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':960,'titles':'File:'+filename})
 pages=fetch(url).get('query',{}).get('pages',{})
 page=next((p for p in pages.values() if p.get('imageinfo')),None)
 if not page:return None
 info=page['imageinfo'][0];meta=info.get('extmetadata',{})
 value=lambda key:plain(meta.get(key,{}).get('value',''))
 license=value('LicenseShortName');license_url=value('LicenseUrl')
 if not re.search(r'^(CC0|Public domain|PDM|FAL|Attribution|KOGL Type 1|CC BY(?:-SA)? [\d.]+(?: [a-z]{2})?)$',license,re.I):return None
 license_url=license_url or {'Attribution':'https://commons.wikimedia.org/wiki/Template:Attribution','Public domain':'https://commons.wikimedia.org/wiki/Commons:Public_domain','CC0':'https://creativecommons.org/publicdomain/zero/1.0/','PDM':'https://creativecommons.org/publicdomain/mark/1.0/'}.get(license,'')
 artist=value('Artist')
 if not artist:return None
 thumb=info.get('thumburl',info['url'])
 extension=Path(urllib.parse.urlparse(thumb).path).suffix.lower()
 if extension not in ['.jpg','.jpeg','.png','.webp']:return None
 target=root/'public/media/world'/(seed['qid'].lower()+extension)
 target.parent.mkdir(parents=True,exist_ok=True)
 if not target.exists():
  with urllib.request.urlopen(urllib.request.Request(thumb,headers=headers),timeout=40) as response:
   content_type=response.headers.get('Content-Type','').split(';')[0]
   if content_type not in ['image/jpeg','image/png','image/webp']:raise ValueError('unsupported image type')
   body=response.read(8000001)
  if not 2000<=len(body)<=8000000:raise ValueError('invalid image size')
  target.write_bytes(body)
 return {'image':'/'+str(target.relative_to(root/'public')),'imageKind':'reference',
   'imageSource':{'title':'Wikimedia Commons · '+filename,'url':info['descriptionurl'],'original':info['url'],
     'author':artist,'license':license,'licenseUrl':license_url,
     'credit':value('Credit'),'attribution':value('Attribution'),'date':photo_date(meta.get('DateTimeOriginal',{}).get('value','')),
     'sourcePage':next((html.unescape(link) for link in re.findall(r'href="(https?://[^"]+)"',meta.get('Credit',{}).get('value',''))),''),
     'note':'开放许可参考照片，非实时影像；原作者与许可见署名。','retrievedAt':'2026-10-17'}}

specs=[]
for line in (root/'scripts/data/world-destinations.tsv').read_text().splitlines():
 if not line.strip() or line.startswith('#'):continue
 fields=line.split('|')
 country,name,title,category,timezone=fields[:5]
 specs.append({'countryId':country,'name':name,'wikipediaTitle':title,'category':category,'timezone':timezone,**({'qid':fields[5]} if len(fields)>5 else {})})
# Enrich the original seeds as well; their stable IDs are retained.
old_specs=[]
for seed in existing:
 if any(s.get('qid')==seed['qid'] or s['name']==seed['name'] for s in specs):continue
 title=seed.get('wikipediaTitle') or {'Q615183':'Sensō-ji','Q160236':'Metropolitan Museum of Art','Q19675':'Louvre','Q12506':'Hagia Sophia'}.get(seed['qid'],seed['englishName'])
 old_specs.append({**seed,'wikipediaTitle':title})
tasks=specs+old_specs
if args.limit:tasks=tasks[:args.limit]
failures=[]
def acquire(spec):
 try:
  old=next((p for p in existing if p['qid']==spec.get('qid') or p.get('wikipediaTitle')==spec['wikipediaTitle']),{})
  if not args.refresh and old.get('image') and (root/'public'/old['image'].lstrip('/')).is_file():
   return {**old,**spec}
  data=summary(spec['wikipediaTitle']);coords=data.get('coordinates');qid=data.get('wikibase_item')
  if not coords or not qid:raise ValueError('no verified coordinates/entity (possibly disambiguation)')
  if spec.get('qid') and spec['qid']!=qid:raise ValueError('entity mismatch')
  old=next((p for p in existing if p['qid']==qid),{})
  seed={**old,**spec,'qid':qid,'englishName':data['title'],'coordinates':[coords['lon'],coords['lat']],
     'wikipediaUrl':data['content_urls']['desktop']['page'] if data['content_urls']['desktop']['page'].startswith('https://en.wikipedia.org/') else '','verifiedAt':'2026-10-17'}
  try:
   picture=image_for(seed,data)
   if picture:
    seed.update(picture);seed.pop('imagePending',None)
   else:seed['imagePending']='No qualifying Commons photograph from summary'
  except Exception as e:seed['imagePending']=str(e)
  print(qid,spec['name'],'photo' if seed.get('image') else 'image pending',flush=True)
  return seed
 except Exception as e:
  failures.append({'title':spec['wikipediaTitle'],'error':str(e)})
  print('FAILED',spec['wikipediaTitle'],str(e),flush=True)
  return None
merged={p['qid']:p for p in existing}
rows=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
 for row in pool.map(acquire,tasks):
  if not row:continue
  rows.append(row);merged[row['qid']]=row
  seed_path.write_text(json.dumps(list(merged.values()),ensure_ascii=False,indent=2)+'\n')
(root/'docs/world-enrichment-report.json').write_text(json.dumps({'retrievedAt':'2026-10-17','requested':len(tasks),'succeeded':len(rows),'failures':failures,'photos':sum(bool(p.get('image')) for p in merged.values())},ensure_ascii=False,indent=2)+'\n')
print('DONE',len(rows),'of',len(tasks),'photos',sum(bool(p.get('image')) for p in merged.values()),'failures',len(failures))
