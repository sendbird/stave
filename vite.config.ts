import stylex from "@stylexjs/unplugin";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { createWorkspaceWatchIgnore } from "./config/workspace-watch";

export default defineConfig({
  plugins: [
    stylex.vite({
      useCSSLayers: true,
      enableMediaQueryOrder: false,
      unstable_moduleResolution: { type: "commonJS", rootDir: __dirname },
      aliases: { "@/*": [path.resolve(__dirname, "src", "*")] },
    }),
    react(),
  ],
  server: {
    watch: {
      ignored: createWorkspaceWatchIgnore(__dirname),
    },
  },
  resolve: {
    // React hooks and editor nodes must share one runtime across dependency trees.
    dedupe: ["react", "react-dom", "lexical"],
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
                if (
                  id.includes("@monaco-editor") ||
                  id.includes("monaco-editor")
                ) {
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
