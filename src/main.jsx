import { assetUrl } from "./urls.js";
import { PlaceImage, imageLabel } from "./PlaceImage.jsx";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import { geoMercator, geoPath, geoArea } from "d3-geo";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Heart,
  Compass,
  Settings2,
  Search,
  Shuffle,
  Plus,
  Minus,
  RotateCcw,
  MapPin,
  Leaf,
  X,
  ChevronRight,
  Clock3,
  Sparkles,
  Mountain,
  Waves,
  Landmark,
  Check,
  Loader2,
  ShieldCheck,
  BookOpen,
  History,
  ExternalLink,
  SlidersHorizontal,
  CheckCheck,
} from "lucide-react";
import { DshSettings } from "./DshSettings.jsx";
import { AgentProgress } from "./AgentProgress.jsx";
import { VisitedPanel } from "./VisitedPanel.jsx";
import { usePlaceWeather, WeatherOpening, WeatherScene, localInspiration, reviewSearchLinks } from "./ScenicAtmosphere.jsx";
import "./style.css";
import "./polish.css";
import "./features.css";
import "./world.css";
import { WorldMap } from "./WorldMap.jsx";
import { SelectedLandmark } from "./SelectedLandmark.jsx";
import { normalizeMap } from "./geography.js";
import { mergeCatalogs, scopedPlaces, searchCatalog, placeLocation } from "../shared/catalog.mjs";

const money = (n) => `$${Number(n || 0).toFixed(4)}`;
async function api(url, options = {}) {
  const r = await fetch(import.meta.env.BASE_URL + "api" + url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Whereto-Client": "local",
      ...options.headers,
    },
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error || "操作失败");
  return j;
}
const short = (n) =>
  n?.replace(/壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|省|市/g, "");
