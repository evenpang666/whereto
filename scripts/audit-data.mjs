import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const data = JSON.parse(
  await fs.readFile(path.join(root, "public/data/catalog.json")),
);
const missingCities = data.cities.filter(
  (c) => !data.places.some((p) => p.cityId === c.id),
);
if (missingCities.length)
  throw Error("缺少景点：" + missingCities.map((c) => c.name).join("、"));
const coverage = {
  date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }),
  provinces: new Set(data.cities.map((c) => c.provinceId)).size,
  cities: data.cities.length,
  places: data.places.length,
  source5A: data.places.filter((p) => p.grade === "5A").length,
  cityReference: data.places.filter((p) => p.precision === "city-reference")
    .length,
  referenceImages: data.places.filter((p) =>
    ["reference", "photo"].includes(p.imageKind),
  ).length,
  aiIllustrations: data.places.filter((p) => p.imageKind === "ai-illustration")
    .length,
  illustrations: data.places.filter((p) => p.imageKind === "illustration")
    .length,
  missingCities: missingCities.length,
};
await fs.mkdir(path.join(root, "docs"), { recursive: true });
await fs.writeFile(
  path.join(root, "docs/data-coverage.json"),
  JSON.stringify(coverage, null, 2),
);
const csv = (value) => '"' + String(value ?? "").replaceAll('"', '""') + '"';
const rows = [
  [
    "id",
    "省份",
    "城市",
    "景点",
    "经度",
    "纬度",
    "坐标精度",
    "坐标来源",
    "图像类别",
    "配图来源",
    "资料来源",
  ],
  ...data.places.map((p) => [
    p.id,
    p.province,
    p.city,
    p.name,
    ...p.coordinates,
    p.precision,
    p.coordinateSource,
    p.imageKind,
    p.imageSource.url || p.imageSource.title || "",
    p.sources[0]?.url || "",
  ]),
];
await fs.writeFile(
  path.join(root, "docs/data-audit.csv"),
  "\ufeff" + rows.map((r) => r.map(csv).join(",")).join("\r\n"),
);
console.log(JSON.stringify(coverage));
