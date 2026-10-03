import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { invalidateGhAuthCache } from "../electron/host-service/gh-auth";
import { readPullRequestChecks } from "../electron/host-service/scm-runtime";
import { describePushFailure } from "../electron/host-service/supervision/agent-run-scm";
import {
  bucketOfCheckState,
  decideWatchChecks,
  NO_CHECKS_GRACE_MS,
  observeChecks,
  type PullRequestCheck,
  type WatchedPullRequest,
} from "../src/lib/agent-runs/checks";
import {
  buildAgentRunCommitMessage,
  buildAgentRunPullRequestDraft,
} from "../src/lib/agent-runs/pull-request-draft";
import { COMPLETE_REPORT, agentRunFixture } from "./fixtures/agent-run-fixtures";

type Runner = NonNullable<Parameters<typeof readPullRequestChecks>[0]["runCommand"]>;

function fixture(name: string) {
  return readFileSync(`tests/fixtures/pr-checks/${name}.json`, "utf8");
}

function runner(result: { ok: boolean; code: number; stdout: string; stderr: string }) {
  const calls: string[] = [];
  const run: Runner = async (args) => {
    const line = [args.command, ...(args.commandArgs ?? [])].join(" ");
    calls.push(line);
    if (args.commandArgs?.[0] === "auth") return { ok: true, code: 0, stdout: "", stderr: "" };
    return result;
  };
  return { run, calls };
}

const PR: WatchedPullRequest = {
  number: 7,
  url: "https://github.com/acme/app/pull/7",
  state: "OPEN",
  headRefOid: "abc1234",
  mergeable: "MERGEABLE",
  mergeStateStatus: "BLOCKED",
  reviewDecision: "REVIEW_REQUIRED",
};

const NOW = new Date("2026-09-26T10:30:00.000Z");

function decide(
  checks: PullRequestCheck[],
  overrides: Partial<Parameters<typeof decideWatchChecks>[0]> = {},
  pr: WatchedPullRequest | null = PR,
) {
  return decideWatchChecks({
    observation: observeChecks({ pr, checks }),
    pr,
    now: NOW,
    watchStartedAt: new Date("2026-09-26T10:20:00.000Z"),
    timeoutMinutes: 30,
    repairsUsed: 0,
    repairAttempts: 2,
    ...overrides,
  });
}

describe("reading pull request checks", () => {
  test("reads the rows even when gh exits non-zero for failing or pending checks", async () => {
    invalidateGhAuthCache();
    const { run, calls } = runner({ ok: false, code: 8, stdout: fixture("pending"), stderr: "" });
    const result = await readPullRequestChecks({ cwd: "/tmp/checks-1", target: "7", runCommand: run });
    expect(calls).toContain("gh pr checks 7 --json name,state,link,startedAt");
    expect(result).toEqual({
      ok: true,
      checks: [
        {
          name: "typecheck",
          state: "SUCCESS",
          link: "https://github.com/acme/app/actions/runs/3/job/31",
          startedAt: "2026-09-26T10:00:00Z",
        },
        {
          name: "e2e",
          state: "IN_PROGRESS",
          link: "https://github.com/acme/app/actions/runs/3/job/32",
          startedAt: "2026-09-26T09:15:00Z",
        },
        { name: "deploy preview", state: "QUEUED", startedAt: "0001-01-01T00:00:00Z" },
      ],
    });
  });

  test("a branch without checks is an empty list; other errors are failures", async () => {
    invalidateGhAuthCache();
    const none = runner({
      ok: false,
      code: 1,
      stdout: "",
      stderr: "no checks reported on the 'feature/csv' branch",
    });
    expect(await readPullRequestChecks({ cwd: "/tmp/checks-2", runCommand: none.run })).toEqual({
      ok: true,
      checks: [],
    });
    invalidateGhAuthCache();
    const broken = runner({ ok: false, code: 1, stdout: "", stderr: "HTTP 502" });
    expect(await readPullRequestChecks({ cwd: "/tmp/checks-3", runCommand: broken.run })).toEqual({
      ok: false,
      stderr: "HTTP 502",
    });
  });
});

describe("observing checks", () => {
  const passing = JSON.parse(fixture("passing")) as PullRequestCheck[];
  const failing = JSON.parse(fixture("failing")) as PullRequestCheck[];

  test("maps GitHub states to pass, fail and pending", () => {
    expect(["SUCCESS", "skipped", "NEUTRAL"].map(bucketOfCheckState)).toEqual(["pass", "pass", "pass"]);
    expect(["FAILURE", "TIMED_OUT", "cancelled"].map(bucketOfCheckState)).toEqual([
      "fail",
      "fail",
      "fail",
    ]);
    expect(["QUEUED", "IN_PROGRESS", "SOMETHING_NEW"].map(bucketOfCheckState)).toEqual([
      "pending",
      "pending",
      "pending",
    ]);
  });

  test("follows the design's order: pull request, conflict, failure, pending, pass", () => {
    expect(observeChecks({ pr: null, checks: passing }).kind).toBe("no-pull-request");
    expect(observeChecks({ pr: { ...PR, state: "MERGED" }, checks: passing }).kind).toBe("closed");
    expect(observeChecks({ pr: { ...PR, mergeable: "CONFLICTING" }, checks: failing })).toEqual({
      kind: "conflict",
      behind: false,
    });
    expect(observeChecks({ pr: { ...PR, mergeStateStatus: "BEHIND" }, checks: passing })).toEqual({
      kind: "conflict",
      behind: true,
    });
    expect(observeChecks({ pr: PR, checks: failing }).kind).toBe("failing");
    expect(observeChecks({ pr: PR, checks: passing }).kind).toBe("passed");
    expect(observeChecks({ pr: PR, checks: [] }).kind).toBe("no-checks");
  });
});

