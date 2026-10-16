import { listenIndependent, closeIndependent } from "../server/independent-http.mjs";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { registerBrowserLaunch } from "../scripts/browser-launch.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../server/index.mjs";
import { createDshAgentBackend } from "../server/dsh-agent.mjs";

export const name = "whereto";
export const inject = ["sessionController", "sessions", "tools", "skills", "agentDefaultModel", "agentPresets", "webServer", "connection"];
export async function apply(ctx, config = {}) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const basePath = "/whereto", instanceId = randomUUID();
  const agentBackend = createDshAgentBackend(ctx, { root });
  const independent = {};
  const app = await createApp({ independent, agentBackend, basePath, instanceId, connection: ctx.connection, webServer: ctx.webServer, dataDir: config.dataDir ? path.resolve(config.dataDir) : path.join(root, ".local"), ...(config.lan === false ? { lan: null } : {}) });
  ctx.effect(() => async () => { app.cancelGeneration(); await closeIndependent(app.server); agentBackend.dispose(); });
  independent.port = await listenIndependent(app.server, config.port ?? process.env.WHERETO_PORT ?? 3101);
  const catalog = JSON.parse(await fs.readFile(path.join(root, "public/data/catalog.json"), "utf8"));
  const output = { schema: { type: "object" }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] };
  ctx.tools.register({ name: "whereto_read_place", description: "读取漫游地图中指定景点的本地资料与来源，不修改收藏或去过状态。",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false }, output,
    execute: ({ id }) => { const place = catalog.places.find(p => p.id === id); if (!place) throw Error("景点不存在。"); return place; } });
  for (const [folder, skillName, description] of [["travel-guide", "whereto-travel-guide", "漫游景点研究、散文邀约、亲历评价和旅行卡片生成。"],
    ["visited-matcher", "whereto-visited-matcher", "将旅行记录对应到漫游本地目录，区分去过、想去和否定句。"]]) {
    const content = await fs.readFile(path.join(root, "skills", folder, "SKILL.md"), "utf8");
    ctx.skills.register({ name: skillName, description, content, source: "bundled" });
  }
  ctx.effect(() => ctx.webServer.register({ kind: "prefix", path: basePath, handler: app.handler }));
  ctx.effect(() => registerBrowserLaunch(root, { port: ctx.webServer.port, instanceId, connection: ctx.connection }));
  ctx.provide("whereto", { port: independent.port, basePath: "", agentBackend, server: app.server });
  console.log([
    '[DSH 插件] 漫游 (whereto) · 已加载',
    `[DSH 插件]   本机：http://127.0.0.1:${independent.port}/`,
    ...(app.lan ? [`[DSH 插件]   局域网：http://${app.lan.address}:${independent.port}/`] : []),
    '[DSH 插件]   生成：复用 DSH 默认模型与凭据',
  ].join('\n'));
}
