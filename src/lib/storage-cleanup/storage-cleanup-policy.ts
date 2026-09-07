/**
 * Pure classification and planning for on-disk leftovers in the app's user
 * data directory: Lens partitions whose workspace or project no longer exists,
 * oversized Lens HTTP caches, and stray SQLite backup files.
 *
 * Kept free of Electron and Node imports so it can be unit-tested under Bun.
 * The main-process service supplies inventory sizes and executes plans.
 */

export const LENS_PARTITION_DIR_PREFIX = "lens-";
export const LENS_PROJECT_PARTITION_DIR_PREFIX = "lens-project-";
export const PRIMARY_DATABASE_FILE_NAME = "stave.sqlite";

/** Live Lens caches above this size are cleared by the automatic sweep. */
export const LENS_CACHE_AUTO_CLEAR_MIN_BYTES = 512 * 1024 * 1024;
/**
 * Orphaned partitions younger than this are left alone by the automatic
 * sweep, so a workspace that was just deleted and recreated (or a registry
 * that has not finished loading) does not lose its Lens logins by accident.
 * A manual clean-up ignores this grace period.
 */
export const ORPHANED_PARTITION_AUTO_DELETE_MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type LensPartitionKind = "workspace" | "project" | "unknown";

export type LensPartitionStatus =
  /** A Lens guest is using this partition right now. */
  | "active"
  /** Belongs to a known workspace/project but has no live guest. */
  | "idle"
  /** No known workspace or project maps to this partition. */
  | "orphaned";

export interface LensPartitionEntry {
  /** Directory name under `<userData>/Partitions`. */
  dirName: string;
  /** Electron partition name, e.g. `persist:lens-<workspaceId>`. */
  partition: string;
  kind: LensPartitionKind;
  status: LensPartitionStatus;
  bytes: number;
  /** Last modification time of the directory, epoch ms. */
  modifiedAtMs: number;
}

export interface StaleDatabaseFileEntry {
  fileName: string;
  bytes: number;
  modifiedAtMs: number;
}

export interface StorageCleanupReport {
  generatedAt: string;
  partitions: LensPartitionEntry[];
  staleDatabaseFiles: StaleDatabaseFileEntry[];
  totals: {
    partitionBytes: number;
    orphanedPartitionBytes: number;
    orphanedPartitionCount: number;
    oversizedCacheBytes: number;
    oversizedCacheCount: number;
    staleDatabaseBytes: number;
  };
}

export interface StorageCleanupOptions {
  /** Remove partition directories no known workspace/project maps to. */
  deleteOrphanedPartitions?: boolean;
  /** Clear HTTP caches of live Lens partitions (logins are preserved). */
  clearLensCaches?: "none" | "oversized" | "all";
  /** Remove SQLite files other than the primary database (backups). */
  deleteStaleDatabaseFiles?: boolean;
}

export interface StorageCleanupPlan {
  deletePartitionDirNames: string[];
  clearCachePartitions: string[];
  deleteDatabaseFileNames: string[];
}

export interface StorageCleanupResult {
  ok: boolean;
  plan: StorageCleanupPlan;
  reclaimedBytes: number;
  errors: string[];
}

export interface LensPartitionClassificationContext {
  knownWorkspaceIds: ReadonlySet<string>;
  /** Hashes as produced by the Lens session profile for `projectKey`. */
  knownProjectHashes: ReadonlySet<string>;
  /** Partition names (`persist:...`) with a live Lens guest. */
  activePartitions: ReadonlySet<string>;
}

/**
 * Electron stores `persist:<name>` under `Partitions/<encoded name>`, where
 * characters such as `:` are percent-encoded.
 */
export function decodePartitionDirName(dirName: string): string | null {
  try {
    return decodeURIComponent(dirName);
  } catch {
    return null;
  }
}

export function classifyLensPartitionDir(
  dirName: string,
  context: LensPartitionClassificationContext,
): Pick<LensPartitionEntry, "dirName" | "partition" | "kind" | "status"> | null {
  const decoded = decodePartitionDirName(dirName);
  if (!decoded || !decoded.startsWith(LENS_PARTITION_DIR_PREFIX)) {
    return null;
  }
  const partition = `persist:${decoded}`;
  const active = context.activePartitions.has(partition);

  if (decoded.startsWith(LENS_PROJECT_PARTITION_DIR_PREFIX)) {
    const hash = decoded.slice(LENS_PROJECT_PARTITION_DIR_PREFIX.length);
    const known = hash.length > 0 && context.knownProjectHashes.has(hash);
    return {
      dirName,
      partition,
      kind: "project",
      status: active ? "active" : known ? "idle" : "orphaned",
    };
  }

  const workspaceId = decoded.slice(LENS_PARTITION_DIR_PREFIX.length);
  const known =
    workspaceId.length > 0 && context.knownWorkspaceIds.has(workspaceId);
  return {
    dirName,
    partition,
    kind: "workspace",
    status: active ? "active" : known ? "idle" : "orphaned",
  };
}

