import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Regression guard for the shared Local MCP manifest.
 *
 * `~/.stave/local-mcp.json` is last-writer-wins across every Stave instance on
 * the machine and can name an instance that already exited. Provider runtimes
 * (Claude, Codex, ACP agents), the stdio proxy and CLI env builders must reach
 * it only through `readStaveLocalMcpManifest*`, which prefers the owning
 * instance's manifest and rejects dead ones. Reading the path directly — or
 * deleting it without the ownership check — brought back `ECONNREFUSED` in
 * every session of a Stave running next to a crashed dev build.
 */
const REPO_ROOT = path.resolve(import.meta.dir, "..");

/** Files that own the manifest lifecycle and may name its paths. */
const MANIFEST_OWNERS = new Set([
  "electron/main/stave-local-mcp-manifest.ts",
  "electron/main/stave-local-mcp-manifest-store.ts",
  // userData compatibility mirror, written through the store.
  "electron/main/stave-mcp-server.ts",
]);

function stripComments(code: string) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/**
 * Production sources with comments stripped, read once and synchronously.
 * This file runs inside the large shared Bun test process; awaiting one read
 * per file there let earlier tests' pending work starve the scan past the
 * 5 s timeout on CI runners.
 */
const PRODUCTION_SOURCES: ReadonlyArray<{ repoPath: string; code: string }> = [
  "electron",
  "src",
  "server",
].flatMap((root) =>
  Array.from(
    new Bun.Glob("**/*.{ts,tsx,mts,mjs}").scanSync({ cwd: path.join(REPO_ROOT, root) }),
    (relativePath) => `${root}/${relativePath}`,
  )
    .filter((repoPath) => !repoPath.includes("/node_modules/"))
    .map((repoPath) => ({
      repoPath,
      code: stripComments(readFileSync(path.join(REPO_ROOT, repoPath), "utf8")),
    })),
);

function findOffenders(pattern: RegExp, allowed: ReadonlySet<string>) {
  return PRODUCTION_SOURCES.filter(
    ({ repoPath, code }) => !allowed.has(repoPath) && pattern.test(code),
  )
    .map(({ repoPath }) => repoPath)
    .sort();
}

describe("Local MCP manifest consumers", () => {
  test("no production code hardcodes a manifest path", () => {
    expect(findOffenders(/local-mcp(?:\.json|-instances)/, MANIFEST_OWNERS)).toEqual([]);
  });

  test("only the manifest store touches the shared manifest path", () => {
    expect(
      findOffenders(
        /\bgetPrimaryStaveLocalMcpManifestPath\b|\bgetStaveLocalMcpInstanceManifestRoot\b/,
        new Set([
          "electron/main/stave-local-mcp-manifest.ts",
          "electron/main/stave-local-mcp-manifest-store.ts",
        ]),
      ),
    ).toEqual([]);
  });

  test("the main process stamps itself as the Local MCP owner of its children", async () => {
    const mainSource = await Bun.file(path.join(REPO_ROOT, "electron/main.ts")).text();
    expect(mainSource).toMatch(
      /process\.env\[STAVE_LOCAL_MCP_OWNER_PID_ENV\]\s*=\s*String\(process\.pid\)/,
    );
  });
});
