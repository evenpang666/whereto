import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dshCli, npmCli, projectRoot, runtimeRoot } from "./dsh-runtime.mjs";

const versionPattern = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
export function compareVersions(left, right) {
  const a = versionPattern.exec(left), b = versionPattern.exec(right);
  if (!a || !b) throw Error("DSH 返回了无法识别的版本号。");
  for (let i = 1; i <= 3; i++) if (+a[i] !== +b[i]) return +a[i] > +b[i] ? 1 : -1;
  if (a[4] === b[4]) return 0;
  if (!a[4] || !b[4]) return !a[4] ? 1 : -1;
  const preA = a[4].split("."), preB = b[4].split(".");
  for (let i = 0; i < Math.max(preA.length, preB.length); i++) {
    const x = preA[i], y = preB[i];
    if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) return +x > +y ? 1 : -1;
    if (nx !== ny) return nx ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}

export function prepareRuntime({ env = process.env, execPath = process.execPath,
  nodeVersion = process.versions.node, run = spawnSync, locate = dshCli,
  resolveNpm = npmCli, directory = runtimeRoot, log = console.log, warn = console.warn } = {}) {
  log(`检查启动环境：Node.js ${nodeVersion} · ${process.platform}/${process.arch}`);
  if (Number(nodeVersion.split(".")[0]) < 22) throw Error("需要 Node.js 22 或更新版本，请安装后重试：https://nodejs.org/");
  const npm = resolveNpm({ env, execPath });
  const execute = (args, options = {}) => run(execPath, [npm, ...args], {
    cwd: projectRoot, env, encoding: "utf8", windowsHide: true, timeout: 30000, ...options,
  });
  const npmVersion = execute(["--version"]);
  if (npmVersion.error || npmVersion.status !== 0 || !npmVersion.stdout?.trim()) throw Error("npm 无法运行，请检查 Node.js 安装。");
  log(`npm ${npmVersion.stdout.trim()}`);
  const managedBin = path.join(directory, "node_modules/.bin");
  // Plugin management starts pnpm itself, so make the managed tools visible to it.
  env.PATH = managedBin + path.delimiter + (env.PATH ?? env.Path ?? env.path ?? "");
  let cli, installed;
  try {
    cli = locate({ env, execPath, run, directory });
    const result = run(execPath, [cli, "--version"], { cwd: projectRoot, env, encoding: "utf8", windowsHide: true, timeout: 15000 });
    installed = result.stdout?.trim();
    if (result.error || result.status !== 0 || !versionPattern.test(installed || "")) { cli = null; installed = null; }
  } catch (error) {
    if (env.DSH_CLI) throw error;
  }
  log(installed ? `DSH ${installed}` : "未检测到可运行的 DSH，将自动安装 DSH Web。");

  const query = execute(["view", "@deepseek-ai/dsh@latest", "version", "--json", "--fetch-retries=0", "--fetch-timeout=10000"], { timeout: 15000 });
  let latest;
  try { latest = JSON.parse(query.stdout); } catch {}
  if (query.error || query.status !== 0 || typeof latest !== "string" || !versionPattern.test(latest)) {
    if (!cli) throw Error("无法查询 DSH 发布版本，自动安装未完成。请检查网络和 npm registry 后重试。");
    warn(`无法检查 DSH 更新，继续使用已安装版本 ${installed}。`);
  } else {
    log(`npm latest：DSH ${latest}`);
    if (!cli || compareVersions(installed, latest) < 0) {
      log(`${cli ? "升级" : "安装"} DSH ${latest} 到 ${directory}…`);
      const installation = execute(["install", "--prefix", directory, "--save-exact", "--omit=dev", "--engine-strict", "--no-audit", "--no-fund", `@deepseek-ai/dsh@${latest}`], { stdio: "inherit", timeout: 300000 });
      const updated = path.join(directory, "node_modules/@deepseek-ai/dsh/lib/bin.js");
      const check = !installation.error && installation.status === 0
        ? run(execPath, [updated, "--version"], { env, encoding: "utf8", windowsHide: true, timeout: 15000 }) : null;
      if (check && !check.error && check.status === 0 && check.stdout?.trim() === latest) {
        cli = updated; installed = latest;
        log(`DSH 已就绪：${installed}`);
      } else {
        // Recheck the old entry in case it was the managed installation being updated.
        const old = cli && run(execPath, [cli, "--version"], { env, encoding: "utf8", windowsHide: true, timeout: 15000 });
        if (!old || old.error || old.status !== 0 || !versionPattern.test(old.stdout?.trim() || ""))
          throw Error("DSH 自动安装/升级失败，请检查网络、目录写入权限和 Node.js 版本后重试。");
        warn(`DSH 升级未完成，继续使用原版本 ${installed}。`);
      }
    }
  }
  let pnpm = run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--version"], {
    env, encoding: "utf8", windowsHide: true, timeout: 15000, shell: process.platform === "win32",
  });
  if (pnpm.error || pnpm.status !== 0 || !pnpm.stdout?.trim()) {
    log("未检测到 pnpm，自动安装插件管理所需的 pnpm 10…");
    const install = execute(["install", "--prefix", directory, "--save-exact", "--omit=dev", "--engine-strict", "--no-audit", "--no-fund", "pnpm@10"], { stdio: "inherit", timeout: 300000 });
    if (install.error || install.status !== 0) throw Error("pnpm 自动安装失败，请检查网络与目录权限后重试。");
    const pnpmCli = path.join(directory, "node_modules/pnpm/bin/pnpm.cjs");
    pnpm = run(execPath, [pnpmCli, "--version"], { env, encoding: "utf8", windowsHide: true, timeout: 15000 });
    if (pnpm.error || pnpm.status !== 0 || !pnpm.stdout?.trim()) throw Error("pnpm 安装后仍无法运行，请检查 Node.js 环境。");
  }
  log(`pnpm ${pnpm.stdout.trim()}`);
  try {
    let dir = path.dirname(createRequire(path.resolve(cli)).resolve("@deepseek-ai/dsh-web-app"));
    for (;;) {
      const file = path.join(dir, "package.json");
      if (fs.existsSync(file)) {
        const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
        if (manifest.name === "@deepseek-ai/dsh-web-app") { log(`DSH Web ${manifest.version}`); break; }
      }
      if (path.dirname(dir) === dir) break;
      dir = path.dirname(dir);
    }
  } catch {}
  return cli;
}