/** SQLite files in the user data root that are not the primary database. */
export function isStaleDatabaseFileName(fileName: string): boolean {
  if (!/\.sqlite(?:-wal|-shm|-journal)?$/i.test(fileName)) {
    return false;
  }
  const base = fileName.replace(/-(?:wal|shm|journal)$/i, "");
  return base !== PRIMARY_DATABASE_FILE_NAME;
}

export function summarizeStorageCleanup(args: {
  partitions: LensPartitionEntry[];
  staleDatabaseFiles: StaleDatabaseFileEntry[];
  now: number;
  oversizedCacheMinBytes?: number;
}): StorageCleanupReport {
  const oversizedMin = args.oversizedCacheMinBytes ?? LENS_CACHE_AUTO_CLEAR_MIN_BYTES;
  const orphaned = args.partitions.filter((p) => p.status === "orphaned");
  const oversized = args.partitions.filter(
    (p) => p.status !== "orphaned" && p.bytes > oversizedMin,
  );
  const sum = (items: Array<{ bytes: number }>) =>
    items.reduce((total, item) => total + item.bytes, 0);
  return {
    generatedAt: new Date(args.now).toISOString(),
    partitions: args.partitions,
    staleDatabaseFiles: args.staleDatabaseFiles,
    totals: {
      partitionBytes: sum(args.partitions),
      orphanedPartitionBytes: sum(orphaned),
      orphanedPartitionCount: orphaned.length,
      oversizedCacheBytes: sum(oversized),
      oversizedCacheCount: oversized.length,
      staleDatabaseBytes: sum(args.staleDatabaseFiles),
    },
  };
}

/** Plan for a user-requested clean-up: no grace period on orphans. */
export function planManualStorageCleanup(
  report: StorageCleanupReport,
  options: StorageCleanupOptions,
  oversizedCacheMinBytes = LENS_CACHE_AUTO_CLEAR_MIN_BYTES,
): StorageCleanupPlan {
  const clearMode = options.clearLensCaches ?? "none";
  return {
    deletePartitionDirNames: options.deleteOrphanedPartitions
      ? report.partitions
          .filter((p) => p.status === "orphaned")
          .map((p) => p.dirName)
      : [],
    clearCachePartitions: report.partitions
      .filter((p) => p.status !== "orphaned")
      .filter((p) =>
        clearMode === "all"
          ? true
          : clearMode === "oversized"
            ? p.bytes > oversizedCacheMinBytes
            : false,
      )
      .map((p) => p.partition),
    deleteDatabaseFileNames: options.deleteStaleDatabaseFiles
      ? report.staleDatabaseFiles.map((f) => f.fileName)
      : [],
  };
}

/**
 * Plan for the unattended sweep (startup and periodic): remove orphans that
 * have been untouched past the grace period and clear oversized live caches.
 * Never touches database files — those are manual only.
 */
export function planAutomaticStorageCleanup(
  report: StorageCleanupReport,
  now: number,
  options: {
    orphanMinAgeMs?: number;
    oversizedCacheMinBytes?: number;
  } = {},
): StorageCleanupPlan {
  const minAge = options.orphanMinAgeMs ?? ORPHANED_PARTITION_AUTO_DELETE_MIN_AGE_MS;
  const oversizedMin =
    options.oversizedCacheMinBytes ?? LENS_CACHE_AUTO_CLEAR_MIN_BYTES;
  return {
    deletePartitionDirNames: report.partitions
      .filter(
        (p) => p.status === "orphaned" && now - p.modifiedAtMs >= minAge,
      )
      .map((p) => p.dirName),
    clearCachePartitions: report.partitions
      .filter((p) => p.status !== "orphaned" && p.bytes > oversizedMin)
      .map((p) => p.partition),
    deleteDatabaseFileNames: [],
  };
}

export function isEmptyStorageCleanupPlan(plan: StorageCleanupPlan): boolean {
  return (
    plan.deletePartitionDirNames.length === 0 &&
    plan.clearCachePartitions.length === 0 &&
    plan.deleteDatabaseFileNames.length === 0
  );
}
