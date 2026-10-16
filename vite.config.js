import { defineConfig } from "vite";
export default defineConfig({
  base: "/whereto/",
  server: { host: "127.0.0.1", proxy: { "/whereto/api": { target: process.env.DSH_WEB_URL || "http://127.0.0.1:3080", changeOrigin: true } } },
  build: { target: "es2022" },
});
