export interface GitWorktreeEntry {
  path: string;
  branch: string | null;
  detached: boolean;
  /**
   * The path as Git reported it, when `alignWorktreePaths` rewrote `path`.
   * Workspaces saved under that form before the rewrite still match it, so
   * they are neither treated as gone nor imported a second time.
   */
  gitPath?: string;
}

/** Both forms of a listed worktree's path, for "is this workspace still a worktree" checks. */
export function worktreeComparablePaths(entry: GitWorktreeEntry): string[] {
  return [entry.path, entry.gitPath].map((value) => normalizeComparablePath(value)).filter(Boolean);
}

export function parseGitWorktrees(args: { stdout: string }) {
  const entries: GitWorktreeEntry[] = [];
  let currentWorktreePath = "";
  let currentBranch: string | null = null;
  let detached = false;

  const flushCurrentEntry = () => {
    if (!currentWorktreePath) {
      return;
    }
    entries.push({
      path: currentWorktreePath,
      branch: currentBranch,
      detached,
    });
    currentWorktreePath = "";
    currentBranch = null;
    detached = false;
  };

  // `--porcelain -z` ends every field with NUL instead of a newline, so a
  // path that contains a newline still reads as one field. In that mode the
  // fields are kept exactly: a path may end in whitespace or a newline.
  const nulSeparated = args.stdout.includes("\0");
  for (const rawLine of args.stdout.split(nulSeparated ? "\0" : "\n")) {
    const line = nulSeparated ? rawLine : rawLine.trimEnd();
    if (!line) {
      flushCurrentEntry();
      continue;
    }
    if (line.startsWith("worktree ")) {
      flushCurrentEntry();
      const path = line.slice("worktree ".length);
      currentWorktreePath = nulSeparated ? path : path.trim();
      continue;
    }
    if (!currentWorktreePath) {
      continue;
    }

    if (line.startsWith("branch refs/heads/")) {
      const branch = line.slice("branch refs/heads/".length).trim();
      if (branch) {
        currentBranch = branch;
        detached = false;
      }
      continue;
    }

    if (line === "detached") {
      currentBranch = null;
      detached = true;
    }
  }

  flushCurrentEntry();
  return entries;
}

/**
 * Git reports worktree paths with symbolic links resolved (on macOS the
 * temporary directory `/var/…` is reported as `/private/var/…`). Rewrite paths
 * inside the resolved repository into the repository path as the app
 * registered it, so a worktree the host created keeps the workspace id it was
 * given and the repository itself is not mistaken for another worktree.
 */
export function alignWorktreePaths(args: {
  worktrees: readonly GitWorktreeEntry[];
  repositoryPath: string;
  /** The repository path with symbolic links resolved; null when unknown. */
  resolvedRepositoryPath: string | null;
}): GitWorktreeEntry[] {
  const registered = normalizeComparablePath(args.repositoryPath);
  const resolved = normalizeComparablePath(args.resolvedRepositoryPath);
  if (!registered || !resolved || registered === resolved) return [...args.worktrees];
  return args.worktrees.map((entry) => {
    const comparable = normalizeComparablePath(entry.path);
    if (comparable === resolved) return { ...entry, path: registered, gitPath: entry.path };
    return comparable.startsWith(`${resolved}/`) ? { ...entry, path: `${registered}${comparable.slice(resolved.length)}`, gitPath: entry.path } : entry;
  });
}

type WorktreeCommandRunner = (args: { cwd?: string; command: string }) => Promise<{ ok: boolean; stdout: string }>;

/**
 * Lists a repository's worktrees with paths in the repository's registered
 * form. The extra `pwd -P` read happens only when Git's main worktree path
 * differs from the registered one; a failed read keeps Git's paths. Null when
 * the listing itself fails.
 */
export async function listRepositoryWorktrees(args: { repositoryPath: string; run: WorktreeCommandRunner; nulSeparated?: boolean }): Promise<GitWorktreeEntry[] | null> {
  const listResult = await args.run({ cwd: args.repositoryPath, command: `git worktree list --porcelain${args.nulSeparated ? " -z" : ""}` });
  if (!listResult.ok) return null;
  const worktrees = parseGitWorktrees({ stdout: listResult.stdout });
  // Git lists the main worktree first.
  if (!worktrees.length || normalizeComparablePath(worktrees[0]!.path) === normalizeComparablePath(args.repositoryPath)) return worktrees;
  const resolved = await args.run({ cwd: args.repositoryPath, command: "pwd -P" }).catch(() => null);
  return alignWorktreePaths({ worktrees, repositoryPath: args.repositoryPath,
    resolvedRepositoryPath: resolved?.ok ? resolved.stdout.trim() || null : null });
}

/**
 * The listed worktree at `path`, matched in its registered or Git-reported
 * form, so a path Git resolved through a symbolic link still finds its entry.
 */
export function findListedWorktree(worktrees: readonly GitWorktreeEntry[], path: string | null | undefined): GitWorktreeEntry | null {
  const comparable = normalizeComparablePath(path);
  if (!comparable) return null;
  return worktrees.find((entry) => worktreeComparablePaths(entry).includes(comparable)) ?? null;
}

export function parseWorktreePathByBranch(args: { stdout: string }) {
  const worktreePathByBranch: Record<string, string> = {};

  for (const entry of parseGitWorktrees(args)) {
    if (!entry.branch) {
      continue;
    }
    worktreePathByBranch[entry.branch] = entry.path;
  }

  return worktreePathByBranch;
}

export function normalizeComparablePath(value?: string | null) {
  return value ? value.replace(/\\/g, "/").replace(/\/+$/, "") : "";
}

export function isBranchAttachedElsewhere(args: {
  branch: string;
  workspacePath?: string | null;
  worktreePathByBranch: Record<string, string>;
}) {
  const attachedPath = args.worktreePathByBranch[args.branch];
  if (!attachedPath) {
    return false;
  }

  return normalizeComparablePath(attachedPath) !== normalizeComparablePath(args.workspacePath);
}
