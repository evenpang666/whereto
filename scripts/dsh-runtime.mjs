import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const runtimeRoot = path.join(projectRoot, ".local/runtime");
function isFile(file) {
  try { return fs.statSync(file).isFile(); } catch { return false; }
}

// npm uses symlinks on Unix and adjacent node_modules plus .cmd/.ps1 shims
// on Windows. Return the JavaScript entry so callers never need a shell.
function cliOnPath(name, packageName, entry, env) {
  const searchPath = env.PATH ?? env.Path ?? env.path ?? "";
  for (const directory of searchPath.split(path.delimiter).filter(Boolean)) {
    const dir = directory.replace(/^"(.*)"$/, "$1");
    for (const suffix of ["", ".cmd", ".ps1"]) {
      const command = path.join(dir, name + suffix);
      if (!isFile(command)) continue;
      const real = fs.realpathSync(command);
      if (/\.[cm]?js$/i.test(real) || /^#![^\r\n]*\bnode\b/.test(fs.readFileSync(real, "utf8"))) return real;
      const adjacent = path.join(dir, "node_modules", packageName, entry);
      if (isFile(adjacent)) return adjacent;
    }
  }
}

export function npmCli({ env = process.env, execPath = process.execPath } = {}) {
  const cli = [env.npm_execpath,
    cliOnPath("npm", "npm", "bin/npm-cli.js", env),
    path.join(path.dirname(execPath), "node_modules/npm/bin/npm-cli.js"),
    path.resolve(path.dirname(execPath), "../lib/node_modules/npm/bin/npm-cli.js"),
  ].find(file => file && isFile(file));
  if (!cli) throw Error("未找到 npm，请重新安装包含 npm 的 Node.js 22 或更新版本：https://nodejs.org/");
  return cli;
}

export function dshCli({ env = process.env, execPath = process.execPath, run = spawnSync, directory = runtimeRoot } = {}) {
  if (env.DSH_CLI?.trim()) {
    const explicit = env.DSH_CLI.trim().replace(/^~(?=$|[/\\])/, os.homedir());
    if (isFile(explicit)) return fs.realpathSync(explicit);
    throw Error(`DSH_CLI 指定的文件不存在：${explicit}。请将它设为 DSH 的 JavaScript 入口文件。`);
  }
  const managed = path.join(directory, "node_modules/@deepseek-ai/dsh/lib/bin.js");
  if (isFile(managed)) return managed;
  const onPath = cliOnPath("dsh", "@deepseek-ai/dsh", "lib/bin.js", env);
  if (onPath) return onPath;
  const candidates = [
    env.APPDATA && path.join(env.APPDATA, "npm/node_modules/@deepseek-ai/dsh/lib/bin.js"),
    path.join(projectRoot, "node_modules/@deepseek-ai/dsh/lib/bin.js"),
    path.join(path.dirname(execPath), "node_modules/@deepseek-ai/dsh/lib/bin.js"),
    path.resolve(path.dirname(execPath), "../lib/node_modules/@deepseek-ai/dsh/lib/bin.js"),
  ].filter(Boolean);
  for (const file of candidates) if (isFile(file)) return file;
  let npm;
  try { npm = npmCli({ env, execPath }); } catch {}
  if (npm) {
    const globalRoot = run(execPath, [npm, "root", "-g"], { encoding: "utf8", env, windowsHide: true });
    const root = globalRoot.stdout?.trim();
    if (globalRoot.status === 0 && root) {
      const file = path.join(root, "@deepseek-ai/dsh/lib/bin.js");
      if (isFile(file)) return file;
    }
  }
  throw Error("未找到 DSH。请确认 dsh 已加入 PATH，或设置 DSH_CLI 为其 lib/bin.js 完整路径。尚未安装时运行：npm install -g @deepseek-ai/dsh。");
}
export function ensureDshPlugin(cli = dshCli()) {
  const configuredHome = process.env.DSH_HOME?.trim();
  const dshHome = configuredHome ? configuredHome.replace(/^~(?=$|[/\\])/, os.homedir()) : path.join(os.homedir(), ".dsh");
  const manifestPath = path.join(dshHome, "profiles/web/package.json");
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const link = `link:${projectRoot.replaceAll("\\", "/")}`;
  const installedLink = manifest?.dependencies?.["dsh-whereto"];
  const samePath = installedLink?.startsWith("link:") && path.resolve(path.dirname(manifestPath), installedLink.slice(5)).toLowerCase() === projectRoot.toLowerCase();
  if (!samePath || !manifest?.dsh?.profile?.bundles?.includes("dsh-whereto")) {
    console.log("将漫游业务插件注册到现有 DSH Web profile…");
    const install = spawnSync(process.execPath, [cli, "plugin", "--profile", "web", "add", link], { cwd: projectRoot, stdio: "inherit", windowsHide: true });
    if (install.status !== 0) throw Error("DSH 插件安装失败，请检查 DSH 和 pnpm 安装。");
  }
  return cli;
}
