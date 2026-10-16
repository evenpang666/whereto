import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

export function dshWebAddress(env = process.env) {
  if (env.DSH_WEB_URL) {
    const url = new URL(env.DSH_WEB_URL);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw Error("DSH_WEB_URL 必须是本机 DSH Web 的 HTTP 地址。");
    return url.origin;
  }
  const port = Number(env.DSH_WEB_PORT || 3080);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("DSH_WEB_PORT 必须为 1024–65535 的整数。");
  return `http://127.0.0.1:${port}`;
}

export async function probeDshWeb(url, { fetchImpl = fetch } = {}) {
  try {
    const response = await fetchImpl(url + "/", { signal: AbortSignal.timeout(1500), redirect: "manual" });
    // The unauthenticated index identifies DSH without needing its login token.
    // An occupied port alone is not enough to identify a DSH instance.
    const text = await response.text();
    const running = (response.status === 401 && text.includes("dsh web authentication required")) ||
      (response.ok && /<title>\s*(?:DeepSeek Harness|DSH)(?:\s*[-·|][^<]*)?\s*<\/title>/i.test(text));
    return running ? "running" : "occupied";
  } catch (error) {
    if (error.cause?.code === "ECONNREFUSED") return "stopped";
    throw Error(`无法检测 DSH Web（${url}）：${error.message}。请检查该服务状态后重试。`);
  }
}

export async function discoverDshWeb(env = process.env, { directory, processList, probe = probeDshWeb, fetchImpl = fetch } = {}) {
  const preferred = dshWebAddress(env);
  if (env.DSH_WEB_URL || env.DSH_WEB_PORT) return preferred;
  const ports = new Set();
  if (directory) {
    try { for (const name of readdirSync(join(directory, '.local'))) { const match = name.match(/^browser-(\d+)\.json$/); if (match) ports.add(Number(match[1])); } } catch {}
  }
  let listing = processList;
  if (listing === undefined) {
    try { listing = process.platform === 'win32'
      ? execFileSync('powershell.exe', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(node|dsh)(.exe)?$' } | Select-Object -ExpandProperty CommandLine"], { encoding: 'utf8', timeout: 5000 })
      : execFileSync('ps', ['-eo', 'args='], { encoding: 'utf8', timeout: 5000 }); } catch { listing = ''; }
  }
  for (const line of listing.split(/\r?\n/)) {
    if (!/(?:^|[/\\\s])dsh(?:[/\\\s.]|$)/i.test(line) || !/(?:\bweb\b|--profile[=\s]+web)/.test(line)) continue;
    const match = line.match(/--port(?:=|\s+)["']?(\d+)/); if (match) ports.add(Number(match[1]));
  }
  for (const base of new Set([preferred, ...[...ports].filter(port => port > 0 && port <= 65535).map(port => `http://127.0.0.1:${port}`)])) {
    try { const response = await fetchImpl(base + '/whereto/api/health', { signal: AbortSignal.timeout(1000) }); if (response.ok && (await response.json()).app === 'whereto') return base; } catch {}
    if (await probe(base) === 'running') return base;
  }
  return preferred;
}
