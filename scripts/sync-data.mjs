import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "public/data");
await fs.mkdir(path.join(dir, "maps"), { recursive: true });
async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw Error(`${r.status}: ${url}`);
      return await r.json();
    } catch (e) {
      if (i === 2) throw e;
    }
  }
}
const nation = await get(
  "https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json",
);
await fs.writeFile(path.join(dir, "maps/100000.json"), JSON.stringify(nation));
const provinces = nation.features.filter((f) => f.properties.name);
const cities = [];
for (let i = 0; i < provinces.length; i += 5) {
  await Promise.all(
    provinces.slice(i, i + 5).map(async (p) => {
      const { adcode, name, center } = p.properties;
      const direct = [110000, 120000, 310000, 500000, 810000, 820000].includes(
        adcode,
      );
      let map;
      if (adcode === 710000) {
        map = { type: "FeatureCollection", features: [p] };
        // This upstream has no city polygons for Taiwan; retain explicit city points.
        const points = [
          ["710100", "台北市", 121.5654, 25.033],
          ["710200", "高雄市", 120.3014, 22.6273],
          ["710300", "台南市", 120.227, 22.9999],
          ["710400", "台中市", 120.6736, 24.1477],
          ["710500", "新竹市", 120.9686, 24.8039],
          ["710600", "嘉义市", 120.4491, 23.4801],
          ["710700", "基隆市", 121.7392, 25.1276],
          ["710800", "花莲县", 121.6015, 23.9872],
          ["710900", "南投县", 120.9876, 23.8388],
          ["711000", "台东县", 121.1458, 22.7613],
          ["711100", "宜兰县", 121.753, 24.759],
          ["711200", "新北市", 121.462, 25.012],
          ["711300", "桃园市", 121.301, 24.993],
          ["711400", "苗栗县", 120.821, 24.561],
          ["711500", "彰化县", 120.544, 24.075],
          ["711600", "云林县", 120.527, 23.709],
          ["711700", "屏东县", 120.488, 22.669],
          ["711800", "澎湖县", 119.579, 23.566],
          ["711900", "金门县", 118.318, 24.432],
          ["712000", "连江县", 119.949, 26.158],
        ];
        points.forEach(([id, n, x, y]) =>
          cities.push({
            id,
            name: n,
            provinceId: String(adcode),
            province: name,
            center: [x, y],
          }),
        );
        [
          ["712100", "新竹县", 121.0177, 24.8387],
          ["712200", "嘉义县", 120.2555, 23.4598],
        ].forEach(([id, n, x, y]) =>
          cities.push({
            id,
            name: n,
            provinceId: String(adcode),
            province: name,
            center: [x, y],
          }),
        );
      } else {
        map = await get(
          `https://geo.datav.aliyun.com/areas_v3/bound/${adcode}_full.json`,
        );
        if (direct)
          cities.push({
            id: String(adcode),
            name,
            provinceId: String(adcode),
            province: name,
            center,
          });
        else
          map.features
            .filter((f) => f.properties.name && f.properties.adcode)
            .forEach((f) =>
              cities.push({
                id: String(f.properties.adcode),
                name: f.properties.name,
                provinceId: String(adcode),
                province: name,
                center: f.properties.center || f.properties.centroid,
              }),
            );
      }
      await fs.writeFile(
        path.join(dir, `maps/${adcode}.json`),
        JSON.stringify(map),
      );
      console.log(`地图已缓存：${name}`);
    }),
  );
}
const scenic = await get(
  "https://loreroutes.com/data/china-5a-scenic-areas.json",
);
await fs.writeFile(path.join(dir, "5a-source.json"), JSON.stringify(scenic));
await fs.writeFile(
  path.join(dir, "cities.json"),
  JSON.stringify(cities.sort((a, b) => a.id.localeCompare(b.id))),
);
console.log(
  `${cities.length} 个城市/地区，${scenic.length} 条 5A 景点；运行 node scripts/build-catalog.mjs 构建目录。`,
);
