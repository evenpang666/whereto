import React, { useLayoutEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';

export function SelectedLandmark({ place, point, animatePosition = false }) {
  const marker = useRef(null);
  const [size, setSize] = useState(1);
  useLayoutEffect(() => {
    const svg = marker.current?.ownerSVGElement;
    if (!svg) return;
    const resize = () => {
      const matrix = svg.getScreenCTM();
      const scale = matrix && Math.hypot(matrix.a, matrix.b);
      if (scale > 0) setSize(1 / scale);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);
  if (!point?.every(Number.isFinite)) return null;
  const x = Math.max(26 * size, Math.min(940 - 26 * size, point[0]));
  const y = Math.max(44 * size, Math.min(580 - 25 * size, point[1]));
  const lines = place.name.match(/.{1,16}/gu) || [place.name];
  const width = Math.max(...lines.map(line => [...line].length)) * 12 + 24;
  const labelX = (Math.max((width / 2 + 10) * size, Math.min(940 - (width / 2 + 10) * size, x)) - x) / size;
  const height = lines.length * 18 + 14;
  const labelY = y - (52 + height) * size < 10 ? 14 : -52 - height;
  return <g ref={marker} className={`selected-landmark ${animatePosition ? 'animate-position' : ''}`}
    style={{ transform: `translate(${x}px, ${y}px)` }}
    data-interactive="true" role="img" aria-label={`当前选中地标：${place.name}`}>
    <title>{place.name}</title>
    <g transform={`scale(${size})`}>
      <g className="selected-landmark-icon" key={place.id}>
        <circle cy="-19" r="25" className="selected-landmark-halo" />
        <MapPin x={-19} y={-43} width={38} height={44} fill="currentColor" strokeWidth={1.6} />
      </g>
      <g className="selected-landmark-label" transform={`translate(${labelX}, ${labelY})`}>
        <rect x={-width / 2} width={width} height={height} rx="8" />
        <text textAnchor="middle">{lines.map((line, i) => <tspan key={i} x="0" y={20 + i * 18}>{line}</tspan>)}</text>
      </g>
    </g>
  </g>;
}