describe("deciding what Watch checks does", () => {
  test("passing checks complete the stage with the rows as verified evidence", () => {
    const outcome = decide(JSON.parse(fixture("passing")));
    expect(outcome).toMatchObject({
      status: "succeeded",
      result: { type: "watch-checks", outcome: "passed" },
    });
    if (outcome.status !== "succeeded" || outcome.result.type !== "watch-checks") throw new Error();
    expect(outcome.result.checks[0]).toEqual({
      name: "typecheck",
      state: "SUCCESS",
      url: "https://github.com/acme/app/actions/runs/1/job/11",
    });
    expect(outcome.result.checks[2]).toEqual({ name: "preview", state: "SKIPPED" });
  });

  test("no checks completes only after a grace period for a fresh head", () => {
    expect(decide([], { watchStartedAt: new Date(NOW.getTime() - 30_000) })).toEqual({
      status: "in-progress",
    });
    expect(decide([], { watchStartedAt: new Date(NOW.getTime() - NO_CHECKS_GRACE_MS) })).toEqual({
      status: "succeeded",
      result: { type: "watch-checks", outcome: "no-checks", checks: [] },
    });
  });

  test("a check pending past the timeout is stuck, named with its age", () => {
    const pending = JSON.parse(fixture("pending")) as PullRequestCheck[];
    expect(decide(pending)).toEqual({
      status: "stuck",
      detail: "e2e has been pending for 75 minutes.",
    });
    // The queued check's year-one start is ignored; it counts from the watch.
    const queuedOnly = pending.filter((check) => check.state === "QUEUED");
    expect(decide(queuedOnly)).toEqual({ status: "in-progress" });
  });

  test("a failure asks for a repair turn until the repairs run out", () => {
    const failing = JSON.parse(fixture("failing")) as PullRequestCheck[];
    const repair = decide(failing, { repairsUsed: 1 });
    expect(repair).toMatchObject({
      status: "needs-turn",
      reason: "repair-checks",
      detail: "Checks failed: unit tests.",
    });
    if (repair.status !== "needs-turn") throw new Error();
    expect(repair.prompt).toContain("- unit tests: https://github.com/acme/app/actions/runs/2/job/22");
    expect(repair.prompt).toContain("This is repair 2 of 2.");
    expect(repair.prompt).toContain("Do not skip, disable or loosen a check");

    expect(decide(failing, { repairsUsed: 2 })).toEqual({
      status: "failed",
      detail: "Checks still fail after 2 repairs: unit tests.",
    });
    expect(decide(failing, { repairAttempts: 0 })).toEqual({
      status: "failed",
      detail: "Checks failed: unit tests.",
    });
  });

  test("conflicts, a missing pull request and a closed one block with a sentence", () => {
    expect(decide([], {}, { ...PR, mergeable: "CONFLICTING" })).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("conflicts with its base branch"),
    });
    expect(decide([], {}, { ...PR, mergeStateStatus: "BEHIND" })).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("behind its base branch"),
    });
    expect(decide([], {}, null)).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("no open pull request to watch"),
    });
    expect(decide([], {}, { ...PR, state: "MERGED" })).toEqual({
      status: "failed",
      detail: "The pull request is merged, so there are no checks to watch.",
    });
  });
});

describe("pull request text and push failures", () => {
  function atOpenPr() {
    const aggregate = agentRunFixture();
    const understand = aggregate.stages[0]!;
    return {
      agentRun: { ...aggregate.agentRun, currentStageIndex: 3 },
      stages: [
        { ...understand, status: "completed" as const, report: COMPLETE_REPORT, reportRevision: 1 },
      ],
    };
  }

  test("the draft takes its title from the branch's commits and its body from the run", () => {
    const aggregate = atOpenPr();
    const draft = buildAgentRunPullRequestDraft({
      aggregate,
      baseBranch: "main",
      headBranch: "feature/csv-export",
      commitLog: "a1b2c3d feat(billing): add csv export\n",
    });
    expect(draft.title).toBe("feat(billing): add csv export");
    expect(draft.body).toContain("## Summary\nAdd CSV export to the billing page.");
    expect(draft.body).toContain("- **Understand:** Restated the request and wrote criteria.");
    expect(draft.body).toContain("- [?] Export button exists");
    expect(draft.body).toContain("Opened as a draft by a Stave run (Request → PR).");
    expect(draft.body).not.toContain(aggregate.agentRun.id);

    const fromBranch = buildAgentRunPullRequestDraft({
      aggregate,
      baseBranch: "main",
      headBranch: "feat/csv-export",
      commitLog: "",
    });
    expect(fromBranch.title).toBe("feat: csv export");
  });

  test("uncommitted work gets a commit message from the assignment", () => {
    expect(buildAgentRunCommitMessage(agentRunFixture())).toBe(
      "chore: add CSV export to the billing page",
    );
  });

  test("a refused push becomes Stave's own sentence", () => {
    expect(describePushFailure("remote: error: GH006: Protected branch update failed")).toContain(
      "The branch is protected",
    );
    expect(describePushFailure(" ! [rejected] main -> main (fetch first)")).toContain(
      "remote branch has commits",
    );
    expect(describePushFailure("fatal: Authentication failed for 'https://github.com'")).toContain(
      "could not authenticate",
    );
    expect(describePushFailure("fatal: unable to access remote")).toBe(
      "Stave could not push the branch: fatal: unable to access remote",
    );
  });
});
