import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteStore } from "../../electron/persistence/sqlite-store";
import { createWorkspaceCleanupRuntime } from "../../electron/host-service/workspace-cleanup-runtime";
import { createTarsBatchRuntime } from "../../electron/host-service/tars-batch";

/** A three-item cleanup in a repository with twenty workspaces looks up each candidate's pull request at most once per step. */
async function main() {
  const root = mkdtempSync(join(tmpdir(), "tars-cleanup-lookups-"));
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  let store: SqliteStore | undefined;
  try {
    const repo = join(root, "repository");
    git(root, "init", "-b", "main", repo);
    git(repo, "config", "user.name", "Test"); git(repo, "config", "user.email", "test@example.test"); git(repo, "config", "commit.gpgsign", "false");
    git(repo, "commit", "--allow-empty", "-m", "test: initial");
    const remote = join(root, "remote.git"); git(root, "init", "--bare", remote); git(repo, "remote", "add", "origin", remote); git(repo, "push", "-u", "origin", "main");
    store = new SqliteStore({ dbPath: join(root, "state.sqlite"), runMaintenance: false });
    const ended = ["ended-1", "ended-2", "ended-3"];
    const idle = Array.from({ length: 16 }, (_, index) => `idle-${index + 1}`);
    const paths: Record<string, string> = { base: repo };
    for (const id of [...ended, ...idle]) {
      paths[id] = join(root, id);
      if (ended.includes(id)) git(repo, "worktree", "add", "-b", id, paths[id]!);
      store.upsertWorkspace({ id, name: id, snapshot: { activeTaskId: null, tasks: [], messagesByTask: {} } });
    }
    for (const id of ended) {
      const row = store.tars.create({ requestId: id, title: id, instruction: "Verify work", acceptanceCriteria: ["Verified"], workspaceId: "base", repositoryPath: repo, providerId: "codex" }, "2026-11-16T00:00:00.000Z");
      store.tars.patch(row.id, row.revision, { state: "completed", executionWorkspaceId: id, completionConfirmedAt: "2026-11-16T00:00:00.000Z" }, "2026-11-16T00:00:00.000Z");
    }
    // Twenty workspaces: the default checkout, three ended executions and sixteen others.
    const all = ["base", ...ended, ...idle];
    store.saveRepositoryRegistry({ repositories: [{ repositoryPath: repo, repositoryName: "Repository", lastOpenedAt: "2026-11-16", defaultBranch: "main",
      workspaces: all.map(id => ({ id, name: id, updatedAt: "2026-11-16" })), activeWorkspaceId: "base", workspacePathById: paths,
      workspaceBranchById: Object.fromEntries(all.map(id => [id, id === "base" ? "main" : id])), workspaceDefaultById: { base: true } }] });
    let lookups = 0;
    const pr = async () => { lookups++; return { ok: true, pr: null, stderr: "" }; };
    const cleanup = createWorkspaceCleanupRuntime({ store: () => store!, hasTerminals: () => false, pr });
    const batch = createTarsBatchRuntime({ conversations: () => store!.tarsConversations, responsibilities: () => store!.tars, cleanup, pr, control: async () => { throw new Error("Unexpected control"); } });
    const preview = await batch.invoke({ operation: "preview", action: { kind: "cleanup", scope: { kind: "all" }, deleteBranches: false, permanentlyDeleteArchived: false } });
    assert.equal(preview.items.filter(item => item.status === "included").length, 3);
    assert.ok(lookups <= 3, `preview looked up ${lookups} pull requests for 3 candidates`);
    lookups = 0;
    const result = await batch.invoke({ operation: "confirm", id: preview.id });
    assert.equal(result.items.filter(item => item.status === "applied").length, 3);
    assert.ok(lookups <= 3, `confirm looked up ${lookups} pull requests for 3 items`);
    for (const id of ended) assert.equal(existsSync(paths[id]!), false);
  } finally { store?.close(); rmSync(root, { recursive: true, force: true }); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
