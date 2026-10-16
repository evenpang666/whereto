const isNumber = value => typeof value === "number" && Number.isFinite(value);
export function weatherTheme(code, isDay = true) {
  if ([95, 96, 99].includes(code)) return { theme: "storm", label: "雷暴" };
  if ([56, 57, 66, 67].includes(code)) return { theme: "rain", label: "冻雨" };
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return { theme: "rain", label: "下雨" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { theme: "snow", label: "下雪" };
  if ([45, 48].includes(code)) return { theme: "fog", label: "有雾" };
  if (code === 0) return { theme: isDay ? "sunny" : "night", label: "晴朗" };
  if ([1, 2, 3].includes(code)) return { theme: "cloudy", label: code === 3 ? "阴天" : "多云" };
  return { theme: "neutral", label: "天气更新中" };
}

// Independent of the durable AI cache: current conditions expire after 15 minutes.
export function createWeatherService({ fetchImpl = fetch, now = () => Date.now() } = {}) {
  const cache = new Map(), pending = new Map();
  return async function getWeather(place) {
    const date = new Date(now()).toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
    const cached = cache.get(place.id);
    if (cached && cached.date === date && now() - cached.at < 15 * 60 * 1000) return cached.value;
    if (pending.has(place.id)) return pending.get(place.id);
    const request = (async () => {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.search = new URLSearchParams({
        latitude: place.coordinates[1], longitude: place.coordinates[0],
        current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m",
        daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        timezone: "Asia/Shanghai", forecast_days: "1",
      }).toString();
      try {
        const response = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(12000), redirect: "error" });
        if (!response.ok) throw Error("weather upstream");
        const data = await response.json(), c = data.current, d = data.daily;
        const at = Date.parse(`${c?.time}+08:00`);
        if (!isNumber(c?.temperature_2m) || !Number.isInteger(c.weather_code) ||
            ![0, 1].includes(c.is_day) || !Number.isFinite(at) ||
            Math.abs(now() - at) > 2 * 60 * 60 * 1000 || c.time.slice(0, 10) !== date || d?.time?.[0] !== date)
          throw Error("stale or incomplete weather");
        const optional = value => isNumber(value) ? value : null;
        const value = {
          ...weatherTheme(c.weather_code, !!c.is_day), date, observedAt: c.time,
          fetchedAt: new Date(now()).toISOString(), temperature: c.temperature_2m,
          feelsLike: optional(c.apparent_temperature), humidity: optional(c.relative_humidity_2m),
          wind: optional(c.wind_speed_10m), high: optional(d.temperature_2m_max?.[0]),
          low: optional(d.temperature_2m_min?.[0]), precipitation: optional(d.precipitation_probability_max?.[0]),
          location: place.precision === "city-reference" ? `${place.city}市区参考` : `${place.name}附近`,
          source: { title: "Open-Meteo", url: "https://open-meteo.com/" },
        };
        cache.set(place.id, { at: now(), date, value });
        return value;
      } catch {
        throw Error("当地天气暂时连接不上，稍后可重试。");
      }
    })();
    pending.set(place.id, request);
    try { return await request; } finally { pending.delete(place.id); }
  };
}
