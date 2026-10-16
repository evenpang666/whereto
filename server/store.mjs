import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
export class LocalStore {
  constructor(dir) {
    this.dir = dir;
    this.pending = Promise.resolve();
  }
  async read(name, fallback = {}) {
    try {
      return JSON.parse(
        await fs.readFile(path.join(this.dir, name + ".json"), "utf8"),
      );
    } catch (e) {
      if (e.code === "ENOENT") return structuredClone(fallback);
      throw new Error("本地配置文件损坏，请从备份恢复；未覆盖原文件。");
    }
  }
  update(name, fallback, fn) {
    const next = this.pending.then(async () => {
      await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
      const data = await fn(await this.read(name, fallback));
      const target = path.join(this.dir, name + ".json");
      const tmp = target + "." + randomUUID() + ".tmp";
      await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
      await fs.rename(tmp, target);
      return data;
    });
    this.pending = next.catch(() => {});
    return next;
  }
}
