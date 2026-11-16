import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { launchStave, type StaveApp } from "./harness/stave-app";
import type { WorkspaceCleanupActArgs } from "../../src/lib/workspace-cleanup-contract";

// Setup writes fixture history through real persistence. All cleanup operations
// cross preload/main/host IPC, use real Git and the real database, and no provider runs.
const act = (page: Page, args: WorkspaceCleanupActArgs) => page.evaluate(input => window.api.workspaceCleanup!.act(input), args);
const messages = (page: Page, workspaceId: string) => page.evaluate(async id =>
  (await window.api.persistence!.loadTaskMessages!({ workspaceId: id, taskId: `task-${id}`, limit: 20 })).page?.messages.map(message => message.content) ?? [], workspaceId);

// DOMContentLoaded precedes workspace hydration. Wait on the same usable shell
// control as the shared harness, then inspect Git-backed cleanup once. Polling
// the whole Git scan puts its execution time inside the polling deadline.
async function workspaceShellReady(page: Page) {
  await expect(page.getByRole("button", { name: "Lens", exact: true })).toBeEnabled();
}

async function expectArchivedExecutionDenied(page: Page, workspaceId: string, workspacePath: string, cwd: string) {
  const result = await page.evaluate(async input => {
    const result = await window.api.terminal!.createSession!({ ...input, taskId: null, taskTitle: null, terminalTabId: "archived-admission" });
    if (result.ok && result.sessionId) await window.api.terminal!.closeSession!({ sessionId: result.sessionId });
    return result;
  }, { workspaceId, workspacePath, cwd, shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh" });
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).toContain("Workspace history is archived");
}

test("archive and restore preserve history across restart, missing branches stay read-only, permanent deletion requires opt-in", async () => {
  test.setTimeout(240_000);
  const directory = await mkdtemp(path.join(tmpdir(), "stave-cleanup-e2e-"));
  const repositoryPath = path.join(directory, "repository");
  const profile = path.join(directory, "profile");
  await mkdir(repositoryPath);
  await mkdir(profile);
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git(repositoryPath, "init", "-b", "main");
  git(repositoryPath, "config", "user.name", "Test");
  git(repositoryPath, "config", "user.email", "test@example.invalid");
  await writeFile(path.join(repositoryPath, "README.md"), "Cleanup integration fixture.\n");
  git(repositoryPath, "add", ".");
  git(repositoryPath, "commit", "-m", "test: initialize");
  const remote = path.join(directory, "remote.git");
  git(repositoryPath, "init", "--bare", remote);
  git(repositoryPath, "remote", "add", "origin", remote);
  git(repositoryPath, "push", "-u", "origin", "main");
  const ids = ["restore-branch", "restore-history", "delete-unmerged"];
  const worktrees = Object.fromEntries(ids.map(id => [id, path.join(repositoryPath, ".stave", "workspaces", id)]));
  for (const id of ids) git(repositoryPath, "worktree", "add", "-b", id, worktrees[id]!);
  await writeFile(path.join(worktrees["delete-unmerged"]!, "unmerged.txt"), "Keep this until explicit permanent deletion.\n");
  git(worktrees["delete-unmerged"]!, "add", ".");
  git(worktrees["delete-unmerged"]!, "commit", "-m", "test: unmerged work");
  let stave: StaveApp | null = null;
  try {
    // Seed before launch so renderer hydration and the host start from one registry.
    const fixtureEntry = path.join(directory, "seed.ts");
    const fixtureBundle = path.join(directory, "seed.cjs");
    await writeFile(fixtureEntry, `
      import { SqliteStore } from ${JSON.stringify(path.resolve("electron/persistence/sqlite-store.ts"))};
      const store = new SqliteStore({dbPath:${JSON.stringify(path.join(profile, "stave.sqlite"))},runMaintenance:false});
      const repositoryPath=${JSON.stringify(repositoryPath)};
      const ids=${JSON.stringify(ids)};
      const worktrees=${JSON.stringify(worktrees)};
      const updatedAt="2026-01-01T00:00:00.000Z";
      const repository={repositoryPath,repositoryName:"Fixture",lastOpenedAt:updatedAt,defaultBranch:"main",activeWorkspaceId:"base",
        workspaces:[{id:"base",name:"Default",updatedAt}],workspacePathById:{base:repositoryPath},workspaceBranchById:{base:"main"},workspaceDefaultById:{base:true}};
      store.upsertWorkspace({id:"base",name:"Default",snapshot:{activeTaskId:"",tasks:[],messagesByTask:{}}});
      for(const id of ids){
        const taskId="task-"+id;
        store.upsertWorkspace({id,name:id,snapshot:{activeTaskId:taskId,tasks:[{id:taskId,title:"Preserved task",provider:"codex",updatedAt,unread:false,archivedAt:null}],
          messagesByTask:{[taskId]:[{id:"message-"+id,role:"user",model:"user",providerId:"user",content:"History "+id,isStreaming:false,parts:[]}]}}});
        repository.workspaces.push({id,name:id,updatedAt});
        repository.workspacePathById[id]=worktrees[id];repository.workspaceBranchById[id]=id;repository.workspaceDefaultById[id]=false;
      }
      store.saveRepositoryRegistry({repositories:[repository],activeRepositoryPath:repositoryPath});store.close();
    `);
    execFileSync("bun", ["build", fixtureEntry, "--outfile", fixtureBundle, "--target=node", "--format=cjs", "--external=better-sqlite3", '--define=import.meta.env.BASE_URL="/"'], { stdio: "pipe" });
    const require = createRequire(import.meta.url);
    execFileSync(require("electron"), [fixtureBundle], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_PATH: path.dirname(path.dirname(require.resolve("better-sqlite3/package.json"))) }, stdio: "pipe" });
    stave = await launchStave({ userDataDir: profile });
    await workspaceShellReady(stave.page);
    expect((await stave.page.evaluate(() => window.api.workspaceCleanup!.list())).rows.filter(row => ids.includes(row.id)).map(row => row.id).sort()).toEqual([...ids].sort());
    // Hold the real refresh after it captures renderer state and before Git
    // observes the checkout removed by archive. Only scheduling is controlled.
    await stave.app.evaluate(({ ipcMain }) => {
      const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (event: unknown, args: { command: string; cwd: string }) => unknown> })._invokeHandlers;
      const original = handlers.get("terminal:run-command")!;
      const control = { started: false, listed: false, release: () => {} };
      (globalThis as unknown as { cleanupRefresh: typeof control }).cleanupRefresh = control;
      const held = new Promise<void>(resolve => { control.release = resolve; });
      ipcMain.removeHandler("terminal:run-command");
      ipcMain.handle("terminal:run-command", async (event, args: { command: string; cwd: string }) => {
        if (args.command === "git worktree prune") { control.started = true; await held; }
        const result = await original(event, args);
        if (args.command.includes("worktree list")) control.listed = true;
        return result;
      });
    });
    // App refreshes every 30 seconds; wait for that actual interval to capture
    // its snapshot, with a bounded allowance for desktop scheduling.
    await expect.poll(() => stave!.app.evaluate(() => (globalThis as unknown as { cleanupRefresh: { started: boolean } }).cleanupRefresh.started), { timeout: 40_000 }).toBe(true);
    for (const id of ids.slice(0, 2)) {
      const result = await act(stave.page, { action: "archive", workspaceId: id, repositoryPath });
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
      expect(existsSync(worktrees[id]!)).toBe(false);
      if (id === "restore-branch") {
        await stave.app.evaluate(() => (globalThis as unknown as { cleanupRefresh: { release: () => void } }).cleanupRefresh.release());
        await expect.poll(() => stave!.app.evaluate(() => (globalThis as unknown as { cleanupRefresh: { listed: boolean } }).cleanupRefresh.listed)).toBe(true);
      }

      expect(git(repositoryPath, "show-ref", "--verify", `refs/heads/${id}`)).toContain(`refs/heads/${id}`);
      expect(await messages(stave.page, id)).toEqual([`History ${id}`]);
      // Reproduce the destructive request emitted by a stale pre-archive snapshot.
      expect(await stave.page.evaluate(workspaceId => window.api.persistence!.closeWorkspace!({ workspaceId }), id)).toMatchObject({ ok: false });
      expect(await messages(stave.page, id)).toEqual([`History ${id}`]);
      expect((await stave.page.evaluate(() => window.api.workspaceCleanup!.listArchived())).some(row => row.id === id)).toBe(true);

    }
    await stave.close();
    stave = await launchStave({ userDataDir: profile });
    await workspaceShellReady(stave.page);
    expect((await stave.page.evaluate(() => window.api.workspaceCleanup!.list())).rows.filter(row => row.archived).map(row => row.id).sort()).toEqual(["restore-branch", "restore-history"]);
    await expectArchivedExecutionDenied(stave.page, "restore-branch", worktrees["restore-branch"]!, repositoryPath);
    expect(await messages(stave.page, "restore-branch")).toEqual(["History restore-branch"]);
    expect(await act(stave.page, { action: "restore", workspaceId: "restore-branch", repositoryPath })).toMatchObject({ ok: true, readOnly: false });
    expect(existsSync(worktrees["restore-branch"]!)).toBe(true);
    git(repositoryPath, "branch", "-d", "restore-history");
    expect(await act(stave.page, { action: "restore", workspaceId: "restore-history", repositoryPath })).toMatchObject({ ok: true, readOnly: true });
    expect(existsSync(worktrees["restore-history"]!)).toBe(false);
    expect(await messages(stave.page, "restore-history")).toEqual(["History restore-history"]);
    await stave.close();
    stave = await launchStave({ userDataDir: profile });
    await workspaceShellReady(stave.page);
    await expectArchivedExecutionDenied(stave.page, "restore-history", worktrees["restore-history"]!, repositoryPath);
    const historyRow = (await stave.page.evaluate(() => window.api.workspaceCleanup!.list())).rows.find(row => row.id === "restore-history");
    expect(historyRow).toMatchObject({ archived: true, readOnly: true });
    const denied = await act(stave.page, { action: "delete", workspaceId: "delete-unmerged", repositoryPath, deleteBranch: true });
    expect(denied.ok).toBe(false);
    expect(denied.reason).toMatch(/unmergedBranch|unpushedCommits/);
    expect(existsSync(worktrees["delete-unmerged"]!)).toBe(true);
    expect(await messages(stave.page, "delete-unmerged")).toEqual(["History delete-unmerged"]);
    expect(await act(stave.page, { action: "delete", workspaceId: "delete-unmerged", repositoryPath, deleteBranch: true, forceDeleteBranch: true })).toMatchObject({ ok: true });
    expect(existsSync(worktrees["delete-unmerged"]!)).toBe(false);
    expect(() => git(repositoryPath, "show-ref", "--verify", "refs/heads/delete-unmerged")).toThrow();
    expect(await messages(stave.page, "delete-unmerged")).toEqual([]);
    expect(await stave.page.evaluate(async () => (await window.api.persistence!.loadWorkspaceShell!({workspaceId:"delete-unmerged"})).shell)).toBeNull();
  } catch (error) {
    if (stave) {
      console.info("Cleanup state at failure", JSON.stringify(await stave.page.evaluate(async () => ({
        cleanup: await window.api.workspaceCleanup!.list(),
        registry: await window.api.persistence!.loadRepositoryRegistry!(),
      })).catch(failure => ({ error: String(failure) }))));
    }
    throw error;
  } finally {
    await stave?.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
