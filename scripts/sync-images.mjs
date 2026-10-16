import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const file = path.join(root, "public/data/catalog.json");
const catalog = JSON.parse(await fs.readFile(file));
const decode = (s) =>
  s
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
const limit = Number(process.argv[2] || 10000);
const names = ["西湖风景名胜区", "故宫博物院", "丽江古城景区", "黄山风景区"];
const pending = [...catalog.places]
  .sort((a, b) => names.indexOf(b.name) - names.indexOf(a.name))
  .filter((p) => p.imageKind !== "photo")
  .slice(0, limit);
let count = 0;
async function acquire(p) {
  try {
    const query = `${p.name.replace(/风景名胜区|旅游景区|景区|风景区/g, "")} ${p.city} site:commons.wikimedia.org/wiki/File:`;
    const r = await fetch(
      `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&first=1`,
      { signal: AbortSignal.timeout(12000) },
    );
    if (!r.ok) throw Error(`搜索 ${r.status}`);
    const html = await r.text();
    const matches = [...html.matchAll(/\bm="(\{[^"<>]+\})"/g)]
      .map((x) => {
        try {
          return JSON.parse(decode(x[1]));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const found = matches.find(
      (x) =>
        x.purl?.includes("commons.wikimedia.org/wiki/File:") &&
        x.turl &&
        /^https:\/\/tse\d\.mm\.bing\.net\//.test(x.turl),
    );
    if (!found) throw Error("无可用开放图片");
    const image = await fetch(found.turl, {
      signal: AbortSignal.timeout(15000),
    });
    if (!image.ok || !image.headers.get("content-type")?.startsWith("image/"))
      throw Error("图片不可用");
    const buffer = Buffer.from(await image.arrayBuffer());
    if (buffer.length < 1500 || buffer.length > 5000000)
      throw Error("图片尺寸异常");
    const target = `/media/${p.id}.jpg`;
    await fs.writeFile(path.join(root, "public", target), buffer);
    p.image = target;
    p.imageKind = "photo";
    p.imageSource = {
      title: found.t || "Wikimedia Commons",
      url: found.purl,
      original: found.murl,
      thumbnail: found.turl,
      note: "开放图片搜索匹配，尚需人工确认画面与原页许可。原作者版权与署名要求见原始文件页。",
    };
    count++;
    console.log(`图片 ${count}: ${p.name}`);
  } catch (e) {
    console.log(`保留示意图：${p.name} (${e.message})`);
  }
}
for (let i = 0; i < pending.length; i += 4) {
  await Promise.all(pending.slice(i, i + 4).map(acquire));
  await fs.writeFile(file, JSON.stringify(catalog));
}
console.log(
  `本次缓存 ${count} 张照片。搜索匹配照片需人工核对，图片许可见原始 Commons 页面。`,
);
