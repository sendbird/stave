import { describe, expect, test } from "bun:test";
import { ensureGhAuth, invalidateGhAuthCache } from "../electron/host-service/gh-auth";
import {
  buildAutoMergePullRequestArgs,
  buildMergePullRequestArgs,
  classifyAutoMergeFailure,
  fetchGitHubPrStatus,
  isPullRequestBranchAlreadyCurrent,
  isTerminalPullRequestSuperseded,
  mergeScmPr,
  parseExistingPullRequestUrl,
  pickAllowedMergeMethod,
  updateScmPrBranch,
} from "../electron/host-service/scm-runtime";

type Runner = NonNullable<Parameters<typeof mergeScmPr>[0]["runCommand"]>;
type RunnerResult = Awaited<ReturnType<Runner>>;

function ok(stdout = ""): RunnerResult {
  return { ok: true, code: 0, stdout, stderr: "" };
}

function fail(stderr: string, code = 1): RunnerResult {
  return { ok: false, code, stdout: "", stderr };
}

/** Routes each spawned command to a scripted result and records the calls. */
function scriptedRunner(
  script: (command: string, commandArgs: string[]) => RunnerResult | undefined,
) {
  const calls: string[] = [];
  const run: Runner = async (args) => {
    const line = [args.command, ...(args.commandArgs ?? [])].join(" ");
    calls.push(line);
    const result = script(args.command, args.commandArgs ?? []);
    return result ?? fail(`unexpected command: ${line}`);
  };
  return { run, calls };
}

const REPO_SETTINGS = JSON.stringify({
  allow_squash_merge: true,
  allow_merge_commit: false,
  allow_rebase_merge: true,
  allow_auto_merge: true,
});

describe("Create PR SCM runtime", () => {
  test("builds a concrete auto-merge command", () => {
    expect(buildAutoMergePullRequestArgs("squash")).toEqual(["pr", "merge", "--auto", "--squash", "--delete-branch"]);
  });

  test("direct merge carries an explicit strategy and never deletes the local branch", () => {
    // `gh pr merge --delete-branch` checks out the base branch after merging;
    // in a linked worktree that fails and turns a successful merge into a
    // non-zero exit, so the direct merge must not ask gh to clean up.
    expect(buildMergePullRequestArgs("merge")).toEqual(["pr", "merge", "--merge"]);
    expect(buildMergePullRequestArgs()).toEqual(["pr", "merge", "--squash"]);
    expect(buildMergePullRequestArgs("squash", { matchHeadCommit: "abc123" })).toEqual([
      "pr",
      "merge",
      "--squash",
      "--match-head-commit",
      "abc123",
    ]);
  });

  test("resolves the merge method against repository settings", () => {
    expect(pickAllowedMergeMethod({ method: "rebase" })).toBe("rebase");
    expect(pickAllowedMergeMethod({ method: "default" })).toBe("squash");
    expect(pickAllowedMergeMethod({})).toBe("squash");
    expect(
      pickAllowedMergeMethod({
        method: "default",
        settings: { squashMergeAllowed: false, mergeCommitAllowed: true, rebaseMergeAllowed: true },
      }),
    ).toBe("merge");
    // An explicit choice the repository forbids would only make GitHub reject
    // the merge, so it is remapped to the first allowed method.
    expect(
      pickAllowedMergeMethod({
        method: "squash",
        settings: { squashMergeAllowed: false, mergeCommitAllowed: true, rebaseMergeAllowed: true },
      }),
    ).toBe("merge");
  });

  test("classifies graceful auto-merge fallback cases", () => {
    expect(classifyAutoMergeFailure("GraphQL: Pull request is in clean status")).toBe("clean-status");
    expect(classifyAutoMergeFailure("Auto-merge is disabled for this repository")).toBe("unsupported");
    expect(classifyAutoMergeFailure("network failed")).toBe("other");
  });

  test("extracts the existing PR url from a duplicate create failure", () => {
    expect(
      parseExistingPullRequestUrl(
        'a pull request for branch "fix/x" into branch "main" already exists:\nhttps://github.com/acme/repo/pull/42',
      ),
    ).toBe("https://github.com/acme/repo/pull/42");
    expect(parseExistingPullRequestUrl("network failed")).toBeNull();
  });

  test("detects a reused branch whose terminal PR is behind local HEAD", () => {
    expect(isTerminalPullRequestSuperseded({ ok: true, code: 0 })).toBe(false);
    expect(isTerminalPullRequestSuperseded({ ok: false, code: 1 })).toBe(true);
    // Unknown object / not a repository: inconclusive, keep the PR.
    expect(isTerminalPullRequestSuperseded({ ok: false, code: 128 })).toBe(false);
  });

  test("recognizes an already current PR branch", () => {
    expect(isPullRequestBranchAlreadyCurrent("PR branch already up-to-date")).toBe(true);
    expect(isPullRequestBranchAlreadyCurrent("already up to date")).toBe(true);
    expect(isPullRequestBranchAlreadyCurrent("merge conflict")).toBe(false);
  });
});

