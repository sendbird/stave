/**
 * Removes old files from a workspace scratch folder.
 *
 * Only for workspaces that are never archived (a project's main checkout):
 * an archived worktree loses its scratch folder with the worktree, but the
 * main checkout's would otherwise grow forever.
 *
 * Strictly inside `<root>/.stave/scratch`: the folder and every folder on
 * the way to it must be real folders, links are never followed or removed,
 * and only regular files older than the cut-off go. A folder is removed only
 * when this pass emptied it; the scratch folder itself and its `.gitignore`
 * always stay.
 *
 * Used by: `electron/main/workspace-scratch-retention-runtime.ts`.
 */
import { promises as fs, type Dirent } from "node:fs";
import path from "node:path";
import { WORKSPACE_SCRATCH_RETENTION_DAYS } from "../../../src/lib/workspace-scratch";
import { WORKSPACE_SCRATCH_GITIGNORE_NAME, findWorkspaceScratchRoot } from "./workspace-scratch";

export const WORKSPACE_SCRATCH_RETENTION_MS = WORKSPACE_SCRATCH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** Deeper folders are left alone: nothing an agent writes nests this far. */
const MAX_PRUNE_DEPTH = 16;

export interface WorkspaceScratchPruneResult {
  removedFiles: number;
  removedBytes: number;
  removedFolders: number;
}

/** Lets other main-process work run between folders; the pass is low priority. */
function yieldToEventLoop() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

async function isRealDirectory(target: string) {
  try {
    const stat = await fs.lstat(target);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

export async function pruneWorkspaceScratch(args: {
  rootPath: string;
  now?: number;
  maxAgeMs?: number;
}): Promise<WorkspaceScratchPruneResult> {
  const result: WorkspaceScratchPruneResult = { removedFiles: 0, removedBytes: 0, removedFolders: 0 };
  const scratchRoot = await findWorkspaceScratchRoot(args.rootPath);
  if (!scratchRoot) return result;
  const cutoff = (args.now ?? Date.now()) - (args.maxAgeMs ?? WORKSPACE_SCRATCH_RETENTION_MS);

  /** Returns whether `directory` is empty after the pass removed something from it. */
  async function prune(directory: string, depth: number): Promise<boolean> {
    await yieldToEventLoop();
    let entries: Dirent[];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return false;
    }
    let removedHere = 0;
    for (const entry of entries) {
      // A link (to a file or a folder) is neither followed nor removed.
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (depth >= MAX_PRUNE_DEPTH) continue;
        // Checked again right before descending: never walk into a link
        // that replaced the folder after it was listed.
        if (!(await isRealDirectory(absolute))) continue;
        if (await prune(absolute, depth + 1)) {
          try {
            await fs.rmdir(absolute);
            result.removedFolders += 1;
            removedHere += 1;
          } catch {
            // Something was written there meanwhile: keep it.
          }
        }
        continue;
      }
      if (!entry.isFile()) continue;
      if (depth === 0 && entry.name === WORKSPACE_SCRATCH_GITIGNORE_NAME) continue;
      let stat;
      try {
        stat = await fs.lstat(absolute);
      } catch {
        continue;
      }
      if (!stat.isFile() || stat.mtimeMs >= cutoff) continue;
      try {
        // `unlink` never follows a link, so a swap after the check removes
        // at most the link itself, never what it points to.
        await fs.unlink(absolute);
        result.removedFiles += 1;
        result.removedBytes += stat.size;
        removedHere += 1;
      } catch {
        // Gone already or not removable: leave it.
      }
    }
    if (removedHere === 0) return false;
    try {
      return (await fs.readdir(directory)).length === 0;
    } catch {
      return false;
    }
  }

  await prune(scratchRoot, 0);
  return result;
}

/** At most one retention pass a day (`workspace-scratch-retention-runtime.ts`). */
export const WORKSPACE_SCRATCH_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** The folders retention covers: each registered project's main checkout, once. */
export function mainCheckoutRoots(registry: readonly { repositoryPath: string }[]): string[] {
  const roots = new Set<string>();
  for (const repository of registry) {
    if (repository.repositoryPath && path.isAbsolute(repository.repositoryPath)) {
      roots.add(path.resolve(repository.repositoryPath));
    }
  }
  return [...roots];
}

/** Due on first run, a day after the last one, or when the clock went backwards. */
export function isScratchRetentionDue(lastRunAt: number | null, now: number) {
  return lastRunAt === null || now - lastRunAt >= WORKSPACE_SCRATCH_RETENTION_INTERVAL_MS || lastRunAt > now;
}

/** Prunes each root in turn; one failing root does not stop the others. */
export async function runWorkspaceScratchRetention(args: {
  roots: readonly string[];
  now?: number;
  prune?: typeof pruneWorkspaceScratch;
}): Promise<WorkspaceScratchPruneResult> {
  const total: WorkspaceScratchPruneResult = { removedFiles: 0, removedBytes: 0, removedFolders: 0 };
  const prune = args.prune ?? pruneWorkspaceScratch;
  for (const rootPath of args.roots) {
    try {
      const result = await prune({ rootPath, now: args.now });
      total.removedFiles += result.removedFiles;
      total.removedBytes += result.removedBytes;
      total.removedFolders += result.removedFolders;
    } catch (error) {
      console.warn("[workspace-scratch] retention skipped a folder", { error: String(error) });
    }
  }
  return total;
}
