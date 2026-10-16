import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { LocalStore } from "../server/store.mjs";
import { createApp } from "../server/index.mjs";
import { validateSettings } from "../server/harness.mjs";
import { root, catalog, place, headers, temp, cleanup } from "./helpers.mjs";

test("catalog covers every city with local images, sources and valid coordinates", async () => {
  assert.equal(new Set(catalog.places.map(p => p.id)).size, catalog.places.length);
  for (const city of catalog.cities) assert.ok(catalog.places.some(p => p.cityId === city.id));
  for (const p of catalog.places) { assert.match(p.id, /^[a-zA-Z0-9-]+$/); assert.ok(p.sources[0].url.startsWith("https://"));
    assert.ok(p.coordinates.every(Number.isFinite)); await fs.access(path.join(root, "public", p.image)); }
});
test("atomic store serializes updates and survives restart", async () => {
  const dir = await temp();
  try { const store = new LocalStore(dir); await Promise.all(Array.from({ length: 20 }, () => store.update("test", { n: 0 }, p => ({ n: p.n + 1 }))));
    assert.equal((await new LocalStore(dir).read("test")).n, 20); } finally { await cleanup(dir); }
});
test("settings accept only DSH session preferences and discard legacy API credentials", () => {
  assert.deepEqual(validateSettings({ apiKey: "sk-old-secret", model: "legacy", sourceSessionId: "session-123", agentPreset: "standard" }), { sourceSessionId: "session-123", agentPreset: "standard" });
  assert.throws(() => validateSettings({ sourceSessionId: "../../private" }));
});
test("offline API retains local exploration, protects settings and does not call an LLM", async () => {
  const dir = await temp(); const { server, store } = await createApp({ dataDir: dir, lan: null, fetchImpl: () => { throw Error("Unexpected API"); } });
  await store.update("config", {}, () => ({ apiKey: "sk-old-secret", model: "old" }));
  server.listen(0, "127.0.0.1"); await once(server, "listening"); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const config = await (await fetch(base + "/api/settings")).json(); assert.equal(config.connected, false); assert.equal(config.apiKey, undefined); assert.ok(!JSON.stringify(config).includes("sk-old"));
    assert.equal((await fetch(base + "/.local/config.json")).status, 404);
    assert.equal((await fetch(base + "/api/settings", { method: "PUT", headers: { ...headers, Origin: "https://attacker.example" }, body: "{}" })).status, 403);
    const response = await fetch(base + "/api/state", { method: "PUT", headers, body: JSON.stringify({ action: "favorite", id: place.id }) });
    assert.ok((await response.json()).favorites.includes(place.id));
    const generate = await fetch(base + `/api/places/${place.id}/generate`, { method: "POST", headers, body: "{}" });
    assert.equal(generate.status, 400); assert.match((await generate.json()).error, /DSH/);
  } finally { await new Promise(resolve => server.close(resolve)); await cleanup(dir); }
});
