import React, { useMemo, useRef, useState, useEffect } from 'react';
import { geoNaturalEarth1, geoMercator, geoPath } from 'd3-geo';
import { Compass, Plus, Minus, RotateCcw, MapPin, Heart, CheckCheck } from 'lucide-react';
import { normalizeMap, mainLand } from './geography.js';
import { mapCamera } from './map-camera.js';
import { useMapCamera } from './useMapCamera.js';
import { SelectedLandmark } from './SelectedLandmark.jsx';

export function WorldMap({ world, countryMap, catalog, country, region, city, places,
  onCountry, onRegion, onCity, onPlace, highlightedPlace, favorites, visited, randomizing, loading, error, onRetry }) {
  const scope = `${country?.id || ''}/${region?.id || ''}/${city?.id || ''}`;
  const [view, setView] = useState({ scope, zoom: 1, pan: [0, 0] });
  const { zoom, pan } = view.scope === scope ? view : { zoom: 1, pan: [0, 0] };
  const setZoom = update => setView(previous => ({ scope, zoom: update(previous.scope === scope ? previous.zoom : 1), pan: previous.scope === scope ? previous.pan : [0, 0] }));
  const setPan = next => setView({ scope, zoom, pan: next });
  const [hover, setHover] = useState(''), [dragging, setDragging] = useState(false);
  const drag = useRef(null), svg = useRef(null);
  const countries = useMemo(() => normalizeMap(world), [world]);
  const boundaries = countryMap;
  const targetProjection = useMemo(() => {
    const feature = region ? boundaries?.features.find(f => String(f.properties.id ?? f.properties.adcode) === region.id)
      : countries.features.find(f => f.properties.id === country?.id);
    const center = city?.center || region?.center || country?.center;
    if (!country) return geoNaturalEarth1().fitExtent([[30, 30], [910, 565]], { type: 'Sphere' });
    const projection = geoMercator().rotate([-center[0], 0]);
    if (city) {
      const coords = [city.center, ...places.map(p => p.coordinates)];
      const [x, y] = city.center;
      return projection.fitExtent([[90, 70], [850, 530]], { type: 'MultiPoint', coordinates: [...coords, [x - .08, y - .06], [x + .08, y + .06]] });
    }
    if (feature) return projection.fitExtent([[70, 50], [870, 540]], mainLand(feature));
    const [x, y] = center;
    return projection.fitExtent([[70, 50], [870, 540]], { type: 'MultiPoint', coordinates: [[x - .5, y - .4], [x + .5, y + .4]] });
  }, [countries, country, region, city, boundaries, places]);
  const targetCamera = useMemo(() => mapCamera(targetProjection, !!country, zoom, pan), [targetProjection, country, zoom, pan[0], pan[1]]);
  const geometry = useMapCamera(targetCamera, dragging);
  const path = useMemo(() => geoPath(geometry), [geometry]);
  useEffect(() => { setView({ scope, zoom: 1, pan: [0, 0] }); setHover(''); }, [scope]);
  const countryLabels = useMemo(() => {
    const ranks = new Map(countries.features.map(f => [f.properties.id, f.properties.labelRank || 9]));
    return catalog.countries.map(c => ({ ...c, rank: ranks.get(c.id) || 9 })).sort((a, b) => a.rank - b.rank);
  }, [countries, catalog.countries]);
  const cities = country ? catalog.cities.filter(c => c.countryId === country.id && (!region || c.regionId === region.id)) : [];
  const shownCities = cities.filter(c => !country?.regionLabel || region || !c.regionId);
  const pins = city ? places : !country ? catalog.places.filter(p => ['world-q243','world-q45178','world-q9202','world-q43473'].includes(p.id)) : [];
  const records = catalog.places.filter(p => (favorites.includes(p.id) || visited.includes(p.id)) && (!country || p.countryId === country.id));
  const marked = new Set(records.map(p => p.id));
  const keyboard = (e, fn) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
  const visible = p => p && p.every(Number.isFinite) && p[0] >= 20 && p[0] <= 920 && p[1] >= 20 && p[1] <= 565;
  function point(p) { return geometry(p); }
  return <div className={`map-canvas world-map ${dragging ? 'dragging' : ''}`}>
    <svg ref={svg} viewBox="0 0 940 630" role="group" aria-label="世界交互地图，选择国家、行政区、城市和景点"
      onPointerDown={e => { if (e.target.closest('[data-interactive]')) return; drag.current = { x: e.clientX, y: e.clientY, pan }; svg.current.setPointerCapture(e.pointerId); setDragging(true); }}
      onPointerMove={e => { if (!drag.current) return; const ratio = 940 / svg.current.getBoundingClientRect().width; setPan([drag.current.pan[0] + (e.clientX - drag.current.x) * ratio, drag.current.pan[1] + (e.clientY - drag.current.y) * ratio]); }}
      onPointerUp={() => { drag.current = null; setDragging(false); }} onPointerCancel={() => { drag.current = null; setDragging(false); }}>
      <defs><clipPath id="world-viewport"><rect x="0" y="0" width="940" height="580" /></clipPath></defs>
      <g clipPath="url(#world-viewport)">
        <g>
          {countries.features.filter(f => !country || f.properties.id === country.id).map((f, i) => <path key={f.properties.id} d={path(f)}
            className={`province shape-${i % 5} ${country ? 'province-selected' : ''} ${randomizing && i % 7 === 0 ? 'random-glow' : ''}`}
            vectorEffect="non-scaling-stroke" data-interactive="true" role="button" tabIndex={country ? -1 : 0}
            aria-label={`探索${f.properties.name}`} onClick={() => onCountry(catalog.countries.find(c => c.id === f.properties.id))}
            onKeyDown={e => keyboard(e, () => onCountry(catalog.countries.find(c => c.id === f.properties.id)))}
            onMouseEnter={() => setHover(f.properties.name)} onMouseLeave={() => setHover('')} />)}
          {country && boundaries?.features.filter(f => f.properties.name).map((f, i) => {
            const id = String(f.properties.id ?? f.properties.adcode), r = catalog.regions.find(r => r.id === id && r.countryId === country.id);
            return r && <path key={id} d={path(f)} className={`city-region shape-${i % 5} ${region?.id === id ? 'city-selected' : ''}`}
              data-interactive="true" role="button" tabIndex={city ? -1 : 0} aria-label={`探索${r.name}`} vectorEffect="non-scaling-stroke"
              onClick={() => onRegion(r)} onKeyDown={e => keyboard(e, () => onRegion(r))}
              onMouseEnter={() => setHover(r.name)} onMouseLeave={() => setHover('')} />;
          })}
        </g>
        {!country && (() => {
          const occupied = [];
          return countryLabels.map(c => {
            const pt = point(c.center); if (!visible(pt)) return null;
            const rank = c.rank;
            const width = c.name.length * 11 + 12;
            const box = [pt[0] - width / 2, pt[1] - 10, pt[0] + width / 2, pt[1] + 6];
            const showLabel = rank <= (zoom >= 3 ? 5 : zoom >= 1.8 ? 4 : 3) && !occupied.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
            if (showLabel) occupied.push(box);
            return <g key={c.id} transform={`translate(${pt})`} className="world-country-label" data-interactive="true"
              role="button" tabIndex={-1} aria-label={`选择${c.name}`} onClick={() => onCountry(c)}
              onMouseEnter={() => setHover(c.name)} onMouseLeave={() => setHover('')}>
              {showLabel ? <text textAnchor="middle">{c.name}</text> : rank >= 5 ? <circle r="1.8" /> : null}
            </g>;
          });
        })()}
        {!city && shownCities.map(c => {
          const pt = point(c.center); if (!visible(pt)) return null;
          return <g key={c.id} transform={`translate(${pt})`} className="city-point" data-interactive="true" role="button" tabIndex={0}
            aria-label={`探索${c.name}`} onClick={() => onCity(c)} onKeyDown={e => keyboard(e, () => onCity(c))}>
            <circle r="5" /><text y="-13" textAnchor="middle">{c.name}</text></g>;
        })}
        {[...pins.filter(p => !marked.has(p.id)), ...records].map(p => {
          if (p.id === highlightedPlace?.id) return null;
          const pt = point(p.coordinates); if (!visible(pt)) return null;
          const loved = favorites.includes(p.id), been = visited.includes(p.id);
          return <g key={p.id} transform={`translate(${pt})`} data-interactive="true" role="button" tabIndex={0}
            className={loved || been ? `marked-point ${been ? 'is-visited' : ''}` : 'site-point'}
            aria-label={`打开${p.name}${loved ? ' · 已收藏' : ''}${been ? ' · 已去过' : ''}`}
            onClick={() => onPlace(p, true)} onKeyDown={e => keyboard(e, () => onPlace(p, true))}
            onMouseEnter={() => setHover(p.name)} onMouseLeave={() => setHover('')}>
            {loved || been ? <><circle r="15" className="record-halo" />{loved ? <Heart x={-9} y={-9} width={18} height={18} fill="currentColor" /> : <CheckCheck x={-9} y={-9} width={18} height={18} />}{loved && been && <circle cx="11" cy="10" r="4" className="visited-dot" />}</>
              : <><circle className="pin-halo" r="13" /><circle className="pin-core" r="5" /></>}
            {city && <text y="-23" textAnchor="middle">{p.name.length > 18 ? p.name.slice(0,17) + '…' : p.name}</text>}
          </g>;
        })}
        {highlightedPlace && <SelectedLandmark place={highlightedPlace} point={point(highlightedPlace.coordinates)} />}
      </g>
    </svg>
    <div className="map-compass"><span>N</span><Compass size={35} strokeWidth={1} /></div>
    {hover && <div className="map-tooltip"><MapPin size={12} />{hover}</div>}
    {loading && <div className="world-map-status" role="status">正在展开当地地图…</div>}
    {error && <div className="world-map-status" role="alert">{error} <button onClick={onRetry}>重新加载</button></div>}
    <div className="map-controls">
      <button className="icon-button" aria-label="放大地图" onClick={() => setZoom(z => Math.min(8,z*1.3))}><Plus size={17} /></button>
      <button className="icon-button" aria-label="缩小地图" onClick={() => setZoom(z => Math.max(.7,z/1.3))}><Minus size={17} /></button><span />
      <button className="icon-button" aria-label="重置地图视角" onClick={() => setView({ scope, zoom: 1, pan: [0, 0] })}><RotateCcw size={15} /></button>
    </div>
    <div className="map-hint"><span className="status-dot" />{city ? '点击标记，打开一处风景' : region || country && !country.regionLabel ? '点击城市，继续探索' : country ? `选择${country.regionLabel}，让风景再近一点` : '选择一个国家，开始看世界'}<span className="hint-drag"> · 可拖动地图</span></div>
  </div>;
}
