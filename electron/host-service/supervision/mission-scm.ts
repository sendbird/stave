/**
 * The source-control port behind a mission's Stave actions, built on
 * `scm-runtime` and the GitHub CLI.
 *
 * Used by: `electron/host-service/supervision/mission-host.ts`.
 */
import { runCommandArgs } from "../../main/utils/command";
import {
  commitSourceControl,
  createScmPullRequest,
  fetchGitHubPrStatus,
  readPullRequestChecks,
  setScmPrReady,
  stageAllSourceControl,
  type ScmCommandRunner,
} from "../scm-runtime";
import type { MissionScmPort, ScmStep } from "./mission-actions";

const OK: ScmStep = { ok: true, value: true };

function firstLine(text: string) {
  return text.trim().split("\n").find((line) => line.trim())?.trim() ?? "";
}

/** Stave's own sentence for a push GitHub or git refused. */
export function describePushFailure(output: string): string {
  if (/protected branch|GH006/i.test(output)) {
    return "The branch is protected, so Stave cannot push to it. Move the work to a feature branch, then retry this stage.";
  }
  if (/non-fast-forward|fetch first|\[rejected\]|rejected/i.test(output)) {
    return "GitHub rejected the push because the remote branch has commits this workspace does not. Pull or rebase, then retry this stage.";
  }
  if (/authentication failed|could not read username|permission denied|403/i.test(output)) {
    return "Git could not authenticate the push. Check your GitHub credentials, then retry this stage.";
  }
  const detail = firstLine(output);
  return detail ? `Stave could not push the branch: ${detail}` : "Stave could not push the branch.";
}

export function createScmMissionPort(run: ScmCommandRunner = runCommandArgs): MissionScmPort {
  const git = (cwd: string, commandArgs: string[]) =>
    run({ command: "git", commandArgs, cwd, timeoutMs: 120_000 });
  /** `origin/<default branch>`, or empty when the remote has no HEAD set. */
  const readBaseRef = async (cwd: string) => {
    const base = await git(cwd, ["rev-parse", "--abbrev-ref", "origin/HEAD"]);
    return base.ok ? base.stdout.trim() : "";
  };
  const toBaseBranch = (baseRef: string) => baseRef.replace(/^origin\//, "") || "main";

  return {
    currentBranch: async (cwd) => {
      const result = await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
      const branch = result.stdout.trim();
      return result.ok && branch && branch !== "HEAD" ? branch : null;
    },
    headSha: async (cwd) => {
      const result = await git(cwd, ["rev-parse", "HEAD"]);
      return result.ok ? result.stdout.trim() || null : null;
    },
    hasUncommittedChanges: async (cwd) => {
      const result = await git(cwd, ["status", "--porcelain"]);
      return result.ok && result.stdout.trim().length > 0;
    },
    commitAll: async (cwd, message) => {
      const staged = await stageAllSourceControl({ cwd });
      if (!staged.ok) return { ok: false, detail: firstLine(staged.stderr) || "git add failed." };
      const committed = await commitSourceControl({ cwd, message });
      return committed.ok
        ? OK
        : { ok: false, detail: firstLine(`${committed.stderr}\n${committed.stdout}`) || "git commit failed." };
    },
    hasUnpushedCommits: async (cwd) => {
      const result = await git(cwd, ["rev-list", "--count", "@{upstream}..HEAD"]);
      // No upstream yet: the push sets it.
      if (!result.ok) return true;
      return Number(result.stdout.trim()) > 0;
    },
    push: async (cwd, branch) => {
      const result = await git(cwd, ["push", "--set-upstream", "origin", branch]);
      return result.ok ? OK : { ok: false, detail: describePushFailure(`${result.stderr}\n${result.stdout}`) };
    },
    readPullRequest: async (cwd) => {
      const status = await fetchGitHubPrStatus({ cwd, runCommand: run });
      if (!status.ok) {
        return { ok: false, detail: firstLine(status.stderr) || "Stave could not read the pull request." };
      }
      const pr = status.pr;
      return {
        ok: true,
        value: pr
          ? {
              number: pr.number,
              url: pr.url,
              state: pr.state,
              isDraft: pr.isDraft,
              headRefOid: pr.headRefOid ?? null,
              mergeable: pr.mergeable,
              mergeStateStatus: pr.mergeStateStatus,
              reviewDecision: pr.reviewDecision ?? null,
            }
          : null,
      };
    },
    createDraftPullRequest: async (cwd, draft) => {
      const result = await createScmPullRequest({
        cwd,
        title: draft.title,
        body: draft.body,
        draft: true,
        runCommand: run,
      });
      if (result.ok && result.prUrl) return { ok: true, value: { url: result.prUrl, created: true } };
      if ("existingPrUrl" in result && result.existingPrUrl) {
        return { ok: true, value: { url: result.existingPrUrl, created: false } };
      }
      return { ok: false, detail: result.stderr || "Stave could not create the pull request." };
    },
    markReady: async (cwd) => {
      const result = await setScmPrReady({ cwd });
      return result.ok
        ? OK
        : { ok: false, detail: firstLine(result.stderr) || "Stave could not mark the pull request ready." };
    },
    readChecks: async (cwd, prNumber) => {
      const result = await readPullRequestChecks({ cwd, target: String(prNumber), runCommand: run });
      return result.ok ? { ok: true, value: result.checks } : { ok: false, detail: firstLine(result.stderr) };
    },
    readBaseBranch: async (cwd) => toBaseBranch(await readBaseRef(cwd)),
    readCommitLog: async (cwd) => {
      const baseRef = await readBaseRef(cwd);
      const baseBranch = toBaseBranch(baseRef);
      if (!baseRef) return { baseBranch, log: "" };
      const log = await git(cwd, ["log", "--oneline", "-n", "20", `${baseRef}..HEAD`]);
      return { baseBranch, log: log.ok ? log.stdout : "" };
    },
  };
}
