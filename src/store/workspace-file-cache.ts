import type { WorkspaceSummary } from "@/lib/db/workspaces.db";
import { normalizeComparablePath } from "@/lib/source-control-worktrees";
import { areStringArraysEqual } from "@/store/repository.utils";

export function getCachedWorkspaceFiles(args: {
  workspacePath?: string | null;
  workspaceFileCacheByPath: Record<string, string[]>;
}) {
  if (!args.workspacePath) {
    return [];
  }
  return args.workspaceFileCacheByPath[args.workspacePath] ?? [];
}

export function resolveInitialWorkspaceFiles(args: {
  workspacePath?: string | null;
  activeRepositoryPath?: string | null;
  activeRepositoryFiles: string[];
  workspaceFileCacheByPath: Record<string, string[]>;
}) {
  const workspacePath = args.workspacePath?.trim();
  if (!workspacePath) {
    return [];
  }
  if (
    Object.prototype.hasOwnProperty.call(
      args.workspaceFileCacheByPath,
      workspacePath,
    )
  ) {
    return args.workspaceFileCacheByPath[workspacePath] ?? [];
  }
  if (
    args.activeRepositoryPath &&
    normalizeComparablePath(args.activeRepositoryPath) ===
      normalizeComparablePath(workspacePath)
  ) {
    return args.activeRepositoryFiles;
  }
  return [];
}

/**
 * How many workspace file lists stay cached. Each list can hold up to the
 * file-listing cap (tens of thousands of paths), and without a bound every
 * worktree visited in a session stayed in renderer memory. Matches the
 * workspace runtime cache, whose sessions are the ones a switch can restore
 * instantly; an evicted list is simply listed again on the next visit.
 */
export const MAX_CACHED_WORKSPACE_FILE_LISTS = 10;

/**
 * Drop the least-recently-written file lists once the cache exceeds its cap,
 * never evicting the retained paths (the active workspace and its repository
 * root). Recency is the record's key order: `rememberCachedWorkspaceFiles`
 * re-inserts the written path last, and path keys iterate in insertion order.
 */
export function evictColdWorkspaceFileCacheEntries(args: {
  workspaceFileCacheByPath: Record<string, string[]>;
  retainPaths?: Array<string | null | undefined>;
  limit?: number;
}) {
  const limit = args.limit ?? MAX_CACHED_WORKSPACE_FILE_LISTS;
  const paths = Object.keys(args.workspaceFileCacheByPath);
  if (paths.length <= limit) {
    return args.workspaceFileCacheByPath;
  }
  const retained = new Set(
    (args.retainPaths ?? [])
      .map((workspacePath) => normalizeComparablePath(workspacePath?.trim()))
      .filter(Boolean),
  );
  let overflow = paths.length - limit;
  const evicted = new Set<string>();
  for (const workspacePath of paths) {
    if (overflow === 0) {
      break;
    }
    if (retained.has(normalizeComparablePath(workspacePath))) {
      continue;
    }
    evicted.add(workspacePath);
    overflow -= 1;
  }
  if (evicted.size === 0) {
    return args.workspaceFileCacheByPath;
  }
  return Object.fromEntries(
    Object.entries(args.workspaceFileCacheByPath).filter(
      ([workspacePath]) => !evicted.has(workspacePath),
    ),
  );
}

/**
 * Record a workspace's file list and mark it most recently used.
 *
 * Reads do not touch recency on their own: every path that reads a cached
 * list to seed a switch then lists the files again and writes them here, so
 * the write is what moves the path to the front.
 */
export function rememberCachedWorkspaceFiles(args: {
  workspaceFileCacheByPath: Record<string, string[]>;
  workspacePath?: string | null;
  files: string[];
  /** Paths that must survive eviction besides the written one. */
  retainPaths?: Array<string | null | undefined>;
  limit?: number;
}) {
  if (!args.workspacePath) {
    return args.workspaceFileCacheByPath;
  }
  const workspacePath = args.workspacePath;
  const currentFiles = args.workspaceFileCacheByPath[workspacePath];
  const unchanged =
    currentFiles !== undefined &&
    areStringArraysEqual(currentFiles, args.files);
  const paths = Object.keys(args.workspaceFileCacheByPath);
  if (unchanged && paths[paths.length - 1] === workspacePath) {
    return args.workspaceFileCacheByPath;
  }
  const { [workspacePath]: _previousFiles, ...otherEntries } =
    args.workspaceFileCacheByPath;
  return evictColdWorkspaceFileCacheEntries({
    workspaceFileCacheByPath: {
      ...otherEntries,
      [workspacePath]: unchanged ? currentFiles : args.files,
    },
    retainPaths: [workspacePath, ...(args.retainPaths ?? [])],
    limit: args.limit,
  });
}

export function removeCachedWorkspaceFiles(args: {
  workspaceFileCacheByPath: Record<string, string[]>;
  workspacePaths: Array<string | null | undefined>;
}) {
  const removablePaths = [
    ...new Set(
      args.workspacePaths
        .map((workspacePath) => workspacePath?.trim())
        .filter((workspacePath): workspacePath is string =>
          Boolean(workspacePath),
        ),
    ),
  ];
  if (removablePaths.length === 0) {
    return args.workspaceFileCacheByPath;
  }
  let changed = false;
  const nextWorkspaceFileCacheByPath = { ...args.workspaceFileCacheByPath };
  for (const workspacePath of removablePaths) {
    if (!(workspacePath in nextWorkspaceFileCacheByPath)) {
      continue;
    }
    delete nextWorkspaceFileCacheByPath[workspacePath];
    changed = true;
  }
  return changed ? nextWorkspaceFileCacheByPath : args.workspaceFileCacheByPath;
}

export function resolveWorkspacePathForId(args: {
  activeWorkspaceId: string;
  workspaceId?: string;
  workspacePathById: Record<string, string>;
  workspaceDefaultById: Record<string, boolean>;
  repositoryPath: string | null;
}) {
  const workspaceId = args.workspaceId ?? args.activeWorkspaceId;
  if (!workspaceId) {
    return null;
  }
  return (
    args.workspacePathById[workspaceId] ??
    (args.workspaceDefaultById[workspaceId] ? (args.repositoryPath ?? null) : null)
  );
}

export function isWorkspaceTargetCurrent(args: {
  state: {
    repositoryPath: string | null;
    workspaces: WorkspaceSummary[];
    activeWorkspaceId: string;
    workspacePathById: Record<string, string>;
    workspaceDefaultById: Record<string, boolean>;
  };
  workspaceId: string;
  workspacePath?: string | null;
  repositoryPath?: string | null;
}) {
  if (
    args.repositoryPath !== undefined &&
    normalizeComparablePath(args.state.repositoryPath) !==
      normalizeComparablePath(args.repositoryPath)
  ) {
    return false;
  }
  if (
    !args.state.workspaces.some(
      (workspace) => workspace.id === args.workspaceId,
    )
  ) {
    return false;
  }
  if (args.workspacePath === undefined) {
    return true;
  }

  const currentWorkspacePath = resolveWorkspacePathForId({
    activeWorkspaceId: args.state.activeWorkspaceId,
    workspaceId: args.workspaceId,
    workspacePathById: args.state.workspacePathById,
    workspaceDefaultById: args.state.workspaceDefaultById,
    repositoryPath: args.state.repositoryPath,
  });
  return (
    normalizeComparablePath(currentWorkspacePath) ===
    normalizeComparablePath(args.workspacePath)
  );
}
