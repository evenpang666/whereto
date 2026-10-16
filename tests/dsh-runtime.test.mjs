import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, execFile } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { promisify } from "node:util";
import { dshCli, projectRoot } from "../scripts/dsh-runtime.mjs";
import { dshWebAddress, probeDshWeb } from "../scripts/running-dsh.mjs";
const runFile = promisify(execFile);

async function serverAt(t, handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { server, port: server.address().port, url: `http://127.0.0.1:${server.address().port}` };
}
async function unusedPort() {
  const server = createServer();
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "whereto-dsh-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = (relative, content = "") => {
    const file = path.join(dir, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  };
  return { dir, write, directory: path.join(dir, "runtime"), env: { PATH: path.join(dir, "bin") }, execPath: path.join(dir, "node") };
}

test("finds a Unix PATH symlink with a custom npm prefix", { skip: process.platform === "win32" }, t => {
  const f = fixture(t);
  const cli = f.write("custom prefix/lib/node_modules/@deepseek-ai/dsh/lib/bin.js", "#!/usr/bin/env node\n");
  fs.mkdirSync(f.env.PATH, { recursive: true });
  fs.symlinkSync(cli, path.join(f.env.PATH, "dsh"));
  assert.equal(dshCli({ ...f, run: () => assert.fail("PATH discovery must not need npm") }), cli);
});

test("resolves npm Windows shims to JavaScript without executing .cmd through Node", t => {
  const f = fixture(t);
  f.write("bin/dsh.cmd", "@echo off\r\n");
  const cli = f.write("bin/node_modules/@deepseek-ai/dsh/lib/bin.js");
  assert.equal(dshCli(f), cli);
});

test("uses the real npm CLI to discover a configured global root", t => {
  const f = fixture(t);
  const npmCli = f.write("npm/bin/npm-cli.js");
  const cli = f.write("global modules/@deepseek-ai/dsh/lib/bin.js");
  f.env.npm_execpath = npmCli;
  let calls = 0;
  const run = (command, args, options) => {
    calls++;
    assert.equal(command, f.execPath);
    assert.deepEqual(args, [npmCli, "root", "-g"]);
    assert.equal(options.env, f.env);
    return { status: 0, stdout: path.join(f.dir, "global modules") + "\n" };
  };
  assert.equal(dshCli({ ...f, run }), cli);
  assert.equal(calls, 1);
});

test("resolves npm on PATH when launch runs directly without npm_execpath", t => {
  const f = fixture(t);
  f.write("bin/npm.cmd", "@echo off\r\n");
  const npmCli = f.write("bin/node_modules/npm/bin/npm-cli.js");
  const cli = f.write("global/@deepseek-ai/dsh/lib/bin.js");
  const run = (_command, args) => {
    assert.equal(args[0], npmCli);
    return { status: 0, stdout: path.join(f.dir, "global") };
  };
  assert.equal(dshCli({ ...f, run }), cli);
});

test("honors an explicit CLI and reports an invalid override clearly", t => {
  const f = fixture(t), cli = f.write("explicit/lib/bin.js");
  assert.equal(dshCli({ ...f, env: { ...f.env, DSH_CLI: cli } }), cli);
  assert.throws(() => dshCli({ ...f, env: { ...f.env, DSH_CLI: path.join(f.dir, "missing.js") } }), /DSH_CLI.*不存在/);
});

test("missing DSH gives PATH and explicit-entry recovery instructions", t => {
  const f = fixture(t);
  assert.throws(() => dshCli(f), /PATH.*DSH_CLI/);
});

