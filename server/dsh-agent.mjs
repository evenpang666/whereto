import { randomUUID } from "node:crypto";
import { publicUrl } from "./harness.mjs";

const plainText = message => (message?.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
export function parseAgentJson(text) {
  if (typeof text !== "string" || text.length > 50000) throw Error("DSH 结果为空或过大，原缓存已保留。");
  try { return JSON.parse(text.trim()); } catch {}
  const blocks = [...text.matchAll(/```(?:json)?[ \t]*\r?\n([\s\S]*?)```/gi)];
  if (blocks.length === 1) { try { return JSON.parse(blocks[0][1].trim()); } catch {} }
  throw Error("DSH 会话没有返回完整 JSON，请在 DSH Web 查看会话，原缓存已保留。");
}
export function sessionEvidence(events) {
  const sources = new Map();
  const calls = new Map();
  let truncated = false;
  for (const event of events) {
    if (event.type === "tool/call") calls.set(event.data.callId, event.data.name);
    if (event.type !== "tool/result" || event.data.message?.content?.some(b => b.isError)) continue;
    const meta = event.data.meta;
    // Trust tool-produced structured evidence, never URLs asserted by the final answer.
    const candidates = Array.isArray(meta?.sources) ? meta.sources : [];
    if (meta?.truncated) truncated = true;
    for (const source of candidates) {
      const url = publicUrl(source?.url);
      if (!url) continue;
      const host = new URL(url).hostname;
      const excerpt = typeof source.snippet === "string" ? source.snippet.trim().slice(0, 240) : "";
      const previous = sources.get(url);
      if (!previous || (!previous.excerpt && excerpt)) sources.set(url, { url,
        title: typeof source.title === "string" ? source.title.slice(0, 150) : host, excerpt,
        publishedAt: typeof source.publishedAt === "string" ? source.publishedAt.slice(0, 60) : "",
        platform: /(^|\.)xiaohongshu\.com$/.test(host) ? "小红书" : /(^|\.)zhihu\.com$/.test(host) ? "知乎" : "网页" });
    }
    // DSH web_fetch can provide the original page even when search only yields
    // title-level sources. Keep its text transiently to verify explicit quotes.
    const fetchedUrl = publicUrl(meta?.url);
    if (fetchedUrl && meta.statusCode >= 200 && meta.statusCode < 300) {
      const body = (event.data.message?.content || []).filter(b => b.type === "tool-result").map(b => plainText(b)).join("\n").slice(0, 200000);
      if (body) {
        const previous = sources.get(fetchedUrl);
        sources.set(fetchedUrl, { ...(previous || { url: fetchedUrl, title: new URL(fetchedUrl).hostname, platform: "网页", excerpt: "", publishedAt: "" }), verificationText: body });
      }
    }
  }
  return { provider: "dsh-agent-session", searchedAt: new Date().toISOString(), truncated,
    sources: [...sources.values()].slice(0, 40), tools: [...new Set(calls.values())] };
}
function selectionFrom(events) {
  let selected;
  for (const event of events) {
    if (event.type === "model/selection") selected = event.data;
    if (event.type === "request/header") selected = event.data.header?.config;
  }
  if (!selected?.provider || !selected?.model) return undefined;
  return { provider: selected.provider, model: selected.model,
    ...(selected.reasoningEffort ? { reasoningEffort: selected.reasoningEffort } : {}) };
}
export function resultFromEvents(events, sessionInfo) {
  const end = events.findLast(e => e.type === "turn/end");
  if (end?.data.reason.kind === "error") throw Error("DSH Agent 生成失败，请打开对应 DSH 会话查看原因。");
  if (end?.data.reason.kind === "blocked") throw Error("DSH Agent 需要处理权限或工具请求，请打开对应 DSH 会话继续。");
  if (!["completed", "max-tokens"].includes(end?.data.reason.kind)) throw Error("DSH 会话尚未完整结束，原缓存已保留。");
  const message = events.findLast(e => e.type === "assistant/message" && plainText(e.data.message));
  const value = parseAgentJson(plainText(message?.data.message));
  const current = selectionFrom(events);
  const research = sessionEvidence(events);
  return { value, research, agent: { ...sessionInfo, model: current?.model, provider: current?.provider },
    usage: { input: events.reduce((n, e) => n + (e.data?.usage?.inputTokens || 0), 0),
      output: events.reduce((n, e) => n + (e.data?.usage?.outputTokens || 0), 0), cost: null, currency: "USD", managedBy: "dsh" },
    trace: ["DSH Web Agent 会话", `预设：${sessionInfo.preset || "宿主默认"}`, ...research.tools] };
}

// Runs inside the DSH Web host: no private runtime, credentials, model client,
// token allocation, tool roster or skill filesystem is reconstructed here.
export function createDshAgentBackend(ctx, { root, timeoutMs = 15 * 60 * 1000 } = {}) {
  const active = new Map();
  const webPort = ctx.get?.("webServer")?.port || 3080;
  const webUrl = `http://127.0.0.1:${webPort}`;
  return {
    async readResult({ sessionId, placeId }) {
      if (typeof sessionId !== "string" || !/^[a-zA-Z0-9_.-]{1,160}$/.test(sessionId)) throw Error("DSH 会话 ID 无效。");
      const inspection = await ctx.sessionController.inspect(sessionId);
      if (inspection.meta?.cwd !== root || !inspection.events.some(e => e.type === "user/message" &&
          e.data?.source?.rpcId?.startsWith("whereto-") && plainText(e.data).includes(`\"id\":\"${placeId}\"`)))
        throw Error("只能读取本项目为当前景点创建的旅行会话。");
      return resultFromEvents(inspection.events, { sessionId, preset: inspection.meta.agentPreset, url: webUrl });
    },
    async describe(config = {}) {
      let model = ctx.agentDefaultModel?.currentSelection?.() || (await ctx.sessionController.modelCatalog()).default;
      let sourceError, sourcePreset;
      if (config.sourceSessionId) {
        try {
          const source = await ctx.sessionController.inspect(config.sourceSessionId);
          model = selectionFrom(source.events) || model;
          sourcePreset = source.meta?.agentPreset;
        } catch { sourceError = "参考会话不存在或不可读取，请更正 ID 或清空后使用宿主默认配置。"; }
      }
      return { connected: true, model: model?.model || "DSH 默认模型", provider: model?.provider,
        defaultPreset: config.agentPreset || sourcePreset || ctx.agentPresets?.defaultId || "", sourceError,
        presets: (await ctx.agentPresets?.list?.() || []).map(p => ({ id: p.id, name: p.name || p.id })),
        sourceSessionId: config.sourceSessionId || "", managedBy: "dsh", webUrl };
    },
    async run({ title, prompt, config = {}, signal, onUsage = async () => {}, onProgress = () => {} }) {
      const abort = new AbortController();
      const combined = AbortSignal.any([abort.signal, AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
      let source, selected;
      if (config.sourceSessionId) {
        source = await ctx.sessionController.inspect(config.sourceSessionId, combined);
        selected = selectionFrom(source.events);
      }
      const created = await ctx.sessionController.create({ cwd: root,
        ...(config.agentPreset || source?.meta?.agentPreset ? { agentPreset: config.agentPreset || source.meta.agentPreset } : {}) });
      const sessionId = created.sessionId;
      active.set(sessionId, abort);
      let agent, events = [], stop, accepted = false;
      const cancel = () => { if (accepted) { try { ctx.sessionController.cancel({ sessionId }); } catch {} } };
      combined.addEventListener("abort", cancel, { once: true });
      const sessionInfo = { sessionId, sourceSessionId: config.sourceSessionId || null, preset: created.agentPreset || "",
        url: webUrl };
      onProgress({ status: "running", ...sessionInfo, message: "DSH Agent 正在准备工具与 skills" });
      try {
        if (selected) await ctx.sessionController.selectModel({ sessionId, ...selected });
        await ctx.sessionController.rename({ sessionId, title });
        const resolved = await ctx.sessionController.resolveAgent(sessionId);
        if (resolved.error) throw Error("DSH 无法启动旅行会话，请在 DSH Web 检查模型与预设。");
        agent = resolved.agent;
        stop = ctx.on("session/event", (session, event) => {
          if (session.id !== sessionId) return;
          if (event.type === "tool/call") onProgress({ status: "running", ...sessionInfo, message: `DSH 正在使用 ${event.data.name}` });
          if (event.type === "assistant/message") onProgress({ status: "running", ...sessionInfo, message: "DSH 正在整理卡片内容" });
        });
        await ctx.sessionController.prompt({ sessionId, requestId: `whereto-${randomUUID()}`, mode: "queue",
          content: [{ type: "text", text: prompt }], clientTimeZone: "Asia/Shanghai" }, combined);
        accepted = true;
        if (combined.aborted) cancel();
        let onAbort;
        try {
          await Promise.race([agent.whenIdle(), new Promise((_, reject) => {
            onAbort = () => reject(Error("DSH 任务已取消或超时，会话与已知用量保留在 DSH Web。"));
            combined.addEventListener("abort", onAbort, { once: true });
            if (combined.aborted) onAbort();
          })]);
        } finally { combined.removeEventListener("abort", onAbort); }
        events = agent.session.snapshotEvents();
        await ctx.sessions.flush(agent.session);
        return resultFromEvents(events, sessionInfo);
      } finally {
        stop?.(); combined.removeEventListener("abort", cancel); active.delete(sessionId);
        const known = agent?.session.snapshotEvents() || events;
        for (const event of known) if (event.type === "assistant/message" && event.data.usage) {
          await onUsage({ input: event.data.usage.inputTokens, output: event.data.usage.outputTokens,
            cost: null, currency: "USD", managedBy: "dsh", sessionId, seq: event.seq, model: selectionFrom(known)?.model,
            at: new Date(event.time || Date.now()).toISOString() });
        }
      }
    },
    dispose() { for (const abort of active.values()) abort.abort(); },
  };
}
