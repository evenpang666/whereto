import test from "node:test";
import assert from "node:assert/strict";
import { selectLan, allowedClient, allowedHost } from "../server/network.mjs";
import { prepareMatch, matchVisited, matchText, normalizeState } from "../server/visited.mjs";
import { createDshAgentBackend } from "../server/dsh-agent.mjs";
import { catalog, root, mockHost } from "./helpers.mjs";
test("LAN uses physical 192.168 Ethernet and restricts access to the selected subnet", () => {
  const entry = address => [{ address, family: "IPv4", internal: false, netmask: "255.255.255.0" }];
  const lan = selectLan({ "VMware VMnet8": entry("192.168.146.1"), WLAN: entry("192.168.1.9"), Ethernet: entry("192.168.10.106") });
  assert.equal(lan.address, "192.168.10.106"); assert.equal(allowedClient("192.168.146.80", lan), false);
  assert.equal(allowedClient("::ffff:192.168.10.80", lan), true); assert.equal(allowedHost("attacker.example:3789", lan), false);
});
test("visited matching uses DSH session and rejects out-of-catalog results", async () => {
  assert.throws(() => matchText(" ")); assert.throws(() => matchText("景".repeat(12001)));
  assert.deepEqual(normalizeState({ favorites: [], history: [] }).visited, []);
  const prepared = await prepareMatch({ text: "去过西湖，还没去故宫", catalog, root, config: {} });
  assert.match(prepared.prompt, /想去、尚未去过不能标记/); assert.equal(prepared.estimate.ceiling, null);
  const index = catalog.places.findIndex(p => p.id === "west-lake");
  const host = mockHost({ value: { matched: [index, index], unmatched: [], ambiguous: [] } });
  const result = await matchVisited({ prepared, catalog, config: {}, agentBackend: createDshAgentBackend(host.ctx, { root }) });
  assert.deepEqual(result.ids, ["west-lake"]); assert.ok(result.agent.sessionId); assert.equal(host.requests.length, 1);
  const invalid = mockHost({ value: { matched: [99999], unmatched: [], ambiguous: [] } });
  await assert.rejects(matchVisited({ prepared, catalog, config: {}, agentBackend: createDshAgentBackend(invalid.ctx, { root }) }), /库外/);
});

test("Wi-Fi-only and private 10.* LANs remain accessible", () => {
  const lan = selectLan({ wlan0: [{ family: "IPv4", internal: false, address: "10.0.0.12", netmask: "255.255.255.0" }] });
  assert.equal(lan.address, "10.0.0.12");
  assert.equal(allowedClient("10.0.0.24", lan), true);
  assert.equal(allowedClient("10.0.1.24", lan), false);
  assert.equal(allowedHost("10.0.0.12:3101", lan), true);
});
