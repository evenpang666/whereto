import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function dshCli() {
  const candidates = [process.env.DSH_CLI,
    process.env.APPDATA && path.join(process.env.APPDATA, "npm/node_modules/@deepseek-ai/dsh/lib/bin.js"),
    path.join(path.dirname(process.execPath), "node_modules/@deepseek-ai/dsh/lib/bin.js")].filter(Boolean);
  for (const file of candidates) if (fs.existsSync(file)) return file;
  const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
  const globalRoot = spawnSync(process.execPath, [npmCli, "root", "-g"], { encoding: "utf8" });
  const file = path.join(globalRoot.stdout?.trim() || "", "@deepseek-ai/dsh/lib/bin.js");
  if (globalRoot.status === 0 && fs.existsSync(file)) return file;
  throw Error("未找到 DSH。请先安装：npm install -g @deepseek-ai/dsh，并在 DSH Web 配置模型。");
}
export function ensureDshPlugin() {
  const cli = dshCli();
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
