import { describe, expect, test } from "bun:test";
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
  // Basename classification for MCP config fingerprints; reads no file.
  "electron/providers/mcp-config-refresh.ts",
]);

function stripComments(code: string) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

async function findOffenders(pattern: RegExp, allowed: ReadonlySet<string>) {
  const offenders: string[] = [];
  for (const root of ["electron", "src", "server"]) {
    const glob = new Bun.Glob("**/*.{ts,tsx,mts,mjs}");
    for await (const relativePath of glob.scan({ cwd: path.join(REPO_ROOT, root) })) {
      const repoPath = `${root}/${relativePath}`;
      if (repoPath.includes("/node_modules/") || allowed.has(repoPath)) {
        continue;
      }
      const code = stripComments(await Bun.file(path.join(REPO_ROOT, repoPath)).text());
      if (pattern.test(code)) {
        offenders.push(repoPath);
      }
    }
  }
  return offenders.sort();
}

describe("Local MCP manifest consumers", () => {
  test("no production code hardcodes a manifest path", async () => {
    expect(await findOffenders(/local-mcp(?:\.json|-instances)/, MANIFEST_OWNERS)).toEqual([]);
  });

  test("only the manifest store touches the shared manifest path", async () => {
    expect(
      await findOffenders(
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
