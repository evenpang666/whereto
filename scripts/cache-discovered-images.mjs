import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const file = path.join(root, "public/data/catalog.json");
const catalog = JSON.parse(await fs.readFile(file));
const records = [
  ...new Map(
    JSON.parse(
      await fs.readFile(path.join(root, "scripts/discovered-images.json")),
    ).map((entry) => [entry.id, entry]),
  ).values(),
];
let done = 0;
for (let i = 0; i < records.length; i += 6) {
  await Promise.all(
    records.slice(i, i + 6).map(async (entry) => {
      const p = catalog.places.find((x) => x.id === entry.id);
      if (!p || p.imageKind !== "illustration") return;
      try {
        const u = new URL(entry.image);
        if (
          u.protocol !== "https:" ||
          /localhost|\.local$|^\d+\./i.test(u.hostname)
        )
          return;
        const r = await fetch(u, {
          signal: AbortSignal.timeout(10000),
          headers: {
            "User-Agent": "Mozilla/5.0 (Whereto Local Travel Catalog)",
            Referer: new URL(entry.page).href,
          },
        });
        const type = r.headers.get("content-type") || "";
        if (
          !r.ok ||
          !type.startsWith("image/") ||
          Number(r.headers.get("content-length") || 0) > 8000000
        )
          return;
        const bytes = Buffer.from(await r.arrayBuffer());
        if (bytes.length < 2500 || bytes.length > 8000000) return;
        const ext = type.includes("webp")
          ? "webp"
          : type.includes("png")
            ? "png"
            : "jpg";
        p.image = `/media/${p.id}.${ext}`;
        await fs.writeFile(path.join(root, "public", p.image), bytes);
        p.imageKind = "reference";
        p.imageSource = {
          title: entry.title.replace(/[^]*/g, ""),
          url: entry.page,
          original: entry.image,
          note: "公开网页参考配图，可能带水印；原图版权归原作者，不纳入代码许可。人工核对前不认定为实拍或精确点位。",
        };
        console.log(`${++done} 张参考图：${p.name}`);
      } catch {}
    }),
  );
  await fs.writeFile(file, JSON.stringify(catalog));
}
console.log(`本次缓存 ${done} 张。所有来源随 catalog.json 保存。`);
