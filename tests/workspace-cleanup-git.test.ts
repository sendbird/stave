import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { startWorkspaceArchiveCleanup, waitForPendingWorkspaceArchiveCleanups } from "@/store/workspace-archive-cleanup";

const originalWindow = globalThis.window;
let fixtureRoot: string | undefined;

afterEach(() => {
  globalThis.window = originalWindow;
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
  fixtureRoot = undefined;
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "stave-cleanup-test-"));
  fixtureRoot = root;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init", "-b", "main");
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "test: fixture");
  const worktree = join(root, "feature's $(printf unexpected)");
  git("worktree", "add", "-b", "feature", worktree);
  globalThis.window = {
    api: {
      terminal: { runCommand: async ({ command, cwd }: { command: string; cwd: string }) => {
        const result = spawnSync("/bin/sh", ["-c", command], { cwd, encoding: "utf8" });
        return { ok: result.status === 0, code: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
      } },
      persistence: { listWorkspaces: async () => ({}), loadWorkspace: async () => ({}), upsertWorkspace: async () => ({}), closeWorkspace: async () => ({ ok: true }) },
    },
  } as unknown as Window & typeof globalThis;
  return { root, worktree, git };
}

test("cleanup removes a real clean worktree with literal special characters and keeps its branch", async () => {
  const { root, worktree, git } = fixture();
  startWorkspaceArchiveCleanup({ workspaceId: "fixture", projectPath: root, workspacePath: worktree, deleteBranch: false });
  await waitForPendingWorkspaceArchiveCleanups();
  expect(existsSync(worktree)).toBe(false);
  expect(git("branch", "--list", "feature").trim()).toBe("feature");
});

test("cleanup preserves real uncommitted files and the branch", async () => {
  const { root, worktree, git } = fixture();
  writeFileSync(join(worktree, "unsaved.txt"), "keep this work");
  startWorkspaceArchiveCleanup({ workspaceId: "fixture-dirty", projectPath: root, workspacePath: worktree, deleteBranch: false });
  await waitForPendingWorkspaceArchiveCleanups();
  expect(existsSync(join(worktree, "unsaved.txt"))).toBe(true);
  expect(git("branch", "--list", "feature")).toContain("feature");
});
