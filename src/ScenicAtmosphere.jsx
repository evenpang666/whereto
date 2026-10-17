import React, { useEffect, useState } from "react";
import { Sun, Moon, Cloud, CloudRain, CloudLightning, Snowflake, CloudFog, Loader2, RotateCcw } from "lucide-react";
import "./scenic.css";
import { localClock } from "../shared/local-time.mjs";

export function usePlaceWeather(id, request) {
  const [state, setState] = useState({ weather: null, loading: true, error: "" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ weather: null, loading: true, error: "" });
    let pending = false, lastAttempt = 0, latest = null;
    const load = async () => {
      if (pending) return;
      pending = true; lastAttempt = Date.now();
      try {
        const data = await request(`/places/${id}/weather`, { signal: controller.signal });
        latest = data.weather;
        if (active) setState({ weather: data.weather, loading: false, error: "" });
      } catch (e) {
        if (active) setState({ weather: null, loading: false, error: e.message });
      } finally { pending = false; }
    };
    const refresh = () => {
      const clock = latest && localClock(latest);
      if (Date.now() - lastAttempt >= 15 * 60 * 1000 || (clock && clock.date !== latest.date && Date.now() - lastAttempt >= 60000)) load();
    };
    load();
    const timer = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [id, request, retry]);
  return { ...state, retry: () => setRetry(n => n + 1) };
}

const icons = { sunny: Sun, night: Moon, cloudy: Cloud, rain: CloudRain, storm: CloudLightning, snow: Snowflake, fog: CloudFog };
const number = (value, suffix) => value == null ? "" : `${Math.round(value)}${suffix}`;
export function DestinationTime({ weather, place }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const clock = localClock({ timezone: weather?.timezone || place?.timezone, utcOffsetSeconds: weather?.utcOffsetSeconds }, now);
  return <div className="destination-time" aria-label="目的地当地日期与时间">
    {clock ? <>
      <div><span>当地日期</span><time dateTime={clock.date}>{clock.dateLabel} · {clock.weekday}</time></div>
      <div><span>当地时间</span><time dateTime={`${clock.date}T${clock.time}${clock.utc.slice(3)}`}>{clock.time}</time><small>{clock.utc}</small></div>
      <small>{clock.timezone}{clock.dateDifference ? ` · ${clock.dateDifference}` : ""}</small>
    </> : <span>当地日期与时间待确认时区后显示</span>}
  </div>;
}
export function WeatherOpening({ weather, loading, error, retry, place }) {
  const Icon = icons[weather?.theme] || Cloud;
  if (!weather) return <><DestinationTime weather={weather} place={place} /><div className="weather-opening weather-pending" role="status">
    {loading ? <Loader2 size={18} className="spin" /> : <Cloud size={18} />}
    <span>{loading ? "正在迎接当地的风与晴…" : error || "天气暂时不可用"}</span>
    {!loading && <button type="button" onClick={retry}><RotateCcw size={12} /> 重试</button>}
  </div></>;
  return <><DestinationTime weather={weather} place={place} /><div className="weather-opening" aria-label="当地今日天气">
    <div className="weather-main"><Icon size={27} strokeWidth={1.4} />
      <strong>{number(weather.temperature, "°")}</strong>
      <div><b>{weather.label}</b><span>{weather.date} · {weather.location}</span></div>
    </div>
    <div className="weather-stats">
      {weather.low != null && weather.high != null && <span>当日 {number(weather.low, "°")} / {number(weather.high, "°C")}</span>}
      {weather.feelsLike != null && <span>体感 {number(weather.feelsLike, "°C")}</span>}
      {weather.precipitation != null && <span>降水概率 {number(weather.precipitation, "%")}</span>}
      {weather.wind != null && <span>风速 {number(weather.wind, " km/h")}</span>}
    </div>
    <div className="weather-credit"><a href={weather.source.url} target="_blank" rel="noreferrer">{weather.source.title} · 模型天气</a>
      <span>天气数据更新：{weather.observedAt.replace("T", " ")}（当地）</span></div>
    {weather.theme === "storm" && <p className="weather-advice">雷暴天气，优先安排室内活动，留意当地预警与景区公告。</p>}
    {weather.theme === "rain" && <p className="weather-advice">带好雨具，留意步道湿滑；山地和水上项目出发前确认开放。</p>}
  </div></>;
}

export function WeatherScene({ theme }) {
  return <div className={`weather-scene scene-${theme}`} aria-hidden="true">
    <div className="weather-glow" /><div className="weather-cloud cloud-one" /><div className="weather-cloud cloud-two" />
    <div className="weather-particles">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ "--i": i, left: `${(i * 37) % 100}%`, animationDelay: `${-i * .37}s` }} />)}</div>
    <div className="weather-flash" />
  </div>;
}

export function localInspiration(place) {
  return { feedback: { "山野自然": "偏爱自然与步行的人可能更享受这一站。建议先选一条短线，再按体力延长；坡道与天气会影响体验。",
      "湖光水色": "适合慢步与观景；想拍照可留出停驻时间，同行有老人或孩子时优先选择便于折返的路线。",
      "人文古迹": "喜欢历史与建筑细节的人可能更有收获。先了解一两个主题再参观，比匆忙打卡更容易留下印象。",
      "海岸漫游": "喜欢开阔视野与休闲停留的人可能更享受这里。按风力与日照调整户外时间，水上项目另看当天安排。",
    }[place.category] || "适合留一段不赶路的时间，先选一处最感兴趣的看点，再按步行距离与同行人的节奏调整行程。" };
}

export function reviewSearchLinks(place) {
  const q = encodeURIComponent(`${place.country || "中国"} ${place.city} ${place.name} ${place.englishName || ""} 游玩体验 评价`);
  return [
    { title: "网页评价", url: `https://www.bing.com/search?q=${q}` },
    { title: "小红书", url: `https://www.xiaohongshu.com/search_result?keyword=${q}` },
    { title: "知乎", url: `https://www.zhihu.com/search?type=content&q=${q}` },
  ];
}
