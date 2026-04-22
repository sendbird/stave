import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  root: path.resolve(__dirname, "site"),
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, ".pages-dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        landing: path.resolve(__dirname, "site/index.html"),
        docs: path.resolve(__dirname, "site/docs/index.html"),
      },
    },
  },
})
