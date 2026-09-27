/**
 * The I/O half of stage facts: git reads in the lead task's workspace and the
 * task's persisted messages. The extraction itself is pure
 * (`src/lib/missions/facts.ts`).
 *
 * Also reads what a mission leaves behind in its workspace (a pushed branch,
 * an open pull request) for the partial Mission report.
 *
 * Used by: `electron/host-service/supervision/mission-runtime.ts`, wired in
 * `electron/host-service.ts`.
 */
import {
  extractStageFacts,
  parseDiffShortStat,
  type FactSourceMessage,
} from "../../../src/lib/missions/facts";
import type { StageFacts } from "../../../src/lib/missions/domain";
import type { MissionWorkspaceState } from "../../../src/lib/missions/report";
import type { ScmCommandRunner } from "../scm-runtime";

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

/** Facts for one stage attempt from the turns it ran. */
export async function collectStageFacts(args: {
  cwd: string | null;
  startHeadSha: string | null;
  turnIds: ReadonlySet<string>;
  messages: readonly FactSourceMessage[];
  run: ScmCommandRunner;
}): Promise<StageFacts> {
  const diff =
    args.cwd && args.startHeadSha
      ? await readDiffSince({ cwd: args.cwd, sha: args.startHeadSha, run: args.run })
      : null;
  return extractStageFacts({ messages: args.messages, turnIds: args.turnIds, diff });
}

/**
 * What outlives a mission that ended short of its goal. Every read degrades to
 * "nothing left behind" rather than failing the report.
 */
export async function readMissionWorkspaceState(args: {
  cwd: string | null;
  run: ScmCommandRunner;
  readOpenPullRequest: (cwd: string) => Promise<MissionWorkspaceState["openPullRequest"]>;
}): Promise<MissionWorkspaceState> {
  const empty: MissionWorkspaceState = {
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
  let openPullRequest: MissionWorkspaceState["openPullRequest"] = null;
  try {
    openPullRequest = await args.readOpenPullRequest(args.cwd);
  } catch {
    openPullRequest = null;
  }
  return { branch, branchPushed: true, openPullRequest };
}
