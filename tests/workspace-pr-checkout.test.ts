import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pushScmBranch } from "../electron/host-service/scm-runtime";
import { checkoutWorkspacePr } from "../electron/host-service/workspace-pr-checkout";
import { invalidateGhAuthCache } from "../electron/host-service/gh-auth";
import { runWorkspaceGit } from "../electron/shared/git-worktree-create";
import { parseWorkspacePrReference, WorkspacePrCheckoutArgsSchema } from "../src/lib/workspace-pr-checkout";

let root: string;
let cwd: string;
const github = "https://github.com/test/repo.git";
const commandResult = (stdout: string, stderr = "") => ({ ok: !stderr, stdout, stderr, code: stderr ? 1 : 0 });

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "stave-pr-checkout-"));
  cwd = root;
});
afterEach(async () => {
  invalidateGhAuthCache();
  await rm(root, { recursive: true, force: true });
});

test("parses repository-scoped PR references at the boundary", () => {
  expect(parseWorkspacePrReference(" #123 ")).toEqual({ number: 123, repository: undefined });
  expect(parseWorkspacePrReference("https://github.com/test/repo/pull/123#discussion")).toEqual({ number: 123, repository: "test/repo" });
  for (const reference of ["#0", "#9007199254740992", "--help", "https://example.com/test/repo/pull/1", "https://github.com/a/../pull/1"]) {
    expect(WorkspacePrCheckoutArgsSchema.safeParse({ cwd, path: root, reference }).success).toBe(false);
  }
});

for (const fork of [false, true]) {
  test(`checks out and tracks the ${fork ? "fork PR ref" : "same-repository branch"} and reports collisions`, async () => {
    const runGit = runWorkspaceGit({ cwd });
    async function git(...args: string[]) {
      const result = await runGit(args);
      if (!result.ok) throw new Error(result.stderr);
      return result.stdout.trim();
    }
    await git("init", "-b", "main");
    await git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "Seed");
    await git("update-ref", fork ? "refs/pull/123/head" : "refs/heads/remote-head", "HEAD");
    await git("remote", "add", "origin", github);
    await git("config", "--local", `url.file://${cwd}/.git.insteadOf`, github);
    const deps = {
      runGit,
      runGh: async ({ commandArgs }: { commandArgs?: string[] }) => {
        if (commandArgs?.[0] === "auth") return commandResult("");
        expect(commandArgs?.slice(0, 5)).toEqual(["pr", "view", "123", "--repo", "github.com/test/repo"]);
        return commandResult(JSON.stringify({ headRefName: "remote-head", baseRefName: "main", isCrossRepository: fork, title: "Example" }));
      },
    };
    const args = { cwd, path: path.join(root, "workspace"), reference: "#123", branch: "review" };
    expect(await checkoutWorkspacePr(args, deps)).toEqual({
      ok: true, branch: "review", url: "https://github.com/test/repo/pull/123", title: "Example", base: "main", fork,
    });
    expect(await git("rev-parse", "--symbolic-full-name", "review@{upstream}")).toBe(
      fork ? "refs/remotes/stave-pr-123/head" : "refs/remotes/origin/remote-head",
    );
    if (fork) {
      expect(await git("remote", "get-url", "--push", "stave-pr-123")).toBe("file:///dev/null");
      expect(await pushScmBranch({ cwd: args.path, branch: "refs/heads/review" })).toMatchObject({ ok: false, reason: "fork-pr-read-only" });
    } else {
      await git("-C", args.path, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "Update");
      expect(await pushScmBranch({ cwd: args.path, branch: "refs/heads/review" })).toMatchObject({ ok: true });
      expect(await git("rev-parse", "remote-head")).toBe(await git("rev-parse", "review"));
    }
    expect(await checkoutWorkspacePr({ ...args, path: path.join(root, "another") }, deps)).toMatchObject({
      ok: false, code: "worktree", failure: { code: "branch_checked_out", branch: "review", suggestedBranch: "review-2" },
    });
    expect(await checkoutWorkspacePr({ ...args, branch: "unused", reference: "https://github.com/other/repo/pull/123" }, deps)).toEqual({
      ok: false, code: "wrongRepository",
    });
  });
}


for (const [stage, stderr, code] of [
  ["auth", "Error: spawn gh ENOENT", "ghMissing"],
  ["auth", "You are not logged into any GitHub hosts.", "ghAuth"],
  ["view", "GraphQL: Could not resolve to a PullRequest with the number of 123.", "notFound"],
  ["view", "could not connect to api.github.com", "lookupFailed"],
] as const) {
  test(`reports ${code} from GitHub CLI`, async () => {
    const result = await checkoutWorkspacePr({ cwd, path: path.join(cwd, "workspace"), reference: "#123" }, {
      runGit: async () => commandResult(github),
      runGh: async ({ commandArgs }) => stage === "auth" || commandArgs?.[0] === "pr"
        ? commandResult("", stderr)
        : commandResult(""),
    });
    expect(result).toMatchObject({ ok: false, code });
  });
}

describe("pull request head branch names", () => {
  test("rejects names Git could read as an option or would refuse", async () => {
    const { isSafeGitBranchName } = await import("../src/lib/workspace-pr-checkout");
    for (const name of ["feature/review", "fix-1044", "user.name/topic"]) expect(isSafeGitBranchName(name)).toBe(true);
    for (const name of ["-upload-pack=x", "--force", "a..b", "a b", "a~1", "a:b", "x.lock", "/abs", "a//b", ".hidden", "a/.b", "a@{1}", "a\\b", ""]) {
      expect(isSafeGitBranchName(name)).toBe(false);
    }
  });
});
