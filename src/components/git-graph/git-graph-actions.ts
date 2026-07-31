import type {
  GraphCommitDetailsResult,
  GraphResult,
} from "@/lib/git-graph/types";

export async function loadGraph(
  cwd: string,
  opts: {
    limit?: number;
    skip?: number;
    scope?: string;
    refs?: string[];
    includeRepositoryState?: boolean;
  } = {},
): Promise<GraphResult> {
  const api = window.api?.sourceControl?.getGraph;
  if (!api) {
    return {
      ok: false,
      commits: [],
      head: null,
      headHash: null,
      availableRefs: [],
      workingTree: {
        staged: 0,
        unstaged: 0,
        untracked: 0,
        conflicts: 0,
      },
      workingTreeAvailable: false,
      worktreePathByBranch: {},
      worktreePathsAvailable: false,
      hasMore: false,
      stderr: "Unavailable",
    };
  }
  return api({ cwd, ...opts });
}

export async function loadCommitDetails(
  cwd: string,
  hash: string,
): Promise<GraphCommitDetailsResult> {
  const api = window.api?.sourceControl?.getCommitDetails;
  if (!api) {
    return { ok: false, details: null, stderr: "Unavailable" };
  }
  return api({ cwd, hash });
}

export async function loadCommitFiles(cwd: string, hash: string) {
  const api = window.api?.sourceControl?.getCommitFiles;
  if (!api) {
    return {
      ok: false,
      files: [] as Array<{ path: string; status: string; oldPath?: string }>,
      stderr: "Unavailable",
    };
  }
  return api({ cwd, hash });
}

export async function loadWorkingTree(cwd: string) {
  const api = window.api?.sourceControl?.getStatus;
  if (!api) {
    return {
      ok: false,
      branch: "",
      items: [] as Array<{
        code: string;
        path: string;
        indexStatus?: string;
        workingTreeStatus?: string;
      }>,
      hasConflicts: false,
      stderr: "Unavailable",
    };
  }
  return api({ cwd });
}

export async function loadWorkingTreeDiff(cwd: string, path: string) {
  const api = window.api?.sourceControl?.getDiff;
  if (!api) {
    return {
      ok: false,
      content: "",
      oldContent: "",
      newContent: "",
      stderr: "Unavailable",
    };
  }
  return api({ cwd, path });
}

export async function loadCommitDiff(
  cwd: string,
  hash: string,
  path: string,
  oldPath?: string,
): Promise<{
  ok: boolean;
  oldContent: string;
  newContent: string;
  stderr: string;
}> {
  const api = window.api?.sourceControl?.getCommitDiff;
  if (!api) {
    return { ok: false, oldContent: "", newContent: "", stderr: "Unavailable" };
  }
  return api({ cwd, hash, path, oldPath });
}

// ---------------------------------------------------------------------------
// Commit action wrappers
// ---------------------------------------------------------------------------

interface ActionResult {
  ok: boolean;
  stdout?: string;
  stderr?: string;
  code?: number;
}

function unavailable(): ActionResult {
  return { ok: false, stderr: "API unavailable" };
}

export async function revertCommit(
  cwd: string,
  commit: string,
): Promise<ActionResult> {
  const api = window.api?.sourceControl?.revert;
  if (!api) return unavailable();
  return api({ commit, cwd });
}

export async function resetCommit(
  cwd: string,
  commit: string,
  mode: "soft" | "mixed" | "hard",
): Promise<ActionResult> {
  const api = window.api?.sourceControl?.reset;
  if (!api) return unavailable();
  return api({ commit, mode, cwd });
}

export async function createTag(
  cwd: string,
  name: string,
  commit: string,
  message?: string,
): Promise<ActionResult> {
  const api = window.api?.sourceControl?.createTag;
  if (!api) return unavailable();
  return api({ name, commit, message, cwd });
}

export async function cherryPickCommit(
  cwd: string,
  commit: string,
): Promise<ActionResult> {
  const api = window.api?.sourceControl?.cherryPick;
  if (!api) return unavailable();
  return api({ commit, cwd });
}

export async function createBranchFrom(
  cwd: string,
  name: string,
  from: string,
): Promise<ActionResult> {
  const api = window.api?.sourceControl?.createBranch;
  if (!api) return unavailable();
  return api({ name, cwd, from });
}

export async function checkoutCommit(
  cwd: string,
  hash: string,
): Promise<ActionResult> {
  // Checkout a detached HEAD at the given commit hash.
  const api = window.api?.sourceControl?.checkoutBranch;
  if (!api) return unavailable();
  return api({ name: hash, cwd });
}

// ---------------------------------------------------------------------------
// Branch / ref action wrappers
// ---------------------------------------------------------------------------

export async function checkoutBranch(
  cwd: string,
  name: string,
): Promise<ActionResult> {
  const api = window.api?.sourceControl?.checkoutBranch;
  if (!api) return unavailable();
  return api({ name, cwd });
}

export async function renameBranch(
  cwd: string,
  from: string,
  to: string,
): Promise<ActionResult> {
  const api = window.api?.sourceControl?.renameBranch;
  if (!api) return unavailable();
  return api({ from, to, cwd });
}

export async function deleteBranch(
  cwd: string,
  name: string,
  force?: boolean,
): Promise<ActionResult> {
  const api = window.api?.sourceControl?.deleteBranch;
  if (!api) return unavailable();
  return api({ name, force, cwd });
}

export async function deleteTag(
  cwd: string,
  name: string,
): Promise<ActionResult> {
  const api = window.api?.sourceControl?.deleteTag;
  if (!api) return unavailable();
  return api({ name, cwd });
}

export async function mergeBranch(
  cwd: string,
  branch: string,
): Promise<ActionResult> {
  const api = window.api?.sourceControl?.mergeBranch;
  if (!api) return unavailable();
  return api({ branch, cwd });
}

export async function rebaseBranch(
  cwd: string,
  branch: string,
): Promise<ActionResult> {
  const api = window.api?.sourceControl?.rebaseBranch;
  if (!api) return unavailable();
  return api({ branch, cwd });
}

export async function pullBranch(
  cwd: string,
  branch?: string,
): Promise<ActionResult> {
  const api = window.api?.sourceControl?.pullBranch;
  if (!api) return unavailable();
  return api({ branch, cwd });
}

export async function pushBranch(
  cwd: string,
  branch?: string,
  force?: boolean,
): Promise<ActionResult> {
  const api = window.api?.sourceControl?.push;
  if (!api) return unavailable();
  return api({ branch, force, cwd });
}

export interface ListBranchesResult {
  ok: boolean;
  current: string;
  branches: string[];
  remoteBranches: string[];
  worktreePathByBranch: Record<string, string>;
  stderr: string;
}

export async function listBranches(cwd: string): Promise<ListBranchesResult> {
  const api = window.api?.sourceControl?.listBranches;
  if (!api) {
    return {
      ok: false,
      current: "",
      branches: [],
      remoteBranches: [],
      worktreePathByBranch: {},
      stderr: "API unavailable",
    };
  }
  return api({ cwd }) as Promise<ListBranchesResult>;
}

export async function fetchAllRemotes(cwd: string): Promise<ActionResult> {
  const api = window.api?.sourceControl?.fetchBranch;
  if (!api) return unavailable();
  return api({ cwd });
}
