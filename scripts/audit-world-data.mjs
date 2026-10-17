import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const data=JSON.parse(await fs.readFile(path.join(root,'public/data/world-catalog.json'),'utf8'));
const count=places=>({landmarks:places.filter(p=>p.kind==='landmark').length,cityWalks:places.filter(p=>p.kind==='city-walk').length,
  photos:places.filter(p=>p.imageKind==='reference').length,illustrations:places.filter(p=>p.imageKind==='illustration').length,
  unavailablePhotos:places.filter(p=>p.imageKind==='unavailable').length});
const countries=data.countries.filter(c=>c.id!=='CHN').map(c=>({id:c.id,name:c.name,
  ...count(data.places.filter(p=>p.countryId===c.id)),cities:data.cities.filter(city=>city.countryId===c.id).length,
  regions:data.regions.filter(r=>r.countryId===c.id).map(r=>({id:r.id,name:r.name,...count(data.places.filter(p=>p.regionId===r.id))}))}));
const report={updated:data.updated,totals:count(data.places),countriesWithLandmarks:countries.filter(c=>c.landmarks).length,countries};
await fs.writeFile(path.join(root,'docs/world-data-coverage.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({totals:report.totals,countriesWithLandmarks:report.countriesWithLandmarks,priority:countries.filter(c=>['USA','RUS'].includes(c.id))},null,2));
