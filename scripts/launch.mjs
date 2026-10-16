import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ensureDshPlugin, npmCli } from "./dsh-runtime.mjs";
import { prepareRuntime } from "./prepare-runtime.mjs";
import { studioLaunchUrl } from "./browser-launch.mjs";
import { discoverDshWeb, probeDshWeb } from "./running-dsh.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const quiet = process.argv.includes("--no-open") || process.env.WHERETO_NO_OPEN === "1";
let cli, dshUrl;
try { dshUrl = await discoverDshWeb(process.env, { directory: root }); }
catch (error) { console.error(error.message); process.exit(1); }
const url = dshUrl + "/whereto";
let instanceId, appUrl;
// Environment validation must also run before returning an already-ready map.
try {
  const state = await probeDshWeb(dshUrl);
  if (state === "occupied") throw Error(`${dshUrl} 已被其他服务占用，未启动 DSH。请检查端口。`);
  cli = ensureDshPlugin(prepareRuntime());
} catch (error) { console.error(error.message); process.exit(1); }
function openBrowser() {
  if (quiet) return;
  const handoff = new URL(studioLaunchUrl(root, dshUrl, instanceId));
  const destination = new URL(appUrl || handoff.href);
  if (!appUrl && handoff.searchParams.has("token")) destination.searchParams.set("token", handoff.searchParams.get("token"));
  const target = destination.href;
  if (process.platform === "win32")
    spawn("rundll32.exe", ["url.dll,FileProtocolHandler", target], {
      stdio: "ignore",
      windowsHide: true,
    }).unref();
  else
    spawn(process.platform === "darwin" ? "open" : "xdg-open", [target], {
      stdio: "ignore",
    })
      .on("error", () => console.log(`请手动打开 ${url}`))
      .unref();
}
try {
  const r = await fetch(url + "/api/health", {
    signal: AbortSignal.timeout(1000),
  });
  const health = r.ok ? await r.json() : null;
  if (health?.app === "whereto" && health.engine !== "dsh-agent") {
    console.error("旧版独立服务仍在运行。请关闭原启动窗口，再运行 start.bat 以启用 DSH Agent 插件。");
    process.exit(1);
  }
  if (health?.app === "whereto") {
    instanceId = health.instanceId;
    if (health.url) { const target = new URL(health.url); if (target.protocol === "http:" && target.hostname === "127.0.0.1" && !target.username && !target.password) appUrl = target.href; }
    console.log(`漫游whereto已在运行：${appUrl || url + "/"}`);
    console.log("复用现有 DSH 服务。");
    await printAddresses();
    openBrowser();
    process.exit(0);
  }
} catch {}
async function printAddresses() {
  console.log(`漫游地图：${appUrl || url + "/"}`);
  let runtime;
  try {
    const network = await fetch((appUrl || url + "/") + "api/runtime", { signal: AbortSignal.timeout(1000) });
    if (network.ok) runtime = await network.json();
  } catch {}
  console.log(`DSH Web：${runtime?.dshWebUrl || dshUrl}`);
  if (runtime?.lanUrl) console.log(`同一局域网手机访问：${runtime.lanUrl}（${runtime.interfaceName}）`);
}
async function dshState() {
  const state = await probeDshWeb(dshUrl);
  if (state === "occupied") throw Error(`${dshUrl} 已被其他服务占用，未启动 DSH。请检查端口，或用 DSH_WEB_PORT 指定现有 DSH Web 的端口。`);
  return state;
}
let existingDsh;
try {
  existingDsh = await dshState();
  if (existingDsh === "running") console.log(`DSH Web 已在运行，将复用：${dshUrl}`);
} catch (error) { console.error(error.message); process.exit(1); }
function npm(args) {
  // Resolve npm's CLI without shell interpolation, including Windows paths with spaces.
  const result = spawnSync(process.execPath, [npmCli(), ...args], {
    stdio: "inherit",
    cwd: root,
  });
  if (result.error || result.status !== 0) {
    console.error(
      `运行 npm ${args.join(" ")} 失败。请检查网络和 Node.js 安装。`,
    );
    process.exit(1);
  }
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const requiredPackages = ["vite", ...Object.keys(manifest.dependencies)];
if (requiredPackages.some(name => !fs.existsSync(path.join(root, "node_modules", name, "package.json")))) {
  console.log("准备漫游界面依赖…");
  npm(["ci"]);
}
const inputs = [
  "src",
  "public",
  "index.html",
  "vite.config.js",
  "package-lock.json",
];
const latest = (p) => {
  const st = fs.statSync(p);
  return st.isDirectory()
    ? Math.max(
        st.mtimeMs,
        ...fs.readdirSync(p).map((n) => latest(path.join(p, n))),
      )
    : st.mtimeMs;
};
const built = path.join(root, "dist/index.html");
if (
  !fs.existsSync(built) ||
  Math.max(...inputs.map((p) => latest(path.join(root, p)))) >
    fs.statSync(built).mtimeMs
) {
  console.log("准备本地网页…");
  npm(["run", "build"]);
}
// Recheck after setup: another launch may have started DSH in the meantime.
try { if (existingDsh !== "running") existingDsh = await dshState(); }
catch (error) { console.error(error.message); process.exit(1); }
if (existingDsh === "running") {
  for (let n = 0; n < 20; n++) {
    try {
      const response = await fetch(url + "/api/health", { signal: AbortSignal.timeout(500) });
      const health = response.ok ? await response.json() : null;
      if (health?.app === "whereto" && health.engine === "dsh-agent") {
        instanceId = health.instanceId;
    if (health.url) { const target = new URL(health.url); if (target.protocol === "http:" && target.hostname === "127.0.0.1" && !target.username && !target.password) appUrl = target.href; }
        await printAddresses();
        openBrowser();
        process.exit(0);
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  console.error(`DSH Web 已在运行：${dshUrl}。漫游插件已注册，但地图尚未就绪；请在原服务中检查插件加载状态，必要时重启该服务。未启动第二个 DSH。`);
  process.exit(1);
}
// DSH prints its authenticated login URL; only the map opens automatically.
const child = spawn(process.execPath, [cli, "web", "--no-open", "--port", String(new URL(dshUrl).port || 80)], {
  stdio: "inherit",
  cwd: root,
  env: process.env,
  windowsHide: true,
});
let stopped = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    if (!stopped) {
      stopped = true;
      child.kill(signal);
    }
  });
child.on("error", error => { console.error(`DSH 启动失败：${error.message}`); process.exit(1); });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (let n = 0; n < 40; n++) {
  try {
    const r = await fetch(url + "/api/health", {
      signal: AbortSignal.timeout(500),
    });
    const health = r.ok ? await r.json() : null;
    if (health?.app === "whereto") {
      instanceId = health.instanceId;
    if (health.url) { const target = new URL(health.url); if (target.protocol === "http:" && target.hostname === "127.0.0.1" && !target.username && !target.password) appUrl = target.href; }
      await printAddresses();
      console.log("关闭此窗口或按 Ctrl+C 可停止服务。");
      openBrowser();
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 250));
}
