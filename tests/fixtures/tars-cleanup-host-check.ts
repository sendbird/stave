import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteStore } from "../../electron/persistence/sqlite-store";
import { createWorkspaceCleanupRuntime } from "../../electron/host-service/workspace-cleanup-runtime";
import { createTarsBatchRuntime } from "../../electron/host-service/tars-batch";

async function main() {
  const root = mkdtempSync(join(tmpdir(), "tars-cleanup-"));
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  let store: SqliteStore | undefined;
  try {
    const repo = join(root, "repository");
    git(root, "init", "-b", "main", repo);
    git(repo, "config", "user.name", "Test"); git(repo, "config", "user.email", "test@example.test"); git(repo, "config", "commit.gpgsign", "false");
    git(repo, "commit", "--allow-empty", "-m", "test: initial");
    const remote = join(root, "remote.git"); git(root, "init", "--bare", remote); git(repo, "remote", "add", "origin", remote); git(repo, "push", "-u", "origin", "main");
    const dbPath = join(root, "state.sqlite");
    store = new SqliteStore({ dbPath, runMaintenance: false });
    const cases = ["eligible", "cancelled", "dirty", "unpushed", "running", "pending"];
    const paths: Record<string, string> = { base: repo };
    for (const id of cases) {
      paths[id] = join(root, id); git(repo, "worktree", "add", "-b", id, paths[id]!);
      store.upsertWorkspace({ id, name: id, snapshot: { activeTaskId: null, tasks: [], messagesByTask: {} } });
      const row = store.tars.create({ requestId: id, title: id, instruction: "Verify work", acceptanceCriteria: ["Verified"], workspaceId: "base", repositoryPath: repo, providerId: "codex" }, "2026-11-16T00:00:00.000Z");
      store.tars.patch(row.id, row.revision, { state: id === "running" ? "queued" : id === "cancelled" ? "cancelled" : "completed", executionWorkspaceId: id, completionConfirmedAt: "2026-11-16T00:00:00.000Z" }, "2026-11-16T00:00:00.000Z");
    }
    store.saveRepositoryRegistry({ repositories: [{ repositoryPath: repo, repositoryName: "Repository", lastOpenedAt: "2026-11-16", defaultBranch: "main", workspaces: ["base", ...cases].map(id => ({ id, name: id, updatedAt: "2026-11-16" })), activeWorkspaceId: "base", workspacePathById: paths, workspaceBranchById: Object.fromEntries(["base", ...cases].map(id => [id, id === "base" ? "main" : id])), workspaceDefaultById: { base: true } }] });
    writeFileSync(join(paths.dirty!, "changed.txt"), "keep");
    git(paths.unpushed!, "commit", "--allow-empty", "-m", "test: unpushed");
    const pr = async ({ target }: { target?: string }) => ({ ok: true, pr: target === "pending" ? { state: "OPEN" } as never : null, stderr: "" });
    const cleanup = createWorkspaceCleanupRuntime({ store: () => store!, hasTerminals: () => false, pr });
    const makeBatch = () => createTarsBatchRuntime({ conversations: () => store!.tarsConversations, responsibilities: () => store!.tars, cleanup, pr, control: async () => { throw new Error("Unexpected control"); } });
    let batch = makeBatch();
    const preview = await batch.invoke({ operation: "preview", action: { kind: "cleanup", scope: { kind: "all" }, deleteBranches: false, permanentlyDeleteArchived: false } });
    const reasons = Object.fromEntries(preview.items.map(item => [item.name, item.reason]));
    for (const [name, reason] of [["eligible", null], ["cancelled", null], ["dirty", "changedFiles"], ["unpushed", "unpushedCommits"], ["pending", "publicationPending"]]) assert.equal(reasons[name!], reason, name!);
    // Running work is left out of a cleanup list and counted once.
    assert.equal(reasons.running, undefined);
    assert.equal(preview.omitted, 1);
    const result = await batch.invoke({ operation: "confirm", id: preview.id });
    assert.equal(result.items.filter(item => item.status === "applied").length, 2);
    assert.equal(existsSync(paths.eligible!), false);
    for (const id of cases.filter(id => !["eligible", "cancelled"].includes(id))) assert.equal(existsSync(paths[id]!), true);
    store.close(); store = new SqliteStore({ dbPath, runMaintenance: false }); batch = makeBatch();
    assert.equal(batch.list()[0]!.state, "applied");
    await batch.invoke({ operation: "restore", id: preview.id });
    assert.equal(existsSync(paths.eligible!), true);
    assert.equal(batch.list()[0]!.state, "restored");
    const ended = store.tars.snapshot().responsibilities.find(row => row.title === "eligible")!;
    const again = await batch.invoke({ operation: "preview", action: { kind: "cleanup", scope: { kind: "ids", ids: [ended.id] }, deleteBranches: false, permanentlyDeleteArchived: false } });
    await batch.invoke({ operation: "confirm", id: again.id });
    const permanent = await batch.invoke({ operation: "preview", action: { kind: "cleanup", scope: { kind: "ids", ids: [ended.id] }, deleteBranches: true, permanentlyDeleteArchived: true } });
    assert.equal(permanent.items[0]!.action, "delete");
    const racing = createTarsBatchRuntime({ conversations: () => store!.tarsConversations, responsibilities: () => store!.tars, pr,
      cleanup: { list: cleanup.list, act: async input => {
        if (input.action === "delete") await cleanup.act({ action: "restore", workspaceId: input.workspaceId, repositoryPath: input.repositoryPath });
        return cleanup.act(input);
      } }, control: async () => { throw new Error("Unexpected control"); } });
    const raced = await racing.invoke({ operation: "confirm", id: permanent.id });
    assert.equal(raced.items[0]!.status, "skipped");
    assert.equal(raced.items[0]!.reason, "notArchived");
    assert.equal(existsSync(paths.eligible!), true, "A Restore queued before deletion must preserve the workspace");
    await cleanup.act({ action: "archive", workspaceId: "eligible", repositoryPath: repo });
    const finalDelete = await batch.invoke({ operation: "preview", action: permanent.action });
    const deleted = await batch.invoke({ operation: "confirm", id: finalDelete.id });
    assert.equal(deleted.items[0]!.status, "applied");
    assert.equal(store.listArchivedWorkspacesPersistence().some(row => row.workspaceId === "eligible"), false);
    assert.throws(() => git(repo, "show-ref", "--verify", "refs/heads/eligible"));
  } finally { store?.close(); rmSync(root, { recursive: true, force: true }); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
