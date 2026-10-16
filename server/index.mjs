import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LocalStore } from "./store.mjs";
import { selectLan, allowedHost, allowedClient, isLoopback, isLocalHost } from "./network.mjs";
import { emptyState, normalizeState, matchText, prepareMatch, matchVisited } from "./visited.mjs";
import { createWeatherService } from "./weather.mjs";
import {
  defaults,
  estimate,
  validateSettings,
  generateDetail,
  DETAIL_VERSION,
  detailFromTask,
} from "./harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};
export async function createApp({
  dataDir = path.join(root, ".local"),
  fetchImpl = fetch,
  lan = selectLan(),
  agentBackend = null,
} = {}) {
  const store = new LocalStore(dataDir);
  const catalog = JSON.parse(
    await fs.readFile(path.join(root, "public/data/catalog.json"), "utf8"),
  );
  const placeMap = new Map(catalog.places.map((p) => [p.id, p]));
  const inflight = new Set();
  let generation = null, generationAbort = null;
  const getWeather = createWeatherService({ fetchImpl });
  const safeConfig = async c => ({ ...validateSettings(c), ...(agentBackend ? await agentBackend.describe(c) : { connected: false }),
    hasKey: !!agentBackend, estimate: estimate(), managedBy: "dsh" });
  const progress = update => { generation = { ...generation, ...update }; };
  const begin = (kind, placeId) => { generationAbort = new AbortController(); generation = { kind, placeId, status: "starting", message: "正在创建 DSH 会话" }; return generationAbort.signal; };
  const json = (res, status, value) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(value));
  };
  async function body(req) {
    let raw = "";
    req.setEncoding("utf8");
    for await (const part of req) {
      raw += part;
      if (Buffer.byteLength(raw) > 65536) throw Error("请求内容过大。");
    }
    try {
      return JSON.parse(raw || "{}");
    } catch {
      throw Error("请求 JSON 无效。");
    }
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    const host = req.headers.host || "";
    const local = isLoopback(req.socket.remoteAddress) && isLocalHost(host);
    if (!allowedHost(host, lan) || !allowedClient(req.socket.remoteAddress, lan) || (!isLoopback(req.socket.remoteAddress) && isLocalHost(host)))
      return json(res, 403, { error: "仅允许本机和所选以太网的同一局域网访问。" });
    if (
      req.headers.origin &&
      ![
        `http://${host}`,
        ...(local ? ["http://127.0.0.1:5173", "http://localhost:5173"] : []),
      ].includes(req.headers.origin)
    )
      return json(res, 403, { error: "请求来源不受信任。" });
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(req.url, `http://${host}`).pathname,
      );
    } catch {
      return json(res, 400, { error: "地址无效。" });
    }
    if (
      req.method !== "GET" &&
      (req.headers["x-whereto-client"] !== "local" ||
        !String(req.headers["content-type"]).includes("application/json"))
    )
      return json(res, 403, { error: "请从本地页面操作。" });
    try {
      if (pathname === "/api/health")
        return json(res, 200, { ok: true, app: "whereto", version: "1.0.0", engine: agentBackend ? "dsh-agent" : "offline" });
      if (pathname === "/api/runtime" && req.method === "GET")
        return json(res, 200, { dshWebUrl: agentBackend?.webUrl || null, lanUrl: lan ? `http://${lan.address}:${req.socket.localPort}` : null,
          interfaceName: lan?.name || null, canManageSettings: local });
      if (pathname === "/api/settings" && req.method === "GET")
        return json(res, 200, await safeConfig(await store.read("config", defaults)));
      if (pathname === "/api/generation" && req.method === "GET") return json(res, 200, generation);
      if (pathname === "/api/generation/cancel" && req.method === "POST") {
        generationAbort?.abort();
        return json(res, 200, { accepted: true });
      }
      if (pathname === "/api/settings" && req.method === "PUT") {
        if (!local) return json(res, 403, { error: "请在主机的 127.0.0.1 页面修改 DSH 会话偏好。" });
        const input = await body(req);
        const next = await store.update("config", defaults, (prev) =>
          validateSettings(input, prev),
        );
        return json(res, 200, await safeConfig(next));
      }
      if (pathname === "/api/state" && req.method === "GET")
        return json(
          res,
          200,
          normalizeState(await store.read("state", emptyState())),
        );
      if (pathname === "/api/state" && req.method === "PUT") {
        const input = await body(req);
        const next = await store.update(
          "state",
          emptyState(),
          (prev) => {
            prev = normalizeState(prev);
            if (input.action === "favorite" && placeMap.has(input.id))
              prev.favorites = prev.favorites.includes(input.id)
                ? prev.favorites.filter((x) => x !== input.id)
                : [input.id, ...prev.favorites];
            else if (input.action === "visit" && placeMap.has(input.id))
              prev.history = [
                input.id,
                ...prev.history.filter((x) => x !== input.id),
              ].slice(0, 100);
            else if (input.action === "visited" && placeMap.has(input.id))
              prev.visited = prev.visited.includes(input.id)
                ? prev.visited.filter(x => x !== input.id) : [input.id, ...prev.visited];
            else throw Error("景点记录操作无效。");
            return prev;
          },
        );
        return json(res, 200, next);
      }
      if (pathname === "/api/usage" && req.method === "GET")
        return json(res, 200, await store.read("usage", []));
      if (["/api/visited/estimate", "/api/visited/match"].includes(pathname) && req.method === "POST") {
        const text = matchText((await body(req)).text);
        const config = await safeConfig(await store.read("config", defaults));
        const prepared = await prepareMatch({ text, catalog, config, root });
        const cache = await store.read("visited-matches", {});
        if (pathname.endsWith("/estimate"))
          return json(res, 200, { ...prepared.estimate, cached: !!cache[prepared.key],
            ceiling: cache[prepared.key] ? 0 : null });
        if (inflight.size) return json(res, 409, { error: "已有一个 AI 任务正在处理，请稍候。" });
        inflight.add("visited-match");
        const signal = begin("visited-match");
        try {
          const cached = !!cache[prepared.key];
          const result = cache[prepared.key] || await matchVisited({ prepared, catalog, config, agentBackend, signal, onProgress: progress,
            onUsage: entry => store.update("usage", [], prev => [entry, ...prev].slice(0, 1000)) });
          if (!cached) await store.update("visited-matches", {}, prev =>
            Object.fromEntries([[prepared.key, result], ...Object.entries(prev).filter(([k]) => k !== prepared.key)].slice(0, 100)));
          let added = [];
          const state = await store.update("state", emptyState(), prev => {
            prev = normalizeState(prev);
            added = result.ids.filter(id => !prev.visited.includes(id));
            return { ...prev, visited: [...added, ...prev.visited] };
          });
          return json(res, 200, { ...result, cached, added, state });
        } catch (error) { progress({ status: "failed", message: error.message }); throw error;
        } finally { if (generation?.status !== "failed") progress({ status: "completed" }); generationAbort = null; inflight.delete("visited-match"); }
      }
      const match = pathname.match(
        /^\/api\/places\/([a-zA-Z0-9-]+)(\/generate|\/weather|\/result)?$/,
      );
      if (match) {
        const place = placeMap.get(match[1]);
        if (!place) return json(res, 404, { error: "没有找到这个景点。" });
        if (match[2] === "/weather" && req.method === "GET")
          return json(res, 200, { weather: await getWeather(place) });
        if (match[2] === "/result" && req.method === "POST") {
          if (!agentBackend) throw Error("当前未连接 DSH Agent。");
          if (inflight.size) throw Error("请等待当前生成任务完成后读取结果。");
          const { sessionId } = await body(req);
          const detail = detailFromTask(place, await agentBackend.readResult({ sessionId, placeId: place.id }));
          await store.update("details", {}, previous => ({ ...previous, [place.id]: detail }));
          return json(res, 200, { detail, recovered: true });
        }
        if (!match[2] && req.method === "GET") {
          const cache = await store.read("details", {});
          return json(res, 200, {
            place,
            detail: cache[place.id] || null,
            cached: !!cache[place.id],
          });
        }
        if (match[2] === "/generate" && req.method === "POST") {
          const input = await body(req);
          const cache = await store.read("details", {});
          if (cache[place.id]?.schemaVersion === DETAIL_VERSION && input.refresh !== true)
            return json(res, 200, { detail: cache[place.id], cached: true });
          if (inflight.size)
            return json(res, 409, {
              error: "已有一个 AI 任务正在处理，请等待完成。",
            });
          inflight.add(place.id);
          const signal = begin("detail", place.id);
          try {
            const config = await safeConfig(await store.read("config", defaults));
            const detail = await generateDetail({
              place,
              config,
              root,
              agentBackend, signal, onProgress: progress,
              onUsage: async (entry) => {
                await store.update("usage", [], (prev) =>
                  [
                    {
                      ...entry,
                      placeId: place.id,
                      at: new Date().toISOString(),
                    },
                    ...prev,
                  ].slice(0, 1000),
                );
              },
            });
            await store.update("details", {}, (prev) => ({
              ...prev,
              [place.id]: detail,
            }));
            return json(res, 200, { detail, cached: false });
          } catch (error) { progress({ status: "failed", message: error.message }); throw error;
          } finally {
            if (generation?.status !== "failed") progress({ status: "completed" });
            generationAbort = null;
            inflight.delete(place.id);
          }
        }
      }
      if (pathname.startsWith("/api/"))
        return json(res, 404, { error: "接口不存在。" });
      if (!["GET", "HEAD"].includes(req.method))
        return json(res, 405, { error: "不支持的请求方法。" });
      const base = path.join(root, "dist");
      const rel =
        pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const target = path.resolve(base, rel);
      if (!target.startsWith(base + path.sep))
        return json(res, 403, { error: "路径不可访问。" });
      let content;
      try {
        content = await fs.readFile(target);
      } catch (e) {
        if (e.code === "ENOENT")
          return json(res, 404, {
            error: "文件不存在，请先运行 npm run build。",
          });
        throw e;
      }
      res.writeHead(200, {
        "Content-Type":
          mime[path.extname(target)] || "application/octet-stream",
        "Cache-Control": /\/assets\//.test(pathname)
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch (e) {
      json(res, 400, { error: e.message || "操作失败，请重试。" });
    }
  });
  return { server, store, lan, cancelGeneration: () => generationAbort?.abort() };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { server, lan } = await createApp();
  const port = Number(process.env.PORT || 3789);
  server.on("error", (e) => {
    console.error(
      e.code === "EADDRINUSE"
        ? `端口 ${port} 已占用。请使用启动脚本打开已运行的应用，或设置 PORT。`
        : e.message,
    );
    process.exit(1);
  });
  server.listen(port, lan ? "0.0.0.0" : "127.0.0.1", () => {
    console.log(`漫游whereto 已启动：http://127.0.0.1:${port}`);
    console.log(lan ? `同一局域网手机访问：http://${lan.address}:${port}（${lan.name}）` : "没有找到 192.168 开头的以太网地址，仅提供本机访问。");
  });
}
