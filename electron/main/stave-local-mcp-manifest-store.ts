import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { StaveLocalMcpManifest } from "../../src/lib/local-mcp";
import {
  getPrimaryStaveLocalMcpManifestPath,
  getStaveLocalMcpInstanceManifestPath,
  getStaveLocalMcpInstanceManifestRoot,
  isLiveStaveLocalMcpManifest,
  isProcessAlive,
  isStaveLocalMcpManifest,
} from "./stave-local-mcp-manifest";

/**
 * Manifest file lifecycle for one Stave instance.
 *
 * Several Stave instances (an installed build next to a dev build, or two
 * profiles) can run at once and all of them know the shared
 * `~/.stave/local-mcp.json`. The rules below keep every instance's sessions
 * pointed at a live endpoint:
 *
 * - Each instance owns `local-mcp-instances/<pid>/local-mcp.json`; in-app
 *   consumers resolve through it, so the shared file can never redirect them.
 * - The shared file (and any mirror copies) is removed only by its owner, or
 *   when its owner is no longer running. Another live instance's file is left
 *   alone.
 * - A running instance reclaims the shared file when it is missing or names a
 *   dead instance, so external CLIs recover without a restart.
 */
export interface StaveLocalMcpManifestStorePaths {
  primaryPath: string;
  instanceRoot: string;
  /** Extra copies kept for compatibility (for example the userData mirror). */
  mirrorPaths: readonly string[];
}

export interface StaveLocalMcpManifestStoreOptions {
  paths?: Partial<StaveLocalMcpManifestStorePaths>;
  isAlive?: (pid: number) => boolean;
}

function resolvePaths(
  options?: StaveLocalMcpManifestStoreOptions,
): StaveLocalMcpManifestStorePaths {
  return {
    primaryPath: options?.paths?.primaryPath ?? getPrimaryStaveLocalMcpManifestPath(),
    instanceRoot: options?.paths?.instanceRoot ?? getStaveLocalMcpInstanceManifestRoot(),
    mirrorPaths: options?.paths?.mirrorPaths ?? [],
  };
}

function instanceManifestPath(root: string, pid: number) {
  return getStaveLocalMcpInstanceManifestPath(pid, root);
}

async function readManifestFile(filePath: string): Promise<
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "manifest"; manifest: StaveLocalMcpManifest }
> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return { kind: "missing" };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isStaveLocalMcpManifest(parsed)
      ? { kind: "manifest", manifest: parsed }
      : { kind: "invalid" };
  } catch {
    return { kind: "invalid" };
  }
}

/**
 * Write via a sibling temp file and rename so a concurrent reader never sees a
 * truncated document.
 */
async function writeManifestFile(filePath: string, manifest: StaveLocalMcpManifest) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      mode: 0o600,
    });
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

function sameEndpoint(left: StaveLocalMcpManifest, right: StaveLocalMcpManifest) {
  return (
    left.pid === right.pid &&
    left.url === right.url &&
    left.token === right.token &&
    left.stdioProxyScript === right.stdioProxyScript
  );
}

/**
 * Remove instance directories whose process has exited. A crashed instance
 * cannot clean up, and its directory would otherwise accumulate forever.
 */
export async function sweepDeadStaveLocalMcpInstanceManifests(
  options?: StaveLocalMcpManifestStoreOptions & { keepPid?: number },
) {
  const { instanceRoot } = resolvePaths(options);
  const isAlive = options?.isAlive ?? isProcessAlive;
  let entries: string[];
  try {
    entries = await fs.readdir(instanceRoot);
  } catch {
    return [];
  }
  const removed: number[] = [];
  await Promise.all(
    entries.map(async (entry) => {
      if (!/^\d+$/.test(entry)) {
        return;
      }
      const pid = Number(entry);
      if (pid === options?.keepPid || isAlive(pid)) {
        return;
      }
      await fs.rm(path.join(instanceRoot, entry), { recursive: true, force: true });
      removed.push(pid);
    }),
  );
  return removed;
}

