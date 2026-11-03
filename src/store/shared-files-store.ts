import { create } from "zustand";
import {
  computeSharedFiles,
  type SharedFile,
  type WorktreeChangedFile,
} from "@/lib/delegation/shared-files";
import type { ScmReviewDiffResult } from "@/lib/review/review-diff-contract";

/**
 * Which files the delegated children's worktrees changed in common, per
 * parent task. Read only while a parent's Subagents tab is open; the last
 * answer stays here, so Fleet can show its count without reading git itself.
 */

export type WorktreeRead =
  | { status: "ready"; workspaceId: string; baseSha: string; headSha: string | null; files: readonly WorktreeChangedFile[] }
  /** Stave knows no folder for the worktree: it was removed, or is not loaded yet. */
  | { status: "missing"; workspaceId: string }
  | { status: "failed"; workspaceId: string; message: string };

export interface SharedFilesEntry {
  loading: boolean;
  /** When the last read finished; null before the first one. */
  readAt: number | null;
  worktrees: Readonly<Record<string, WorktreeRead>>;
  shared: readonly SharedFile[];
}

interface SharedFilesState {
  byParent: Readonly<Record<string, SharedFilesEntry>>;
}

export const useSharedFilesStore = create<SharedFilesState>()(() => ({ byParent: {} }));

export function sharedFilesParentKey(workspaceId: string, taskId: string) {
  return JSON.stringify([workspaceId, taskId]);
}

/**
 * A worktree's merge-base with the default branch, by the HEAD it was read
 * at. While HEAD stays, the next read diffs against the known base and skips
 * resolving the default branch and the merge-base again; a moved HEAD reads
 * the base afresh. The file list itself is always read again, because work
 * not committed yet changes it without moving HEAD.
 */
const baseByCwd = new Map<string, { headSha: string; baseSha: string }>();

/** Test seam: forget every known base. */
export function clearSharedFilesBaseCache() {
  baseByCwd.clear();
}

type ReviewDiffReader = (args: { cwd: string; base: { kind: "commit"; sha: string } | { kind: "merge-base" } }) => Promise<ScmReviewDiffResult>;

function defaultReader(): ReviewDiffReader | null {
  const read = typeof window === "undefined" ? undefined : window.api?.sourceControl?.getReviewDiff;
  return read ? (args) => read(args) : null;
}

export async function readWorktreeChanges(args: {
  workspaceId: string;
  cwd: string | null;
  read?: ReviewDiffReader | null;
}): Promise<WorktreeRead> {
  if (!args.cwd) return { status: "missing", workspaceId: args.workspaceId };
  const read = args.read === undefined ? defaultReader() : args.read;
  if (!read) return { status: "failed", workspaceId: args.workspaceId, message: "" };
  const cwd = args.cwd;
  try {
    const known = baseByCwd.get(cwd);
    let result: ScmReviewDiffResult | null = null;
    if (known) {
      const again = await read({ cwd, base: { kind: "commit", sha: known.baseSha } });
      if (again.ok && again.headSha === known.headSha) result = again;
    }
    if (!result) {
      result = await read({ cwd, base: { kind: "merge-base" } });
      if (result.ok && result.baseSha && result.headSha) baseByCwd.set(cwd, { headSha: result.headSha, baseSha: result.baseSha });
      else baseByCwd.delete(cwd);
    }
    if (!result.ok || !result.baseSha) {
      return { status: "failed", workspaceId: args.workspaceId, message: result.stderr.trim() };
    }
    return {
      status: "ready",
      workspaceId: args.workspaceId,
      baseSha: result.baseSha,
      headSha: result.headSha,
      files: result.files.map((file) => ({
        path: file.path,
        status: file.status,
        ...(file.oldPath ? { oldPath: file.oldPath } : {}),
        ...(file.untracked ? { untracked: true } : {}),
      })),
    };
  } catch (error) {
    return { status: "failed", workspaceId: args.workspaceId, message: error instanceof Error ? error.message : "" };
  }
}

/** The latest refresh per parent; an older one that finishes later is dropped. */
const latestRefresh = new Map<string, number>();
let refreshSequence = 0;

/**
 * Reads every child worktree of one parent and records what they changed in
 * common. Worktrees that cannot be read are kept as such and left out of
 * the comparison.
 */
export async function refreshSharedFiles(args: {
  parentKey: string;
  worktrees: readonly { workspaceId: string; cwd: string | null }[];
  read?: ReviewDiffReader | null;
  now?: () => number;
}) {
  const sequence = ++refreshSequence;
  latestRefresh.set(args.parentKey, sequence);
  useSharedFilesStore.setState((state) => {
    const current = state.byParent[args.parentKey];
    return {
      byParent: {
        ...state.byParent,
        [args.parentKey]: current ? { ...current, loading: true } : { loading: true, readAt: null, worktrees: {}, shared: [] },
      },
    };
  });
  const reads = await Promise.all(args.worktrees.map((worktree) => readWorktreeChanges({ ...worktree, read: args.read })));
  if (latestRefresh.get(args.parentKey) !== sequence) return;
  const worktrees = Object.fromEntries(reads.map((entry) => [entry.workspaceId, entry]));
  const shared = computeSharedFiles(reads.flatMap((entry) => (entry.status === "ready" ? [{ workspaceId: entry.workspaceId, files: entry.files }] : [])));
  useSharedFilesStore.setState((state) => ({
    byParent: {
      ...state.byParent,
      [args.parentKey]: { loading: false, readAt: (args.now ?? Date.now)(), worktrees, shared },
    },
  }));
}
