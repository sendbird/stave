import { execFile } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { WorkspaceDiskMeasurement, WorkspaceDiskUsageReport, WorkspaceDiskUsageRow } from "../../src/lib/workspace-cleanup-contract";

/** One folder never holds the measurement queue longer than this. */
export const DISK_MEASURE_TIMEOUT_MS = 30_000;
/** A walk stops counting after this many entries and reports what it counted. */
export const DISK_WALK_MAX_ENTRIES = 500_000;
/** A measurement younger than this is reused instead of measured again. */
export const DISK_USAGE_MAX_AGE_MS = 5 * 60_000;

export type DirectorySize = { bytes: number; partial: boolean; method: "du" | "walk" } | { bytes: null; timedOut: boolean };

type ExecResult = { stdout: string; code: string | number | null; killed: boolean };
export type ExecRunner = (command: string, args: string[], timeoutMs: number) => Promise<ExecResult>;

const execRunner: ExecRunner = (command, args, timeoutMs) => new Promise((resolve) => {
  execFile(command, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024, killSignal: "SIGKILL" }, (error, stdout) => {
    const failure = error as (NodeJS.ErrnoException & { killed?: boolean }) | null;
    resolve({ stdout: String(stdout ?? ""), code: failure ? failure.code ?? null : 0, killed: Boolean(failure?.killed) });
  });
});

/** The KiB total `du -sk` prints first; null when there is none. */
export function parseDuKilobytes(stdout: string): number | null {
  const match = /^\s*(\d+)\s/.exec(stdout);
  if (!match) return null;
  const kilobytes = Number(match[1]);
  return Number.isSafeInteger(kilobytes) ? kilobytes : null;
}

/**
 * `du -sk` at the lowest CPU priority. It exits non-zero when a subfolder is
 * unreadable but still prints a total, which then counts as partial. Without
 * `nice` on PATH it runs `du` alone. "missing" means neither could run.
 */
export async function measureWithDu(path: string, options: { run?: ExecRunner; timeoutMs?: number } = {}):
  Promise<{ bytes: number; partial: boolean } | "timeout" | "missing" | "failed"> {
  const run = options.run ?? execRunner;
  const timeoutMs = options.timeoutMs ?? DISK_MEASURE_TIMEOUT_MS;
  let result = await run("nice", ["-n", "19", "du", "-sk", path], timeoutMs);
  if (result.code === "ENOENT") result = await run("du", ["-sk", path], timeoutMs);
  if (result.killed) return "timeout";
  if (result.code === "ENOENT") return "missing";
  const kilobytes = parseDuKilobytes(result.stdout);
  if (kilobytes === null) return "failed";
  return { bytes: kilobytes * 1024, partial: result.code !== 0 };
}

/**
 * Walks a folder in Node, counting allocated blocks (or the size where the
 * platform reports none) without following symbolic links. It stops at the
 * time or entry budget and reports what it counted as partial. Null only when
 * the folder itself cannot be read.
 */
export async function walkDirectorySize(path: string, options: { budgetMs?: number; maxEntries?: number; now?: () => number } = {}):
  Promise<{ bytes: number; partial: boolean } | null> {
  const now = options.now ?? Date.now;
  const deadline = now() + (options.budgetMs ?? DISK_MEASURE_TIMEOUT_MS);
  const maxEntries = options.maxEntries ?? DISK_WALK_MAX_ENTRIES;
  const usage = (stat: { blocks?: number; size: number }) => stat.blocks ? stat.blocks * 512 : stat.size;
  let root;
  try { root = await lstat(path); } catch { return null; }
  if (!root.isDirectory()) return { bytes: usage(root), partial: false };
  let bytes = usage(root);
  let entries = 0;
  const pending = [path];
  while (pending.length) {
    if (now() >= deadline || entries >= maxEntries) return { bytes, partial: true };
    const folder = pending.pop()!;
    let names: string[];
    try { names = await readdir(folder); } catch { if (folder === path) return null; continue; }
    entries += names.length;
    if (entries > maxEntries) return { bytes, partial: true };
    const stats = await Promise.all(names.map((name) => {
      const child = join(folder, name);
      // A file removed mid-walk adds nothing.
      return lstat(child).then((stat) => ({ child, stat }), () => null);
    }));
    for (const entry of stats) {
      if (!entry) continue;
      bytes += usage(entry.stat);
      if (entry.stat.isDirectory()) pending.push(entry.child);
    }
  }
  return { bytes, partial: false };
}

/**
 * One folder's disk use: `du` on macOS and Linux, a budgeted walk on Windows
 * or when `du` cannot run or prints nothing. A `du` that runs out of time is
 * not walked again, since the walk would spend the same time.
 */
export async function measureDirectory(path: string, options: { platform?: NodeJS.Platform; run?: ExecRunner; timeoutMs?: number;
  walk?: typeof walkDirectorySize } = {}): Promise<DirectorySize> {
  const walk = options.walk ?? walkDirectorySize;
  const timeoutMs = options.timeoutMs ?? DISK_MEASURE_TIMEOUT_MS;
  if ((options.platform ?? process.platform) !== "win32") {
    const du = await measureWithDu(path, { run: options.run, timeoutMs });
    if (du === "timeout") return { bytes: null, timedOut: true };
    if (typeof du === "object") return { ...du, method: "du" };
  }
  const walked = await walk(path, { budgetMs: timeoutMs });
  return walked ? { ...walked, method: "walk" } : { bytes: null, timedOut: false };
}