/**
 * Publish a freshly bound server. The starting instance takes over the shared
 * file: it is the one the user most recently launched or reconfigured.
 */
export async function publishStaveLocalMcpManifest(
  manifest: StaveLocalMcpManifest,
  options?: StaveLocalMcpManifestStoreOptions,
) {
  const paths = resolvePaths(options);
  const instancePath = instanceManifestPath(paths.instanceRoot, manifest.pid);
  // Instance file first: in-app consumers depend on it, the shared file only
  // serves external clients.
  await writeManifestFile(instancePath, manifest);
  const sharedPaths = [paths.primaryPath, ...paths.mirrorPaths];
  await Promise.all(sharedPaths.map((filePath) => writeManifestFile(filePath, manifest)));
  await sweepDeadStaveLocalMcpInstanceManifests({
    ...options,
    keepPid: manifest.pid,
  }).catch(() => []);
  return [instancePath, ...sharedPaths];
}

/**
 * Withdraw this instance's endpoint. Shared files are deleted only when this
 * instance owns them or their owner has exited — never out from under another
 * live instance.
 */
export async function retractStaveLocalMcpManifest(
  pid: number,
  options?: StaveLocalMcpManifestStoreOptions,
) {
  const paths = resolvePaths(options);
  const isAlive = options?.isAlive ?? isProcessAlive;
  await fs.rm(path.join(paths.instanceRoot, String(pid)), {
    recursive: true,
    force: true,
  });
  const removed: string[] = [];
  await Promise.all(
    [paths.primaryPath, ...paths.mirrorPaths].map(async (filePath) => {
      const current = await readManifestFile(filePath);
      if (current.kind === "missing") {
        return;
      }
      if (
        current.kind === "manifest" &&
        current.manifest.pid !== pid &&
        isAlive(current.manifest.pid)
      ) {
        return;
      }
      await fs.rm(filePath, { force: true });
      removed.push(filePath);
    }),
  );
  await sweepDeadStaveLocalMcpInstanceManifests(options).catch(() => []);
  return removed;
}

/** The shared manifest, only when the instance that wrote it is running. */
export async function readLivePrimaryStaveLocalMcpManifest(
  options?: StaveLocalMcpManifestStoreOptions,
) {
  const { primaryPath } = resolvePaths(options);
  const current = await readManifestFile(primaryPath);
  if (current.kind !== "manifest") {
    return null;
  }
  return isLiveStaveLocalMcpManifest(current.manifest, {
    isAlive: options?.isAlive,
  })
    ? current.manifest
    : null;
}

export type StaveLocalMcpPrimaryClaim = "owned" | "reclaimed" | "held-by-other";

/**
 * Make sure the shared manifest names a running instance. Rewrites it with
 * `manifest` when it is missing, unreadable, stale for this instance, or left
 * behind by an instance that exited; leaves it alone while another live
 * instance holds it.
 */
export async function reclaimPrimaryStaveLocalMcpManifest(
  manifest: StaveLocalMcpManifest,
  options?: StaveLocalMcpManifestStoreOptions,
): Promise<StaveLocalMcpPrimaryClaim> {
  const paths = resolvePaths(options);
  const isAlive = options?.isAlive ?? isProcessAlive;
  // The instance file is ours alone; restore it if anything removed it, since
  // every in-app consumer of this instance resolves through it.
  const instancePath = instanceManifestPath(paths.instanceRoot, manifest.pid);
  const instance = await readManifestFile(instancePath);
  if (instance.kind !== "manifest" || !sameEndpoint(instance.manifest, manifest)) {
    await writeManifestFile(instancePath, manifest);
  }
  const current = await readManifestFile(paths.primaryPath);
  if (current.kind === "manifest") {
    if (sameEndpoint(current.manifest, manifest)) {
      return "owned";
    }
    if (current.manifest.pid !== manifest.pid && isAlive(current.manifest.pid)) {
      return "held-by-other";
    }
  }
  await writeManifestFile(paths.primaryPath, manifest);
  return "reclaimed";
}
