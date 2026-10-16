import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { Context } from "@deepseek-ai/cordis";
import * as plugin from "../dsh/index.mjs";
import { createDshAgentBackend, parseAgentJson, sessionEvidence } from "../server/dsh-agent.mjs";
import { generateDetail, validateDetail, detailFromTask } from "../server/harness.mjs";
import { createApp } from "../server/index.mjs";
import { root, place, full, url, excerpt, headers, temp, cleanup, mockHost } from "./helpers.mjs";

test("whole-project plugin mounts authenticated UI on the DSH listener and cleans up only its routes", async () => {
  const dir = await temp(), ctx = new Context(), host = mockHost(); const tools = [], skills = [];
  let handler;
  const server = createServer((req, res) => handler && req.url.startsWith('/whereto') ? handler(req, res) : (res.writeHead(404), res.end()));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/whereto`;
  const auth = { headers: { Cookie: 'dsh=valid' } };
  for (const [key, value] of Object.entries(host.ctx)) if (!["on", "get"].includes(key)) ctx.provide(key, value);
  ctx.provide("tools", { register: value => tools.push(value) }); ctx.provide("skills", { register: value => skills.push(value) });
  ctx.provide("webServer", { port: server.address().port, host: '127.0.0.1', register(route) { assert.equal(route.path, '/whereto'); handler = route.handler; return () => { handler = null; }; } });
  ctx.provide("connection", {
    authenticatedUrl: base => base + '?token=test-token',
    authorizeIndex(req,res) { if (req.url === '/?token=test-token') { res.writeHead(303, { location: './', 'set-cookie': 'dsh=valid; HttpOnly' }); res.end(); return false; } if (req.headers.cookie === 'dsh=valid') return true; res.writeHead(401); res.end(); return false; },
    requestRejection: req => req.headers.cookie !== 'dsh=valid' ? 401 : req.headers.origin === 'https://evil.example' ? 403 : undefined,
  });
  try {
    const fiber = await ctx.plugin(plugin, { lan: false, dataDir: dir, port: 0 }).await();
    const app = ctx.get("whereto");
    assert.notEqual(app.port, server.address().port); assert.equal(app.server.listening, true);
    const independent = `http://127.0.0.1:${app.port}`;
    assert.equal((await fetch(independent + '/')).status, 200);
    assert.equal((await fetch(independent + '/api/state')).status, 200);
    assert.equal((await fetch(independent + '/api/state', auth)).status, 200);
    assert.equal((await fetch(independent + '/api/state', { headers: { ...auth.headers, Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await fetch(independent + '/', auth)).status, 200);
    assert.equal((await fetch(independent + '/whereto/assets/missing.js', auth)).status, 404);
    assert.equal((await (await fetch(base + '/api/health')).json()).engine, 'dsh-agent');
    assert.equal((await fetch(base + '/')).status, 401); assert.equal((await fetch(base + '/api/state')).status, 401);
    assert.equal((await fetch(base + '/brand/mark.svg')).status, 401);
    const login = await fetch(base + '/?token=test-token', { redirect: 'manual' }); assert.equal(login.status,303); assert.equal(login.headers.get('location'),'/whereto/');
    assert.equal((await fetch(base + '/api/state', auth)).status,200);
    assert.equal((await fetch(base + '/api/state', {headers:{...auth.headers,Origin:'https://evil.example'}})).status,403);
    const html = await (await fetch(base + '/', auth)).text(); assert.match(html,/\/whereto\/assets\//);
    assert.equal((await fetch(base + '/data/catalog.json',auth)).status,200);
    assert.ok(tools.some(t => t.name === "whereto_read_place")); assert.ok(skills.some(s => s.name === "whereto-travel-guide"));
    await fiber.dispose(); assert.equal(handler,null); assert.equal(server.listening,true); assert.equal(app.server.listening,false);
  } finally { await ctx.fiber.dispose(); await new Promise(resolve=>server.close(resolve)); await cleanup(dir); }
});
test("generation creates DSH Web sessions without allocating tokens or supplying a model/client", async () => {
  const host = mockHost(), ledger = [], updates = [];
  const result = await generateDetail({ place, config: {}, agentBackend: createDshAgentBackend(host.ctx, { root }), onUsage: u => ledger.push(u), onProgress: u => updates.push(u) });
  assert.deepEqual(host.creates, [{ cwd: root }]); assert.equal(host.selections.length, 0);
  assert.equal(host.requests[0].mode, "queue"); assert.match(host.requests[0].content[0].text, /site:xiaohongshu.com/);
  assert.equal(result.schemaVersion, 4); assert.equal(result.agent.model, "host-model"); assert.equal(result.realReviews[0].excerpt, excerpt);
  assert.equal(result.prose, full.prose);
  assert.equal(ledger.length, 1); assert.equal(ledger[0].cost, null); assert.ok(updates.some(p => p.message.includes("web_search")));
  assert.equal(host.listeners.size, 0); assert.equal(result.usage.input, 100);
});
test("reference-session model and preset are inherited without prompting or editing the reference session", async () => {
  const host = mockHost({ source: { meta: { agentPreset: "my-preset" }, events: [{ type: "model/selection", data: { provider: "custom", model: "my-model", reasoningEffort: "high" } }] } });
  await createDshAgentBackend(host.ctx, { root }).run({ title: "test", prompt: "JSON", config: { sourceSessionId: "session-source" } });
  assert.equal(host.creates[0].agentPreset, "my-preset"); assert.equal(host.selections[0].model, "my-model");
  assert.notEqual(host.requests[0].sessionId, "session-source");
});
test("model output cannot invent evaluation sources, and free text is not mined for URLs", () => {
  const research = sessionEvidence([{ type: "assistant/message", data: { message: { content: [{ type: "text", text: `source ${url}` }] } } }]);
  assert.equal(research.sources.length, 0);
  const detail = validateDetail(full, research);
  assert.equal(detail.realReviews.length, 0); assert.equal(detail.omittedReviews, 1);
  assert.equal(detail.intro, full.intro);
  assert.deepEqual(parseAgentJson('```json\n{"ok":true}\n```'), { ok: true }); assert.throws(() => parseAgentJson("prefix {}"), /JSON/);
  assert.deepEqual(parseAgentJson('检索完成。\n```json\n{"ok":true}\n```\n结束。'), { ok: true });
  assert.throws(() => parseAgentJson('```json\n{"a":1}\n```\n```json\n{"a":2}\n```'), /JSON/);
});
test("completed scene results can be recovered without another prompt and cannot be imported into another scene", async () => {
  const host = mockHost(), backend = createDshAgentBackend(host.ctx, { root });
  const result = await generateDetail({ place, config: {}, agentBackend: backend });
  const task = await backend.readResult({ sessionId: result.agent.sessionId, placeId: place.id });
  assert.deepEqual(task.value, full); assert.equal(host.requests.length, 1);
  await assert.rejects(backend.readResult({ sessionId: result.agent.sessionId, placeId: "another-place" }), /当前景点/);
  const status = await backend.describe({ sourceSessionId: "bad-id" }); assert.ok(status.sourceError);
});

test("page excerpts must match fetched tool text and full page bodies never enter card caches", () => {
  const events = [{ type: "tool/result", data: { meta: { sources: [{ url, title: "游客亲历" }] }, message: { content: [] } } },
    { type: "tool/result", data: { meta: { url, statusCode: 200 }, message: { content: [
      { type: "tool-result", content: [{ type: "text", text: `页面标题\n${excerpt}\n更多内容` }] }] } } }];
  const research = sessionEvidence(events);
  const value = { ...full, reviewExcerpts: { [url]: excerpt } };
  const detail = detailFromTask(place, { value, research, agent: { model: "host-model" } });
  assert.equal(detail.realReviews[0].excerpt, excerpt);
  assert.ok(!JSON.stringify(detail).includes("verificationText"));
  assert.ok(!JSON.stringify(detail).includes("更多内容"));
  const mismatched = detailFromTask(place, { value: { ...value, reviewExcerpts: { [url]: "这是一段模型杜撰、没有在网页出现过的评价。" } }, research, agent: {} });
  assert.equal(mismatched.realReviews.length, 0);
  assert.equal(mismatched.research.omittedReviews, 1);
  assert.equal(mismatched.intro, value.intro);
  assert.equal(validateDetail(full, research).realReviews.length, 0);
  assert.equal(detailFromTask(place, { value: full, research, agent: {} }).research.omittedReviews, 1);
});
test("failed and blocked DSH turns retain usage and do not retry or cache an answer", async () => {
  for (const options of [{ fail: true }, { blocked: true }]) {
    const host = mockHost(options), ledger = [];
    await assert.rejects(generateDetail({ place, config: {}, agentBackend: createDshAgentBackend(host.ctx, { root }), onUsage: u => ledger.push(u) }), /DSH/);
    assert.equal(ledger.length, 1); assert.equal(host.requests.length, 1); assert.equal(host.listeners.size, 0);
  }
});
test("quote verification retains long search snippets and all fetched versions without caching full text", () => {
  const firstQuote = "这是搜索摘要末尾的亲历描述，沿着湖边慢慢走很舒服。";
  const secondQuote = "这是第二次获取页面中的亲历描述，清早到达时游客还比较少。";
  const research = sessionEvidence([
    { type: "tool/result", data: { meta: { sources: [{ url, snippet: "开头内容".repeat(100) + firstQuote }] } } },
    { type: "tool/result", data: { meta: { url, statusCode: 200 }, message: { content: [{ type: "tool-result", content: [{ type: "text", text: secondQuote }] }] } } },
    { type: "tool/result", data: { meta: { url, statusCode: 200 }, message: { content: [{ type: "tool-result", content: [{ type: "text", text: "页面刷新后只显示了登录提示。" }] }] } } },
  ]);
  for (const quote of [firstQuote, secondQuote]) {
    const detail = detailFromTask(place, { value: { ...full, reviewExcerpts: { [url]: quote } }, research, agent: {} });
    assert.equal(detail.realReviews[0].excerpt, quote);
    assert.ok(!JSON.stringify(detail).includes("verificationTexts"));
    assert.ok(!JSON.stringify(detail).includes("页面刷新后"));
  }
});

test("mismatched reviews are omitted individually while verified reviews remain", () => {
  const second = "https://www.zhihu.com/question/123/answer/789";
  const research = sessionEvidence([{ type: "tool/result", data: { meta: { sources: [{ url, snippet: excerpt }, { url: second, snippet: excerpt }] } } }]);
  const detail = detailFromTask(place, { value: { ...full, reviewUrls: [url, second], reviewExcerpts: {
    [url]: excerpt, [second]: "这是一段未出现在工具原文中的改写评价。",
  } }, research, agent: {} });
  assert.equal(detail.realReviews.length, 1);
  assert.equal(detail.realReviews[0].url, url);
  assert.equal(detail.research.omittedReviews, 1);
});

test("failed Web tool results cannot supply quote evidence", () => {
  const research = sessionEvidence([{ type: "tool/result", data: {
    meta: { sources: [{ url, snippet: excerpt }] }, message: { isError: true, content: [{ type: "text", text: excerpt }] },
  } }]);
  assert.equal(research.sources.length, 0);
});

test("review URL comparison normalizes fragments and URL syntax without merging distinct pages", () => {
  const research = sessionEvidence([{ type: "tool/result", data: { meta: { sources: [{ url, snippet: excerpt }] } } }]);
  const variant = url.replace("https://www.zhihu.com", "https://WWW.ZHIHU.COM:443") + "#comment";
  const detail = detailFromTask(place, { value: { ...full,
    reviewUrls: [variant, url, url + "?answer=other", url + "/other"],
    reviewExcerpts: { [url + "#quote"]: excerpt },
  }, research, agent: {} });
  assert.equal(detail.realReviews.length, 1);
  assert.equal(detail.realReviews[0].url, url);
  assert.equal(detail.realReviews[0].excerpt, excerpt);
  assert.equal(detail.research.omittedReviews, 2);
});

test("missing, malformed, unsupported and unverified review data never rejects valid card text", () => {
  const research = sessionEvidence([{ type: "tool/result", data: { meta: { sources: [{ url, snippet: excerpt }] } } }]);
  const cases = [
    [undefined, 0], [null, 0], ["not an array", 1], [{ url }, 1],
    [[null, 42, {}, "javascript:alert(1)", "http://127.0.0.1/private", "https://example.com/unknown"], 6],
  ];
  for (const [reviewUrls, omitted] of cases) {
    const detail = detailFromTask(place, { value: { ...full, reviewUrls }, research, agent: {} });
    assert.equal(detail.intro, full.intro);
    assert.equal(detail.realReviews.length, 0);
    assert.equal(detail.research.omittedReviews, omitted);
  }
  for (const quote of [null, 42, {}, "过短", "未在工具结果中出现的模型改写评价，不能用它替代游客原文。"])
    assert.equal(validateDetail({ ...full, reviewExcerpts: { [url]: quote } }, research).realReviews.length, 0);
  assert.throws(() => validateDetail({ ...full, intro: "" }, research), /intro/);
});

test("review limits and large search result lists do not discard selected source evidence", () => {
  const sources = Array.from({ length: 45 }, (_, i) => ({ url: `https://example.com/review/${i}`, snippet: excerpt }));
  const research = sessionEvidence([{ type: "tool/result", data: { meta: { sources } } }]);
  const last = sources.at(-1).url;
  assert.equal(validateDetail({ ...full, reviewUrls: [last] }, research).realReviews[0].url, last);
  const detail = detailFromTask(place, { value: { ...full, reviewUrls: sources.slice(0, 11).map(source => source.url) }, research, agent: {} });
  assert.equal(detail.realReviews.length, 9);
  assert.equal(detail.research.omittedReviews, 2);
});

test("generation and completed-session recovery save cards with unknown review URLs without another model call", async () => {
  const dir = await temp(), host = mockHost({ value: { ...full, reviewUrls: ["https://example.com/unknown-review"] } });
  const backend = createDshAgentBackend(host.ctx, { root });
  const { server, store } = await createApp({ dataDir: dir, lan: null, agentBackend: backend });
  await store.update("details", {}, () => ({ [place.id]: { schemaVersion: 3, intro: "previous" } }));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api/places/${place.id}`;
  const post = (suffix, body) => fetch(base + suffix, { method: "POST", headers, body: JSON.stringify(body) });
  try {
    const response = await post("/generate", {});
    assert.equal(response.status, 200);
    const { detail } = await response.json();
    assert.equal(detail.intro, full.intro);
    assert.equal(detail.realReviews.length, 0);
    assert.equal(detail.research.omittedReviews, 1);
    assert.deepEqual((await store.read("details", {}))[place.id], detail);
    const recovered = await post("/result", { sessionId: detail.agent.sessionId });
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).detail.research.omittedReviews, 1);
    assert.equal((await (await post("/generate", {})).json()).cached, true);
    assert.equal(host.requests.length, 1);
    assert.equal((await store.read("usage", [])).length, 1);
  } finally { await new Promise(resolve => server.close(resolve)); await cleanup(dir); }
});
test("cancellation reaches the DSH session, cleans listeners and preserves the original session", async () => {
  let release; const wait = new Promise(resolve => { release = resolve; });
  const host = mockHost({ wait }), controller = new AbortController(); let started;
  const ready = new Promise(resolve => { started = resolve; });
  const task = createDshAgentBackend(host.ctx, { root }).run({ title: "cancel", prompt: "JSON", config: {}, signal: controller.signal,
    onProgress: () => started() });
  const rejection = assert.rejects(task, /取消|超时/);
  await ready; await new Promise(resolve => setImmediate(resolve)); controller.abort(); await rejection;
  assert.equal(host.cancelled, 1); assert.equal(host.listeners.size, 0); assert.equal(host.sessions.size, 1); release();
});
test("API upgrades old caches through DSH, persists usage, reuses new caches and preserves results on refresh failure", async () => {
  const dir = await temp(), host = mockHost();
  const backend = createDshAgentBackend(host.ctx, { root });
  const { server, store } = await createApp({ dataDir: dir, lan: null, agentBackend: backend });
  await store.update("details", {}, () => ({ [place.id]: { schemaVersion: 3, intro: "old" } }));
  server.listen(0, "127.0.0.1"); await once(server, "listening"); const base = `http://127.0.0.1:${server.address().port}`;
  const post = body => fetch(base + `/api/places/${place.id}/generate`, { method: "POST", headers, body: JSON.stringify(body) });
  try {
    const firstResponse = await post({}); assert.equal(firstResponse.status, 200); const first = await firstResponse.json();
    assert.equal(first.detail.schemaVersion, 4); assert.equal(first.detail.kind, "dsh-agent");
    assert.equal((await (await post({})).json()).cached, true); assert.equal(host.requests.length, 1);
    backend.run = async () => { throw Error("DSH failed"); };
    assert.equal((await post({ refresh: true })).status, 400);
    assert.deepEqual((await (await fetch(base + `/api/places/${place.id}`)).json()).detail, first.detail);
    assert.equal((await store.read("usage", [])).length, 1);
  } finally { await new Promise(resolve => server.close(resolve)); await cleanup(dir); }
});
