import React, { useEffect, useState } from "react";
import { Sun, Moon, Cloud, CloudRain, CloudLightning, Snowflake, CloudFog, Loader2, RotateCcw } from "lucide-react";
import "./scenic.css";

export function usePlaceWeather(id, request) {
  const [state, setState] = useState({ weather: null, loading: true, error: "" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ weather: null, loading: true, error: "" });
    const load = async () => {
      try {
        const data = await request(`/places/${id}/weather`, { signal: controller.signal });
        if (active) setState({ weather: data.weather, loading: false, error: "" });
      } catch (e) {
        if (active) setState({ weather: null, loading: false, error: e.message });
      }
    };
    load();
    const timer = setInterval(load, 15 * 60 * 1000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, [id, request, retry]);
  return { ...state, retry: () => setRetry(n => n + 1) };
}

const icons = { sunny: Sun, night: Moon, cloudy: Cloud, rain: CloudRain, storm: CloudLightning, snow: Snowflake, fog: CloudFog };
const number = (value, suffix) => value == null ? "" : `${Math.round(value)}${suffix}`;
export function WeatherOpening({ weather, loading, error, retry }) {
  const Icon = icons[weather?.theme] || Cloud;
  if (!weather) return <div className="weather-opening weather-pending" role="status">
    {loading ? <Loader2 size={18} className="spin" /> : <Cloud size={18} />}
    <span>{loading ? "正在迎接当地的风与晴…" : error || "天气暂时不可用"}</span>
    {!loading && <button type="button" onClick={retry}><RotateCcw size={12} /> 重试</button>}
  </div>;
  return <div className="weather-opening" aria-label="当地今日天气">
    <div className="weather-main"><Icon size={27} strokeWidth={1.4} />
      <strong>{number(weather.temperature, "°")}</strong>
      <div><b>{weather.label}</b><span>{weather.date.slice(5).replace("-", "月")}日 · {weather.location}</span></div>
    </div>
    <div className="weather-stats">
      {weather.low != null && weather.high != null && <span>今日 {number(weather.low, "°")} / {number(weather.high, "°C")}</span>}
      {weather.feelsLike != null && <span>体感 {number(weather.feelsLike, "°C")}</span>}
      {weather.precipitation != null && <span>降水概率 {number(weather.precipitation, "%")}</span>}
      {weather.wind != null && <span>风速 {number(weather.wind, " km/h")}</span>}
    </div>
    <div className="weather-credit"><a href={weather.source.url} target="_blank" rel="noreferrer">{weather.source.title} · 模型天气</a>
      <span>{weather.observedAt.slice(11, 16)} 更新（当地时间）</span></div>
    {weather.theme === "storm" && <p className="weather-advice">雷暴天气，优先安排室内活动，留意当地预警与景区公告。</p>}
    {weather.theme === "rain" && <p className="weather-advice">带好雨具，留意步道湿滑；山地和水上项目出发前确认开放。</p>}
  </div>;
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
  const q = encodeURIComponent(`${place.city} ${place.name} 游玩体验 评价`);
  return [
    { title: "网页评价", url: `https://www.bing.com/search?q=${q}` },
    { title: "小红书", url: `https://www.xiaohongshu.com/search_result?keyword=${q}` },
    { title: "知乎", url: `https://www.zhihu.com/search?type=content&q=${q}` },
  ];
}
