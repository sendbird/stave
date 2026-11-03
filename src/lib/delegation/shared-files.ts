import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";

/**
 * Files more than one worktree changed: the parent task's delegated children
 * write in worktrees of their own (a writer gets a new one by default), and a
 * file two of them changed is where their branches can collide when they come
 * back together. File level only; whether the same lines changed is not read.
 */

/** A file one worktree changed since it left the default branch. */
export interface WorktreeChangedFile {
  /** The path now: a rename counts under its new path. */
  path: string;
  /** Where a renamed file came from, for reading its diff. */
  oldPath?: string;
  /** Git name-status letter (`M`, `A`, `D`, `R`, ...). */
  status: string;
  /** Never added to git: no content at the base. */
  untracked?: boolean;
}

/** How a changed file reads in a cell: the kind of change, not the git letter. */
export type SharedFileChange = "added" | "deleted" | "renamed" | "changed";

export function describeSharedFileChange(status: string): SharedFileChange {
  const letter = status.trim().charAt(0).toUpperCase();
  return letter === "A" || letter === "?" ? "added" : letter === "D" ? "deleted" : letter === "R" ? "renamed" : "changed";
}

/** A worktree the parent's children write in, and the children writing there. */
export interface ChildWorktree {
  workspaceId: string;
  /** Children in this worktree, oldest first. */
  children: readonly DelegatedTaskSummary[];
}

export interface WorktreeChanges {
  workspaceId: string;
  files: readonly WorktreeChangedFile[];
}

export interface SharedFile {
  path: string;
  /** The worktrees that changed it, in the order the worktrees were given. */
  workspaceIds: readonly string[];
  /** Each worktree's own change to the file. */
  fileByWorkspaceId: Readonly<Record<string, WorktreeChangedFile>>;
}

/**
 * The children's worktrees other than the parent's own: a child working in
 * the parent's workspace shares its tree, so there is nothing to collide.
 * Worktrees keep the order their first child was delegated in.
 */
export function selectChildWorktrees(args: {
  parentWorkspaceId: string;
  children: readonly DelegatedTaskSummary[];
}): ChildWorktree[] {
  const byWorkspace = new Map<string, DelegatedTaskSummary[]>();
  const sorted = [...args.children].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  for (const child of sorted) {
    if (child.delegatedWorkspaceId === args.parentWorkspaceId) continue;
    const list = byWorkspace.get(child.delegatedWorkspaceId) ?? [];
    list.push(child);
    byWorkspace.set(child.delegatedWorkspaceId, list);
  }
  return [...byWorkspace.entries()].map(([workspaceId, children]) => ({ workspaceId, children }));
}

/**
 * Every file at least two worktrees changed. Most-shared first, then by path,
 * so the list reads the same on every refresh.
 */
export function computeSharedFiles(worktrees: readonly WorktreeChanges[]): SharedFile[] {
  const byPath = new Map<string, { workspaceIds: string[]; fileByWorkspaceId: Record<string, WorktreeChangedFile> }>();
  for (const worktree of worktrees) {
    for (const file of worktree.files) {
      if (!file.path) continue;
      const entry = byPath.get(file.path) ?? { workspaceIds: [], fileByWorkspaceId: {} };
      if (!entry.workspaceIds.includes(worktree.workspaceId)) entry.workspaceIds.push(worktree.workspaceId);
      entry.fileByWorkspaceId[worktree.workspaceId] = file;
      byPath.set(file.path, entry);
    }
  }
  return [...byPath.entries()]
    .filter(([, entry]) => entry.workspaceIds.length > 1)
    .map(([path, entry]) => ({ path, workspaceIds: entry.workspaceIds, fileByWorkspaceId: entry.fileByWorkspaceId }))
    .sort((left, right) => right.workspaceIds.length - left.workspaceIds.length || left.path.localeCompare(right.path));
}