describe("mergeScmPr", () => {
  const cwd = "/tmp/stave-merge-pr";

  test("treats a merged PR as success when gh fails during local cleanup", async () => {
    invalidateGhAuthCache();
    const { run, calls } = scriptedRunner((command, args) => {
      if (command === "gh" && args[0] === "auth") return ok("authenticated");
      if (command === "gh" && args[0] === "api") return ok(REPO_SETTINGS);
      if (command === "gh" && args[0] === "pr" && args[1] === "merge") {
        return fail("✓ Merged pull request #7\nfatal: 'main' is already checked out at '/repo'");
      }
      if (command === "gh" && args[0] === "pr" && args[1] === "view") {
        return ok(JSON.stringify({ state: "MERGED", mergedAt: "2026-01-01T00:00:00Z", headRefName: "fix/x" }));
      }
      if (command === "git" && args[0] === "push") return ok();
      return undefined;
    });

    const result = await mergeScmPr({ method: "squash", cwd, expectedHeadOid: "abc123", runCommand: run });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.merged).toBe(true);
    expect(result.remoteBranchDeleted).toBe(true);
    expect(result.warning).toContain("gh exited with an error");
    expect(calls).toContain("gh pr merge --squash --match-head-commit abc123");
    expect(calls).toContain("git push origin --delete fix/x");
  });

  test("reports a real merge failure when GitHub still shows the PR open", async () => {
    invalidateGhAuthCache();
    const { run, calls } = scriptedRunner((command, args) => {
      if (command === "gh" && args[0] === "auth") return ok("authenticated");
      if (command === "gh" && args[0] === "api") return ok(REPO_SETTINGS);
      if (command === "gh" && args[1] === "merge") return fail("GraphQL: Pull request is not mergeable");
      if (command === "gh" && args[1] === "view") {
        return ok(JSON.stringify({ state: "OPEN", mergedAt: null, headRefName: "fix/x" }));
      }
      return undefined;
    });

    const result = await mergeScmPr({ method: "default", cwd, runCommand: run });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("not mergeable");
    expect(calls.some((line) => line.startsWith("git push"))).toBe(false);
  });

  test("remaps a disallowed merge method and says so", async () => {
    invalidateGhAuthCache();
    const { run, calls } = scriptedRunner((command, args) => {
      if (command === "gh" && args[0] === "auth") return ok("authenticated");
      if (command === "gh" && args[0] === "api") return ok(REPO_SETTINGS);
      if (command === "gh" && args[1] === "merge") return ok("✓ Merged");
      if (command === "gh" && args[1] === "view") {
        return ok(JSON.stringify({ state: "MERGED", mergedAt: "2026-01-01T00:00:00Z", headRefName: "fix/x" }));
      }
      if (command === "git" && args[0] === "push") return fail("error: unable to delete 'fix/x': remote ref does not exist");
      return undefined;
    });

    const result = await mergeScmPr({ method: "merge", cwd: "/tmp/stave-merge-pr-remap", runCommand: run });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mergeMethod).toBe("squash");
    expect(result.warning).toContain("does not allow merge merges");
    expect(result.remoteBranchDeleted).toBe(true);
    expect(calls).toContain("gh pr merge --squash");
  });
});

