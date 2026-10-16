import { ensureDshPlugin } from "./dsh-runtime.mjs";
try { ensureDshPlugin(); console.log("漫游已注册为 DSH Web 业务插件。重新启动 DSH Web 后生效。"); }
catch (error) { console.error(error.message); process.exitCode = 1; }
