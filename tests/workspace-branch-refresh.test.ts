import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspaceHydrationActions } from "../src/store/app-store-workspace-hydration-actions";
import type { AppState } from "../src/store/app-store.types";

async function refreshWithCheckout(checkout: (git: (...args: string[]) => string) => void) {
  const root = mkdtempSync(join(tmpdir(), "branch-refresh-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  const original = globalThis.window;
  try {
    git("init", "-b", "main");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "test: initialize");
    const worktree = join(root, "feature");
    git("worktree", "add", "-b", "feature", worktree);
    checkout((...args) => execFileSync("git", args, { cwd: worktree, encoding: "utf8" }));
    let state = {
      hasHydratedWorkspaces: true, repositoryPath: root, defaultBranch: "main", activeWorkspaceId: "feature",
      workspaces: [{ id: "base", name: "Default" }, { id: "feature", name: "Feature" }],
      workspaceBranchById: { base: "main", feature: "feature" },
      workspacePathById: { base: root, feature: worktree }, workspaceDefaultById: { base: true },
      workspaceFileCacheByPath: {}, workspaceRuntimeCacheById: {}, taskWorkspaceIdById: {}, recentRepositories: [],
    } as unknown as AppState;
    Object.assign(globalThis, { window: { api: {
      persistence: { listWorkspaces: async () => ({ ok: true, rows: [] }) },
      workspaceCleanup: { listArchived: async () => [] },
      terminal: { runCommand: async ({ command }: { command: string }) =>
        ({ ok: true, stdout: execFileSync("/bin/sh", ["-c", command], { cwd: root, encoding: "utf8" }), stderr: "" }) },
    } } });
    const actions = createWorkspaceHydrationActions({
      get: () => state,
      set: (update: unknown) => { state = { ...state, ...(typeof update === "function" ? update(state) : update) }; },
      loadTaskMessagesIntoSession: async () => {}, hydrateWorkspaceMessagesInBackground: () => {}, refreshWorkspaceFilesInBackground: () => {}, reloadRefreshedWorkspaceTasks: () => {},
    } as never);
    await actions.refreshWorkspaces();
    return state.workspaceBranchById;
  } finally { Object.assign(globalThis, { window: original }); rmSync(root, { recursive: true, force: true }); }
}

test("refreshWorkspaces picks up a branch checked out outside the dropdown", async () => {
  const branches = await refreshWithCheckout((git) => git("checkout", "-b", "renamed"));
  expect(branches).toEqual({ base: "main", feature: "renamed" });
});

test("refreshWorkspaces records a detached worktree as HEAD", async () => {
  const branches = await refreshWithCheckout((git) => git("checkout", "--detach"));
  expect(branches.feature).toBe("HEAD");
});

test("refreshWorkspaces leaves the branch alone when HEAD did not move", async () => {
  const branches = await refreshWithCheckout(() => {});
  expect(branches).toEqual({ base: "main", feature: "feature" });
});
