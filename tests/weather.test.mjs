import test from "node:test";
import assert from "node:assert/strict";
import { createWeatherService, weatherTheme } from "../server/weather.mjs";
import { place } from "./helpers.mjs";
test("weather codes map to clear/night/cloud/rain/storm/snow/fog", () => {
  for (const [code, theme] of [[0,"sunny"],[3,"cloudy"],[61,"rain"],[57,"rain"],[95,"storm"],[99,"storm"],[73,"snow"],[86,"snow"],[45,"fog"],[1000,"neutral"]]) assert.equal(weatherTheme(code).theme, theme);
  assert.equal(weatherTheme(0, false).theme, "night");
});
test("weather uses separate caches, combines concurrent requests and rejects stale responses", async () => {
  let now = Date.parse("2026-10-16T10:00:00+08:00"), calls = 0, stale = false;
  const get = createWeatherService({ now: () => now, fetchImpl: async () => { calls++;
    const date = stale ? "2026-10-15" : "2026-10-16";
    return Response.json({ current: { time: `${date}T10:00`, temperature_2m: 22, weather_code: 61, is_day: 1 }, daily: { time: [date] } }); } });
  const [a, b] = await Promise.all([get(place), get(place)]); assert.deepEqual(a, b); assert.equal(calls, 1); assert.equal(a.theme, "rain");
  now += 16 * 60000; await get(place); assert.equal(calls, 2);
  stale = true; now += 16 * 60000; await assert.rejects(get(place), /天气暂时/);
});

test("world weather validates the destination's local date across midnight and UTC offsets", async () => {
  const now = Date.parse('2026-10-17T00:30:00Z');
  for (const [offset,time,date,timezone] of [
    [-7*3600,'2026-10-16T17:30','2026-10-16','America/Los_Angeles'],
    [9*3600,'2026-10-17T09:30','2026-10-17','Asia/Tokyo'],
    [13*3600,'2026-10-17T13:30','2026-10-17','Pacific/Auckland'],
  ]) {
    let calls=0;
    const service=createWeatherService({now:()=>now,fetchImpl:async url=>{
      calls++;assert.equal(new URL(url).searchParams.get('timezone'),'auto');
      return Response.json({utc_offset_seconds:offset,timezone,current:{time,temperature_2m:18,weather_code:0,is_day:1},daily:{time:[date]}});
    }});
    const weather=await service({...place,id:timezone});
    assert.equal(weather.date,date);assert.equal(weather.timezone,timezone);
    await service({...place,id:timezone});assert.equal(calls,1);
  }
});

test('foreign weather without a trustworthy time zone or UTC offset is rejected',async()=>{
 const now=Date.parse('2026-10-17T02:00:00Z');
 const service=createWeatherService({now:()=>now,fetchImpl:async()=>Response.json({
  current:{time:'2026-10-17T10:00',temperature_2m:20,weather_code:0,is_day:1},daily:{time:['2026-10-17']}
 })});
 await assert.rejects(service({...place,countryId:'RUS',id:'unknown-foreign-zone'}),/当地天气/);
});

test('offline landmark IANA zone is used when the weather response omits zone metadata',async()=>{
 const now=Date.parse('2026-10-17T02:00:00Z');
 const service=createWeatherService({now:()=>now,fetchImpl:async()=>Response.json({
  current:{time:'2026-10-17T05:00',temperature_2m:12,weather_code:3,is_day:1},daily:{time:['2026-10-17']}
 })});
 const weather=await service({...place,countryId:'RUS',timezone:'Europe/Moscow',id:'moscow-clock'});
 assert.equal(weather.timezone,'Europe/Moscow');assert.equal(weather.utcOffsetSeconds,3*3600);
});
