export function dshWebAddress(env = process.env) {
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
