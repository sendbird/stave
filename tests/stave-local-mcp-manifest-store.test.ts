import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { StaveLocalMcpManifest } from "../src/lib/local-mcp";
import {
  STAVE_LOCAL_MCP_OWNER_PID_ENV,
  isLiveStaveLocalMcpManifest,
  readStaveLocalMcpManifest,
  readStaveLocalMcpManifestSync,
  resolveStaveLocalMcpManifestPath,
  resolveStaveLocalMcpOwnerPid,
} from "../electron/main/stave-local-mcp-manifest";
import {
  publishStaveLocalMcpManifest,
  readLivePrimaryStaveLocalMcpManifest,
  reclaimPrimaryStaveLocalMcpManifest,
  retractStaveLocalMcpManifest,
  sweepDeadStaveLocalMcpInstanceManifests,
} from "../electron/main/stave-local-mcp-manifest-store";

const INSTALLED_PID = 50_001;
const DEV_PID = 50_002;
const OTHER_PID = 50_003;

function buildManifest(pid: number, port: number): StaveLocalMcpManifest {
  return {
    version: 1,
    name: "stave-local-mcp",
    mode: "local-only",
    url: `http://127.0.0.1:${port}/mcp`,
    healthUrl: `http://127.0.0.1:${port}/health`,
    token: `token-${pid}`,
    host: "127.0.0.1",
    port,
    pid,
    appVersion: "0.0.0-test",
    startedAt: "2026-01-01T00:00:00.000Z",
    stdioProxyScript: "/tmp/stave-mcp-stdio-proxy.mjs",
  };
}

let root = "";
let alive = new Set<number>();
const isAlive = (pid: number) => alive.has(pid);

function storeOptions() {
  return {
    paths: {
      primaryPath: path.join(root, ".stave", "local-mcp.json"),
      instanceRoot: path.join(root, ".stave", "local-mcp-instances"),
      mirrorPaths: [path.join(root, "userData", "stave-local-mcp.json")],
    },
    isAlive,
  };
}

function readOptions(ownerPid: number | null) {
  const { paths } = storeOptions();
  return {
    env: ownerPid === null
      ? {}
      : { [STAVE_LOCAL_MCP_OWNER_PID_ENV]: String(ownerPid) },
    isAlive,
    locations: {
      primaryPath: paths.primaryPath,
      instanceRoot: paths.instanceRoot,
    },
  };
}

async function readJson(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as StaveLocalMcpManifest;
}

async function exists(filePath: string) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "stave-local-mcp-store-"));
  alive = new Set();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("Local MCP manifest resolver", () => {
  test("parses only a positive integer owner pid", () => {
    expect(resolveStaveLocalMcpOwnerPid({ [STAVE_LOCAL_MCP_OWNER_PID_ENV]: "42" })).toBe(42);
    expect(resolveStaveLocalMcpOwnerPid({ [STAVE_LOCAL_MCP_OWNER_PID_ENV]: "0" })).toBeNull();
    expect(resolveStaveLocalMcpOwnerPid({ [STAVE_LOCAL_MCP_OWNER_PID_ENV]: "4x" })).toBeNull();
    expect(resolveStaveLocalMcpOwnerPid({})).toBeNull();
  });

  test("routes owned processes to their instance manifest and others to the shared file", () => {
    const { locations } = readOptions(null);
    expect(resolveStaveLocalMcpManifestPath({}, locations)).toBe(locations.primaryPath);
    expect(
      resolveStaveLocalMcpManifestPath(
        { [STAVE_LOCAL_MCP_OWNER_PID_ENV]: String(INSTALLED_PID) },
        locations,
      ),
    ).toBe(path.join(locations.instanceRoot, String(INSTALLED_PID), "local-mcp.json"));
  });

  test("rejects a manifest whose process has exited", () => {
    const manifest = buildManifest(DEV_PID, 55_028);
    expect(isLiveStaveLocalMcpManifest(manifest, { isAlive })).toBe(false);
    alive.add(DEV_PID);
    expect(isLiveStaveLocalMcpManifest(manifest, { isAlive })).toBe(true);
    expect(isLiveStaveLocalMcpManifest({ url: "http://x", token: "t" }, { isAlive })).toBe(false);
  });

  test("ignores an instance manifest that names a different owner", async () => {
    alive.add(INSTALLED_PID).add(OTHER_PID);
    const { paths } = storeOptions();
    const foreignPath = path.join(paths.instanceRoot, String(INSTALLED_PID), "local-mcp.json");
    await mkdir(path.dirname(foreignPath), { recursive: true });
    await writeFile(foreignPath, JSON.stringify(buildManifest(OTHER_PID, 1)));
    expect(await readStaveLocalMcpManifest(readOptions(INSTALLED_PID))).toBeNull();
  });
});

