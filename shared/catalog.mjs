export function mergeCatalogs(china, world, chinaMap) {
  if (!china || !world || !chinaMap) return null;
  const cn = p => ({ ...p, countryId: 'CHN', country: '中国', regionId: p.provinceId, timezone: 'Asia/Shanghai' });
  return { ...china, countries: world.countries,
    regions: [...world.regions, ...chinaMap.features.filter(f => f.properties.name).map(f => ({
      id: String(f.properties.adcode), name: f.properties.name, countryId: 'CHN',
      center: f.properties.center || f.properties.centroid,
    }))],
    cities: [...china.cities.map(cn), ...world.cities],
    places: [...china.places.map(cn), ...world.places],
  };
}

export function scopedPlaces(catalog, { mode, province, country, region, city, filter = '全部风景' }) {
  return catalog?.places.filter(p =>
    (mode !== 'china' || p.countryId === 'CHN') &&
    (!province || mode !== 'china' || p.provinceId === String(province.properties.adcode)) &&
    (!country || mode !== 'world' || p.countryId === country.id) &&
    (!region || mode !== 'world' || p.regionId === region.id) &&
    (!city || p.cityId === city.id) &&
    (filter === '全部风景' || p.category === filter)) || [];
}

export function searchCatalog(catalog, term, mode) {
  const q = term.trim().toLocaleLowerCase();
  if (!q || !catalog) return [];
  const matches = value => [value.name, value.englishName, value.city, value.province, value.country].filter(Boolean).join(' ').toLocaleLowerCase().includes(q);
  const scoped = values => mode === 'china' ? values.filter(v => v.countryId === 'CHN') : values;
  return [
    ...(mode === 'world' ? catalog.countries.filter(matches).slice(0, 4).map(value => ({ type: 'country', value })) : []),
    ...(mode === 'world' ? catalog.regions.filter(matches).slice(0, 4).map(value => ({ type: 'region', value })) : []),
    ...scoped(catalog.cities).filter(matches).slice(0, 5).map(value => ({ type: 'city', value })),
    ...scoped(catalog.places).filter(matches).slice(0, 6).map(value => ({ type: 'place', value })),
  ];
}

export function placeLocation(p) {
  return [...new Set([p.countryId !== 'CHN' && p.country, p.province, p.city].filter(Boolean))].join(' · ');
}
