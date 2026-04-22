import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      ignored: ["**/.stave/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name(id) {
                if (id.includes("react-virtuoso")) {
                  return "virtuoso";
                }
                if (id.includes("@monaco-editor") || id.includes("monaco-editor")) {
                  return "monaco";
                }
                if (id.includes("react-diff-viewer-continued")) {
                  return "diff-viewer";
                }
                if (id.includes("lucide-react")) {
                  return "lucide";
                }
                if (id.includes("dexie")) {
                  return "dexie";
                }
                if (
                  id.includes("/node_modules/react/") ||
                  id.includes("/node_modules/react-dom/") ||
                  id.includes("/node_modules/scheduler/")
                ) {
                  return "react-core";
                }
                if (id.includes("zustand") || id.includes("zod")) {
                  return "state-runtime";
                }
                if (id.includes("node_modules")) {
                  return "vendor";
                }
                return null;
              },
            },
          ],
        },
      },
    },
    chunkSizeWarningLimit: 450,
  },
});
