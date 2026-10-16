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
  resolveNpm = npmCli, directory = runtimeRoot, log = console.log } = {}) {
  log(`检查启动环境：Node.js ${nodeVersion} · ${process.platform}/${process.arch}`);
  if (Number(nodeVersion.split(".")[0]) < 22) throw Error("需要 Node.js 22 或更新版本，请安装后重试：https://nodejs.org/");
  const npm = resolveNpm({ env, execPath });
  const npmVersion = run(execPath, [npm, "--version"], { cwd: projectRoot, env, encoding: "utf8", windowsHide: true, timeout: 15000 });
  if (npmVersion.error || npmVersion.status !== 0 || !npmVersion.stdout?.trim()) throw Error("npm 无法运行，请检查 Node.js 安装。");
  log(`npm ${npmVersion.stdout.trim()}`);
  let cli;
  try { cli = locate({ env, execPath, run, directory }); }
  catch (error) { throw Error(`未找到已安装的 DSH：${error.message}。启动器不会自动安装或升级 DSH。`); }
  const detected = run(execPath, [cli, "--version"], { cwd: projectRoot, env, encoding: "utf8", windowsHide: true, timeout: 15000 });
  if (detected.error || detected.status !== 0 || !versionPattern.test(detected.stdout?.trim() || "")) throw Error("已安装的 DSH 无法运行，请检查其入口和 Node 环境；不会自动下载其他版本。");
  log(`复用 DSH ${detected.stdout.trim()}：${cli}`);
  const pnpm = run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--version"], {
    env, encoding: "utf8", windowsHide: true, timeout: 15000, shell: process.platform === "win32",
  });
  if (pnpm.error || pnpm.status !== 0 || !pnpm.stdout?.trim()) throw Error("未找到可运行的 pnpm，请先安装与现有 DSH profile 匹配的 pnpm。启动器不会另装 pnpm 10。");
  log(`复用 pnpm ${pnpm.stdout.trim()}`);
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
