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
