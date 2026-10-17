"""Build local world snapshots from Natural Earth GeoJSON in --source-dir.

Source: https://github.com/nvkelso/natural-earth-vector (public domain).
Download ne_50m_admin_0_countries, ne_10m_admin_1_states_provinces,
ne_10m_populated_places_simple. Repo world-landmarks.json uses Wikidata CC0.
Run: python scripts/build-world-data.py --source-dir /tmp
"""
import argparse, json, math, re, subprocess
from pathlib import Path
from collections import defaultdict, Counter

parser = argparse.ArgumentParser()
parser.add_argument('--source-dir', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
out = root / 'public/data'
mapdir = out / 'maps/world'
mapdir.mkdir(parents=True, exist_ok=True)
def read(name): return json.loads((args.source_dir / name).read_text())
def save(path, value): path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n')
def simplify_line(points, tolerance=.025):
    if len(points) <= 4: return points
    first, last = points[0], points[-1]
    dx, dy = last[0]-first[0], last[1]-first[1]
    def distance(p):
        t = max(0, min(1, ((p[0]-first[0])*dx+(p[1]-first[1])*dy)/(dx*dx+dy*dy))) if dx or dy else 0
        return (p[0]-first[0]-t*dx)**2 + (p[1]-first[1]-t*dy)**2
    i = max(range(1,len(points)-1), key=lambda n: distance(points[n]))
    if distance(points[i]) > tolerance*tolerance:
        return simplify_line(points[:i+1], tolerance)[:-1] + simplify_line(points[i:], tolerance)
    return [first,last]
def geometry(g):
    polygons = [g['coordinates']] if g['type']=='Polygon' else g['coordinates']
    result=[]
    for p in polygons:
        rings=[]
        for ring in p:
            simplified=simplify_line(ring)
            if len(simplified)<4: simplified=ring
            rings.append([[round(x,4), round(y,4)] for x,y,*_ in simplified])
        result.append(rings)
    return {'type':'MultiPolygon','coordinates':result}
def contains(g, point):
    x,y=point
    if '_extent' not in g:
        polygons=[g['coordinates']] if g['type']=='Polygon' else g['coordinates']
        coords=[c for polygon in polygons for ring in polygon for c in ring]
        g['_extent']=(min(c[0] for c in coords),min(c[1] for c in coords),max(c[0] for c in coords),max(c[1] for c in coords))
    xmin,ymin,xmax,ymax=g['_extent']
    if y<ymin or y>ymax or (xmax-xmin<180 and (x<xmin or x>xmax)):return False
    def inside(ring):
        hit=False
        for a,b in zip(ring, ring[1:]):
            ax,ay=a[:2]; bx,by=b[:2]
            # unwrap the ring around the query longitude, including the date line
            ax=x+(ax-x+180)%360-180; bx=x+(bx-x+180)%360-180
            if (ay>y)!=(by>y) and x < (bx-ax)*(y-ay)/(by-ay)+ax: hit=not hit
        return hit
    polys=[g['coordinates']] if g['type']=='Polygon' else g['coordinates']
    return any(inside(p[0]) and not any(inside(r) for r in p[1:]) for p in polys)

def feature(id,name,g,**props): return {'type':'Feature','properties':{'id':id,'name':name,**props},'geometry':g}
# These use an explicitly selected travel level instead of an arbitrary admin-1 label.
profiles={
 'JPN':('都道府县','按都道府县探索；城市使用当地市级目录。'),
 'USA':('州／联邦区','按州和联邦区探索；海外地区可从区划列表进入。'),
 'CAN':('省／地区','按省和地区探索。'), 'AUS':('州／领地','按州和领地探索。'),
 'FRA':('大区','将来源中的省级边界按所属大区归并；海外大区可独立选择。'),
 'ITA':('大区','将来源中的省级边界按所属大区归并。'),
 'GBR':('构成国','先选择英格兰、苏格兰、威尔士或北爱尔兰，再进入城市。'),
 'CHE':('州','按瑞士各州探索。'), 'DEU':('联邦州','按联邦州探索。'),
 'THA':('府','按府探索，包含曼谷。'), 'ARE':('酋长国','按酋长国探索，来源中的飞地合并显示。'),
 'KOR':('道／广域市','按道、特别市和广域市等一级区划探索。'),
 'IND':('邦／中央直辖区','按邦和中央直辖区探索。'),
 'ESP':('自治区','按自治区和自治市探索。'), 'BRA':('州／联邦区','按州和联邦区探索。'),
 'RUS':('联邦主体','按共和国、州、边疆区等联邦主体探索。'),
 'SGP':(None,'城市国家，直接选择新加坡及景点。'),
 'MCO':(None,'微型国家，直接选择城市及景点。'), 'VAT':(None,'微型国家，直接选择城市及景点。'),
}
fr_names={'Île-de-France':'法兰西岛','Normandie':'诺曼底','Bretagne':'布列塔尼','Occitanie':'奥克西塔尼','Auvergne-Rhône-Alpes':'奥弗涅-罗讷-阿尔卑斯','Nouvelle-Aquitaine':'新阿基坦','Grand Est':'大东部','Bourgogne-Franche-Comté':'勃艮第-弗朗什-孔泰',"Provence-Alpes-Côte-d'Azur":'普罗旺斯-阿尔卑斯-蓝色海岸','Centre-Val de Loire':'中央-卢瓦尔河谷','Hauts-de-France':'上法兰西','Pays de la Loire':'卢瓦尔河地区','Corse':'科西嘉'}
it_names={'Lombardia':'伦巴第','Toscana':'托斯卡纳','Emilia-Romagna':'艾米利亚-罗马涅','Sicily':'西西里','Piemonte':'皮埃蒙特','Sardegna':'撒丁','Veneto':'威尼托','Apulia':'普利亚','Marche':'马尔凯','Campania':'坎帕尼亚','Lazio':'拉齐奥','Liguria':'利古里亚','Calabria':'卡拉布里亚','Abruzzo':'阿布鲁佐','Umbria':'翁布里亚','Basilicata':'巴西利卡塔','Molise':'莫利塞',"Valle d'Aosta":'瓦莱达奥斯塔','Trentino-Alto Adige':'特伦蒂诺-上阿迪杰','Friuli-Venezia Giulia':'弗留利-威尼斯朱利亚'}
raw_countries=read('ne_50m_admin_0_countries.geojson')['features']
countries=[]; world=[]; country_by_id={}
for f in raw_countries:
 p=f['properties']; code=p['ADM0_A3']
 if code in ['ATA','TWN','HKG','MAC']: continue
 c={'id':code,'name':p['NAME_ZH'] or p['NAME_LONG'],'englishName':p['NAME_LONG'],'iso2':p['ISO_A2_EH'],'center':[p['LABEL_X'],p['LABEL_Y']]}
 c['name']={'CHN':'中国','KOR':'韩国','PRK':'朝鲜','RUS':'俄罗斯','TZA':'坦桑尼亚','VNM':'越南'}.get(code,c['name'])
 c['regionLabel'],c['hierarchyNote']=profiles.get(code,('行政区','使用来源中的一级区划；地图与名称为本地快照。'))
 countries.append(c);country_by_id[code]=c
 if code!='CHN': world.append(feature(code,c['name'],geometry(f['geometry']),center=c['center'],labelRank=p['LABELRANK']))
# Keep China's existing geography and identifiers in both modes.
cn=json.loads((out/'maps/100000.json').read_text())
polygons=[]
for f in cn['features']:
 g=f.get('geometry')
 if not g: continue
 if g['type']=='Polygon':polygons.append(g['coordinates'])
 if g['type']=='MultiPolygon':polygons.extend(g['coordinates'])
world.append(feature('CHN','中国',{'type':'MultiPolygon','coordinates':polygons},center=[104,35],labelRank=2,grouped=True))
country_by_id['CHN'].update(regionLabel='省级地区',hierarchyNote='沿用中国模式的省级地区、城市与景点目录。',center=[104,35])

raw_regions=read('ne_10m_admin_1_states_provinces.geojson')['features']
types_by_country=defaultdict(set)
for f in raw_regions:
 p=f['properties']
 if p.get('type_en'):types_by_country[p['adm0_a3']].add(p['type_en'])
type_names={'Province':'省','State':'州','Region':'大区','Department':'省级区','District':'区','Municipality':'市','Parish':'教区','Commune':'市镇','Canton':'州','County':'郡','Governorate':'省级区','Prefecture':'省级区','Territory':'领地','Division':'专区','Oblast':'州'}
for c in countries:
 c['regionTypes']=sorted(types_by_country[c['id']])
 if c['id'] not in profiles and c['id']!='CHN':
  types=c['regionTypes']
  c['regionLabel']=type_names.get(types[0],'行政区') if len(types)==1 else '行政区'
  c['hierarchyNote']='按该国'+c['regionLabel']+'探索；使用本地一级区划快照。'
regions=[]; group_maps=defaultdict(dict); region_lookup={}; original_regions=defaultdict(list)
for f in raw_regions:
 p=f['properties'];code=p['adm0_a3']
 if code not in country_by_id or code=='CHN' or country_by_id[code]['regionLabel'] is None:continue
 group=p['adm1_code']; name=p['name_zh'] or p['name'];english=p['name']
 if not name:continue
 if code=='JPN' and p['iso_3166_2']=='JP-13':name='东京都'
 if code in ['FRA','ITA'] and p['region']:
  english=p['region'];group=p['region_cod'] or english
  name=(fr_names if code=='FRA' else it_names).get(english,english)
 if code=='GBR':
  # geonunit is provided by Natural Earth (England, Scotland, Wales, Northern Ireland).
  english=p.get('geonunit') or ''
  if english not in ['England','Scotland','Wales','Northern Ireland']:
   region=p.get('region') or ''
   english='Northern Ireland' if region=='Northern Ireland' else 'Wales' if 'Wales' in region else 'Scotland' if region in ['Highlands','Grampian','Tayside','Fife','Lothian','Central','Strathclyde','Borders','Dumfries and Galloway','Orkney','Shetland','Western Isles'] else 'England'
  group=english;name={'England':'英格兰','Scotland':'苏格兰','Wales':'威尔士','Northern Ireland':'北爱尔兰'}[english]
 if code=='ARE':group=p['name'];english=p['name']
 id=code+'-'+re.sub(r'[^A-Za-z0-9]+','-',group).strip('-')
 if id not in group_maps[code]:
  r={'id':id,'countryId':code,'name':name,'englishName':english,'center':[p['longitude'],p['latitude']]}
  regions.append(r);region_lookup[id]=r
  group_maps[code][id]=feature(id,name,{'type':'MultiPolygon','coordinates':[]},grouped=code in ['FRA','ITA','GBR'])
 group_maps[code][id]['geometry']['coordinates'].extend(geometry(f['geometry'])['coordinates'])
 original_regions[code].append((p['name'],id,f['geometry']))
for c in countries:
 if c['id']=='CHN':continue
 items=group_maps[c['id']]
 if not items:c['regionLabel']=None
 save(mapdir/(c['id']+'.json'),{'type':'FeatureCollection','features':list(items.values())})

city_names={'Tokyo':'东京','Kyoto':'京都','Osaka':'大阪','Sapporo':'札幌','Nara':'奈良','Hiroshima':'广岛','Fukuoka':'福冈','Naha':'那霸','Paris':'巴黎','Lyon':'里昂','Marseille':'马赛','Nice':'尼斯','London':'伦敦','Edinburgh':'爱丁堡','Glasgow':'格拉斯哥','Cardiff':'加的夫','Belfast':'贝尔法斯特','Manchester':'曼彻斯特','Rome':'罗马','Milano':'米兰','Milan':'米兰','Venice':'威尼斯','Florence':'佛罗伦萨','Naples':'那不勒斯','New York':'纽约','Los Angeles':'洛杉矶','San Francisco':'旧金山','Washington, D.C.':'华盛顿','Washington,  D.C.':'华盛顿','Versailles':'凡尔赛','Chicago':'芝加哥','Sydney':'悉尼','Melbourne':'墨尔本','Canberra':'堪培拉','Singapore':'新加坡','Bangkok':'曼谷','Chiang Mai':'清迈','Seoul':'首尔','Busan':'釜山','Dubai':'迪拜','Abu Dhabi':'阿布扎比','Berlin':'柏林','Munich':'慕尼黑','Madrid':'马德里','Barcelona':'巴塞罗那','Lisbon':'里斯本','Athens':'雅典','Istanbul':'伊斯坦布尔','Cairo':'开罗','Cape Town':'开普敦','Nairobi':'内罗毕','Marrakesh':'马拉喀什','Rio de Janeiro':'里约热内卢','Lima':'利马','Buenos Aires':'布宜诺斯艾利斯','Mexico City':'墨西哥城','Toronto':'多伦多','Vancouver':'温哥华','Ottawa':'渥太华','Auckland':'奥克兰','Wellington':'惠灵顿','Moscow':'莫斯科','Saint Petersburg':'圣彼得堡','Delhi':'德里','New Delhi':'新德里','Mumbai':'孟买','Agra':'阿格拉','Jaipur':'斋浦尔','Kathmandu':'加德满都','Hanoi':'河内','Ho Chi Minh City':'胡志明市','Kuala Lumpur':'吉隆坡','Jakarta':'雅加达','Denpasar':'登巴萨','Phnom Penh':'金边','Siem Reap':'暹粒','Reykjavík':'雷克雅未克','Reykjavik':'雷克雅未克','Zurich':'苏黎世','Zürich':'苏黎世','Bern':'伯尔尼','Geneva':'日内瓦','Vienna':'维也纳','Prague':'布拉格','Budapest':'布达佩斯','Amsterdam':'阿姆斯特丹','Brussels':'布鲁塞尔','Copenhagen':'哥本哈根','Stockholm':'斯德哥尔摩','Oslo':'奥斯陆','Helsinki':'赫尔辛基'}
city_names.update({'Albany': '奥尔巴尼', 'Annapolis': '安纳波利斯', 'Atlanta': '亚特兰大', 'Austin': '奥斯汀', 'Baton Rouge': '巴吞鲁日', 'Bismarck': '俾斯麦', 'Boise': '博伊西', 'Boston': '波士顿', 'Carson City': '卡森城', 'Charleston': '查尔斯顿', 'Cheyenne': '夏延', 'Columbia': '哥伦比亚', 'Columbus': '哥伦布', 'Concord': '康科德', 'Denver': '丹佛', 'Des Moines': '得梅因', 'Dover': '多佛', 'Frankfort': '法兰克福', 'Harrisburg': '哈里斯堡', 'Hartford': '哈特福德', 'Helena': '海伦娜', 'Honolulu': '檀香山', 'Indianapolis': '印第安纳波利斯', 'Jackson': '杰克逊', 'Jefferson City': '杰斐逊城', 'Juneau': '朱诺', 'Lansing': '兰辛', 'Lincoln': '林肯', 'Little Rock': '小石城', 'Madison': '麦迪逊', 'Montgomery': '蒙哥马利', 'Montpelier': '蒙彼利埃', 'Nashville': '纳什维尔', 'Oklahoma City': '俄克拉荷马城', 'Olympia': '奥林匹亚', 'Phoenix': '菲尼克斯', 'Pierre': '皮尔', 'Providence': '普罗维登斯', 'Raleigh': '罗利', 'Richmond': '里士满', 'Sacramento': '萨克拉门托', 'Salem': '塞勒姆', 'Salt Lake City': '盐湖城', 'Santa Fe': '圣菲', 'Springfield': '斯普林菲尔德', 'St. Paul': '圣保罗', 'St.  Paul': '圣保罗', 'Tallahassee': '塔拉哈西', 'Topeka': '托皮卡', 'Trenton': '特伦顿', 'St.  Petersburg': '圣彼得堡', 'Novosibirsk': '新西伯利亚', 'Yekaterinburg': '叶卡捷琳堡', 'Nizhny Novgorod': '下诺夫哥罗德', 'Kazan': '喀山', 'Yaroslavl': '雅罗斯拉夫尔', 'Petrozavodsk': '彼得罗扎沃茨克', 'Arkhangelsk': '阿尔汉格尔斯克', 'Volgograd': '伏尔加格勒', 'Vladivostok': '符拉迪沃斯托克', 'Irkutsk': '伊尔库茨克', 'Sochi': '索契', 'Kaliningrad': '加里宁格勒', 'Velikiy Novgorod': '大诺夫哥罗德', 'Petropavlovsk-Kamchatsky': '彼得罗巴甫洛夫斯克', 'Derbent': '杰尔宾特', 'Ulan Ude': '乌兰乌德', 'Vladimir': '弗拉基米尔', 'Tula': '图拉'})
raw_cities=read('ne_10m_populated_places_simple.geojson')['features']
by_country=defaultdict(list)
for f in raw_cities:
 p=f['properties'];code=p['adm0_a3']
 if code in country_by_id and code!='CHN': by_country[code].append(p)
cities=[]; all_cities=[]
for code,rows in by_country.items():
 rows.sort(key=lambda p:-p['pop_max'])
 seen_regions=set()
 for i,p in enumerate(rows):
  center=[p['longitude'],p['latitude']]
  rs=original_regions[code]
  rid=next((rid for name,rid,g in rs if contains(g,center)),None)
  if not rid:rid=next((rid for name,rid,g in rs if name==p['adm1name']),None)
  city={'id':'world-city-'+str(p['ne_id']),'name':city_names.get(p['name'],p['name']),'englishName':p['name'],'countryId':code,'country':country_by_id[code]['name'],'regionId':rid,'center':center}
  region=region_lookup.get(rid)
  city.update(provinceId=rid,province=region['name'] if region else city['country'])
  all_cities.append(city)
  if i<5 or p['adm0cap'] or p['name'] in city_names or (code in ['USA','RUS'] and rid and rid not in seen_regions):cities.append(city)
  seen_regions.add(rid)

places=[]
def base_place(city):
 return {'cityId':city['id'],'city':city['name'],'countryId':city['countryId'],'country':city['country'],'regionId':city['regionId'],'provinceId':city['regionId'],'province':city['province'],'grade':'','history':'背景与沿革可从资料来源继续了解，也可按需生成带来源的旅行解读。','aiReview':'先选一个感兴趣的主题，再结合交通、天气与同行人的节奏规划这一站。','bestSeason':'依当地季节、天气与开放安排','duration':'按路线与体力安排','feedback':'体验取决于路线、天气与停留方式，可按需检索亲历评价。','tips':'出发前确认当地交通、预约及开放信息；地图代表点不作为入口导航。','imageKind':'illustration','imageSource':{'title':'项目原创类别景观示意','url':''}}
for city in cities:
 p=base_place(city);p.update(id=city['id']+'-walk',name=city['name']+'城市漫步',englishName=city['englishName']+' city walk',kind='city-walk',coordinates=city['center'],precision='city-reference',coordinateSource='Natural Earth populated places',category='城市漫步',intro='从'+city['name']+'开始认识'+city['country']+'。这是城市探索入口，可按兴趣安排街区步行，具体路线与开放信息需另行确认。',image=None,imageKind='unavailable',imageSource={'title':'实景照片待补充','url':'','note':'暂未找到可核实来源的当地实景照片。'},sources=[{'title':'Natural Earth · 城市名称与参考坐标','url':'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/'}])
 places.append(p)
# Keep every verified destination. Remote parks use a nearby city in the same
# region as an explicitly labelled gateway, instead of silently disappearing.
landmark_file=out/'world-landmarks.json'
old_catalog=json.loads((out/'world-catalog.json').read_text()) if (out/'world-catalog.json').exists() else {'places':[]}
old_countries={p.get('qid'):p['countryId'] for p in old_catalog['places'] if p.get('qid')}
landmark_seeds=json.loads(landmark_file.read_text()) if landmark_file.exists() else []
rejected=[]
for landmark in landmark_seeds:
 code=landmark.get('countryId') or old_countries.get(landmark['qid'])
 if not code:
  code=next((f['properties']['ADM0_A3'] for f in raw_countries if contains(f['geometry'],landmark['coordinates'])),None)
 if code not in country_by_id or code=='CHN':
  rejected.append({'qid':landmark['qid'],'reason':'country could not be linked'});continue
 rid=next((r['id'] for r in regions if r['countryId']==code and r['name']==landmark.get('regionName')),None) or next((rid for name,rid,g in original_regions[code] if contains(g,landmark['coordinates'])),None)
 candidates=[c for c in all_cities if c['countryId']==code and (not rid or c['regionId']==rid)]
 def distance(c):
  lon,lat=landmark['coordinates'];x,y=c['center']
  return 111.2*math.hypot(((x-lon+180)%360-180)*math.cos(math.radians(lat)),y-lat)
 city=min(candidates,key=distance) if candidates else None
 if city is not None and distance(city)>120:city=None
 if city is None:
  region=region_lookup.get(rid)
  city={'id':'world-area-'+landmark['qid'].lower(),'name':landmark['name']+'周边','englishName':landmark['englishName']+' area',
    'kind':'destination-area','countryId':code,'country':country_by_id[code]['name'],'regionId':rid,'provinceId':rid,
    'province':region['name'] if region else country_by_id[code]['name'],'center':landmark['coordinates']}
  all_cities.append(city)
 if city not in cities:cities.append(city)
 category=landmark.get('category','人文古迹')
 relation='destination-area' if city.get('kind')=='destination-area' else 'gateway' if distance(city)>12 or category in ['山野自然','湖光水色','海岸漫游'] else 'city'
 intro=landmark.get('intro') or (landmark['name']+'，是探索'+country_by_id[code]['name']+'的一站。'+
   {'山野自然':'留出时间观察地貌与自然环境，按体力和天气选择步行路线。','湖光水色':'沿着水岸与观景点慢慢探索，按季节、天气和交通安排停留。','海岸漫游':'留一些时间走近海岸景观，按风浪、潮汐与开放安排选择路线。'}.get(category,'留一些时间观察建筑、空间与周边街区之间的关系。'))
 p=base_place(city)
 p.update(landmark,id='world-'+landmark['qid'].lower(),countryId=code,country=country_by_id[code]['name'],kind='landmark',
   precision='scenic-reference',coordinateSource='Wikimedia / Wikidata '+landmark['qid'],category=category,intro=intro,
   cityRelation=relation,gatewayDistanceKm=round(distance(city)),
   image=landmark.get('image','/media/illustration-'+category+'.svg'),imageKind=landmark.get('imageKind','illustration'),
   sources=[{'title':'Wikidata · 景点实体与资料索引（CC0）','url':'https://www.wikidata.org/wiki/'+landmark['qid']}])
 if landmark.get('regionSource'):p['sources'].append({'title':'地区归属来源','url':landmark['regionSource']})
 if landmark.get('wikipediaUrl'):p['sources'].append({'title':'Wikipedia · 位置与资料来源','url':landmark['wikipediaUrl']})
 places.insert(0,p)
if rejected:raise ValueError('Unlinked verified landmarks: '+json.dumps(rejected,ensure_ascii=False))
city_photo_file=out/'world-city-photos.json'
city_photos=json.loads(city_photo_file.read_text()) if city_photo_file.exists() else {}
for place in places:
 if place.get('kind')!='city-walk':continue
 photo=city_photos.get(place['cityId'])
 if photo:
  if photo['cityId']!=place['cityId'] or photo['countryId']!=place['countryId']:raise ValueError('City photo entity mismatch: '+place['id'])
  if not (root/'public'/photo['image'].lstrip('/')).is_file():raise ValueError('Missing city photo: '+photo['image'])
  place.update({key:photo[key] for key in ['image','imageKind','imageSource']})
  continue
 photo=next((p for p in places if p.get('kind')=='landmark' and p['cityId']==place['cityId'] and p['imageKind']=='reference' and p.get('cityRelation')=='city'),None)
 if photo:
  place.update(image=photo['image'],imageKind='reference',imageSource={**photo['imageSource'],'note':'城市参考照片，画面为'+photo['name']+'，不代表完整步行路线。'})
# A map unit without cities stays selectable and explicitly empty in the UI.
save(out/'maps/world.json',{'type':'FeatureCollection','features':world})
save(out/'world-catalog.json',{'version':2,'updated':'2026-10-17','attribution':'Made with Natural Earth (public domain); landmark labels and coordinates: Wikidata (CC0).','countries':countries,'regions':regions,'cities':cities,'places':places})
print('countries',len(countries),'regions',len(regions),'cities',len(cities),'places',len(places),'landmarks',sum(p['kind']=='landmark' for p in places))
print('world map bytes',(out/'maps/world.json').stat().st_size,'catalog bytes',(out/'world-catalog.json').stat().st_size)

subprocess.run(['node',str(root/'scripts/assign-world-timezones.mjs')],check=True)
