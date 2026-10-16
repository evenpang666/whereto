import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { prepareRuntime, compareVersions } from "../scripts/prepare-runtime.mjs";

function toolchain({ installed = "0.1.5-rc.1", latest = "0.2.0-rc.2", offline = false, failInstall = false, pnpmMissing = false } = {}) {
  const calls = [], messages = [], warnings = [], env = { PATH: "/existing-bin" };
  const directory = path.join(path.resolve("/tmp"), "whereto-runtime-mock");
  const oldCli = path.join(directory, "old-dsh.mjs");
  const newCli = path.join(directory, "node_modules/@deepseek-ai/dsh/lib/bin.js");
  let ready = false, pnpmReady = !pnpmMissing;
  const result = stdout => ({ status: 0, stdout });
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    if (args[0] === "npm-cli.mjs") {
      if (args.includes("view")) return offline ? { status: 1, stderr: "offline" } : result(JSON.stringify(latest));
      if (args.includes("install")) {
        if (failInstall) return { status: 1 };
        if (args.some(arg => arg.startsWith("@deepseek-ai/dsh@"))) ready = true;
        if (args.includes("pnpm@10")) pnpmReady = true;
        return result("");
      }
      return result("10.9.9\n");
    }
    if (args[0] === oldCli) return result(installed + "\n");
    if (args[0] === newCli) return ready ? result(latest + "\n") : { status: 1 };
    if (command.endsWith("pnpm") || command.endsWith("pnpm.cmd") || args[0]?.endsWith("pnpm.cjs"))
      return pnpmReady ? result("10.17.1\n") : { status: null, error: Error("ENOENT") };
    assert.fail(`unexpected command: ${command} ${args.join(" ")}`);
  };
  return { calls, messages, warnings, oldCli, newCli, env, options: {
    env, directory, run, nodeVersion: "22.23.3", resolveNpm: () => "npm-cli.mjs",
    locate: () => { if (!installed) throw Error("missing"); return oldCli; },
    log: text => messages.push(text), warn: text => warnings.push(text),
  } };
}

test("startup installs missing DSH and pnpm locally and returns the verified DSH entry", () => {
  const f = toolchain({ installed: null, pnpmMissing: true });
  assert.equal(prepareRuntime(f.options), f.newCli);
  const installs = f.calls.filter(call => call.args.includes("install"));
  assert.equal(installs.length, 2);
  assert.ok(installs.every(call => call.args.includes("--prefix") && !call.args.includes("-g")));
  assert.ok(f.env.PATH.startsWith(path.join(f.options.directory, "node_modules/.bin")));
  assert.ok(f.messages.some(text => text.includes("未检测到可运行的 DSH")));
});

test("startup upgrades an older DSH and keeps an equal or newer release", () => {
  const old = toolchain();
  assert.equal(prepareRuntime(old.options), old.newCli);
  for (const installed of ["0.2.0-rc.2", "0.2.1-alpha.4"]) {
    const f = toolchain({ installed });
    assert.equal(prepareRuntime(f.options), f.oldCli);
    assert.equal(f.calls.filter(call => call.args.includes("install")).length, 0);
  }
});

test("offline startup keeps existing DSH but explains why first installation cannot continue", () => {
  const f = toolchain({ offline: true });
  assert.equal(prepareRuntime(f.options), f.oldCli);
  assert.ok(f.warnings.some(text => text.includes("继续使用")));
  assert.throws(() => prepareRuntime(toolchain({ offline: true, installed: null }).options), /自动安装未完成/);
});

test("failed upgrades recheck the installed runtime; failed first installation stops startup", () => {
  const f = toolchain({ failInstall: true });
  assert.equal(prepareRuntime(f.options), f.oldCli);
  assert.ok(f.warnings.some(text => text.includes("升级未完成")));
  assert.throws(() => prepareRuntime(toolchain({ installed: null, failInstall: true }).options), /自动安装\/升级失败/);
});

test("unsupported Node stops before accessing npm or changing files", () => {
  const f = toolchain();
  assert.throws(() => prepareRuntime({ ...f.options, nodeVersion: "20.19.0" }), /Node.js 22/);
  assert.equal(f.calls.length, 0);
});

test("release comparison handles numeric prereleases and avoids downgrading alpha users", () => {
  for (const [a, b] of [["0.1.5-rc.1", "0.2.0-rc.2"], ["0.2.0-rc.2", "0.2.0-rc.10"], ["0.2.0-rc.10", "0.2.0"], ["0.2.0", "0.2.1-alpha.4"]]) {
    assert.equal(compareVersions(a, b), -1);
    assert.equal(compareVersions(b, a), 1);
  }
  assert.equal(compareVersions("0.2.0+build.1", "0.2.0"), 0);
});
