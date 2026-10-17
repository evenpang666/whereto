import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const data = JSON.parse(await fs.readFile(path.join(root, 'public/data/world-catalog.json'), 'utf8'));
const photos = JSON.parse(await fs.readFile(path.join(root, 'public/data/world-city-photos.json'), 'utf8'));
const cell = value => String(value || '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const rows = Object.values(photos).sort((a, b) => a.countryId.localeCompare(b.countryId) || a.cityName.localeCompare(b.cityName, 'zh'));
let content = '# 世界城市照片署名\n\n';
content += `${rows.length} 个城市漫步入口的本地照片。图片按城市实体、坐标与作品资料匹配；城市参考画面不代表完整步行路线。\n\n`;
content += '照片由原作者按各自许可提供，不属于项目代码 MIT 许可；浏览时不访问外部图片服务器。既有具体景点及其同城参考照片见 [景点照片署名](world-photo-credits.md)。\n\n';
content += '| 城市／国家 | 作者 | 作品日期 | 许可 | 原作及来源 | 额外署名 |\n| --- | --- | --- | --- | --- | --- |\n';
for (const row of rows) {
  const source = row.imageSource;
  const city = data.cities.find(c => c.id === row.cityId);
  const original = `[${source.url.includes('commons.wikimedia.org') ? 'Commons 文件页' : '原始作品页'}](${source.url})` + (source.sourcePage ? ` · [原始来源](${source.sourcePage})` : '');
  content += `| ${cell(row.cityName)}／${cell(city?.country || row.countryId)} | ${cell(source.author)} | ${cell(source.date)} | [${cell(source.license)}](${source.licenseUrl}) | ${original} | ${cell(source.attribution)} |\n`;
}
await fs.writeFile(path.join(root, 'docs/world-city-photo-credits.md'), content);
const report = {
  updated: data.updated,
  places: data.places.length,
  landmarks: data.places.filter(p => p.kind === 'landmark').length,
  cityWalks: data.places.filter(p => p.kind === 'city-walk').length,
  cityPhotographs: rows.length,
  localRasterPhotos: data.places.filter(p => /\.(?:jpe?g|png|webp)$/i.test(p.image || '') && p.imageKind === 'reference').length,
  illustrations: data.places.filter(p => p.imageKind.includes('illustration') || p.image?.endsWith('.svg')).map(p => ({id: p.id, name: p.name, country: p.country})),
  unavailable: data.places.filter(p => !p.image).map(p => ({id: p.id, name: p.name, country: p.country})),
};
await fs.writeFile(path.join(root, 'docs/world-photo-coverage.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({...report, illustrations: report.illustrations.length, unavailable: report.unavailable.length}));
