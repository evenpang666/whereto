import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../server/index.mjs";
import { createDshAgentBackend } from "../server/dsh-agent.mjs";

export const name = "whereto";
export const inject = ["sessionController", "sessions", "tools", "skills", "agentDefaultModel", "agentPresets", "webServer"];
export async function apply(ctx, config = {}) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const agentBackend = createDshAgentBackend(ctx, { root });
  const app = await createApp({ agentBackend, dataDir: config.dataDir ? path.resolve(config.dataDir) : path.join(root, ".local"), ...(config.lan === false ? { lan: null } : {}) });
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
  const port = Number(config.port ?? process.env.WHERETO_PORT ?? 3789);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error("漫游端口无效。");
  await new Promise((resolve, reject) => { app.server.once("error", reject); app.server.listen(port, app.lan ? "0.0.0.0" : "127.0.0.1", resolve); });
  ctx.effect(() => () => {
    app.cancelGeneration(); agentBackend.dispose();
    app.server.closeAllConnections();
    return new Promise(resolve => app.server.close(resolve));
  });
  ctx.provide("whereto", { port: app.server.address().port, agentBackend, server: app.server });
  ctx.logger.info(`漫游地图插件：http://127.0.0.1:${app.server.address().port} · 生成交给 DSH Agent 会话`);
}