/**
 * Per-workspace measurements, kept while their folder stays the same. Folders
 * are measured one at a time; asking again for a folder already being
 * measured waits for that measurement instead of starting another.
 */
export function createWorkspaceDiskUsage(options: { measure?: (path: string) => Promise<DirectorySize>; now?: () => number } = {}) {
  const measure = options.measure ?? ((path: string) => measureDirectory(path));
  const now = options.now ?? Date.now;
  const cache = new Map<string, WorkspaceDiskMeasurement & { path: string }>();
  const inFlight = new Map<string, Promise<WorkspaceDiskMeasurement>>();
  let queue: Promise<unknown> = Promise.resolve();

  function cached(workspaceId: string, path: string, maxAgeMs: number) {
    const entry = cache.get(workspaceId);
    return entry && entry.path === path && now() - Date.parse(entry.measuredAt) < maxAgeMs ? entry : null;
  }

  function read(workspaceId: string, path: string, maxAgeMs = DISK_USAGE_MAX_AGE_MS): Promise<WorkspaceDiskMeasurement> {
    const fresh = cached(workspaceId, path, maxAgeMs);
    if (fresh) return Promise.resolve(withoutPath(fresh));
    const key = JSON.stringify([workspaceId, path]);
    const running = inFlight.get(key);
    if (running) return running;
    const next = queue.then(async () => {
      const size = await measure(path).catch((): DirectorySize => ({ bytes: null, timedOut: false }));
      const measurement: WorkspaceDiskMeasurement = size.bytes === null
        ? { bytes: null, partial: false, status: size.timedOut ? "timeout" : "unavailable", measuredAt: new Date(now()).toISOString() }
        : { bytes: size.bytes, partial: size.partial, status: "measured", measuredAt: new Date(now()).toISOString() };
      cache.set(workspaceId, { ...measurement, path });
      return measurement;
    }).finally(() => inFlight.delete(key));
    inFlight.set(key, next);
    queue = next.catch(() => undefined);
    return next;
  }

  /** The last measurement of a folder, however old; null before the first one finishes. */
  function peek(workspaceId: string, path: string): WorkspaceDiskMeasurement | null {
    const entry = cache.get(workspaceId);
    return entry && entry.path === path ? withoutPath(entry) : null;
  }

  return { read, peek, isMeasuring: () => inFlight.size > 0 };
}

export type WorkspaceDiskUsage = ReturnType<typeof createWorkspaceDiskUsage>;
type WorkspaceFolder = Omit<WorkspaceDiskUsageRow, "measurement"> & { path: string };
type FolderSource = {
  loadRepositoryRegistry(): Array<{ repositoryPath: string; repositoryName: string; workspaces: Array<{ id: string; name: string }>;
    workspacePathById: Record<string, string>; workspaceDefaultById: Record<string, boolean> }>;
  listArchivedWorkspacesPersistence(args: { repositoryPath: string }): Array<{ workspaceId: string; name: string; path: string }>;
};

/**
 * The folders Stave created for workspaces, active or archived with their
 * checkout kept. A project's own checkout is left out: workspace folders live
 * inside it, so measuring it would count them twice.
 */
export function workspaceDiskFolders(store: FolderSource, options: { exists?: (path: string) => boolean; canonical?: (path: string) => string } = {}): WorkspaceFolder[] {
  const exists = options.exists ?? existsSync;
  const canonical = options.canonical ?? ((path: string) => { try { return realpathSync(path); } catch { return resolve(path); } });
  const folders: WorkspaceFolder[] = [];
  const seen = new Set<string>();
  const add = (folder: WorkspaceFolder) => {
    const key = canonical(folder.path);
    if (!folder.path || seen.has(key) || key === canonical(folder.repositoryPath)) return;
    seen.add(key);
    folders.push(folder);
  };
  for (const repository of store.loadRepositoryRegistry()) {
    const base = { repositoryPath: repository.repositoryPath, repositoryName: repository.repositoryName };
    for (const workspace of repository.workspaces) {
      if (repository.workspaceDefaultById[workspace.id]) continue;
      add({ ...base, workspaceId: workspace.id, name: workspace.name, archived: false, path: repository.workspacePathById[workspace.id] ?? "" });
    }
    for (const archive of store.listArchivedWorkspacesPersistence({ repositoryPath: repository.repositoryPath })) {
      if (exists(archive.path)) add({ ...base, workspaceId: archive.workspaceId, name: archive.name, archived: true, path: archive.path });
    }
  }
  return folders;
}

/**
 * The latest measurement of every workspace folder. Folders without a fresh
 * measurement (or all of them, on `refresh`) are queued in the background, so
 * the answer never waits for `du`; `measuring` says more is coming.
 */
export function readWorkspaceDiskUsage(folders: readonly WorkspaceFolder[], disk: WorkspaceDiskUsage, refresh = false): WorkspaceDiskUsageReport {
  for (const folder of folders) void disk.read(folder.workspaceId, folder.path, refresh ? 0 : DISK_USAGE_MAX_AGE_MS);
  return {
    rows: folders.map(({ path, ...folder }) => ({ ...folder, measurement: disk.peek(folder.workspaceId, path) })),
    measuring: disk.isMeasuring(),
  };
}

function withoutPath(entry: WorkspaceDiskMeasurement & { path: string }): WorkspaceDiskMeasurement {
  const { path: _path, ...measurement } = entry;
  return measurement;
}
