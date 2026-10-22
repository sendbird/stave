/**
 * The I/O half of stage facts: git reads in the lead task's workspace and the
 * task's persisted messages. The extraction itself is pure
 * (`src/lib/agent-runs/facts.ts`).
 *
 * Also reads what an agent run leaves behind in its workspace (a pushed branch,
 * an open pull request) for the partial Agent run report.
 *
 * Used by: `electron/host-service/supervision/agent-run-runtime.ts`, wired in
 * `electron/host-service.ts`.
 */
import {
  extractStageFacts,
  parseDiffShortStat,
  type FactSourceMessage,
} from "../../../src/lib/agent-runs/facts";
import { AGENT_RUN_LIMITS, type StageFacts } from "../../../src/lib/agent-runs/domain";
import type { AgentRunWorkspaceState } from "../../../src/lib/agent-runs/report";
import type { ScmCommandRunner } from "../scm-runtime";
import { readWorkspaceRevision } from "./workspace-revision";

const GIT_TIMEOUT_MS = 15_000;
const SHA_PATTERN = /^[0-9a-f]{7,64}$/i;

async function git(run: ScmCommandRunner, cwd: string, commandArgs: string[]) {
  return run({ command: "git", commandArgs, cwd, timeoutMs: GIT_TIMEOUT_MS });
}

/** HEAD of the workspace, or null when it cannot be read. */
export async function readHeadSha(args: {
  cwd: string;
  run: ScmCommandRunner;
}): Promise<string | null> {
  const result = await git(args.run, args.cwd, ["rev-parse", "HEAD"]);
  const sha = result.stdout.trim();
  return result.ok && SHA_PATTERN.test(sha) ? sha : null;
}

/**
 * Tracked changes since the stage began, committed or not. Untracked files are
 * not counted: git reports them only once they are added.
 */
export async function readDiffSince(args: {
  cwd: string;
  sha: string;
  run: ScmCommandRunner;
}): Promise<StageFacts["diff"]> {
  if (!SHA_PATTERN.test(args.sha)) return null;
  const result = await git(args.run, args.cwd, ["diff", "--shortstat", args.sha]);
  return result.ok ? parseDiffShortStat(result.stdout) : null;
}

/**
 * The paths changed since the stage began: tracked changes, committed or not,
 * plus untracked files (an agent's new files are untracked until committed;
 * an untracked file that predates the stage cannot be told apart). Sorted and
 * capped; null when git cannot answer.
 */
export async function readChangedPathsSince(args: {
  cwd: string;
  sha: string;
  run: ScmCommandRunner;
}): Promise<{ paths: string[]; truncated: boolean } | null> {
  if (!SHA_PATTERN.test(args.sha)) return null;
  const [tracked, untracked] = await Promise.all([
    git(args.run, args.cwd, ["diff", "--name-only", "-z", args.sha]),
    git(args.run, args.cwd, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  if (!tracked.ok || !untracked.ok) return null;
  const all = [...new Set(`${tracked.stdout}\0${untracked.stdout}`.split("\0").filter(Boolean))].sort();
  const limit = AGENT_RUN_LIMITS.facts.changedPaths;
  return { paths: all.slice(0, limit), truncated: all.length > limit };
}

/** Facts for one stage attempt from the turns it ran. */
export async function collectStageFacts(args: {
  cwd: string | null;
  startHeadSha: string | null;
  turnIds: ReadonlySet<string>;
  currentTurnId?: string;
  messages: readonly FactSourceMessage[];
  run: ScmCommandRunner;
}): Promise<StageFacts> {
  const diff =
    args.cwd && args.startHeadSha
      ? await readDiffSince({ cwd: args.cwd, sha: args.startHeadSha, run: args.run })
      : null;
  const changed =
    args.cwd && args.startHeadSha
      ? await readChangedPathsSince({ cwd: args.cwd, sha: args.startHeadSha, run: args.run })
      : null;
  const workspaceRevision = args.cwd ? await readWorkspaceRevision(args.cwd) : { status: "unknown" as const, reason: "unavailable" as const };
  return {
    ...extractStageFacts({ messages: args.messages, turnIds: args.turnIds, currentTurnId: args.currentTurnId, diff }),
    ...(changed ? { changedPaths: changed.paths, ...(changed.truncated ? { changedPathsTruncated: true } : {}) } : {}),
    workspaceRevision,
  };
}

/**
 * What outlives an agent run that ended short of its goal. Every read degrades to
 * "nothing left behind" rather than failing the report.
 */
export async function readAgentRunWorkspaceState(args: {
  cwd: string | null;
  run: ScmCommandRunner;
  readOpenPullRequest: (cwd: string) => Promise<AgentRunWorkspaceState["openPullRequest"]>;
}): Promise<AgentRunWorkspaceState> {
  const empty: AgentRunWorkspaceState = {
    branch: null,
    branchPushed: false,
    openPullRequest: null,
  };
  if (!args.cwd) return empty;
  const branchResult = await git(args.run, args.cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const branch = branchResult.ok ? branchResult.stdout.trim() : "";
  if (!branch || branch === "HEAD") return empty;
  const upstream = await git(args.run, args.cwd, [
    "rev-parse",
    "--verify",
    "--quiet",
    "@{upstream}",
  ]);
  if (!upstream.ok) return { ...empty, branch };
  let openPullRequest: AgentRunWorkspaceState["openPullRequest"] = null;
  try {
    openPullRequest = await args.readOpenPullRequest(args.cwd);
  } catch {
    openPullRequest = null;
  }
  return { branch, branchPushed: true, openPullRequest };
}