describe("Local MCP manifest store", () => {
  test("publish writes the instance, shared and mirror manifests", async () => {
    alive.add(INSTALLED_PID);
    const manifest = buildManifest(INSTALLED_PID, 39_517);
    const written = await publishStaveLocalMcpManifest(manifest, storeOptions());
    const { paths } = storeOptions();
    expect(written).toEqual([
      path.join(paths.instanceRoot, String(INSTALLED_PID), "local-mcp.json"),
      paths.primaryPath,
      ...paths.mirrorPaths,
    ]);
    for (const filePath of written) {
      expect(await readJson(filePath)).toEqual(manifest);
    }
    expect(await readStaveLocalMcpManifest(readOptions(INSTALLED_PID))).toEqual(manifest);
    expect(readStaveLocalMcpManifestSync(readOptions(INSTALLED_PID))).toEqual(manifest);
    expect(await readStaveLocalMcpManifest(readOptions(null))).toEqual(manifest);
  });

  test("retract never deletes a shared manifest owned by another live instance", async () => {
    alive.add(INSTALLED_PID).add(DEV_PID);
    await publishStaveLocalMcpManifest(buildManifest(INSTALLED_PID, 39_517), storeOptions());
    await publishStaveLocalMcpManifest(buildManifest(DEV_PID, 55_028), storeOptions());

    const removed = await retractStaveLocalMcpManifest(INSTALLED_PID, storeOptions());

    const { paths } = storeOptions();
    expect(removed).toEqual([]);
    expect((await readJson(paths.primaryPath)).pid).toBe(DEV_PID);
    expect(await exists(path.join(paths.instanceRoot, String(INSTALLED_PID), "local-mcp.json"))).toBe(false);
    expect(await readStaveLocalMcpManifest(readOptions(DEV_PID))).not.toBeNull();
  });

  test("retract removes shared copies this instance or a dead instance owns", async () => {
    alive.add(INSTALLED_PID);
    await publishStaveLocalMcpManifest(buildManifest(INSTALLED_PID, 39_517), storeOptions());
    const { paths } = storeOptions();
    expect((await retractStaveLocalMcpManifest(INSTALLED_PID, storeOptions())).sort()).toEqual(
      [paths.primaryPath, ...paths.mirrorPaths].sort(),
    );

    // A crashed previous launch left its manifest behind.
    await mkdir(path.dirname(paths.primaryPath), { recursive: true });
    await writeFile(paths.primaryPath, JSON.stringify(buildManifest(DEV_PID, 55_028)));
    expect(await retractStaveLocalMcpManifest(INSTALLED_PID, storeOptions())).toEqual([
      paths.primaryPath,
    ]);
  });

  test("reclaim takes back a missing or dead shared manifest but defers to a live owner", async () => {
    alive.add(INSTALLED_PID);
    const installed = buildManifest(INSTALLED_PID, 39_517);
    const { paths } = storeOptions();

    expect(await reclaimPrimaryStaveLocalMcpManifest(installed, storeOptions())).toBe("reclaimed");
    expect(await reclaimPrimaryStaveLocalMcpManifest(installed, storeOptions())).toBe("owned");
    // The instance file is restored alongside the shared one.
    expect(await readStaveLocalMcpManifest(readOptions(INSTALLED_PID))).toEqual(installed);

    alive.add(OTHER_PID);
    await writeFile(paths.primaryPath, JSON.stringify(buildManifest(OTHER_PID, 40_000)));
    expect(await reclaimPrimaryStaveLocalMcpManifest(installed, storeOptions())).toBe("held-by-other");
    expect((await readJson(paths.primaryPath)).pid).toBe(OTHER_PID);

    alive.delete(OTHER_PID);
    expect(await reclaimPrimaryStaveLocalMcpManifest(installed, storeOptions())).toBe("reclaimed");
    expect(await readJson(paths.primaryPath)).toEqual(installed);

    await writeFile(paths.primaryPath, "{ not json");
    expect(await reclaimPrimaryStaveLocalMcpManifest(installed, storeOptions())).toBe("reclaimed");
  });

  test("sweeps instance directories of exited processes", async () => {
    alive.add(INSTALLED_PID);
    const { paths } = storeOptions();
    for (const pid of [INSTALLED_PID, DEV_PID]) {
      const filePath = path.join(paths.instanceRoot, String(pid), "local-mcp.json");
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(buildManifest(pid, pid)));
    }
    expect(await sweepDeadStaveLocalMcpInstanceManifests(storeOptions())).toEqual([DEV_PID]);
    expect(await readdir(paths.instanceRoot)).toEqual([String(INSTALLED_PID)]);
  });

  // Regression: an installed build and a dev build ran side by side, the dev
  // build overwrote the shared manifest and then exited without cleaning up.
  // Every Claude session in the installed build then failed with ECONNREFUSED.
  test("a crashed side-by-side instance cannot redirect another instance's sessions", async () => {
    alive.add(INSTALLED_PID).add(DEV_PID);
    const installed = buildManifest(INSTALLED_PID, 39_517);
    await publishStaveLocalMcpManifest(installed, storeOptions());
    await publishStaveLocalMcpManifest(buildManifest(DEV_PID, 55_028), storeOptions());
    alive.delete(DEV_PID);

    // In-app sessions of the installed build keep their own endpoint.
    expect(await readStaveLocalMcpManifest(readOptions(INSTALLED_PID))).toEqual(installed);
    // External clients never receive the dead endpoint.
    expect(await readStaveLocalMcpManifest(readOptions(null))).toBeNull();
    expect(await readLivePrimaryStaveLocalMcpManifest(storeOptions())).toBeNull();

    // The installed build's reclaim loop restores the shared manifest.
    expect(await reclaimPrimaryStaveLocalMcpManifest(installed, storeOptions())).toBe("reclaimed");
    expect(await readStaveLocalMcpManifest(readOptions(null))).toEqual(installed);
  });
});