test("launcher always suppresses the DSH browser, including the default launch", async t => {
  const f = fixture(t);
  const cli = f.write("fake-dsh.mjs", 'import fs from "node:fs";\nif(process.argv.includes("--version")) console.log("99.0.0"); else fs.writeFileSync(process.env.WHERETO_TEST_ARGS, JSON.stringify(process.argv.slice(2)));\n');
  const npm = f.write("fake-npm.cjs", 'console.log(process.argv.includes("view") ? JSON.stringify("99.0.0") : "10.0.0");\n');
  const pnpm = f.write("bin/pnpm", '#!/bin/sh\nprintf "10.0.0\\n"\n');
  fs.chmodSync(pnpm, 0o755);
  f.write("bin/pnpm.cmd", "@echo 10.0.0\r\n");
  f.write("home/profiles/web/package.json", JSON.stringify({
    dependencies: { "dsh-whereto": `link:${projectRoot.replaceAll("\\", "/")}` },
    dsh: { profile: { bundles: ["dsh-whereto"] } },
  }));
  const mapPort = await unusedPort(), dshPort = await unusedPort();
  for (const args of [[], ["--no-open"]]) {
    const recordedArgs = path.join(f.dir, `args-${args.length}.json`);
    const result = spawnSync(process.execPath, [path.join(projectRoot, "scripts/launch.mjs"), ...args], {
      env: { ...process.env, PATH: path.join(f.dir, "bin") + path.delimiter + process.env.PATH, npm_execpath: npm, DSH_CLI: cli, DSH_HOME: path.join(f.dir, "home"), WHERETO_PORT: String(mapPort), DSH_WEB_PORT: String(dshPort), WHERETO_TEST_ARGS: recordedArgs },
      encoding: "utf8", timeout: 30000,
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.deepEqual(JSON.parse(fs.readFileSync(recordedArgs, "utf8")), ["web", "--no-open", "--port", String(dshPort)]);
  }
});

test("DSH detection recognizes authenticated Web surfaces without treating unrelated services as DSH", async () => {
  for (const [status, body, expected] of [
    [401, "dsh web authentication required; reopen the URL printed by dsh web.", "running"],
    [200, "<html><title>DeepSeek Harness</title></html>", "running"],
    [401, "unauthorized", "occupied"], [200, "<title>Another app</title>", "occupied"],
  ]) assert.equal(await probeDshWeb("http://127.0.0.1:3080", { fetchImpl: async () => new Response(body, { status }) }), expected);
  assert.equal(await probeDshWeb("http://127.0.0.1:3080", { fetchImpl: async () => { throw Object.assign(Error("refused"), { cause: { code: "ECONNREFUSED" } }); } }), "stopped");
  await assert.rejects(probeDshWeb("http://127.0.0.1:3080", { fetchImpl: async () => { throw Error("timeout"); } }), /无法检测/);
  assert.throws(() => dshWebAddress({ DSH_WEB_PORT: "invalid" }), /DSH_WEB_PORT/);
});

test("a ready map reuses its host before requiring any local DSH or npm installation", async t => {
  const f = fixture(t);
  const map = await serverAt(t, (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(req.url === "/api/health" ? { app: "whereto", engine: "dsh-agent" } : { dshWebUrl: "http://127.0.0.1:3199" }));
  });
  const result = await runFile(process.execPath, [path.join(projectRoot, "scripts/launch.mjs"), "--no-open"], {
    env: { ...process.env, WHERETO_PORT: String(map.port), DSH_CLI: path.join(f.dir, "missing-dsh.mjs"), npm_execpath: path.join(f.dir, "missing-npm.mjs") }, timeout: 15000,
  });
  assert.match(result.stdout, /复用现有 DSH 服务/);
  assert.match(result.stdout, /DSH Web：http:\/\/127\.0\.0\.1:3199/);
  assert.ok(!result.stdout.includes("检查启动环境"));
});

test("an existing DSH host never launches another Web process, including when its plugin needs a restart", async t => {
  for (const canLoad of [true, false]) await t.test(canLoad ? "plugin becomes ready" : "plugin requires restart", async t => {
  const f = fixture(t), calls = path.join(f.dir, "calls.json");
  const dsh = await serverAt(t, (_req, res) => { res.writeHead(401); res.end("dsh web authentication required"); });
  const map = await serverAt(t, (req, res) => {
    if (canLoad && req.url === "/api/health" && fs.existsSync(calls)) { res.end(JSON.stringify({ app: "whereto", engine: "dsh-agent" })); return; }
    res.writeHead(404); res.end();
  });
  const cli = f.write("fake-dsh.mjs", 'import fs from "node:fs"; if(process.argv.includes("--version")) console.log("99.0.0"); else fs.writeFileSync(process.env.WHERETO_TEST_ARGS, JSON.stringify(process.argv.slice(2)));');
  const npm = f.write("fake-npm.cjs", 'console.log(process.argv.includes("view") ? JSON.stringify("99.0.0") : "10.0.0");');
  const pnpm = f.write("bin/pnpm", '#!/bin/sh\nprintf "10.0.0\\n"\n'); fs.chmodSync(pnpm, 0o755);
  f.write("bin/pnpm.cmd", "@echo 10.0.0\r\n");
  const launch = () => runFile(process.execPath, [path.join(projectRoot, "scripts/launch.mjs"), "--no-open"], {
    env: { ...process.env, PATH: path.join(f.dir, "bin") + path.delimiter + process.env.PATH, npm_execpath: npm, DSH_CLI: cli,
      DSH_HOME: path.join(f.dir, "home"), WHERETO_TEST_ARGS: calls, WHERETO_PORT: String(map.port), DSH_WEB_PORT: String(dsh.port) }, timeout: 15000,
  });
  if (canLoad) {
    const result = await launch();
    assert.match(result.stdout, /DSH Web 已在运行，将复用/);
    assert.match(result.stdout, /漫游地图：http/);
  } else await assert.rejects(launch(), error => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /未启动第二个 DSH/);
    assert.match(error.stderr, /检查插件加载状态/);
    return true;
  });
  const args = JSON.parse(fs.readFileSync(calls, "utf8"));
  assert.equal(args[0], "plugin");
  });
});

test("an unrelated server on the DSH port stops startup before changing the environment", async t => {
  const f = fixture(t);
  const other = await serverAt(t, (_req, res) => res.end("another service"));
  const mapPort = await unusedPort();
  await assert.rejects(runFile(process.execPath, [path.join(projectRoot, "scripts/launch.mjs"), "--no-open"], {
    env: { ...process.env, WHERETO_PORT: String(mapPort), DSH_WEB_PORT: String(other.port), DSH_CLI: path.join(f.dir, "missing.mjs") }, timeout: 15000,
  }), error => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /已被其他服务占用，未启动 DSH/);
    assert.ok(!error.stdout.includes("检查启动环境"));
    return true;
  });
});
