import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:3000" },
      "/ws": { target: process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:3000", ws: true },
    },
  },
});
