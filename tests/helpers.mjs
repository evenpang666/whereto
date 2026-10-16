import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
export const root = path.resolve(import.meta.dirname, "..");
export const catalog = JSON.parse(await fs.readFile(path.join(root, "public/data/catalog.json")));
export const place = catalog.places.find(p => p.id === "west-lake");
export const url = "https://www.zhihu.com/question/123/answer/456";
export const excerpt = "我沿湖走了一个上午，树荫下停下来很舒服。";
export const full = { intro: "湖畔漫步。", prose: "一湖天光，盛下一程温柔。", history: "西湖与苏轼治湖活动相关。",
  feedback: "适合慢步。", aiReview: "清晨漫步。", tips: "穿舒适的鞋。", bestSeason: "春秋", duration: "半天", reviewUrls: [url] };
export const headers = { "Content-Type": "application/json", "X-Whereto-Client": "local" };
export async function temp() { return fs.mkdtemp(path.join(os.tmpdir(), "whereto-test-")); }
export async function cleanup(dir) {
  const target = path.resolve(dir);
  if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith("whereto-test-")) throw Error("Invalid test cleanup target");
  await fs.rm(target, { recursive: true });
}
export function mockHost({ value = full, fail = false, blocked = false, source = null, wait = null } = {}) {
  const listeners = new Set(), sessions = new Map(), requests = [], selections = [], creates = [], usage = { inputTokens: 100, outputTokens: 50 };
  let cancelled = 0, seq = 0, pending;
  const append = (session, type, data) => { const event = { type, data, seq: seq++, time: Date.now() }; session.events.push(event); for (const listener of listeners) listener(session, event); };
  const controller = {
    async create(options) { const sessionId = `session-test-${sessions.size}`; creates.push(options);
      const session = { id: sessionId, events: [], snapshotEvents() { return this.events; } }; sessions.set(sessionId, session);
      return { sessionId, agentPreset: options.agentPreset || "custom-web" }; },
    async inspect(id) { if (id === "session-source" && source) return source;
      if (sessions.has(id)) return { meta: { cwd: root, agentPreset: "custom-web" }, events: sessions.get(id).events };
      throw Error("参考会话不存在"); },
    async selectModel(input) { selections.push(input); }, async rename() {},
    async resolveAgent(id) { return { agent: { session: sessions.get(id), whenIdle: () => pending || Promise.resolve() } }; },
    async prompt(request) { requests.push(request); const session = sessions.get(request.sessionId);
      append(session, "user/message", { content: request.content, source: { rpcId: request.requestId } });
      const finish = () => {
        append(session, "request/header", { header: { config: { provider: "host-provider", model: "host-model" } } });
        append(session, "tool/call", { name: "web_search", callId: "search-1" });
        append(session, "tool/result", { message: { content: [{ type: "tool_result", isError: false }] }, meta: { sources: [{ url, snippet: excerpt, title: "亲历", publishedAt: "2026-10-16" }] } });
        append(session, "assistant/message", { message: { content: [{ type: "reasoning", text: "private reasoning" }, { type: "text", text: JSON.stringify(value) }] }, usage });
        append(session, "turn/end", { reason: { kind: fail ? "error" : blocked ? "blocked" : "completed" } });
      };
      if (wait) pending = wait.then(finish); else finish();
      return { accepted: true }; },
    cancel() { cancelled++; return { accepted: true }; },
    async modelCatalog() { return { default: { provider: "host-provider", model: "host-model" } }; },
  };
  const ctx = { sessionController: controller, sessions: { async flush() {} },
    agentDefaultModel: { currentSelection: () => ({ provider: "host-provider", model: "host-model" }) },
    agentPresets: { defaultId: "custom-web", list: async () => [{ id: "custom-web" }] },
    get: name => name === "webServer" ? { port: 3080 } : undefined,
    on: (name, callback) => { listeners.add(callback); return () => listeners.delete(callback); } };
  return { ctx, requests, selections, creates, sessions, listeners, get cancelled() { return cancelled; } };
}
