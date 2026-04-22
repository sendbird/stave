export interface GitWorktreeEntry {
  path: string;
  branch: string | null;
  detached: boolean;
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

  for (const rawLine of args.stdout.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line) {
      flushCurrentEntry();
      continue;
    }
    if (line.startsWith("worktree ")) {
      flushCurrentEntry();
      currentWorktreePath = line.slice("worktree ".length).trim();
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