const categories = [
  ["全部风景", Compass],
  ["山野自然", Mountain],
  ["人文古迹", Landmark],
  ["湖光水色", Waves],
  ["海岸漫游", Waves],
  ["城市漫步", MapPin],
];
const normalize = normalizeMap;
function Dialog({ title, children, onClose, wide = false, className = "" }) {
  const box = useRef(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    box.current?.focus();
    const key = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
      }
      if (e.key === "Tab") {
        const nodes = [
          ...box.current.querySelectorAll(
            'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
          ),
        ].filter((el) => el.getClientRects().length);
        const first = nodes[0],
          last = nodes.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === box.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    box.current?.addEventListener("keydown", key);
    return () => {
      box.current?.removeEventListener("keydown", key);
      document.body.style.overflow = old;
      prev?.focus();
    };
  }, []);
  return (
    <div
      className="scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={`dialog ${wide ? "dialog-wide" : ""} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={box}
      >
        <button
          className="icon-button dialog-close"
          aria-label="关闭"
          onClick={onClose}
        >
          <X size={19} />
        </button>
        {children}
      </section>
    </div>
  );
}
function TravelMap({
  nation,
  provinceMap,
  catalog,
  province,
  city,
  onProvince,
  onCity,
  onPlace,
  selected,
  highlightedPlace,
  filter,
  randomizing,
  favorites,
  visited,
  onMarkedPlace,
}) {
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState([0, 0]),
    [hover, setHover] = useState(null),
    [dragging, setDragging] = useState(false);
  const drag = useRef(null),
    svg = useRef(null);
  const projection = useMemo(() => {
    const points = [];
    const walk = (c) => {
      if (typeof c[0] === "number") {
        if (c[1] >= 18 && c[0] >= 73) points.push(c);
      } else c.forEach(walk);
    };
    nation.features.forEach((f) => {
      if (f.geometry) walk(f.geometry.coordinates);
    });
    return geoMercator().fitExtent(
      [
        [32, 38],
        [908, 594],
      ],
      { type: "MultiPoint", coordinates: points },
    );
  }, [nation]);
  const path = useMemo(() => geoPath(projection), [projection]);
  useEffect(() => {
    setZoom(1);
    setPan([0, 0]);
    setHover(null);
  }, [province?.properties.adcode, city?.id]);
  const mapTarget = useMemo(() => {
    if (city) {
      const boundary = provinceMap?.features.find(
        (f) => String(f.properties.adcode) === city.id,
      );
      if (
        boundary &&
        !["110000", "120000", "310000", "500000", "810000", "820000"].includes(
          city.id,
        )
      )
        return boundary;
      const sites = catalog.places.filter(
        (p) => p.cityId === city.id && p.precision !== "city-reference",
      );
      const coords = [city.center, ...sites.map((p) => p.coordinates)];
      const [x, y] = city.center;
      return {
        type: "MultiPoint",
        coordinates: [...coords, [x - 0.35, y - 0.24], [x + 0.35, y + 0.24]],
      };
    }
    return province;
  }, [city, province, provinceMap, catalog]);
  let k = 1,
    x = 0,
    y = 0;
  if (mapTarget) {
    const bounds = path.bounds(mapTarget),
      w = bounds[1][0] - bounds[0][0],
      h = bounds[1][1] - bounds[0][1];
    k = Math.min(140, Math.min(830 / Math.max(w, 1), 500 / Math.max(h, 1)));
    x = 470 - (k * (bounds[0][0] + bounds[1][0])) / 2;
    y = 310 - (k * (bounds[0][1] + bounds[1][1])) / 2;
  }
  x = 470 + (x - 470) * zoom + pan[0];
  y = 310 + (y - 310) * zoom + pan[1];
  k *= zoom;
  const nationLevel = !province;
  const shownCities = province
    ? catalog.cities.filter(
        (c) => c.provinceId === String(province.properties.adcode),
      )
    : [];
  const sites = city
    ? catalog.places.filter(
        (p) =>
          p.cityId === city.id &&
          (filter === "全部风景" || p.category === filter),
      )
    : [];
  const markers = nationLevel
    ? catalog.places.filter((p) =>
        ["西湖风景名胜区", "故宫博物院", "丽江古城景区", "黄山风景区"].includes(
          p.name,
        ),
      )
    : sites;
  const keyboard = (e, fn) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  };
  function startDrag(e) {
    if (e.target.closest("[data-interactive]")) return;
    drag.current = { x: e.clientX, y: e.clientY, pan };
    svg.current.setPointerCapture(e.pointerId);
    setDragging(true);
  }
  function moveDrag(e) {
    if (!drag.current) return;
    const scale = 940 / svg.current.getBoundingClientRect().width;
    setPan([
      drag.current.pan[0] + (e.clientX - drag.current.x) * scale,
      drag.current.pan[1] + (e.clientY - drag.current.y) * scale,
    ]);
  }
  return (
    <div className={`map-canvas ${dragging ? "dragging" : ""}`}>
      <svg
        ref={svg}
        viewBox="0 0 940 630"
        role="group"
        aria-label="中国交互地图，选择省份和城市探索景点"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
      >
        <g
          className={`geography ${dragging ? "no-transition" : ""}`}
          style={{ transform: `translate(${x}px,${y}px) scale(${k})` }}
        >
          {nation.features
            .filter((f) => f.properties.name)
            .map((f, i) => (
              <path
                key={f.properties.adcode}
                d={path(f)}
                className={`province shape-${i % 5} ${province?.properties.adcode === f.properties.adcode ? "province-selected" : ""} ${randomizing && i % 6 === 0 ? "random-glow" : ""}`}
                vectorEffect="non-scaling-stroke"
                data-interactive="true"
                tabIndex={province ? -1 : 0}
                role="button"
                aria-label={`探索${f.properties.name}`}
                onKeyDown={(e) => keyboard(e, () => onProvince(f))}
                onClick={() => onProvince(f)}
                onMouseEnter={() => setHover(f.properties.name)}
                onMouseLeave={() => setHover(null)}
              />
            ))}
          {province &&
            provinceMap?.features
              .filter((f) => f.properties.name)
              .map((f) => (
                <path
                  key={"city-" + f.properties.adcode}
                  d={path(f)}
                  className={`city-region ${city && String(f.properties.adcode) === city.id ? "city-selected" : ""}`}
                  vectorEffect="non-scaling-stroke"
                  data-interactive="true"
                  onClick={() => {
                    const c =
                      shownCities.find(
                        (c) => c.id === String(f.properties.adcode),
                      ) || shownCities[0];
                    if (c) onCity(c);
                  }}
                  onMouseEnter={() => setHover(f.properties.name)}
                  onMouseLeave={() => setHover(null)}
                />
              ))}
          {nationLevel &&
            nation.features
              .filter((f) => f.properties.name)
              .map((f) => {
                const pt = projection(
                  f.properties.centroid || f.properties.center,
                );
                if (!pt) return null;
                const offset = {
                  天津市: [12, 9],
                  北京市: [-3, -4],
                  上海市: [8, 2],
                  香港特别行政区: [13, 12],
                  澳门特别行政区: [-15, 19],
                }[f.properties.name] || [0, 0];
                return (
                  <text
                    key={"label" + f.properties.adcode}
                    x={pt[0] + offset[0]}
                    y={pt[1] + offset[1]}
                    className="province-label"
                    textAnchor="middle"
                    pointerEvents="none"
                  >
                    {short(f.properties.name)}
                  </text>
                );
              })}
          {province &&
            !city &&
            shownCities.map((c) => {
              const pt = projection(c.center);
              return (
                <g
                  key={c.id}
                  data-interactive="true"
                  role="button"
                  tabIndex={0}
                  aria-label={`探索${c.name}`}
                  onKeyDown={(e) => keyboard(e, () => onCity(c))}
                  onClick={() => onCity(c)}
                  className="city-point"
                  transform={`translate(${pt[0]},${pt[1]}) scale(${1 / k})`}
                >
                  <circle r="5" />
                  <text y="-13" textAnchor="middle">
                    {short(c.name)}
                  </text>
                </g>
              );
            })}
          {markers.filter(p => p.id !== highlightedPlace?.id && !favorites.includes(p.id) && !visited.includes(p.id)).map((p) => {
            const pt = projection(p.coordinates);
            return (
              <g
                key={p.id}
                className={`site-point ${selected?.id === p.id ? "point-active" : ""}`}
                transform={`translate(${pt[0]},${pt[1]}) scale(${1 / k})`}
                data-interactive="true"
                role="button"
                tabIndex={0}
                aria-label={`打开${p.name}`}
                onClick={() => onPlace(p)}
                onKeyDown={(e) => keyboard(e, () => onPlace(p))}
                onMouseEnter={() => setHover(p.name)}
                onMouseLeave={() => setHover(null)}
              >
                <circle className="pin-halo" r="13" />
                <circle className="pin-core" r="5" />
                {city && (
                  <text y="-20" textAnchor="middle">
                    {p.name.length > 14 ? p.name.slice(0, 13) + "…" : p.name}
                  </text>
                )}
              </g>
            );
          })}
        </g>
        <g className="map-records" aria-label="收藏与去过的景点">
          {(() => {
            const occupied = [];
            return catalog.places.filter(p => p.id !== highlightedPlace?.id && (favorites.includes(p.id) || visited.includes(p.id))).map(p => {
              const pt = projection(p.coordinates);
              const sx = x + k * pt[0], sy = y + k * pt[1];
              const outside = sx < 28 || sx > 912 || sy < 30 || sy > 570;
              const loved = favorites.includes(p.id), been = visited.includes(p.id);
              if (outside && !loved) return null;
              let px = Math.max(28, Math.min(912, sx)), py = Math.max(30, Math.min(570, sy));
              if (outside) {
                // Spread edge pins so several distant favorites remain independently clickable.
                for (let n = 0; n < 36 && occupied.some(q => Math.hypot(q[0]-px, q[1]-py) < 29); n++) {
                  if (px === 28 || px === 912) py = 30 + ((py - 30 + 31) % 540);
                  else px = 28 + ((px - 28 + 31) % 884);
                }
                occupied.push([px, py]);
              }
              const label = `${p.name}${loved ? " · 已收藏" : ""}${been ? " · 已去过" : ""}${outside ? " · 当前视野外，点击前往" : ""}`;
              return <g key={p.id} className={`marked-point ${been ? "is-visited" : ""} ${outside ? "edge-pin" : ""}`}
                style={{ transform: `translate(${px}px, ${py}px)` }} data-interactive="true"
                role="button" tabIndex={0} aria-label={label}
                onClick={() => onMarkedPlace(p)} onKeyDown={e => keyboard(e, () => onMarkedPlace(p))}
                onMouseEnter={() => setHover(label)} onMouseLeave={() => setHover(null)}>
                <title>{label}</title><circle r="15" className="record-halo" />
                {loved ? <Heart x={-9} y={-9} width={18} height={18} fill="currentColor" strokeWidth={1.5} />
                  : <CheckCheck x={-9} y={-9} width={18} height={18} strokeWidth={2.4} />}
                {been && loved && <circle cx="11" cy="10" r="4" className="visited-dot" />}
                {outside && <path d="M-4 20 0 24 4 20" fill="none" stroke="currentColor" strokeWidth="2" />}
                {city && !outside && <text y="-23" textAnchor="middle">{p.name}</text>}
              </g>;
            });
          })()}
        </g>
        {highlightedPlace && (() => {
          const pt = projection(highlightedPlace.coordinates);
          return pt && <SelectedLandmark place={highlightedPlace} point={[x + k * pt[0], y + k * pt[1]]} animatePosition />;
        })()}
      </svg>
      <div className="map-compass">
        <span>N</span>
        <Compass size={35} strokeWidth={1} />
      </div>
      {nationLevel && (
        <div className="sea-inset">
          <svg viewBox="0 0 80 110" aria-hidden="true">
            {nation.features.map((f, i) => (
              <path
                key={i}
                d={geoPath(
                  geoMercator()
                    .center([114, 13])
                    .scale(180)
                    .translate([40, 55]),
                )(f)}
                fill="#c8cfbb"
                stroke="#f8f6ef"
                strokeWidth="1"
              />
            ))}
          </svg>
          <span>南海诸岛</span>
        </div>
      )}
      {hover && (
        <div className="map-tooltip">
          <MapPin size={12} />
          {hover}
        </div>
      )}
      <div className="map-controls">
        <button
          className="icon-button"
          aria-label="放大地图"
          onClick={() => setZoom((z) => Math.min(4, z * 1.3))}
        >
          <Plus size={17} />
        </button>
        <button
          className="icon-button"
          aria-label="缩小地图"
          onClick={() => setZoom((z) => Math.max(0.7, z / 1.3))}
        >
          <Minus size={17} />
        </button>
        <span />
        <button
          className="icon-button"
          aria-label="重置地图视角"
          onClick={() => {
            setZoom(1);
            setPan([0, 0]);
          }}
        >
          <RotateCcw size={15} />
        </button>
      </div>
      <div className="map-hint">
        <span className="status-dot" />
        {city
          ? "点击标记，打开一处风景"
          : province
            ? "点击城市，让风景再近一点"
            : "点击一片山河，开始探索"}
        <span className="hint-drag"> · 可拖动地图</span>
      </div>
    </div>
  );
}
function Settings({ settings, onClose, ...props }) {
  return <Dialog title="DSH 会话设置" onClose={onClose}><DshSettings settings={settings} {...props} /></Dialog>;
}
function Detail({
  place,
  detail,
  loading,
  generating,
  settings,
  favorite,
  onFavorite,
  visited,
  onVisited,
  onGenerate,
  onRecover,
  onClose,
  onSettings,
}) {
  const d = detail || place;
  const weatherState = usePlaceWeather(place.id, api);
  const theme = weatherState.weather?.theme || "neutral";
  const inspiration = localInspiration(place);
  const generatedProse = detail?.kind === "dsh-agent" ? detail.prose?.trim() : "";
  const outdated = detail && detail.schemaVersion !== 4;
  const reviews = detail?.realReviews || [];
  return (
    <Dialog title={place.name} onClose={onClose} wide className={`scenic-card theme-${theme} ${visited ? "is-visited" : ""}`}>
      <div className="detail-visual">
        <PlaceImage place={place} />
        <WeatherScene theme={theme} />
        <div className="image-caption">{imageLabel(place, true)}</div>
        <span className="image-tag">{place.category}</span>
      </div>
      <div className="detail-content">
        <WeatherOpening {...weatherState} place={place} />
        <div className="place-location">
          <MapPin size={13} />
          {placeLocation(place)}
          {place.grade && <span className="grade">{place.grade}</span>}
          {place.kind === "city-walk" && <span className="grade">城市探索入口</span>}
        </div>
        <h2>{place.name}</h2>
        {visited && <span className="visited-badge"><CheckCheck size={13} /> 已去过的风景</span>}
        <p className="detail-intro">{d.intro}</p>
        <div className="detail-meta">
          <span>
            <Leaf size={14} />
            {d.bestSeason}
          </span>
          <span>
            <Clock3 size={14} />
            {d.duration}
          </span>
        </div>
        <div className="detail-sections">
          <section className="scenic-prose" aria-label="风景邀约">
            <div className="prose-heading">
              <span className="prose-eyebrow">把这一站，写进旅途</span>
              {generatedProse && <span className="prose-source">DSH Web 生成</span>}
            </div>
            {generatedProse ? <p>{generatedProse}</p> : <>
              <p className="prose-pending">由 DSH Web 为这处风景写一段散文简介，与旅行解读一起生成并保存。</p>
              <button type="button" className="text-link prose-generate" onClick={settings.hasKey ? onGenerate : onSettings} disabled={loading || generating}>
                {generating ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
                {generating ? "正在写散文简介…" : settings.hasKey ? "生成散文简介与解读" : "连接 DSH，生成散文简介"}
              </button>
            </>}
          </section>
          <section className="detail-section section-story">
            <h3>
              <BookOpen size={16} />
              风景背后的故事
            </h3>
            <p>{d.history}</p>
          </section>
          <section className="detail-section section-reviews">
            <h3>
              <Compass size={16} />
              游客反响
            </h3>
            <div className="experience-inference"><h4>体验推测 <span>旅行建议</span></h4>
              <p>{detail && !outdated ? d.feedback.replace(/^体验推测（非游客实测评论）：/, "") : inspiration.feedback}</p>
            </div>
            <div className="real-reviews"><h4>真实评价 <span>公开来源</span></h4>
              {reviews.length > 0 ? <>
                <p className="review-disclosure">搜索取得的游客亲历原文摘录，未核验发帖者身份，不代表全部游客。</p>
                {reviews.map(review => <blockquote className="visitor-review" key={review.url}>
                  <p>“{review.excerpt}”</p>
                  <a href={review.url} target="_blank" rel="noreferrer">{review.platform} · {review.title} <ExternalLink size={11} /></a>
                  {review.publishedAt && <small>网页日期：{review.publishedAt}</small>}
                </blockquote>)}
              </> : <p>{detail?.research ? "本次检索未找到可引用的游客亲历摘录。可打开下方平台继续查看。" : "点击下方“联网生成解读”，查询网页、小红书与知乎上的亲历评价；也可直接前往平台浏览。"}</p>}
              <div className="review-search-links">{reviewSearchLinks(place).map(s => <a key={s.title} href={s.url} target="_blank" rel="noreferrer">{s.title} <ArrowUpRight size={11} /></a>)}</div>
              {detail?.research && <small className="review-search-date">检索于 {new Date(detail.research.searchedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} · 平台登录与网页索引可能限制结果</small>}
              {detail?.research?.truncated && <small className="review-search-date">部分检索内容未完整返回，本次仅使用已取得的网页资料，平台覆盖可能不完整。</small>}
              {detail?.research?.omittedReviews > 0 && <small className="review-search-date">{detail.research.omittedReviews} 条评价未通过引用检查，已略过；其余解读已保留。</small>}
            </div>
          </section>
          <section className="detail-section section-inspiration ai-note">
            <h3>
              <Sparkles size={16} />
              {detail ? "DSH Agent 的旅行手记" : "一份旅行灵感"}
              <span>{detail ? "AI 生成" : "本地编辑"}</span>
            </h3>
            <p>{d.aiReview}</p>
          </section>
          <section className="detail-section section-tips">
            <h3>出发前的小事</h3>
            <p>{d.tips}</p>
          </section>
        </div>
        {place.regionNote && <p className="fine-print gateway-note">{place.regionNote}</p>}
        {place.cityRelation === "gateway" && <p className="fine-print gateway-note">{place.city}为附近参考城市，距景点代表点约 {place.gatewayDistanceKm} 公里（直线距离，仅用于目录分组）；地图和天气使用景点坐标。</p>}
        {place.cityRelation === "destination-area" && <p className="fine-print gateway-note">此条目按目的地周边区域分组，并非独立城市。</p>}
        <p className="fine-print coordinate-note">
          {place.kind === "city-walk" ? "这是城市探索入口，地图显示城市参考位置，并非独立景区。" : place.precision === "city-reference"
            ? "此景点尚未核实精确坐标，地图显示城市参考位置。"
            : "点位为景区参考坐标，不作为入口导航。"}
        </p>
        {place.kind === "city-walk" && place.imageSource.note && <p className="fine-print">{place.imageSource.note}</p>}
        {place.imageSource.author && <p className="photo-attribution">图片：{place.imageSource.author}{place.imageSource.date ? ` · ${place.imageSource.date}` : ""} · <a href={place.imageSource.url} target="_blank" rel="noreferrer">原始文件</a>{place.imageSource.license && <> · <a href={place.imageSource.licenseUrl || place.imageSource.url} target="_blank" rel="noreferrer">{place.imageSource.license}</a></>}{place.imageSource.sourcePage && <> · <a href={place.imageSource.sourcePage} target="_blank" rel="noreferrer">原始来源</a></>}{place.imageSource.attribution && <><br />署名补充：{place.imageSource.attribution}</>}</p>}
        <div className="source-links">
          {(detail?.sources || place.sources).map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noreferrer">
              {s.platform || "资料来源"} <ExternalLink size={10} />
            </a>
          ))}
          {place.imageSource.url && (
            <a href={place.imageSource.url} target="_blank" rel="noreferrer">
              配图来源 <ExternalLink size={10} />
            </a>
          )}
        </div>
        {detail && (
          <p className="fine-print">
            AI 解读缓存于{" "}
            {new Date(detail.generatedAt).toLocaleDateString("zh-CN")} ·
            {detail.usage?.managedBy === "dsh" ? `DSH 已报告 ${detail.usage.input + detail.usage.output} tokens · 费用由 DSH 管理` : `历史费用估算 ${money(detail.usage?.cost)}`} · 再次打开 $0
            {detail.trace && (
              <span className="trace">{detail.trace.join(" → ")}</span>
            )}
          </p>
        )}
        <div className="detail-actions">
          <button
            className={`button ${favorite ? "saved" : "primary"}`}
            onClick={() => onFavorite(place.id)}
          >
            <Heart size={17} fill={favorite ? "currentColor" : "none"} />
            {favorite ? "已在心愿清单" : "我想去这里"}
          </button>
          <button className={`button outline ${visited ? "been-button" : ""}`} onClick={() => onVisited(place.id)}>
            <CheckCheck size={17} />{visited ? "已去过 · 撤销" : "标记去过"}
          </button>
          <button
              className="button outline"
              onClick={settings.hasKey ? onGenerate : onSettings}
              disabled={loading || generating}
            >
              {generating ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Sparkles size={16} />
              )}{" "}
              {generating
                ? "正在写旅行手记…"
                : settings.hasKey
                  ? (detail ? "联网更新解读" : "联网生成解读")
                  : "连接 DSH Agent"}
          </button>
        </div>
        <p className="fine-print cost-label">
            {loading
              ? "正在读取本地缓存…"
              : generating
                ? "正在搜索景点资料与游客评价，并撰写旅行手记…"
                : `${outdated ? "旧版解读可更新为 DSH 会话结果。" : ""}生成由 DSH Agent 执行 · ${detail ? "手动更新会产生新的模型与工具用量" : "生成后本地缓存"}`}
        </p>
        <AgentProgress api={api} active={generating} kind="detail" placeId={place.id} onRecover={onRecover} />
        {detail?.agent && <p className="fine-print">DSH 会话：{detail.agent.sessionId} · {detail.agent.model} <a href={detail.agent.url || settings.webUrl} target="_blank" rel="noreferrer">查看会话 <ExternalLink size={10} /></a></p>}
      </div>
    </Dialog>
  );
}
function App() {
  const [chinaCatalog, setChinaCatalog] = useState(null),
    [worldData, setWorldData] = useState(null),
    [worldMap, setWorldMap] = useState(null),
    [nation, setNation] = useState(null),
    [provinceMap, setProvinceMap] = useState(null),
    [province, setProvince] = useState(null),
    [city, setCity] = useState(null);
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem("whereto-map-mode") === "world" ? "world" : "china"; } catch { return "china"; }
  });
  const [country, setCountry] = useState(null), [region, setRegion] = useState(null);
  const [countryBoundary, setCountryBoundary] = useState(null), [worldMapLoading, setWorldMapLoading] = useState(false),
    [worldMapError, setWorldMapError] = useState(""), [mapRetry, setMapRetry] = useState(0);
  const rollingTimer = useRef(null);
  const catalog = useMemo(() => mergeCatalogs(chinaCatalog, worldData, nation), [chinaCatalog, worldData, nation]);
  const chinaScope = useMemo(() => catalog && ({ ...catalog, cities: catalog.cities.filter(c => c.countryId === "CHN"), places: catalog.places.filter(p => p.countryId === "CHN") }), [catalog]);
  useEffect(() => { try { localStorage.setItem("whereto-map-mode", mode); } catch {} }, [mode]);
  const [filter, setFilter] = useState("全部风景"),
    [search, setSearch] = useState(""),
    [activeSearch, setActiveSearch] = useState(false),
    [settings, setSettings] = useState({ connected: false, hasKey: false }),
    [state, setState] = useState({ favorites: [], history: [], visited: [] }),
    [runtime, setRuntime] = useState({}),
    [matching, setMatching] = useState(false);
  const [panel, setPanel] = useState(null),
    [selected, setSelected] = useState(null),
    [detail, setDetail] = useState(null),
    [detailLoading, setDetailLoading] = useState(false),
    [generating, setGenerating] = useState(false),
    [rolling, setRolling] = useState(false),
    [randomPlace, setRandomPlace] = useState(null),
    [toast, setToast] = useState(null),
    [error, setError] = useState(null),
    [busyIds, setBusyIds] = useState(new Set());
  const reqId = useRef(0),
    noticeTimer = useRef(null),
    [listTab, setListTab] = useState("favorites");
  const notify = (message, type = "success") => {
    setToast({ message, type });
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setToast(null), 5000);
  };
  const fail = (e) => notify(e.message || String(e), "error");
  const load = () => {
    setError(null);
    Promise.all([
      fetch(import.meta.env.BASE_URL + "data/catalog.json").then((r) => {
        if (!r.ok) throw Error("目录加载失败");
        return r.json();
      }),
      fetch(import.meta.env.BASE_URL + "data/maps/100000.json").then((r) => r.json()),
      api("/settings"),
      api("/state"),
      api("/runtime"),
      fetch(import.meta.env.BASE_URL + "data/world-catalog.json").then(r => { if (!r.ok) throw Error("世界目录加载失败"); return r.json(); }),
      fetch(import.meta.env.BASE_URL + "data/maps/world.json").then(r => { if (!r.ok) throw Error("世界地图加载失败"); return r.json(); }),
    ])
      .then(([c, n, s, st, rt, w, wm]) => {
        setChinaCatalog(c);
        setWorldData(w);
        setWorldMap(wm);
        setNation(normalize(n));
        setSettings(s);
        setState(st);
        setRuntime(rt);
      })
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    load();
    return () => { clearTimeout(noticeTimer.current); clearTimeout(rollingTimer.current); };
  }, []);
  useEffect(() => {
    if (!province) {
      setProvinceMap(null);
      return;
    }
    const controller = new AbortController();
    setProvinceMap(null);
    fetch(`${import.meta.env.BASE_URL}data/maps/${province.properties.adcode}.json`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error("地图未能加载，请重试。");
        return r.json();
      })
      .then((n) => setProvinceMap(normalize(n)))
      .catch((e) => {
        if (e.name !== "AbortError") fail(e);
      });
    return () => controller.abort();
  }, [province?.properties.adcode]);
  useEffect(() => {
    setCountryBoundary(null); setWorldMapError(""); setWorldMapLoading(false);
    if (mode !== "world" || !country) return;
    if (country.id === "CHN") { setCountryBoundary({ id: country.id, data: nation }); return; }
    if (!country.regionLabel) return;
    const controller = new AbortController();
    setWorldMapLoading(true);
    fetch(`${import.meta.env.BASE_URL}data/maps/world/${country.id}.json`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw Error("当地地图未能加载。"); return r.json(); })
      .then(data => { if (!controller.signal.aborted) setCountryBoundary({ id: country.id, data: normalize(data) }); })
      .catch(e => { if (e.name !== "AbortError") setWorldMapError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setWorldMapLoading(false); });
    return () => controller.abort();
  }, [mode, country?.id, nation, mapRetry]);
  const places = useMemo(() => scopedPlaces(catalog, { mode, province, country, region, city, filter }), [catalog, mode, province, country, region, city, filter]);
  useEffect(() => {
    clearTimeout(rollingTimer.current);
    setRolling(false);
    setRandomPlace(previous => places.some(p => p.id === previous?.id) ? previous : null);
  }, [places, mode]);
  const searchResults = useMemo(() => searchCatalog(catalog, search, mode), [catalog, search, mode]);
  const highlightedPlace = places.find(p => p.id === randomPlace?.id);
  const featured = useMemo(() => highlightedPlace || (mode === "china" ? places.find(p => p.name === "西湖风景名胜区") : places.find(p => p.kind === "landmark")) || places[0], [places, mode, highlightedPlace]);
  const selectProvince = p => { setProvince(p); setCity(null); };
  const selectCountry = c => { setCountry(c); setRegion(null); setCity(null); };
  const selectRegion = r => { setRegion(r); setCity(null); };
  const resetScope = () => { setProvince(null); setCountry(null); setRegion(null); setCity(null); };
  const switchMode = next => {
    if (mode === next) return;
    ++reqId.current; setSelected(null); setDetail(null); setDetailLoading(false);
    setRandomPlace(null);
    setMode(next); resetScope(); setSearch(""); setActiveSearch(false); setFilter("全部风景");
  };
  const focusCity = c => {
    if (!c) return;
    if (mode === "world" || c.countryId !== "CHN") {
      setMode("world"); setProvince(null);
      setCountry(catalog.countries.find(n => n.id === c.countryId));
      setRegion(catalog.regions.find(r => r.id === c.regionId && r.countryId === c.countryId) || null);
    } else setProvince(nation.features.find(f => String(f.properties.adcode) === c.provinceId));
    setCity(c);
  };
  const chooseSearchResult = result => {
    if (result.type === "country") selectCountry(result.value);
    else if (result.type === "region") {
      setCountry(catalog.countries.find(c => c.id === result.value.countryId)); selectRegion(result.value);
    } else if (result.type === "city") focusCity(result.value);
    else openPlace(result.value, true);
    setActiveSearch(false); setSearch("");
  };
  async function openPlace(p, zoom = false) {
    if (zoom) focusCity(catalog.cities.find((c) => c.id === p.cityId));
    setSelected(p);
    setDetail(null);
    setDetailLoading(true);
    setSearch("");
    setActiveSearch(false);
    const id = ++reqId.current;
    api("/places/" + p.id)
      .then((data) => {
        if (id === reqId.current) setDetail(data.detail);
      })
      .catch(fail)
      .finally(() => {
        if (id === reqId.current) setDetailLoading(false);
      });
    try {
      setState(
        await api("/state", {
          method: "PUT",
          body: JSON.stringify({ action: "visit", id: p.id }),
        }),
      );
    } catch (e) {
      fail(e);
    }
  }
  const favorite = async (id) => {
    if (busyIds.has(id)) return;
    setBusyIds((s) => new Set(s).add(id));
    try {
      const next = await api("/state", {
        method: "PUT",
        body: JSON.stringify({ action: "favorite", id }),
      });
      setState(next);
      notify(
        next.favorites.includes(id)
          ? "已收藏。下一次，就去这里。"
          : "已从心愿清单移除",
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusyIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  };
  async function generate() {
    if (generating) return;
    const target = selected;
    const id = reqId.current;
    setGenerating(true);
    try {
      const result = await api(`/places/${target.id}/generate`, {
        method: "POST",
        body: JSON.stringify({ refresh: !!detail }),
      });
      if (reqId.current === id) setDetail(result.detail);
      notify(
        result.cached
          ? "已读取本地 AI 解读，没有产生新费用。"
          : "旅行手记已生成并缓存。",
      );
    } catch (e) {
      fail(e);
    } finally {
      setGenerating(false);
    }
  }
  const visited = async (id) => {
    if (busyIds.has(id)) return;
    setBusyIds(s => new Set(s).add(id));
    try {
      const next = await api("/state", { method: "PUT", body: JSON.stringify({ action: "visited", id }) });
      setState(next);
      notify(next.visited.includes(id) ? "已记下这处走过的风景。" : "已撤销去过标记。");
    } catch (e) { fail(e); }
    finally { setBusyIds(s => { const n = new Set(s); n.delete(id); return n; }); }
  };
  const random = () => {
    if (rolling || !places.length) return;
    setRolling(true);
    rollingTimer.current = setTimeout(() => {
      const groups = [...new Set(places.map((p) => p.cityId))];
      const pick = (arr) =>
        arr[crypto.getRandomValues(new Uint32Array(1))[0] % arr.length];
      const cityId = pick(groups);
      const p = pick(places.filter((p) => p.cityId === cityId));
      setRolling(false);
      setRandomPlace(p);
    }, 700);
  };
  const closeDetail = () => {
    ++reqId.current;
    setSelected(null);
    setDetail(null);
  };
  if (error)
    return (
      <div className="boot-state">
        <Compass size={42} />
        <h2>山河暂时未能展开</h2>
        <p>{error}</p>
        <button className="button primary" onClick={load}>
          重新加载
        </button>
      </div>
    );
  if (!catalog || !nation)
    return (
      <div className="boot-state">
        <Compass className="slow-spin" size={42} />
        <p>正在展开山河…</p>
      </div>
    );
  const saved = catalog.places.filter((p) => state.favorites.includes(p.id));
  const history = state.history
    .map((id) => catalog.places.find((p) => p.id === id))
    .filter(Boolean);
  const suggestions = mode === "world"
    ? ["world-q243", "world-q45178", "world-q9202", "world-q43473"].map(id => catalog.places.find(p => p.id === id)).filter(Boolean)
    : ["西湖风景名胜区", "丽江古城景区", "黄山风景区", "故宫博物院"].map(n => catalog.places.find(p => p.name === n)).filter(Boolean);
  const scopeCities = mode === "world" ? catalog.cities.filter(c => c.countryId === country?.id && (!region || c.regionId === region.id)) : [];
  const scopeRegions = mode === "world" ? catalog.regions.filter(r => r.countryId === country?.id) : [];
  const displayCatalog = mode === "china" ? chinaScope : catalog;
  return (
    <>
      <header className="site-header">
        <button
          className="brand"
          onClick={() => {
            resetScope();
            setFilter("全部风景");
          }}
          aria-label="漫游whereto 首页"
        >
          <img src={import.meta.env.BASE_URL + "brand/mark.svg"} alt="" />
          <span>
            漫游<small>whereto</small>
          </span>
        </button>
        <nav aria-label="主导航">
          <button
            className={!panel ? "nav-active" : ""}
            onClick={() => {
              setPanel(null);
              document
                .querySelector("main")
                .scrollIntoView({ behavior: "smooth" });
            }}
          >
            <Compass size={15} />
            探索地图
          </button>
          <button
            onClick={() => {
              setListTab("favorites");
              setPanel("collection");
            }}
          >
            <Heart size={15} />
            心愿清单
            {state.favorites.length > 0 && (
              <span className="nav-count">{state.favorites.length}</span>
            )}
          </button>
          <button
            onClick={() => {
              setListTab("history");
              setPanel("collection");
            }}
          >
            <History size={15} />
            旅途足迹
          </button>
          <button onClick={() => setPanel("visited")}>
            <CheckCheck size={15} /> 去过
            {!!state.visited.length && <span className="nav-count">{state.visited.length}</span>}
          </button>
        </nav>
        <button
          className="settings-button"
          aria-label="本地设置"
          onClick={() => setPanel("settings")}
        >
          <Settings2 size={16} />
          <span>本地设置</span>
        </button>
      </header>
      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span className="tiny-leaf">
                <Leaf size={12} />
              </span>{" "}
              FOLLOW YOUR WANDERLUST
            </div>
            <h1>
              下一站，<span>山河自有答案。</span>
            </h1>
            <p>不必急着决定去哪里，让好奇心先出发。</p>
          </div>
          <div className="intro-side">
            <div className="mode-switch" role="group" aria-label="地图模式">
              <button aria-pressed={mode === "china"} onClick={() => switchMode("china")}>中国</button>
              <button aria-pressed={mode === "world"} onClick={() => switchMode("world")}>世界</button>
            </div>
            <span className="handwritten">
              Somewhere, something wonderful
              <br />
              is waiting to be found.
            </span>
            <span className="intro-note">
              <span /> 一张地图，无数种遇见
            </span>
          </div>
        </section>
        <section className="explore-layout" aria-label="旅行探索">
          <div className="map-panel">
            <div className="map-topline">
              <div className="breadcrumbs" aria-label="当前位置">
                <button onClick={resetScope}>{mode === "world" ? "世界" : "中国"}</button>
                {mode === "world" && country && <><ChevronRight size={12} /><button onClick={() => selectCountry(country)}>{country.name}</button></>}
                {mode === "world" && region && <><ChevronRight size={12} /><button onClick={() => setCity(null)}>{region.name}</button></>}
                {mode === "china" && province && <><ChevronRight size={12} /><button onClick={() => setCity(null)}>{short(province.properties.name)}</button></>}
                {city && <><ChevronRight size={12} /><span>{mode === "world" ? city.name : short(city.name)}</span></>}
                <span className="scope-count">{places.length} 处探索</span>
              </div>
              <div className="search-box">
                <Search size={15} />
                <input
                  aria-label={mode === "world" ? "搜索国家、行政区、城市或景点" : "搜索城市或景点"}
                  placeholder={mode === "world" ? "国家、城市、景点，中英文皆可…" : "找一座城，一处风景…"}
                  value={search}
                  onFocus={() => setActiveSearch(true)}
                  onBlur={() => setTimeout(() => setActiveSearch(false), 180)}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setActiveSearch(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setActiveSearch(false);
                    if (e.key === "Enter" && searchResults[0]) {
                      const result = searchResults[0];
                      chooseSearchResult(result);
                    }
                  }}
                />
                {search && (
                  <button
                    aria-label="清空搜索"
                    className="icon-button"
                    onClick={() => setSearch("")}
                  >
                    <X size={13} />
                  </button>
                )}
                {search && activeSearch && (
                  <div
                    className="search-results"
                    role="listbox"
                    aria-label="搜索结果"
                  >
                    {!searchResults.length ? (
                      <p>还没有找到，试试城市全名。</p>
                    ) : (
                      searchResults.map((r) => (
                        <button
                          key={r.type + r.value.id}
                          className={r.type !== "city" && state.visited.includes(r.value.id) ? "visited-search-result" : ""}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            chooseSearchResult(r);
                          }}
                        >
                          <MapPin size={14} />
                          <span>
                            {r.value.name}
                            {r.type !== "city" && state.visited.includes(r.value.id) ? " · 已去过" : ""}
                            <small>
                              {r.type === "country" ? "国家／地区" : r.type === "region" ? catalog.countries.find(c => c.id === r.value.countryId)?.name : placeLocation(r.value)}
                            </small>
                          </span>
                          <ChevronRight size={13} />
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="map-filters" aria-label="风景筛选">
              {categories.map(([name, Icon]) => (
                <button
                  key={name}
                  className={filter === name ? "filter-active" : ""}
                  onClick={() => setFilter(name)}
                >
                  <Icon size={13} />
                  {name}
                </button>
              ))}
            </div>
            {mode === "world" && <div className="world-navigation">
              <label>国家／地区<select aria-label="选择国家或地区" value={country?.id || ""} onChange={e => selectCountry(catalog.countries.find(c => c.id === e.target.value) || null)}>
                <option value="">整个世界</option>{catalog.countries.slice().sort((a,b) => a.name.localeCompare(b.name, "zh-CN")).map(c => <option key={c.id} value={c.id}>{c.name} · {c.englishName}</option>)}
              </select></label>
              {country?.regionLabel && <label>{country.regionLabel}<select aria-label={`选择${country.regionLabel}`} value={region?.id || ""} onChange={e => selectRegion(scopeRegions.find(r => r.id === e.target.value) || null)}>
                <option value="">全部{country.regionLabel}</option>{scopeRegions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select></label>}
              {country && <label>城市／目的地<select aria-label="选择城市" value={city?.id || ""} onChange={e => { const c = scopeCities.find(c => c.id === e.target.value); if (c) focusCity(c); else setCity(null); }}>
                <option value="">{scopeCities.length ? "选择一座城市" : "此范围暂未收录城市"}</option>{scopeCities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>}
              <p>{country ? country.hierarchyNote : "国家 → 各国区划 → 城市 → 景点；城市国家可直接进入城市。"}</p>
            </div>}
            {mode === "world" ? <WorldMap world={worldMap} countryMap={countryBoundary && countryBoundary.id === country?.id ? countryBoundary.data : null}
              catalog={catalog} country={country} region={region} city={city} places={places}
              highlightedPlace={highlightedPlace}
              onCountry={selectCountry} onRegion={selectRegion} onCity={focusCity} onPlace={openPlace}
              favorites={state.favorites} visited={state.visited} randomizing={rolling}
              loading={worldMapLoading} error={worldMapError} onRetry={() => setMapRetry(v => v + 1)} /> : <TravelMap
              nation={nation}
              provinceMap={provinceMap}
              catalog={chinaScope}
              province={province}
              city={city}
              onProvince={selectProvince}
              onCity={setCity}
              onPlace={(p) => openPlace(p)}
              selected={featured}
              highlightedPlace={highlightedPlace}
              filter={filter}
              randomizing={rolling}
              favorites={state.favorites}
              visited={state.visited}
              onMarkedPlace={p => openPlace(p, true)}
            />}
            <div className="map-bottomline">
              <span>山河很大，慢慢去看。</span>
              <small>{mode === "world" ? "地图：Natural Earth · 探索示意" : "地图：阿里云 DataV · 探索示意"}</small>
            </div>
          </div>
          <aside className="discovery">
            <div className="discovery-heading">
              <span className="eyebrow">A LITTLE SERENDIPITY</span>
              <span className="small-counter">01 / ∞</span>
            </div>
            <h2>偶然，也是一种方向。</h2>
            <p className="discovery-copy">把目的地交给一点点运气。</p>
            <button
              className="random-button"
              onClick={random}
              disabled={rolling || !places.length}
            >
              <Shuffle className={rolling ? "spin" : ""} size={18} />
              <span>{rolling ? "让风景找到你…" : "随心出发"}</span>
              <ArrowUpRight size={18} />
            </button>
            <p className="fine-print random-cost">
              {city ? city.name : mode === "world" ? region?.name || country?.name || "世界范围" : province ? short(province.properties.name) : "中国境内"}
              随机探索 · 免费 · AI 解读按需生成
            </p>
            {highlightedPlace && <p className="random-result" role="status">已选中{highlightedPlace.name}，点击下方卡片查看详情。</p>}
            <button className="visited-entry" onClick={() => setPanel("visited")}>
              <CheckCheck size={16} /><span>{matching ? "正在整理去过的风景…" : "标记去过的风景"}</span><ArrowUpRight size={15} />
            </button>
            {featured ? (
              <article className={`feature-card ${state.visited.includes(featured.id) ? "is-visited" : ""}`}>
                <button
                  className="feature-image"
                  onClick={() => openPlace(featured, true)}
                >
                  <PlaceImage place={featured} />
                  <span className="image-tag">{featured.category}</span>
                  <span className="photo-note">{imageLabel(featured)}</span>
                </button>
                <div className="feature-card-body">
                  <div className="feature-kicker">
                    <span>
                      <MapPin size={12} />
                      {placeLocation(featured)}
                    </span>
                    <button
                      className={`heart-button ${state.favorites.includes(featured.id) ? "hearted" : ""}`}
                      aria-label={`${state.favorites.includes(featured.id) ? "取消收藏" : "收藏"}${featured.name}`}
                      onClick={() => favorite(featured.id)}
                      disabled={busyIds.has(featured.id)}
                    >
                      <Heart
                        size={19}
                        fill={
                          state.favorites.includes(featured.id)
                            ? "currentColor"
                            : "none"
                        }
                      />
                    </button>
                  </div>
                  <h3>
                    <button onClick={() => openPlace(featured, true)}>
                      {featured.name.replace(/风景名胜区|风景区|景区$/g, "")}
                    </button>
                  </h3>
                  <p>{featured.intro}</p>
                  {state.visited.includes(featured.id) && <span className="visited-badge"><CheckCheck size={12} /> 已去过</span>}
                  <button
                    className="text-link"
                    onClick={() => openPlace(featured, true)}
                  >
                    走近这处风景 <ArrowRight size={15} />
                  </button>
                </div>
              </article>
            ) : (
              <div className="empty-small">
                <Leaf size={30} />
                <h3>这片风景，还在路上。</h3>
                <p>换一个筛选，看看别处的惊喜。</p>
                <button
                  className="text-link"
                  onClick={() => setFilter("全部风景")}
                >
                  查看全部风景 <ArrowRight size={14} />
                </button>
              </div>
            )}
            <div className="private-footnote">
              <ShieldCheck size={14} />
              <span>心愿与手记，只留在你的本机。</span>
            </div>
          </aside>
        </section>
        {mode === "world" && <section className="scope-browser world-scope">
          <div className="section-title"><div><span className="eyebrow">SLOW DOWN & EXPLORE</span>
            <h2>{city ? `${city.name}，值得停留的地方` : region ? `从${region.name}的一座城开始` : country ? `${country.name}，下一程从这里开始` : "从一个国家开始，慢慢看世界。"}</h2></div></div>
          <p className="world-coverage">{city ? "具体景点与城市漫步入口分别标注；照片提供来源与许可，示意图明确标识。" : "本地目录收录代表城市和部分地标；空白区表示尚未收录，仍可选择并查看地图。"}{country && !city ? " 国家及区划默认展示主要陆地，岛屿与海外地区可通过区划列表切换。" : ""}</p>
          {!country ? <div className="city-chips">{["CHN","JPN","FRA","ITA","GBR","USA","AUS","SGP","THA","ZAF","BRA","EGY"].map(id => catalog.countries.find(c => c.id === id)).filter(Boolean).map(c => <button key={c.id} onClick={() => selectCountry(c)}>{c.name}<ArrowUpRight size={12} /></button>)}</div>
            : city ? <div className="scope-cards">{places.map(p => <button key={p.id} className={`scope-card ${state.visited.includes(p.id) ? "is-visited" : ""}`} onClick={() => openPlace(p)}>
                <PlaceImage place={p} loading="lazy" /><span><small>{p.kind === "city-walk" ? "城市探索入口" : p.category} · {imageLabel(p)}</small><strong>{p.name}</strong>{state.visited.includes(p.id) && <small>✓ 已去过</small>}</span><ArrowUpRight size={16} />
              </button>)}{!places.length && <p>此筛选下暂无景点。试试“全部风景”。</p>}</div>
            : <>{!region && country.regionLabel && <div className="city-chips region-chips">{scopeRegions.map(r => <button key={r.id} onClick={() => selectRegion(r)}>{r.name}<small>{catalog.cities.filter(c => c.countryId === country.id && c.regionId === r.id).length} 城市 · {catalog.places.filter(p => p.regionId === r.id && p.kind === "landmark").length} 景点</small><ArrowUpRight size={12} /></button>)}</div>}
              {(region || !country.regionLabel) && <div className="city-chips">{scopeCities.map(c => <button key={c.id} onClick={() => focusCity(c)}>{c.name}<ArrowUpRight size={12} /></button>)}</div>}
              {!scopeCities.length && <p className="world-empty">此范围暂未收录城市或景点。可返回上一级，或选择其他地区继续探索。</p>}
            </>}
        </section>}
        {mode === "china" && province && (
          <section className="scope-browser">
            <div className="section-title">
              <span className="eyebrow">
                {city ? "TAKE A CLOSER LOOK" : "SLOW DOWN & EXPLORE"}
              </span>
              <h2>
                {city
                  ? `${short(city.name)}，值得停留的地方`
                  : `从${short(province.properties.name)}的一座城开始`}
              </h2>
            </div>
            {!city ? (
              <div className="city-chips">
                {catalog.cities
                  .filter(
                    (c) => c.provinceId === String(province.properties.adcode),
                  )
                  .map((c) => (
                    <button onClick={() => setCity(c)} key={c.id}>
                      {short(c.name)}
                      <ArrowUpRight size={12} />
                    </button>
                  ))}
              </div>
            ) : (
              <div className="scope-cards">
                {places.map((p) => (
                  <button
                    className={`scope-card ${state.visited.includes(p.id) ? "is-visited" : ""}`}
                    key={p.id}
                    onClick={() => openPlace(p)}
                  >
                    <PlaceImage place={p} loading="lazy" />
                    <span>
                      <small>
                        {p.category}
                        {p.imageKind === "ai-illustration"
                          ? " · AI 图 · $0"
                          : ""}
                        {p.precision === "city-reference"
                          ? " · 城市参考点"
                          : ""}
                      </small>
                      <strong>{p.name}</strong>
                      {state.visited.includes(p.id) && <small>✓ 已去过</small>}
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
                {!places.length && <p>此筛选下暂无景点。试试“全部风景”。</p>}
              </div>
            )}
          </section>
        )}
        <section className="inspiration">
          <div className="section-title">
            <div>
              <span className="eyebrow">COLLECT MOMENTS, NOT MILES</span>
              <h2>总有一处，让你心生向往。</h2>
            </div>
            <span className="section-aside">从一座城，认识一种生活。</span>
          </div>
          <div className="inspiration-grid">
            {suggestions.map((p, i) => (
              <button
                className={`inspiration-card ${state.visited.includes(p.id) ? "is-visited" : ""}`}
                key={p.id}
                onClick={() => openPlace(p, true)}
              >
                <div className="inspiration-image">
                  <PlaceImage place={p} loading="lazy" />
                </div>
                <div>
                  <small>
                    0{i + 1} / {short(p.province)}
                  </small>
                  <h3>{p.name.replace(/风景名胜区|风景区|景区$/g, "")}</h3>
                  <span>{p.category}{state.visited.includes(p.id) ? " · 已去过" : ""}</span>
                </div>
                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
        </section>
        <footer>
          <span>
            <Leaf size={13} />
            漫游whereto · 跟着好奇心，慢慢看世界。
          </span>
          <span>
            {displayCatalog.cities.length} 座城市与地区
            <span className="footer-dot">·</span>
            {displayCatalog.places.length} 处探索<span className="footer-dot">·</span>
            本地优先
          </span>
        </footer>
        <p className="lan-address">
          {runtime.lanUrl ? <>同一局域网手机访问：<a href={runtime.lanUrl}>{runtime.lanUrl}</a> <span>· {runtime.interfaceName}</span></>
            : "未找到 192.168 开头的以太网地址，当前仅支持本机访问。"}
        </p>
      </main>
      {panel === "settings" && (
        <Settings
          settings={settings}
          canManage={runtime.canManageSettings}
          onClose={() => setPanel(null)}
          onSaved={(s) => {
            setSettings(s);
            setPanel(null);
            notify("设置已保存在本机。");
          }}
          onError={fail}
        />
      )}
      {panel === "visited" && <Dialog title="去过的风景" onClose={() => setPanel(null)}>
        <VisitedPanel catalog={catalog} state={state} settings={settings} api={api}
          matching={matching} onBusy={setMatching} onState={setState} onVisited={visited}
          onPlace={p => { setPanel(null); openPlace(p, true); }} onError={fail}
          onResult={result => notify(`已对应 ${result.ids.length} 处景点，新增 ${result.added.length} 个去过标记${result.cached ? " · 使用缓存 $0" : ""}。`)}
          onSettings={() => setPanel("settings")} />
      </Dialog>}
      {panel === "collection" && (
        <Dialog
          title={listTab === "favorites" ? "心愿清单" : "旅途足迹"}
          onClose={() => setPanel(null)}
        >
          <div className="modal-heading">
            <span className="eyebrow">PLACES CLOSE TO YOUR HEART</span>
            <h2>
              {listTab === "favorites"
                ? "把向往，慢慢收藏。"
                : "每一次好奇，都算数。"}
            </h2>
            <p>记录留在本机，下次打开还在这里。</p>
          </div>
          <div className="collection-tabs">
            <button
              className={listTab === "favorites" ? "active" : ""}
              onClick={() => setListTab("favorites")}
            >
              心愿清单 {saved.length}
            </button>
            <button
              className={listTab === "history" ? "active" : ""}
              onClick={() => setListTab("history")}
            >
              最近探索 {history.length}
            </button>
          </div>
          <div className="collection-list">
            {(listTab === "favorites" ? saved : history).map((p) => (
              <article key={p.id} className={state.visited.includes(p.id) ? "is-visited" : ""}>
                <button
                  className="collection-open"
                  onClick={() => {
                    setPanel(null);
                    openPlace(p, true);
                  }}
                >
                  <PlaceImage place={p} />
                  <span>
                    <small>
                      {placeLocation(p)}
                    </small>
                    <strong>{p.name}</strong>
                    <span>
                      {p.category}
                      {state.visited.includes(p.id) ? " · 已去过" : ""}
                      {p.imageKind === "ai-illustration" ? " · AI 图 · $0" : ""}
                    </span>
                  </span>
                </button>
                <button
                  className={`heart-button ${state.favorites.includes(p.id) ? "hearted" : ""}`}
                  aria-label={`${state.favorites.includes(p.id) ? "取消收藏" : "收藏"}${p.name}`}
                  onClick={() => favorite(p.id)}
                  disabled={busyIds.has(p.id)}
                >
                  <Heart
                    size={18}
                    fill={
                      state.favorites.includes(p.id) ? "currentColor" : "none"
                    }
                  />
                </button>
              </article>
            ))}
            {!(listTab === "favorites" ? saved : history).length && (
              <div className="collection-empty">
                <Heart size={40} strokeWidth={1} />
                <h3>你的下一段旅程，还是一张白纸。</h3>
                <p>打开一处风景，点亮爱心，把想去的地方留住。</p>
                <button
                  className="button primary"
                  onClick={() => setPanel(null)}
                >
                  去地图上走走 <ArrowRight size={16} />
                </button>
              </div>
            )}
          </div>
        </Dialog>
      )}
      {selected && panel !== "settings" && (
        <Detail
          place={selected}
          detail={detail}
          loading={detailLoading}
          generating={generating}
          settings={settings}
          favorite={state.favorites.includes(selected.id)}
          onFavorite={favorite}
          visited={state.visited.includes(selected.id)}
          onVisited={visited}
          onGenerate={generate}
          onRecover={async sessionId => {
            const id = reqId.current;
            try { const result = await api(`/places/${selected.id}/result`, { method: "POST", body: JSON.stringify({ sessionId }) }); if (id === reqId.current) setDetail(result.detail); notify("已读取 DSH 会话结果，没有再次调用模型。"); }
            catch (error) { fail(error); }
          }}
          onClose={closeDetail}
          onSettings={() => {
            setSelected(null);
            setPanel("settings");
          }}
        />
      )}
      {toast && (
        <div
          className={`toast ${toast.type}`}
          role={toast.type === "error" ? "alert" : "status"}
        >
          {toast.type === "error" ? <X size={16} /> : <Check size={16} />}
          <span>{toast.message}</span>
          <button aria-label="关闭通知" onClick={() => setToast(null)}>
            <X size={14} />
          </button>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
