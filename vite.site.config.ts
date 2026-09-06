import path from "node:path"
import stylex from "@stylexjs/unplugin"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  root: path.resolve(__dirname, "site"),
  base: "./",
  plugins: [
    stylex.vite({
      useCSSLayers: true,
      enableMediaQueryOrder: false,
      unstable_moduleResolution: { type: "commonJS", rootDir: __dirname },
      aliases: { "@/*": [path.resolve(__dirname, "src", "*")] },
    }),
    react(),
  ],
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
