import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspaceHydrationActions } from "../src/store/app-store-workspace-hydration-actions";
import type { AppState } from "../src/store/app-store.types";

test("stale refresh skips an archive completed after its state snapshot", async () => {
  const root = mkdtempSync(join(tmpdir(), "stale-archive-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  const original = globalThis.window;
  try {
    git("init", "-b", "main");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "test: initialize");
    const worktree = join(root, "feature");
    git("worktree", "add", "-b", "feature", worktree);
    const state = { hasHydratedWorkspaces: true, repositoryPath: root, workspaces: [{ id: "base", name: "Default" }, { id: "feature", name: "Feature" }], workspacePathById: { base: root, feature: worktree }, workspaceDefaultById: { base: true }, recentRepositories: [] } as unknown as AppState;
    let closes = 0;
    let archived = false;
    Object.assign(globalThis, { window: { api: {
      persistence: { loadWorkspace: async () => ({ ok: true, snapshot: null }), upsertWorkspace: async () => ({ ok: true }), listWorkspaces: async () => ({ ok: true, rows: [] }), closeWorkspace: async () => { closes++; return { ok: true }; } },
      workspaceCleanup: { listArchived: async () => archived ? [{ id: "feature", path: worktree }] : [] },
      terminal: { runCommand: async ({ command }: { command: string }) => {
        if (!archived) { git("worktree", "remove", worktree); archived = true; }
        return { ok: true, stdout: execFileSync("/bin/sh", ["-c", command], { cwd: root, encoding: "utf8" }), stderr: "" };
      } },
    } } });
    const actions = createWorkspaceHydrationActions({ get: () => state, set: () => {}, loadTaskMessagesIntoSession: async () => {}, hydrateWorkspaceMessagesInBackground: () => {}, refreshWorkspaceFilesInBackground: () => {}, reloadRefreshedWorkspaceTasks: () => {} });
    await actions.refreshWorkspaces();
    expect(archived).toBe(true);
    expect(closes).toBe(0);
  } finally { Object.assign(globalThis, { window: original }); rmSync(root, { recursive: true, force: true }); }
});
