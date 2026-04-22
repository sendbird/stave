import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const srcAlias = {
  "@": path.resolve(__dirname, "./src"),
};

const mainExternalDeps = [
  "electron",
  "better-sqlite3",
  "node-pty",
  "@anthropic-ai/claude-agent-sdk",
  "@openai/codex-sdk",
  "@vscode/ripgrep",
];

const preloadExternalDeps = [
  "electron",
];

export default defineConfig({
  main: {
    resolve: {
      alias: srcAlias,
    },
    build: {
      externalizeDeps: {
        include: mainExternalDeps,
      },
      rolldownOptions: {
        external: mainExternalDeps,
        input: {
          index: path.resolve(__dirname, "electron/main.ts"),
          "host-service": path.resolve(__dirname, "electron/host-service.ts"),
          // Standalone stdio proxy — compiled separately so it can be
          // executed by `node` outside the Electron process.
          "stave-mcp-stdio-proxy": path.resolve(__dirname, "electron/main/stave-mcp-stdio-proxy.ts"),
        },
        output: {
          format: "es",
          entryFileNames: (chunkInfo) =>
            chunkInfo.name === "stave-mcp-stdio-proxy" ? "[name].mjs" : "[name].js",
        },
      },
    },
  },
  preload: {
    resolve: {
      alias: srcAlias,
    },
    build: {
      externalizeDeps: {
        include: preloadExternalDeps,
      },
      rolldownOptions: {
        external: preloadExternalDeps,
        input: {
          index: path.resolve(__dirname, "electron/preload.ts"),
        },
        output: {
          format: "cjs",
          entryFileNames: "index.js",
        },
      },
    },
  },
  renderer: {
    root: ".",
    plugins: [react(), tailwindcss()],
    server: {
      host: "127.0.0.1",
      port: 4174,
      strictPort: true,
      watch: {
        ignored: ["**/.stave/**"],
      },
    },
    resolve: {
      alias: srcAlias,
    },
    build: {
      rolldownOptions: {
        input: path.resolve(__dirname, "index.html"),
      },
    },
  },
});