describe("updateScmPrBranch", () => {
  const cwd = "/tmp/stave-update-pr-branch";

  test("updates the branch on GitHub and fast-forwards a clean worktree", async () => {
    invalidateGhAuthCache();
    const { run, calls } = scriptedRunner((command, args) => {
      if (command === "gh" && args[0] === "auth") return ok("authenticated");
      if (command === "gh" && args[1] === "view") return ok(JSON.stringify({ headRefName: "fix/x", baseRefName: "main" }));
      if (command === "gh" && args[1] === "update-branch") return ok("✓ PR branch fix/x updated");
      if (command === "git" && args[0] === "status") return ok("");
      if (command === "git" && args[0] === "fetch") return ok();
      if (command === "git" && args[0] === "merge") return ok("Fast-forward");
      return undefined;
    });

    const result = await updateScmPrBranch({ cwd, runCommand: run });
    expect(result).toMatchObject({ ok: true, remoteUpdated: true, localSynced: true });
    expect(calls).toContain("gh pr update-branch");
    expect(calls).toContain("git merge --ff-only origin/fix/x");
    // Regression: the old flow rebased locally and never pushed, so GitHub
    // kept reporting BEHIND.
    expect(calls.some((line) => line.startsWith("git rebase"))).toBe(false);
  });

  test("keeps a dirty worktree untouched and warns", async () => {
    invalidateGhAuthCache();
    const { run, calls } = scriptedRunner((command, args) => {
      if (command === "gh" && args[0] === "auth") return ok("authenticated");
      if (command === "gh" && args[1] === "view") return ok(JSON.stringify({ headRefName: "fix/x", baseRefName: "main" }));
      if (command === "gh" && args[1] === "update-branch") return ok("✓ PR branch fix/x updated");
      if (command === "git" && args[0] === "status") return ok(" M src/app.ts");
      return undefined;
    });

    const result = await updateScmPrBranch({ cwd, runCommand: run });
    expect(result.ok).toBe(true);
    expect(result.localSynced).toBe(false);
    expect(result.warning).toContain("Commit or stash");
    expect(calls.some((line) => line.startsWith("git merge"))).toBe(false);
  });

  test("treats an already current branch as success", async () => {
    invalidateGhAuthCache();
    const { run } = scriptedRunner((command, args) => {
      if (command === "gh" && args[0] === "auth") return ok("authenticated");
      if (command === "gh" && args[1] === "view") return ok(JSON.stringify({ headRefName: "fix/x", baseRefName: "main" }));
      if (command === "gh" && args[1] === "update-branch") return fail("PR branch already up-to-date");
      if (command === "git" && args[0] === "status") return ok("");
      if (command === "git" && args[0] === "fetch") return ok();
      if (command === "git" && args[0] === "merge") return ok("Already up to date.");
      return undefined;
    });

    const result = await updateScmPrBranch({ cwd, runCommand: run });
    expect(result).toMatchObject({ ok: true, remoteUpdated: false, localSynced: true });
  });
});

