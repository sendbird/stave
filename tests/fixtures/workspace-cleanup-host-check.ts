import type { GitHubPrPayload } from "../../src/lib/pr-status";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, symlinkSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteStore } from "../../electron/persistence/sqlite-store";
import { createWorkspaceCleanupRuntime, responsibilityCleanupBlocker } from "../../electron/host-service/workspace-cleanup-runtime";
import { DEFAULT_WORKSPACE_CLEANUP_POLICY } from "../../src/lib/workspace-cleanup-contract";
import { workspaceExecutionGate } from "../../electron/shared/workspace-execution-gate";

async function main() {
const root = mkdtempSync(join(tmpdir(), "workspace-cleanup-host-"));
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
try {
  const repo = join(root, "repository");
  git(root, "init", "-b", "main", repo);
  git(repo, "-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "test: initial");
  const remote = join(root, "remote.git");
  git(root, "init", "--bare", remote);
  git(repo, "remote", "add", "origin", remote);
  git(repo, "push", "-u", "origin", "main");
  const path = join(root, "feature's $(literal)");
  git(repo, "worktree", "add", "-b", "feature", path);
  let store = new SqliteStore({ dbPath: join(root, "state.sqlite"), runMaintenance: false });
  let now = Date.parse("2026-11-16T00:00:00Z");
  let workspaceId = "feature";
  const registry = () => ({ repositoryPath: repo, repositoryName: "Repository", lastOpenedAt: "2026-01-01", defaultBranch: "main", workspaces: [{ id: "base", name: "Default", updatedAt: "2026-01-01" }, { id: workspaceId, name: "Feature", updatedAt: "2026-01-01" }], activeWorkspaceId: "base", workspacePathById: { base: repo, [workspaceId]: path }, workspaceBranchById: { base: "main", [workspaceId]: "feature" }, workspaceDefaultById: { base: true, [workspaceId]: false } });
  store.saveRepositoryRegistry({ repositories: [registry()] });
  store.upsertWorkspace({ id: "feature", name: "Feature", snapshot: { activeTaskId: "task", tasks: [{ id: "task", title: "Task", provider: "codex", updatedAt: "2026-01-01T00:00:00Z", unread: false }], messagesByTask: { task: [{ id: "message", role: "user", model: "user", providerId: "user", content: "Keep history", parts: [] }] } } });
  let terminals = false;
  // Only the PTY observation and PR service are faked; Git, registry, history and policy persistence are real.
  const prTimes = new Map<string, string | null>();
  const prStates = new Map<string, "OPEN" | "MERGED">();
  const runtime = createWorkspaceCleanupRuntime({ store: () => store, hasTerminals: () => terminals, now: () => now,
    pr: async ({ target }) => {
      const pr: GitHubPrPayload | null = prTimes.has(target ?? "") ? { number: 1, title: "Completed work", state: prStates.get(target ?? "") ?? "MERGED", isDraft: prStates.get(target ?? "") === "OPEN",
        url: "https://example.test/pull/1", reviewDecision: null, mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN", checksRollup: null,
        mergedAt: prTimes.get(target ?? "") ?? null, baseRefName: "main", headRefName: target ?? "" } : null;
      return { ok: true, pr, stderr: "" };
    } });
  const act = (action: "archive" | "restore" | "delete", extra = {}) => runtime.act({ action, workspaceId, repositoryPath: repo, ...extra });
  git(path, "checkout", "-b", "other-head");
  assert.equal((await act("archive")).ok, false);
  assert.equal(existsSync(path), true);
  git(path, "checkout", "feature");
  git(repo, "branch", "-d", "other-head");
  mkdirSync(join(repo, "node_modules"));
  symlinkSync(join(repo, "node_modules"), join(path, "node_modules"));
  assert.equal((await act("archive")).ok, true);
  assert.equal(existsSync(path), false);
  assert.equal(git(repo, "branch", "--list", "feature").trim(), "feature");
  assert.equal(store.loadWorkspaceSnapshot({ workspaceId: "feature" })!.messagesByTask.task![0]!.content, "Keep history");
  mkdirSync(path);
  writeFileSync(join(path, "unrelated.txt"), "unrelated directory");
  assert.equal((await act("restore")).ok, false);
  assert.equal(existsSync(join(path, "unrelated.txt")), true);
  rmSync(path, { recursive: true });
  assert.equal((await act("restore")).ok, true);
  assert.equal(existsSync(path), true);
  assert.equal(store.loadRepositoryRegistry()[0]!.archivedWorkspacePaths!.length, 0);
  // Every automatic rule sees the same authoritative guards.
  const policy = { ...DEFAULT_WORKSPACE_CLEANUP_POLICY, inactive: { enabled: true, value: 1 } };
  for (const guard of ["dirty", "unpushed", "current", "default", "running", "terminal"] as const) {
    runtime.configure(policy);
    if (guard === "dirty") writeFileSync(join(path, "unsaved.txt"), "keep");
    if (guard === "unpushed") git(path, "-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "test: unpushed");
    if (guard === "current") store.updateRepositoryRegistry(repositories => { repositories[0]!.activeWorkspaceId = "feature"; return { repositories, result: undefined }; });
    if (guard === "default") store.updateRepositoryRegistry(repositories => { repositories[0]!.workspaceDefaultById.feature = true; return { repositories, result: undefined }; });
    const release = guard === "running" ? workspaceExecutionGate.acquire({ workspaceId: "feature", cwd: path }) : () => {};
    terminals = guard === "terminal";
    await runtime.runNow();
    assert.equal(existsSync(path), true, guard);
    assert.equal(store.listArchivedWorkspacesPersistence().length, 0, guard);
    release(); terminals = false;
    if (guard === "dirty") rmSync(join(path, "unsaved.txt"));
    if (guard === "unpushed") git(path, "reset", "--hard", "main");
    store.saveRepositoryRegistry({ repositories: [registry()] });
  }
  runtime.configure(DEFAULT_WORKSPACE_CLEANUP_POLICY);
  // Denied permanent branch deletion keeps both history and checkout.
  git(path, "-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "test: unmerged");
  assert.equal((await act("delete", { deleteBranch: true })).ok, false);
  assert.equal(existsSync(path), true);
  assert.ok(store.loadWorkspaceSnapshot({ workspaceId: "feature" }));
  assert.equal((await act("delete", { deleteBranch: true, forceDeleteBranch: true })).ok, true);
  assert.equal(existsSync(path), false);
  assert.equal(git(repo, "branch", "--list", "feature").trim(), "");
  assert.equal(store.loadWorkspaceSnapshot({ workspaceId: "feature" }), null);
  // Restore without a branch retains an isolated read-only history shelf.
  workspaceId = "restorable";
  git(repo, "worktree", "add", "-b", "feature", path);
  store.saveRepositoryRegistry({ repositories: [registry()] });
  store.upsertWorkspace({ id: workspaceId, name: "Feature", snapshot: { activeTaskId: null, tasks: [], messagesByTask: {} } });
  workspaceExecutionGate.resume("feature");
  const rearchive = await act("archive");
  assert.equal(rearchive.ok, true, JSON.stringify(rearchive));
  git(repo, "branch", "-d", "feature");
  const readonly = await act("restore");
  assert.equal(readonly.ok, true); assert.equal(readonly.readOnly, true);
  assert.equal(existsSync(path), false);
  assert.equal(store.listArchivedWorkspacesPersistence()[0]!.readOnly, true);
  for (const state of ["running", "waiting", "paused", "resultReady", "takenOver"]) assert.equal(responsibilityCleanupBlocker([{ executionWorkspaceId: "feature", state }], "feature"), "responsibilityRunning");
  for (const state of ["completed", "cancelled"]) assert.equal(responsibilityCleanupBlocker([{ executionWorkspaceId: "feature", state }], "feature"), null);
  assert.equal(responsibilityCleanupBlocker([{ executionWorkspaceId: "feature", state: "completed", publication: { state: "committed" } }], "feature"), "publicationPending");
  const responsibility = store.tars.create({ requestId: "ended-work", title: "Verify cleanup", instruction: "Keep the workspace recoverable", acceptanceCriteria: ["History remains available"], workspaceId, repositoryPath: repo, providerId: "codex" }, new Date(now).toISOString());
  const completed = store.tars.patch(responsibility.id, responsibility.revision, { state: "completed", executionWorkspaceId: workspaceId, completionConfirmedAt: new Date(now).toISOString() }, new Date(now).toISOString());
  assert.equal(store.tars.snapshot().responsibilities[0]!.state, "completed");
  assert.deepEqual((await runtime.list()).rows.find(row => row.id === workspaceId)!.blockers, []);
  store.tarsConversations.recordPublish({ requestId: "pending-publish", source: "click", responsibilityId: completed.id, expectedRevision: completed.revision, commitMessage: "feat: retained work", title: "feat: retained work" }, null, new Date(now).toISOString());
  assert.equal(store.tars.snapshot().responsibilities[0]!.publication, undefined);
  assert.ok((await runtime.list()).rows.find(row => row.id === workspaceId)!.blockers.includes("publicationPending"));
  store.tarsConversations.settlePublish("pending-publish", { status: "rejected", reason: "publishFailed", error: "Fixture publication was cancelled" }, new Date(now).toISOString());
  assert.deepEqual((await runtime.list()).rows.find(row => row.id === workspaceId)!.blockers, []);
  const published = store.tars.patch(completed.id, completed.revision, { publication: { state: "opened", failedStep: null, commit: "0000000000000000000000000000000000000000", branch: "feature", base: "main", commitMessage: "feat: retained work", title: "feat: retained work", url: "https://example.test/pull/1", number: 1, error: null, reason: null, updatedAt: new Date(now).toISOString() } }, new Date(now).toISOString());
  prTimes.set("feature", null); prStates.set("feature", "OPEN");
  assert.ok((await runtime.list()).rows.find(row => row.id === workspaceId)!.blockers.includes("publicationPending"));
  store.tars.patch(published.id, published.revision, { publication: undefined }, new Date(now).toISOString());
  // Successful automatic archive and its audit survive a real store restart.
  const registerAutomatic = (id: string) => {
    const workspacePath = join(root, id);
    git(repo, "worktree", "add", "-b", id, workspacePath);
    store.upsertWorkspace({ id, name: id, snapshot: { activeTaskId: null, tasks: [], messagesByTask: {} } });
    store.updateRepositoryRegistry(repositories => {
      const repository = repositories[0]!;
      repository.workspaces.push({ id, name: id, updatedAt: "2026-01-01" });
      repository.workspacePathById[id] = workspacePath; repository.workspaceBranchById[id] = id; repository.workspaceDefaultById[id] = false;
      return { repositories, result: undefined };
    });
    return workspacePath;
  };
  runtime.configure({ ...DEFAULT_WORKSPACE_CLEANUP_POLICY, merged: { enabled: true, value: 2 } });
  for (const [id, mergedAt, eligible] of [
    ["merge-no-date", null, false], ["merge-invalid", "invalid", false],
    ["merge-recent", new Date(now - 12 * 3600_000).toISOString(), false],
    ["merge-due", new Date(now - 3 * 86400_000).toISOString(), true],
  ] as const) {
    const candidatePath = registerAutomatic(id);
    prTimes.set(id, mergedAt);
    await runtime.runNow();
    assert.equal(existsSync(candidatePath), !eligible, id);
  }
  const automaticPath = registerAutomatic("automatic-one");
  runtime.configure({ ...DEFAULT_WORKSPACE_CLEANUP_POLICY, inactive: { enabled: true, value: 1 } });
  const automatic = await runtime.runNow();
  assert.ok(automatic.results.some(result => result.workspaceId === "automatic-one" && result.ok), JSON.stringify(automatic));
  assert.equal(existsSync(automaticPath), false);
  assert.ok((await runtime.list()).recent.some(result => result.workspaceId === "automatic-one" && result.automatic && result.ok));
  store.close();
  store = new SqliteStore({ dbPath: join(root, "state.sqlite"), runMaintenance: false });
  // A fresh host has no in-memory suspension; durable archives still deny execution.
  workspaceExecutionGate.resume("automatic-one");
  workspaceExecutionGate.resume("restorable");
  workspaceExecutionGate.setArchiveReader(() => []);
  const restarted = createWorkspaceCleanupRuntime({ store: () => store, hasTerminals: () => false, now: () => now });
  assert.throws(() => workspaceExecutionGate.acquire({ workspaceId: "automatic-one", cwd: automaticPath }), /archived/);
  assert.throws(() => workspaceExecutionGate.acquire({ workspaceId: "restorable", cwd: path }), /archived/);
  assert.throws(() => workspaceExecutionGate.acquire({ cwd: path }), /archived/);
  assert.ok((await restarted.list()).recent.some(result => result.workspaceId === "automatic-one" && result.automatic && result.ok));
  const secondPath = registerAutomatic("automatic-two");
  now += 30 * 60_000;
  assert.equal((await restarted.runScheduled()).results.length, 0);
  assert.equal(existsSync(secondPath), true, "scheduled cleanup ran before one hour");
  now += 31 * 60_000;
  const scheduledResult = await restarted.runScheduled();
  assert.ok(scheduledResult.results.some(result => result.workspaceId === "automatic-two" && result.ok), JSON.stringify(scheduledResult));
  assert.equal(existsSync(secondPath), false);
  store.close();
} finally {
  workspaceExecutionGate.setArchiveReader(() => []);
  workspaceExecutionGate.resume("feature");
  rmSync(root, { recursive: true, force: true });
}

}
main().catch(error => { console.error(error); process.exitCode = 1; });
