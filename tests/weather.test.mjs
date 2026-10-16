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