describe("fetchGitHubPrStatus", () => {
  const cwd = "/tmp/stave-fetch-pr-status";
  const merged = {
    number: 3,
    title: "fix: old",
    state: "MERGED",
    isDraft: false,
    url: "https://github.com/acme/repo/pull/3",
    reviewDecision: "APPROVED",
    mergeable: "UNKNOWN",
    mergeStateStatus: "UNKNOWN",
    statusCheckRollup: [],
    mergedAt: "2026-01-01T00:00:00Z",
    baseRefName: "main",
    headRefName: "fix/x",
    headRefOid: "oldhead",
  };

  test("prefers the open PR for the branch", async () => {
    invalidateGhAuthCache();
    const { run, calls } = scriptedRunner((command, args) => {
      if (command === "gh" && args[0] === "auth") return ok("authenticated");
      if (command === "git" && args[0] === "rev-parse") return ok("fix/x\n");
      if (command === "gh" && args[1] === "list") {
        return ok(JSON.stringify([{ ...merged, number: 4, state: "OPEN", mergedAt: null, mergeStateStatus: "CLEAN" }]));
      }
      return undefined;
    });

    const result = await fetchGitHubPrStatus({ cwd, runCommand: run });
    expect(result.ok).toBe(true);
    expect(result.pr?.number).toBe(4);
    expect(result.pr?.mergeStateStatus).toBe("CLEAN");
    expect(calls.some((line) => line.startsWith("gh pr view"))).toBe(false);
  });

  test("drops a merged PR once the reused branch has new local commits", async () => {
    invalidateGhAuthCache();
    const { run } = scriptedRunner((command, args) => {
      if (command === "gh" && args[0] === "auth") return ok("authenticated");
      if (command === "git" && args[0] === "rev-parse") return ok("fix/x\n");
      if (command === "gh" && args[1] === "list") return ok("[]");
      if (command === "gh" && args[1] === "view") return ok(JSON.stringify(merged));
      if (command === "git" && args[0] === "merge-base") return fail("", 1);
      return undefined;
    });

    const result = await fetchGitHubPrStatus({ cwd, runCommand: run });
    expect(result).toEqual({ ok: true, pr: null, stderr: "" });
  });

  test("keeps the merged PR while local HEAD still matches it", async () => {
    invalidateGhAuthCache();
    const { run } = scriptedRunner((command, args) => {
      if (command === "gh" && args[0] === "auth") return ok("authenticated");
      if (command === "git" && args[0] === "rev-parse") return ok("fix/x\n");
      if (command === "gh" && args[1] === "list") return ok("[]");
      if (command === "gh" && args[1] === "view") return ok(JSON.stringify(merged));
      if (command === "git" && args[0] === "merge-base") return ok();
      return undefined;
    });

    const result = await fetchGitHubPrStatus({ cwd, runCommand: run });
    expect(result.pr?.state).toBe("MERGED");
  });

  test("reports gh failures instead of pretending there is no PR", async () => {
    invalidateGhAuthCache();
    const { run } = scriptedRunner((command, args) => {
      if (command === "gh" && args[0] === "auth") return fail("You are not logged into any GitHub hosts.");
      return undefined;
    });

    const result = await fetchGitHubPrStatus({ cwd: "/tmp/stave-fetch-pr-status-auth", runCommand: run });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("not authenticated");
  });
});

describe("gh auth cache", () => {
  test("caches successful GitHub authentication by cwd", async () => {
    invalidateGhAuthCache();
    let now = 1_000;
    let calls = 0;
    const runCommand: NonNullable<Parameters<typeof ensureGhAuth>[0]["runCommand"]> = async () => {
      calls += 1;
      return { ok: true, code: 0, stdout: "authenticated", stderr: "" };
    };

    await ensureGhAuth({ cwd: "/tmp/stave-auth-cache", now: () => now, runCommand });
    await ensureGhAuth({ cwd: "/tmp/stave-auth-cache", now: () => now, runCommand });
    expect(calls).toBe(1);

    now += 5 * 60_000 + 1;
    await ensureGhAuth({ cwd: "/tmp/stave-auth-cache", now: () => now, runCommand });
    expect(calls).toBe(2);
  });

  test("retries a cached GitHub authentication failure after the short ttl", async () => {
    invalidateGhAuthCache();
    let now = 1_000;
    let calls = 0;
    const runCommand: NonNullable<Parameters<typeof ensureGhAuth>[0]["runCommand"]> = async () => {
      calls += 1;
      return { ok: false, code: 1, stdout: "", stderr: "not authenticated" };
    };

    await ensureGhAuth({ cwd: "/tmp/stave-auth-failure-cache", now: () => now, runCommand });
    await ensureGhAuth({ cwd: "/tmp/stave-auth-failure-cache", now: () => now, runCommand });
    expect(calls).toBe(1);

    now += 20_001;
    await ensureGhAuth({ cwd: "/tmp/stave-auth-failure-cache", now: () => now, runCommand });
    expect(calls).toBe(2);
  });
});
