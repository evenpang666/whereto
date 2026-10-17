import { geoArea } from 'd3-geo';

export function normalizeMap(collection) {
  const polygon = coordinates => {
    // Normalize each polygon separately: archipelagos can contain mixed winding.
    // Normalizing the entire MultiPolygon can turn tiny islands into whole spheres.
    const area = geoArea({ type: 'Polygon', coordinates });
    return area > Math.PI * 2 ? coordinates.map(r => r.slice().reverse()) : coordinates;
  };
  return { ...collection, features: collection.features.map(f => {
    if (!f.geometry || !['Polygon', 'MultiPolygon'].includes(f.geometry.type)) return f;
    const coordinates = f.geometry.type === 'Polygon'
      ? polygon(f.geometry.coordinates) : f.geometry.coordinates.map(polygon);
    return { ...f, geometry: { ...f.geometry, coordinates } };
  }) };
}

// Fit the largest land polygon so overseas possessions cannot shrink a country's main view.
// Other islands and territories remain directly accessible through the region selector.
export function mainLand(feature) {
  if (feature?.properties?.grouped || feature?.geometry?.type !== 'MultiPolygon') return feature;
  const polygons = feature.geometry.coordinates.map(coordinates => ({ type: 'Polygon', coordinates }));
  return polygons.reduce((a, b) => geoArea(a) > geoArea(b) ? a : b);
}
