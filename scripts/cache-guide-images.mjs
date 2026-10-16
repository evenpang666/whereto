import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const file = path.join(root, "public/data/catalog.json");
const catalog = JSON.parse(await fs.readFile(file));
let done = 0;
for (let i = 0; i < catalog.places.length; i += 6) {
  await Promise.all(
    catalog.places
      .slice(i, i + 6)
      .filter((p) => p.guideUrl && p.imageKind !== "photo")
      .map(async (p) => {
        try {
          const page = await fetch(p.guideUrl, {
            signal: AbortSignal.timeout(12000),
          });
          if (!page.ok) return;
          const text = await page.text();
          const img = text.match(
            /<img[^>]+class="article-hero"[^>]+src="([^"]+)"/,
          );
          if (!img) return;
          const url = new URL(img[1], p.guideUrl);
          if (
            url.hostname !== "loreroutes.com" ||
            !url.pathname.startsWith("/images/")
          )
            return;
          const response = await fetch(url, {
            signal: AbortSignal.timeout(12000),
          });
          if (
            !response.ok ||
            !response.headers.get("content-type")?.startsWith("image/")
          )
            return;
          const bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length < 2000 || bytes.length > 5000000) return;
          p.image = `/media/${p.id}${path.extname(url.pathname)}`;
          await fs.writeFile(path.join(root, "public", p.image), bytes);
          p.imageKind = "reference";
          p.imageSource = {
            title: "Lore Routes · 景点参考配图",
            url: p.guideUrl,
            original: url.href,
            note: "来源网页配图，未验证实拍属性；原图版权归原权利人，不包含在项目代码许可中。",
          };
          console.log(`已缓存 ${++done}：${p.name}`);
        } catch {}
      }),
  );
  await fs.writeFile(file, JSON.stringify(catalog));
}
console.log(`完成 ${done} 张来源参考图。`);
