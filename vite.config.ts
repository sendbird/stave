import { auiStylex } from "./scripts/vite-aui-stylex.mjs";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { createRequire } from "node:module";
import { createWorkspaceWatchIgnore } from "./config/workspace-watch";

const require = createRequire(import.meta.url);
const fontAssetRoots = ["@fontsource-variable/geist", "@fontsource-variable/inter", "@fontsource-variable/jetbrains-mono", "pretendard"]
  .map((name) => path.dirname(require.resolve(`${name}/package.json`)));

export default defineConfig({
  plugins: [
    auiStylex({
      // Every directory whose modules are AUI. Anything not listed compiles as
      // product, which is the safe default: the product layer is topmost, so a
      // misfiled module loses the ability to be re-themed rather than gaining
      // the ability to outrank a theme.
      auiRoots: [path.resolve(__dirname, "src", "components", "aui")],
      enableMediaQueryOrder: false,
      unstable_moduleResolution: { type: "commonJS", rootDir: __dirname },
      aliases: { "@/*": [path.resolve(__dirname, "src", "*")] },
    }),
    react(),
  ],
  server: {
    // Worktrees may resolve fonts from shared dependencies outside their own root.
    fs: { allow: [searchForWorkspaceRoot(__dirname), ...fontAssetRoots] },
    watch: {
      ignored: createWorkspaceWatchIgnore(__dirname),
    },
  },
  // Scan the worker too: its engine, grammars and themes load after first paint.
  // Discovering them then would re-optimize dependencies and reload an active conversation.
  optimizeDeps: {
    entries: ["**/*.html", "!**/__tests__/**", "!**/coverage/**", "src/lib/syntax-highlight.worker.ts"],
    // The scanner covers both module graphs; serve its result without waiting
    // for the browser's initial import crawl, which can wait on that same result.
    holdUntilCrawlEnd: false,
  },
  resolve: {
    // React hooks and editor nodes must share one runtime across dependency trees.
    dedupe: ["react", "react-dom", "lexical"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Module workers keep their dynamic imports as chunks (code-block grammars).
  worker: {
    format: "es",
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
