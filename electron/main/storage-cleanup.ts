import { promises as fs } from "node:fs";
import path from "node:path";
import { app, session as electronSession } from "electron";
import {
  classifyLensPartitionDir,
  isEmptyStorageCleanupPlan,
  isStaleDatabaseFileName,
  planAutomaticStorageCleanup,
  planManualStorageCleanup,
  summarizeStorageCleanup,
  type LensPartitionEntry,
  type StaleDatabaseFileEntry,
  type StorageCleanupOptions,
  type StorageCleanupPlan,
  type StorageCleanupReport,
  type StorageCleanupResult,
} from "../../src/lib/storage-cleanup/storage-cleanup-policy";
import { listActiveLensPartitions } from "./browser/browser-manager";
import { hashLensProfileKey } from "./browser/browser-session-profile";
import { ensurePersistenceReady } from "./state";

const PARTITIONS_DIR_NAME = "Partitions";
/** Let startup finish (window, host service, persistence) before scanning disk. */
const AUTOMATIC_SWEEP_STARTUP_DELAY_MS = 45_000;
const AUTOMATIC_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

let sweepTimer: ReturnType<typeof setInterval> | null = null;
let startupTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<unknown> | null = null;

function userDataPath(...segments: string[]) {
  return path.join(app.getPath("userData"), ...segments);
}

async function directorySize(dir: string): Promise<number> {
  let total = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
      } else if (entry.isFile()) {
        try {
          total += (await fs.stat(absolute)).size;
        } catch {
          // Cache files churn; a vanished entry is not an error.
        }
      }
    }
  }
  return total;
}

async function loadKnownIdentities() {
  const store = await ensurePersistenceReady();
  const knownWorkspaceIds = new Set<string>();
  const knownProjectHashes = new Set<string>();
  for (const summary of store.listWorkspaceSummaries()) {
    knownWorkspaceIds.add(summary.id);
  }
  for (const project of store.loadProjectRegistry()) {
    knownProjectHashes.add(hashLensProfileKey(project.projectPath));
    for (const workspace of project.workspaces) {
      knownWorkspaceIds.add(workspace.id);
    }
    for (const workspaceId of Object.keys(project.workspacePathById ?? {})) {
      knownWorkspaceIds.add(workspaceId);
    }
  }
  return { knownWorkspaceIds, knownProjectHashes };
}

