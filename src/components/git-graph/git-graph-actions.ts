import type { GraphCommit } from "@/lib/git-graph/types";

export interface LoadGraphResult {
  ok: boolean;
  commits: GraphCommit[];
  head: string | null;
  hasMore: boolean;
  stderr: string;
}

export async function loadGraph(
  cwd: string,
  opts: { limit?: number; skip?: number; scope?: string } = {},
): Promise<LoadGraphResult> {
  const api = window.api?.sourceControl?.getGraph;
  if (!api) {
    return { ok: false, commits: [], head: null, hasMore: false, stderr: "Unavailable" };
  }
  return api({ cwd, ...opts });
}

export async function loadCommitFiles(cwd: string, hash: string) {
  const api = window.api?.sourceControl?.getCommitFiles;
  if (!api) {
    return { ok: false, files: [] as Array<{ path: string; status: string }>, stderr: "Unavailable" };
  }
  return api({ cwd, hash });
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

export async function revertCommit(cwd: string, commit: string): Promise<ActionResult> {
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

export async function cherryPickCommit(cwd: string, commit: string): Promise<ActionResult> {
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

export async function checkoutCommit(cwd: string, hash: string): Promise<ActionResult> {
  // Checkout a detached HEAD at the given commit hash.
  const api = window.api?.sourceControl?.checkoutBranch;
  if (!api) return unavailable();
  return api({ name: hash, cwd });
}
