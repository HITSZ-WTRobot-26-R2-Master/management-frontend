import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const managementProxyTarget =
  process.env.VITE_MANAGEMENT_PROXY_TARGET ?? "http://127.0.0.1:8080"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/management-api": {
        changeOrigin: true,
        rewrite: (proxyPath) => proxyPath.replace(/^\/management-api/, ""),
        target: managementProxyTarget,
        ws: true,
      },
    },
  },
})