export async function collectStorageCleanupReport(): Promise<StorageCleanupReport> {
  const { knownWorkspaceIds, knownProjectHashes } = await loadKnownIdentities();
  const activePartitions = new Set(listActiveLensPartitions());
  const partitionsDir = userDataPath(PARTITIONS_DIR_NAME);

  const partitions: LensPartitionEntry[] = [];
  let partitionDirs: string[] = [];
  try {
    partitionDirs = (await fs.readdir(partitionsDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    partitionDirs = [];
  }
  for (const dirName of partitionDirs) {
    const classified = classifyLensPartitionDir(dirName, {
      knownWorkspaceIds,
      knownProjectHashes,
      activePartitions,
    });
    if (!classified) {
      continue;
    }
    const absolute = path.join(partitionsDir, dirName);
    const [bytes, stat] = await Promise.all([
      directorySize(absolute),
      fs.stat(absolute).catch(() => null),
    ]);
    partitions.push({
      ...classified,
      bytes,
      modifiedAtMs: stat?.mtimeMs ?? 0,
    });
  }

  const staleDatabaseFiles: StaleDatabaseFileEntry[] = [];
  try {
    const rootEntries = await fs.readdir(userDataPath(), { withFileTypes: true });
    for (const entry of rootEntries) {
      if (!entry.isFile() || !isStaleDatabaseFileName(entry.name)) {
        continue;
      }
      const stat = await fs.stat(userDataPath(entry.name)).catch(() => null);
      if (stat) {
        staleDatabaseFiles.push({
          fileName: entry.name,
          bytes: stat.size,
          modifiedAtMs: stat.mtimeMs,
        });
      }
    }
  } catch {
    // Unreadable user data root: report what we have.
  }

  partitions.sort((a, b) => b.bytes - a.bytes);
  staleDatabaseFiles.sort((a, b) => b.bytes - a.bytes);
  return summarizeStorageCleanup({ partitions, staleDatabaseFiles, now: Date.now() });
}

async function executeStorageCleanupPlan(
  report: StorageCleanupReport,
  plan: StorageCleanupPlan,
): Promise<StorageCleanupResult> {
  const errors: string[] = [];
  let reclaimedBytes = 0;
  const partitionByDir = new Map(report.partitions.map((p) => [p.dirName, p]));
  const partitionByName = new Map(report.partitions.map((p) => [p.partition, p]));
  const fileByName = new Map(report.staleDatabaseFiles.map((f) => [f.fileName, f]));
  const activePartitions = new Set(listActiveLensPartitions());

  for (const dirName of plan.deletePartitionDirNames) {
    const entry = partitionByDir.get(dirName);
    if (!entry || entry.status !== "orphaned" || activePartitions.has(entry.partition)) {
      continue;
    }
    // Refuse anything that could escape the Partitions directory.
    if (dirName !== path.basename(dirName) || dirName.startsWith(".")) {
      errors.push(`skipped suspicious partition name: ${dirName}`);
      continue;
    }
    try {
      await fs.rm(userDataPath(PARTITIONS_DIR_NAME, dirName), {
        recursive: true,
        force: true,
      });
      reclaimedBytes += entry.bytes;
    } catch (error) {
      errors.push(`partition ${dirName}: ${String(error)}`);
    }
  }

  for (const partition of plan.clearCachePartitions) {
    const entry = partitionByName.get(partition);
    if (!entry || entry.status === "orphaned") {
      continue;
    }
    try {
      const before = entry.bytes;
      const ses = electronSession.fromPartition(partition);
      await ses.clearCache();
      await ses.clearCodeCaches({});
      const after = await directorySize(
        userDataPath(PARTITIONS_DIR_NAME, entry.dirName),
      );
      reclaimedBytes += Math.max(0, before - after);
    } catch (error) {
      errors.push(`cache ${partition}: ${String(error)}`);
    }
  }

  for (const fileName of plan.deleteDatabaseFileNames) {
    const entry = fileByName.get(fileName);
    if (
      !entry ||
      !isStaleDatabaseFileName(fileName) ||
      fileName !== path.basename(fileName)
    ) {
      continue;
    }
    try {
      await fs.rm(userDataPath(fileName), { force: true });
      reclaimedBytes += entry.bytes;
    } catch (error) {
      errors.push(`file ${fileName}: ${String(error)}`);
    }
  }

  return { ok: errors.length === 0, plan, reclaimedBytes, errors };
}

/** Serialize sweeps so a manual request and the timer never race on the same dirs. */
function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const previous = inFlight ?? Promise.resolve();
  const next = previous.then(task, task);
  inFlight = next.catch(() => undefined);
  return next;
}

export function runStorageCleanup(
  options: StorageCleanupOptions,
): Promise<StorageCleanupResult> {
  return runExclusive(async () => {
    const report = await collectStorageCleanupReport();
    const plan = planManualStorageCleanup(report, options);
    return executeStorageCleanupPlan(report, plan);
  });
}

export function runAutomaticStorageCleanup(): Promise<StorageCleanupResult | null> {
  return runExclusive(async () => {
    const report = await collectStorageCleanupReport();
    const plan = planAutomaticStorageCleanup(report, Date.now());
    if (isEmptyStorageCleanupPlan(plan)) {
      return null;
    }
    const result = await executeStorageCleanupPlan(report, plan);
    if (result.errors.length > 0) {
      console.warn("[storage-cleanup] automatic sweep finished with errors", result.errors);
    }
    return result;
  });
}

export function startStorageCleanupRuntime() {
  if (startupTimer || sweepTimer) {
    return;
  }
  const sweep = () => {
    void runAutomaticStorageCleanup().catch((error) => {
      console.warn("[storage-cleanup] automatic sweep failed", error);
    });
  };
  startupTimer = setTimeout(() => {
    startupTimer = null;
    sweep();
    sweepTimer = setInterval(sweep, AUTOMATIC_SWEEP_INTERVAL_MS);
    sweepTimer.unref?.();
  }, AUTOMATIC_SWEEP_STARTUP_DELAY_MS);
  startupTimer.unref?.();
}

export function stopStorageCleanupRuntime() {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}
