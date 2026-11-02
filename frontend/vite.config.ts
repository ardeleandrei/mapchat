import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const envDir = fileURLToPath(new URL("../", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, ["DEV_", "VITE_API_PROXY_TARGET"]);
  const target = env.VITE_API_PROXY_TARGET || "http://127.0.0.1:3000";

  return {
    envDir,
    plugins: [vue()],
    server: {
      host: "127.0.0.1",
      port: Number(env.DEV_FRONTEND_PORT || 5173),
      strictPort: true,
      proxy: {
        "/api": { target },
        "/ws": { target, ws: true },
      },
    },
  };
});
