import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { mergeCatalogs, scopedPlaces, searchCatalog } from '../shared/catalog.mjs';
import { normalizeMap, mainLand } from '../src/geography.js';
import { geoArea, geoPath, geoMercator, geoCentroid } from 'd3-geo';
import { createApp } from '../server/index.mjs';
import { createDshAgentBackend } from '../server/dsh-agent.mjs';
import { prepareMatch, matchVisited } from '../server/visited.mjs';
import { root, catalog as china, temp, cleanup, headers, mockHost } from './helpers.mjs';
const read = file => fs.readFile(path.join(root,'public/data',file),'utf8').then(JSON.parse);
const [world, chinaMap, worldMap] = await Promise.all([read('world-catalog.json'),read('maps/100000.json'),read('maps/world.json')]);
const catalog = mergeCatalogs(china, world, chinaMap);

test('world snapshot has unique, linked countries, regions, cities, places and local assets', async () => {
  for (const list of [catalog.countries,catalog.regions,catalog.cities,catalog.places]) assert.equal(new Set(list.map(x=>x.id)).size,list.length);
  const countries = new Map(catalog.countries.map(c=>[c.id,c]));
  const regions = new Map(catalog.regions.map(r=>[r.id,r]));
  const cities = new Map(catalog.cities.map(c=>[c.id,c]));
  for (const c of catalog.cities) {
    assert.ok(countries.has(c.countryId),c.name);
    if (c.regionId) assert.equal(regions.get(c.regionId)?.countryId,c.countryId,c.name);
    assert.ok(catalog.places.some(p=>p.cityId===c.id),c.name);
  }
  for (const p of catalog.places) {
    assert.equal(cities.get(p.cityId)?.countryId,p.countryId,p.name);
    assert.equal(cities.get(p.cityId)?.regionId,p.regionId,p.name);
    assert.ok(p.coordinates.length===2 && p.coordinates.every(Number.isFinite),p.name);
    assert.ok(Math.abs(p.coordinates[0])<=180 && Math.abs(p.coordinates[1])<=90,p.name);
    assert.match(p.id,/^[a-zA-Z0-9-]+$/);assert.match(p.sources[0].url,/^https:\/\//);
    if (p.image) await fs.access(path.join(root,'public',p.image));
    else {
      assert.equal(p.kind,'city-walk',p.name);
      assert.equal(p.imageKind,'unavailable',p.name);
      assert.ok(p.imageSource.note,p.name);
    }
  }
  assert.equal(catalog.places.filter(p=>p.countryId==='CHN').length,china.places.length);
});

test('country profiles use appropriate levels and all map files match region identifiers', async () => {
  const profile = id => catalog.countries.find(c=>c.id===id);
  assert.equal(profile('JPN').regionLabel,'都道府县');assert.equal(profile('USA').regionLabel,'州／联邦区');
  assert.equal(profile('SGP').regionLabel,null);
  for (const [id,count] of [['JPN',47],['GBR',4],['ITA',20],['FRA',18]]) assert.equal(catalog.regions.filter(r=>r.countryId===id).length,count,id);
  for (const country of world.countries.filter(c=>c.id!=='CHN')) {
    const map = await read(`maps/world/${country.id}.json`);
    assert.deepEqual(new Set(map.features.map(f=>f.properties.id)), new Set(world.regions.filter(r=>r.countryId===country.id).map(r=>r.id)),country.id);
    for (const feature of normalizeMap(map).features) {
      assert.ok(geoArea(feature)<2*Math.PI,feature.properties.name);
      assert.ok(geoCentroid(feature).every(Number.isFinite),feature.properties.name);
    }
  }
  const projection=geoMercator().rotate([-178,0]).scale(200);
  for (const f of normalizeMap(worldMap).features) assert.ok(!geoPath(projection)(f)?.includes('NaN'),f.properties.name);
});

test('search and filters respect mode, country, region, city and English names', () => {
  const country=catalog.countries.find(c=>c.id==='JPN');
  const city=catalog.cities.find(c=>c.englishName==='Tokyo');
  const region=catalog.regions.find(r=>r.id===city.regionId);
  for (const p of scopedPlaces(catalog,{mode:'world',country,region,city})) assert.equal(p.cityId,city.id);
  assert.ok(scopedPlaces(catalog,{mode:'china'}).every(p=>p.countryId==='CHN'));
  assert.equal(searchCatalog(catalog,'Eiffel','china').length,0);
  assert.ok(searchCatalog(catalog,'Eiffel','world').some(r=>r.value.id==='world-q243'));
  assert.ok(searchCatalog(catalog,'Japan','world').some(r=>r.type==='country' && r.value.id==='JPN'));
  assert.ok(searchCatalog(catalog,'东京','world').some(r=>r.type==='city'));
  assert.ok(scopedPlaces(catalog,{mode:'world',country,region,city,filter:'海岸漫游'}).every(p=>p.category==='海岸漫游'));
});

test('world cards retain favorites, visited, generation, weather and local caches through existing API', async () => {
  const dir=await temp();const host=mockHost();let calls=0;
  const {server}=await createApp({dataDir:dir,lan:null,agentBackend:createDshAgentBackend(host.ctx,{root}),fetchImpl:async url=>{
    calls++;assert.equal(new URL(url).searchParams.get('timezone'),'auto');
    const time=new Date().toISOString().slice(0,16),date=time.slice(0,10);
    return Response.json({utc_offset_seconds:0,timezone:'UTC',current:{time,temperature_2m:20,weather_code:0,is_day:1},daily:{time:[date]}});
  }});
  server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}/api`;
  try {
    const id='world-q243';
    assert.equal((await fetch(`${base}/places/${id}`)).status,200);
    for (const action of ['favorite','visited','visit']) {
      const response=await fetch(base+'/state',{method:'PUT',headers,body:JSON.stringify({id,action})});assert.equal(response.status,200);
    }
    const state=await(await fetch(base+'/state')).json();
    assert.ok(state.favorites.includes(id));assert.ok(state.visited.includes(id));assert.ok(state.history.includes(id));
    const weather=await(await fetch(`${base}/places/${id}/weather`)).json();assert.equal(weather.weather.timezone,'UTC');assert.equal(calls,1);
    const request=()=>fetch(`${base}/places/${id}/generate`,{method:'POST',headers,body:'{}'}).then(r=>r.json());
    const first=await request();assert.equal(first.detail.kind,'dsh-agent');const second=await request();assert.equal(second.cached,true);assert.equal(host.requests.length,1);
  } finally {await new Promise(r=>server.close(r));await cleanup(dir);}
});

test('visited matching includes world country and English context without accepting unknown places',async()=>{
  const prepared=await prepareMatch({text:'去过巴黎埃菲尔铁塔，没有去悉尼歌剧院',catalog,root,config:{}});
  assert.ok(prepared.prompt.includes('Eiffel Tower'));assert.ok(prepared.prompt.includes('法国'));
  const index=catalog.places.findIndex(p=>p.id==='world-q243');
  const host=mockHost({value:{matched:[index],unmatched:[],ambiguous:[]}});
  const result=await matchVisited({prepared,catalog,config:{},agentBackend:createDshAgentBackend(host.ctx,{root})});
  assert.deepEqual(result.ids,['world-q243']);
});

test('grouped regions fit all constituent areas rather than one department or county', async()=>{
  for (const [code,name] of [['GBR','苏格兰'],['FRA','法兰西岛'],['ITA','拉齐奥']]) {
    const region=world.regions.find(r=>r.countryId===code && r.name===name);
    const map=normalizeMap(await read(`maps/world/${code}.json`));
    const feature=map.features.find(f=>f.properties.id===region.id);
    const projection=geoMercator().rotate([-region.center[0],0]).fitExtent([[70,50],[870,540]],mainLand(feature));
    for (const c of world.cities.filter(c=>c.regionId===region.id)) {
      const [x,y]=projection(c.center);
      assert.ok(x>=20 && x<=920 && y>=20 && y<=565,`${c.name}: ${x},${y}`);
    }
  }
  const cn=normalizeMap(worldMap).features.find(f=>f.properties.id==='CHN');
  assert.equal(mainLand(cn),cn);
});

test('US states and priority countries have concrete landmarks, not just city-walk placeholders',()=>{
 const sites=world.places.filter(p=>p.kind==='landmark');
 assert.ok(sites.length>=160);
 const countries=new Set(sites.map(p=>p.countryId));assert.ok(countries.size>=50);
 for(const region of world.regions.filter(r=>r.countryId==='USA'))assert.ok(sites.some(p=>p.regionId===region.id),region.name);
 const russian=sites.filter(p=>p.countryId==='RUS');assert.ok(russian.length>=25);
 assert.ok(new Set(russian.map(p=>p.timezone)).size>=6);
 for(const name of ['黄石国家公园','大峡谷国家公园','莫斯科红场','冬宫','贝加尔湖','堪察加间歇泉谷'])assert.ok(sites.some(p=>p.name===name),name);
 const church=sites.find(p=>p.name==='雅罗斯拉夫尔先知以利亚教堂');
 assert.equal(church.qid,'Q4177920');assert.ok(church.coordinates[0]>39.8 && church.coordinates[0]<40);assert.equal(church.province,'雅罗斯拉夫尔州');
 const monastery=sites.find(p=>p.qid==='Q1140434');assert.equal(monastery.province,'阿尔汉格尔斯克州');
 const remote=sites.find(p=>p.name==='复活节岛拉诺拉拉库采石场');assert.equal(remote.cityRelation,'destination-area');
});

test('all concrete world landmarks have valid local photographs and complete source credits',async()=>{
 for(const p of world.places.filter(p=>p.kind==='landmark')) {
  assert.equal(p.imageKind,'reference',p.name);assert.ok(p.image.startsWith('/media/world/'),p.name);
  assert.ok(p.imageSource.author && p.imageSource.license && p.imageSource.licenseUrl,p.name);
  assert.ok(p.imageSource.url.startsWith('https://commons.wikimedia.org/wiki/'),p.name);
  const bytes=await fs.readFile(path.join(root,'public',p.image));assert.ok(bytes.length>2000,p.name);
  assert.ok(bytes.subarray(0,2).equals(Buffer.from([0xff,0xd8])) || bytes.subarray(1,4).toString()==='PNG' || bytes.subarray(8,12).toString()==='WEBP',p.name);
 }
 for(const p of world.places) { assert.ok(typeof p.timezone==='string' && p.timezone,p.name);assert.doesNotThrow(()=>new Intl.DateTimeFormat('en',{timeZone:p.timezone}).format(0),p.name); }
 for(const p of world.places.filter(p=>p.cityRelation==='gateway'))assert.ok(p.gatewayDistanceKm<=120,p.name);
});

test('world city cards use local raster photographs and never fall back to scenic SVGs',async()=>{
 const photos = world.places.filter(p=>p.imageKind==='reference');
 assert.ok(photos.length/world.places.length>=0.97,'world photo coverage must stay above 97%');
 for(const p of world.places) {
  assert.ok(['reference','unavailable'].includes(p.imageKind),p.name);
  if(p.imageKind==='unavailable') {assert.equal(p.image,null,p.name);continue;}
  assert.match(p.image,/^\/media\/world\/.+\.(?:jpe?g|png|webp)$/i,p.name);
  assert.ok(p.imageSource.author && p.imageSource.license && p.imageSource.licenseUrl,p.name);
  const bytes=await fs.readFile(path.join(root,'public',p.image));
  assert.ok(bytes.subarray(0,2).equals(Buffer.from([0xff,0xd8])) || bytes.subarray(1,4).toString()==='PNG' || bytes.subarray(8,12).toString()==='WEBP',p.name);
 }
 const cities = new Map(world.cities.map(c=>[c.id,c]));
 const manifest = await read('world-city-photos.json');
 for(const photo of Object.values(manifest)) {
  assert.equal(photo.countryId,cities.get(photo.cityId)?.countryId,photo.cityName);
  assert.match(photo.qid,/^Q\d+$/,photo.cityName);
  assert.ok(photo.entityDistanceKm<=60,photo.cityName);
 }
});
