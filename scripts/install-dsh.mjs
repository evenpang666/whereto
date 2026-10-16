import { ensureDshPlugin } from "./dsh-runtime.mjs";
import { prepareRuntime } from "./prepare-runtime.mjs";
try { ensureDshPlugin(prepareRuntime()); console.log("漫游已注册为 DSH Web 业务插件。重新启动 DSH Web 后生效。"); }
catch (error) { console.error(error.message); process.exitCode = 1; }
