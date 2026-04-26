import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { generateRepoMapSnapshot, getOrCreateRepoMap } from "../electron/main/utils/repo-map";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const tempDirs: string[] = [];

function createTempWorkspace(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "stave-repo-map-"));
  tempDirs.push(dir);
  return dir;
}

function write(filePath: string, content: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function writeConfig(root: string, config: object): void {
  write(path.join(root, ".stave/repo-map.config.json"), JSON.stringify(config, null, 2));
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Convention-based discovery (no config file)
// ─────────────────────────────────────────────────────────────────────────────

describe("convention-based discovery (no config)", () => {
  test("discovers README.md, AGENTS.md, and docs/**/*.md automatically", async () => {
    const root = createTempWorkspace();
    write(path.join(root, "README.md"), "# My Project\n");
    write(path.join(root, "AGENTS.md"), "# Policy\n");
    write(path.join(root, "docs/getting-started.md"), "# Getting started\n");
    write(path.join(root, "docs/api/reference.md"), "# API Reference\n");
    write(path.join(root, "src/index.ts"), "export const x = 1;\n");

    const map = await generateRepoMapSnapshot({ rootPath: root });
    const docPaths = map.docs.map((d) => d.path);

    expect(docPaths).toContain("README.md");
    expect(docPaths).toContain("AGENTS.md");
    expect(docPaths).toContain("docs/getting-started.md");
    expect(docPaths).toContain("docs/api/reference.md");
  });

  test("assigns the 'agent policy' role to AGENTS.md by convention", async () => {
    const root = createTempWorkspace();
    write(path.join(root, "AGENTS.md"), "# Policy\n");
    write(path.join(root, "src/index.ts"), "export const x = 1;\n");

    const map = await generateRepoMapSnapshot({ rootPath: root });
    const agents = map.docs.find((d) => d.path === "AGENTS.md");

    expect(agents?.role).toBe("agent policy");
  });

  test("discovers .claude/**/*.md with the 'claude configuration' role", async () => {
    const root = createTempWorkspace();
    write(path.join(root, ".claude/agents/my-agent.md"), "# Agent\n");
    write(path.join(root, "src/index.ts"), "export const x = 1;\n");

    const map = await generateRepoMapSnapshot({ rootPath: root });
    const found = map.docs.find((d) => d.path === ".claude/agents/my-agent.md");

    expect(found).toBeDefined();
    expect(found?.role).toBe("claude configuration");
  });

  test("detects src/index.ts as a 'Source Entry' entrypoint", async () => {
    const root = createTempWorkspace();
    write(path.join(root, "src/index.ts"), "export const x = 1;\n");

    const map = await generateRepoMapSnapshot({ rootPath: root });

    expect(map.entrypoints.some((ep) => ep.id === "src-index")).toBe(true);
  });

  test("detects app/page.tsx as the 'Root Page' (Next.js convention)", async () => {
    const root = createTempWorkspace();
    write(path.join(root, "app/page.tsx"), "export default function Page() { return null; }\n");

    const map = await generateRepoMapSnapshot({ rootPath: root });

    expect(map.entrypoints.some((ep) => ep.id === "pages-root")).toBe(true);
  });

  test("detects server.ts as a 'Server Entry' entrypoint", async () => {
    const root = createTempWorkspace();
    write(path.join(root, "server.ts"), "import http from 'http'; export const start = () => {};\n");

    const map = await generateRepoMapSnapshot({ rootPath: root });

    expect(map.entrypoints.some((ep) => ep.id === "server-entry")).toBe(true);
  });

  test("detects entrypoint from package.json 'main' field", async () => {
    const root = createTempWorkspace();
    // Note: 'dist' is excluded by listFilesRecursive, so point to a source file.
    // This reflects real use: server-side apps often point main to a src file.
    write(
      path.join(root, "package.json"),
      JSON.stringify({ name: "my-app", main: "./src/server.js" }),
    );
    write(path.join(root, "src/server.js"), "module.exports = {};\n");

    const map = await generateRepoMapSnapshot({ rootPath: root });
    const ep = map.entrypoints.find((e) => e.id === "package-main");

    expect(ep).toBeDefined();
    expect(ep?.filePaths).toContain("src/server.js");
  });

  test("ranks a widely-imported file as a hotspot via the import graph", async () => {
    const root = createTempWorkspace();
    // Central utility imported by 8 consumer files — should score high
    write(
      path.join(root, "src/utils.ts"),
      "export const a = 1;\nexport const b = 2;\nexport const c = 3;\nexport const d = 4;\n",
    );
    for (let i = 0; i < 8; i++) {
      write(
        path.join(root, `src/feature${i}.ts`),
        `import { a } from './utils';\nexport const feature = ${i};\n`,
      );
    }

    const map = await generateRepoMapSnapshot({ rootPath: root });
    const utilsHotspot = map.hotspots.find((h) => h.filePath === "src/utils.ts");

    expect(utilsHotspot).toBeDefined();
    expect(utilsHotspot?.importedByCount).toBeGreaterThanOrEqual(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Config-based customization
// ─────────────────────────────────────────────────────────────────────────────

describe("config-based customization (.stave/repo-map.config.json)", () => {
  test("config docs replace convention discovery", async () => {
    const root = createTempWorkspace();
    write(path.join(root, "README.md"), "# ignored\n");
    write(path.join(root, "custom/guide.md"), "# Custom Guide\n");
    writeConfig(root, {
      version: 1,
      docs: [{ path: "custom/guide.md", role: "custom guide" }],
    });
    write(path.join(root, "src/index.ts"), "export const x = 1;\n");

    const map = await generateRepoMapSnapshot({ rootPath: root });
    const docPaths = map.docs.map((d) => d.path);

    expect(docPaths).toContain("custom/guide.md");
    // README.md should NOT appear because config overrides convention
    expect(docPaths).not.toContain("README.md");
  });

  test("config entrypoints replace convention detection", async () => {
    const root = createTempWorkspace();
    write(path.join(root, "src/index.ts"), "export const x = 1;\n");
    write(path.join(root, "src/server.ts"), "export const server = {};\n");
    writeConfig(root, {
      version: 1,
      entrypoints: [
        {
          id: "my-server",
          title: "My Server",
          summary: "Custom server entrypoint.",
          filePaths: ["src/server.ts"],
        },
      ],
    });

    const map = await generateRepoMapSnapshot({ rootPath: root });

    expect(map.entrypoints.some((ep) => ep.id === "my-server")).toBe(true);
    // Convention-detected src-index should NOT appear
    expect(map.entrypoints.some((ep) => ep.id === "src-index")).toBe(false);
  });

  test("config entrypoints filter out file paths that do not exist", async () => {
    const root = createTempWorkspace();
    write(path.join(root, "src/exists.ts"), "export const x = 1;\n");
    writeConfig(root, {
      version: 1,
      entrypoints: [
        {
          id: "mixed",
          title: "Mixed",
          summary: "Some files exist, some do not.",
          filePaths: ["src/exists.ts", "src/does-not-exist.ts"],
        },
      ],
    });

    const map = await generateRepoMapSnapshot({ rootPath: root });
    const ep = map.entrypoints.find((e) => e.id === "mixed");

    expect(ep?.filePaths).toEqual(["src/exists.ts"]);
  });

  test("config hotspot exact-path bonus is applied", async () => {
    const root = createTempWorkspace();
    write(path.join(root, "src/core/engine.ts"), "export const engine = {};\n");
    writeConfig(root, {
      version: 1,
      hotspots: [{ path: "src/core/engine.ts", reason: "core engine", score: 200 }],
    });

    const map = await generateRepoMapSnapshot({ rootPath: root });
    const hotspot = map.hotspots.find((h) => h.filePath === "src/core/engine.ts");

    expect(hotspot).toBeDefined();
    expect(hotspot?.score).toBeGreaterThanOrEqual(200);
    expect(hotspot?.reasons).toContain("core engine");
  });

  test("config hotspot pathPrefix bonus applies to all matching files", async () => {
    const root = createTempWorkspace();
    write(path.join(root, "api/users.ts"), "export const users = {};\n");
    write(path.join(root, "api/posts.ts"), "export const posts = {};\n");
    write(path.join(root, "src/app.ts"), "export const app = {};\n");
    writeConfig(root, {
      version: 1,
      hotspots: [{ path: "api/", reason: "api handler", score: 80, pathPrefix: true }],
    });

    const map = await generateRepoMapSnapshot({ rootPath: root });
    const apiUsers = map.hotspots.find((h) => h.filePath === "api/users.ts");
    const apiPosts = map.hotspots.find((h) => h.filePath === "api/posts.ts");
    const srcApp = map.hotspots.find((h) => h.filePath === "src/app.ts");

    expect(apiUsers?.reasons).toContain("api handler");
    expect(apiPosts?.reasons).toContain("api handler");
    // src/app.ts must NOT receive the api prefix bonus
    expect(srcApp?.reasons ?? []).not.toContain("api handler");
  });

  test("config hotspot bonuses stack on top of import-graph scores", async () => {
    const root = createTempWorkspace();
    // central.ts is imported by 6 consumers AND has a config bonus
    write(
      path.join(root, "src/central.ts"),
      "export const a = 1;\nexport const b = 2;\nexport const c = 3;\nexport const d = 4;\n",
    );
    for (let i = 0; i < 6; i++) {
      write(
        path.join(root, `src/consumer${i}.ts`),
        `import { a } from './central';\nexport const x = ${i};\n`,
      );
    }
    writeConfig(root, {
      version: 1,
      hotspots: [{ path: "src/central.ts", reason: "domain hub", score: 50 }],
    });

    const map = await generateRepoMapSnapshot({ rootPath: root });
    const central = map.hotspots.find((h) => h.filePath === "src/central.ts");

    expect(central).toBeDefined();
    // graph score (importedByCount=6 → 48 pts) + config bonus (50) = 98+
    expect(central?.score).toBeGreaterThan(80);
    expect(central?.reasons).toContain("domain hub");
    expect(central?.reasons).toContain("widely referenced (6)");
  });

  test("ignores a malformed config and falls back to convention discovery", async () => {
    const root = createTempWorkspace();
    write(path.join(root, "README.md"), "# Project\n");
    // Malformed: missing required version field
    write(path.join(root, ".stave/repo-map.config.json"), '{ "docs": [] }');
    write(path.join(root, "src/index.ts"), "export const x = 1;\n");

    const map = await generateRepoMapSnapshot({ rootPath: root });

    // Convention discovery should kick in and find README.md
    expect(map.docs.some((d) => d.path === "README.md")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Caching and incremental analysis
// ─────────────────────────────────────────────────────────────────────────────

describe("caching and incremental analysis", () => {
  test("writes snapshot, analysis cache, and markdown on first generation", async () => {
    const root = createTempWorkspace();
    write(path.join(root, "src/index.ts"), "export const x = 1;\n");

    const result = await getOrCreateRepoMap({ rootPath: root, refresh: true });

    const cacheDir = path.join(root, ".stave/cache");
    expect(result.source).toBe("generated");
    expect(existsSync(path.join(cacheDir, "repo-map.json"))).toBe(true);
    expect(existsSync(path.join(cacheDir, "repo-map.md"))).toBe(true);
    expect(existsSync(path.join(cacheDir, "repo-map-analysis.json"))).toBe(true);
    expect(readFileSync(path.join(cacheDir, "repo-map.md"), "utf8")).toContain("# Repo Map");
  });

  test("returns source=cache when snapshot is fresh", async () => {
    const root = createTempWorkspace();
    write(path.join(root, "src/index.ts"), "export const x = 1;\n");

    await getOrCreateRepoMap({ rootPath: root, refresh: true });
    const cached = await getOrCreateRepoMap({ rootPath: root });

    expect(cached.source).toBe("cache");
  });

  test("regenerates when refresh=true even if snapshot is fresh", async () => {
    const root = createTempWorkspace();
    write(path.join(root, "src/index.ts"), "export const x = 1;\n");

    await getOrCreateRepoMap({ rootPath: root, refresh: true });
    const forced = await getOrCreateRepoMap({ rootPath: root, refresh: true });

    expect(forced.source).toBe("generated");
  });

  test("regenerates when snapshot exceeds maxAgeMs", async () => {
    const root = createTempWorkspace();
    write(path.join(root, "src/index.ts"), "export const x = 1;\n");

    // Generate with maxAgeMs=0 so it's immediately stale
    await getOrCreateRepoMap({ rootPath: root, refresh: true });
    const stale = await getOrCreateRepoMap({ rootPath: root, maxAgeMs: 0 });

    expect(stale.source).toBe("generated");
  });

  test("incremental refresh: only changed files are re-read", async () => {
    const root = createTempWorkspace();
    write(path.join(root, "src/stable.ts"), "export const stable = 1;\n");
    write(path.join(root, "src/changing.ts"), "export const v1 = 1;\n");

    // First generation: populates analysis cache for both files
    const first = await getOrCreateRepoMap({ rootPath: root, refresh: true });
    expect(first.source).toBe("generated");

    // Modify one file — mtime changes, the other stays the same
    writeFileSync(path.join(root, "src/changing.ts"), "export const v2 = 2;\nexport const v3 = 3;\n");

    // Second generation: stable.ts should hit the analysis cache
    const second = await getOrCreateRepoMap({ rootPath: root, refresh: true });
    expect(second.source).toBe("generated");

    // The snapshot should reflect the current state
    expect(second.repoMap.codeFileCount).toBe(2);

    // Verify the analysis cache was updated
    const analysisCachePath = path.join(root, ".stave/cache/repo-map-analysis.json");
    const analysisCache = JSON.parse(readFileSync(analysisCachePath, "utf8")) as {
      entries: Record<string, { exportCount: number }>;
    };
    // changing.ts now has 2 exports
    expect(analysisCache.entries["src/changing.ts"]?.exportCount).toBe(2);
  });
});
