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
                // Math in replies loads KaTeX (with its stylesheet) on first
                // use; inside `vendor` it would load with the app.
                if (id.includes("/node_modules/katex/")) {
                  return "katex";
                }
                // Structured views load the chart library and the table's
                // windowing on first use. Left out of every named group, they
                // split with the lazy renderer that imports them; a named
                // group would pull their shared dependencies (React) in with
                // them, and `vendor` would load them with the app.
                if (
                  /\/node_modules\/(?:recharts|victory-vendor|@reduxjs\/toolkit|react-redux|redux|redux-thunk|reselect|immer|es-toolkit|eventemitter3|tiny-invariant|@standard-schema\/utils|decimal\.js-light|@tanstack\/(?:react-virtual|virtual-core))\//.test(
                    id,
                  )
                ) {
                  return null;
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
