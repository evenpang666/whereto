import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ensureDshPlugin } from "./dsh-runtime.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const port = Number(process.env.WHERETO_PORT || process.env.PORT || 3789);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error("PORT 必须为 1024–65535 的整数。");
  process.exit(1);
}
const url = `http://127.0.0.1:${port}`;
const quiet = process.argv.includes("--no-open") || process.env.WHERETO_NO_OPEN === "1";
function openBrowser() {
  if (quiet) return;
  if (process.platform === "win32")
    spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], {
      stdio: "ignore",
      windowsHide: true,
    }).unref();
  else
    spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], {
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
    console.log(`漫游whereto已在运行：${url}`);
    const network = await fetch(url + "/api/runtime", { signal: AbortSignal.timeout(1000) });
    if (network.ok) {
      const runtime = await network.json();
      if (runtime.lanUrl) console.log(`同一局域网手机访问：${runtime.lanUrl}（${runtime.interfaceName}）`);
    }
    openBrowser();
    process.exit(0);
  }
} catch {}
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 22) {
  console.error("请先安装 Node.js 22 或更新版本：https://nodejs.org/");
  process.exit(1);
}
const npmArgs = process.env.npm_execpath;
function npm(args) {
  // Resolve npm's CLI without shell interpolation, including Windows paths with spaces.
  const cli =
    npmArgs ||
    path.join(
      path.dirname(process.execPath),
      "node_modules/npm/bin/npm-cli.js",
    );
  const result = fs.existsSync(cli)
    ? spawnSync(process.execPath, [cli, ...args], {
        stdio: "inherit",
        cwd: root,
      })
    : spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, {
        stdio: "inherit",
        cwd: root,
        shell: process.platform === "win32",
      });
  if (result.status !== 0) {
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
let cli;
try { cli = ensureDshPlugin(); } catch (error) { console.error(error.message); process.exit(1); }
const child = spawn(process.execPath, [cli, "web", ...(quiet ? ["--no-open"] : [])], {
  stdio: "inherit",
  cwd: root,
  env: { ...process.env, WHERETO_PORT: String(port) },
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
child.on("exit", (code) => process.exit(code || 0));
for (let n = 0; n < 40; n++) {
  try {
    const r = await fetch(url + "/api/health", {
      signal: AbortSignal.timeout(500),
    });
    if (r.ok && (await r.json()).app === "whereto") {
      console.log("关闭此窗口或按 Ctrl+C 可停止服务。");
      openBrowser();
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 250));
}
