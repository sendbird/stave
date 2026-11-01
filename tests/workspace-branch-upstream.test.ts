import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readAgentRunWorkspaceState } from "../electron/host-service/supervision/stage-facts";
import { countUnpushedCommits } from "@/components/layout/workspace-cleanup-operations";

// A workspace branch is created with `git worktree add --no-track -b <branch>
// <path> origin/main`. Without `--no-track` it tracks `origin/main`, and a bare
// `git push` then tells the agent to run `git push origin HEAD:main`.

let fixtureRoot: string | undefined;

afterEach(() => {
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
  fixtureRoot = undefined;
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "stave-upstream-test-"));
  fixtureRoot = root;
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], {
      cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
  const repository = join(root, "repository");
  const origin = join(root, "origin.git");
  execFileSync("git", ["init", "-q", "--bare", origin]);
  execFileSync("git", ["init", "-q", "-b", "main", repository]);
  git(repository, "commit", "-q", "--allow-empty", "-m", "test: base");
  git(repository, "remote", "add", "origin", origin);
  git(repository, "push", "-q", "origin", "main");
  git(repository, "fetch", "-q", "origin");
  return { root, repository, git };
}

const shellRunner = async ({ command, cwd }: { command: string; cwd?: string }) => {
  const result = spawnSync("/bin/sh", ["-c", command], { cwd, encoding: "utf8" });
  return { ok: result.status === 0, code: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
};

const argsRunner = (async ({ command, commandArgs, cwd }: { command: string; commandArgs: string[]; cwd?: string }) => {
  const result = spawnSync(command, commandArgs, { cwd, encoding: "utf8" });
  return { ok: result.status === 0, code: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}) as unknown as Parameters<typeof readAgentRunWorkspaceState>[0]["run"];

const noPullRequest = async () => null;

describe("workspace branch upstream", () => {
  test("a --no-track workspace branch does not track origin/main, so a bare push cannot target main", () => {
    const { root, repository, git } = fixture();
    const workspace = join(root, "workspace");
    git(repository, "worktree", "add", "-q", "--no-track", "-b", "feat/x", workspace, "origin/main");
    expect(git(workspace, "status", "-sb").split("\n")[0]).toBe("## feat/x");
    git(workspace, "commit", "-q", "--allow-empty", "-m", "feat: change");
    const push = spawnSync("git", ["push"], { cwd: workspace, encoding: "utf8" });
    expect(push.status).not.toBe(0);
    expect(push.stderr).toContain("has no upstream branch");
    expect(push.stderr).not.toContain("HEAD:main");
  });

  test("continuing on a new branch from origin/main does not track it either", () => {
    const { repository, git } = fixture();
    git(repository, "switch", "-q", "--no-track", "-c", "feat/next", "origin/main");
    expect(git(repository, "status", "-sb").split("\n")[0]).toBe("## feat/next");
  });

  test("the agent run report calls a branch pushed only when it tracks its own remote branch", async () => {
    const { root, repository, git } = fixture();
    const legacy = join(root, "legacy");
    git(repository, "worktree", "add", "-q", "--track", "-b", "feat/legacy", legacy, "origin/main");
    expect(await readAgentRunWorkspaceState({ cwd: legacy, run: argsRunner, readOpenPullRequest: noPullRequest }))
      .toEqual({ branch: "feat/legacy", branchPushed: false, openPullRequest: null });

    const workspace = join(root, "workspace");
    git(repository, "worktree", "add", "-q", "--no-track", "-b", "feat/x", workspace, "origin/main");
    expect(await readAgentRunWorkspaceState({ cwd: workspace, run: argsRunner, readOpenPullRequest: noPullRequest }))
      .toEqual({ branch: "feat/x", branchPushed: false, openPullRequest: null });

    git(workspace, "commit", "-q", "--allow-empty", "-m", "feat: change");
    git(workspace, "push", "-q", "--set-upstream", "origin", "feat/x");
    expect(await readAgentRunWorkspaceState({ cwd: workspace, run: argsRunner, readOpenPullRequest: noPullRequest }))
      .toEqual({ branch: "feat/x", branchPushed: true, openPullRequest: null });
  });

  test("cleanup counts commits of a never-pushed workspace branch and clears them after the push", async () => {
    const { root, repository, git } = fixture();
    const workspace = join(root, "workspace");
    git(repository, "worktree", "add", "-q", "--no-track", "-b", "feat/x", workspace, "origin/main");
    git(workspace, "commit", "-q", "--allow-empty", "-m", "feat: one");
    git(workspace, "commit", "-q", "--allow-empty", "-m", "feat: two");
    const before = await countUnpushedCommits(shellRunner, workspace);
    expect(before.ok).toBe(true);
    expect(before.stdout.trim()).toBe("2");

    git(workspace, "push", "-q", "--set-upstream", "origin", "feat/x");
    const after = await countUnpushedCommits(shellRunner, workspace);
    expect(after.stdout.trim()).toBe("0");
  });

  test("cleanup leaves the count unknown in a repository without remotes", async () => {
    const { root, git } = fixture();
    const local = join(root, "local");
    execFileSync("git", ["init", "-q", "-b", "main", local]);
    git(local, "commit", "-q", "--allow-empty", "-m", "test: local");
    expect((await countUnpushedCommits(shellRunner, local)).ok).toBe(false);
  });
});
