import { geoProjection, geoNaturalEarth1Raw, geoMercatorRaw } from 'd3-geo';

const origin = [470, 310];

export function mapCamera(projection, mercator, zoom = 1, pan = [0, 0]) {
  const scale = projection.scale() * zoom;
  const translate = projection.translate().map((v, i) => origin[i] + (v - origin[i]) * zoom + pan[i]);
  return {
    scale,
    center: translate.map((v, i) => (origin[i] - v) / scale),
    rotation: projection.rotate()[0],
    mercator: Number(mercator),
  };
}

export function interpolateCamera(from, to, t) {
  if (t <= 0) return from;
  if (t >= 1) return to;
  const mix = (a, b) => a + (b - a) * t;
  // Follow the shortest longitude arc, including destinations across the date line.
  const rotation = ((to.rotation - from.rotation + 540) % 360) - 180;
  return {
    scale: Math.exp(mix(Math.log(from.scale), Math.log(to.scale))),
    center: from.center.map((v, i) => mix(v, to.center[i])),
    rotation: from.rotation + rotation * t,
    mercator: mix(from.mercator, to.mercator),
  };
}

export function cameraProjection(camera) {
  // Morph the projection itself so switching from the world overview to a local
  // Mercator view does not replace every path in a single frame.
  const raw = (longitude, latitude) => {
    if (camera.mercator === 0) return geoNaturalEarth1Raw(longitude, latitude);
    // Mercator is undefined at the poles, which appear in the world geometry.
    const mercator = geoMercatorRaw(longitude, Math.max(-Math.PI / 2 + 1e-6, Math.min(Math.PI / 2 - 1e-6, latitude)));
    if (camera.mercator === 1) return mercator;
    const natural = geoNaturalEarth1Raw(longitude, latitude);
    return natural.map((v, i) => v + (mercator[i] - v) * camera.mercator);
  };
  return geoProjection(raw)
    .rotate([camera.rotation, 0])
    .scale(camera.scale)
    .translate(camera.center.map((v, i) => origin[i] - v * camera.scale))
    .clipExtent([[0, 0], [940, 580]]);
}
