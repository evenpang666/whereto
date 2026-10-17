import fs from 'node:fs/promises';
import path from 'node:path';
import { find } from 'geo-tz';
import { validTimezone } from '../shared/local-time.mjs';
const root=path.resolve(import.meta.dirname,'..');
const file=path.join(root,'public/data/world-catalog.json');
const data=JSON.parse(await fs.readFile(file,'utf8'));
const zone=([lon,lat])=>find(lat,lon)[0];
for(const city of data.cities) city.timezone=zone(city.center);
const cities=new Map(data.cities.map(c=>[c.id,c]));
for(const place of data.places) {
  // Curated landmark zones take precedence; city walks use the city reference point.
  place.timezone=validTimezone(place.timezone) || (place.kind==='city-walk' ? cities.get(place.cityId).timezone : zone(place.coordinates));
}
await fs.writeFile(file,JSON.stringify(data)+'\n');
console.log(`Assigned offline IANA time zones to ${data.cities.length} cities and ${data.places.length} entries.`);
