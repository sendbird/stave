import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteStore } from "../../electron/persistence/sqlite-store";
import { createWorkspaceCleanupRuntime } from "../../electron/host-service/workspace-cleanup-runtime";
import { workspaceExecutionGate } from "../../electron/shared/workspace-execution-gate";
import { buildDelegatedTaskRunId, buildDelegatedTaskStepId, DELEGATED_TASK_DETACHED_REASON } from "../../src/lib/runs/delegated-task";
import { createPendingRun, createPendingRunStep, RUN_LEDGER_SCHEMA_VERSION } from "../../src/lib/runs/run-domain";

/**
 * Delegated child workspaces with a real SQLite store (ledger, registry,
 * snapshots, archives) and real Git: the nesting survives a restart, and the
 * automatic cleanup archives a child only once its rules hold, through the
 * ordinary archive, keeping its branch.
 */
async function main() {
  const root = mkdtempSync(join(tmpdir(), "delegated-cleanup-runtime-"));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com" };
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const calls: string[][] = [];
  const NOW = "2026-11-25T00:00:00.000Z";
  try {
    const repo = join(root, "repository");
    git(root, "init", "-b", "main", repo);
    git(repo, "commit", "--allow-empty", "-m", "initial");
    const worktree = (name: string, branch: string, from: string) => { const path = join(repo, ".stave", "workspaces", name); git(repo, "worktree", "add", "-b", branch, path, from); return realpathSync(path); };
    const parent = worktree("parent", "parent-branch", "main");
    // Local parent work that no remote has: the ordinary automatic archive would refuse it as unpushed.
    writeFileSync(join(parent, "parent.txt"), "parent");
    git(parent, "add", "parent.txt");
    git(parent, "commit", "-m", "parent work");
    const child = worktree("subagent-key", "subagent-key", "parent-branch");
    const released = worktree("subagent-released", "subagent-released", "parent-branch");
    const dbPath = join(root, "state.sqlite");
    let store = new SqliteStore({ dbPath, runMaintenance: false });
    store.saveRepositoryRegistry({ repositories: [{ repositoryPath: repo, repositoryName: "Repository", lastOpenedAt: "2026-01-01", defaultBranch: "main",
      workspaces: [{ id: "base", name: "Default", updatedAt: NOW }, { id: "ws-parent", name: "Parent work", updatedAt: NOW }, { id: "ws-child", name: "subagent-key", updatedAt: NOW }, { id: "ws-released", name: "subagent-released", updatedAt: NOW }],
      activeWorkspaceId: "base",
      workspacePathById: { base: repo, "ws-parent": parent, "ws-child": child, "ws-released": released },
      workspaceBranchById: { base: "main", "ws-parent": "parent-branch", "ws-child": "subagent-key", "ws-released": "subagent-released" },
      workspaceDefaultById: { base: true, "ws-parent": false, "ws-child": false, "ws-released": false } }] });
    const task = (id: string, parentTaskId?: string) => ({ id, title: id, provider: "codex" as const, updatedAt: NOW, unread: false, ...(parentTaskId ? { parentTaskId } : {}) });
    store.upsertWorkspace({ id: "base", name: "Default", snapshot: { activeTaskId: "", tasks: [], messagesByTask: {} } });
    store.upsertWorkspace({ id: "ws-parent", name: "Parent work", snapshot: { activeTaskId: "parent-task", tasks: [task("parent-task")], messagesByTask: {} } });
    store.upsertWorkspace({ id: "ws-child", name: "subagent-key", snapshot: { activeTaskId: "child-task", tasks: [task("child-task", "parent-task")], messagesByTask: {} } });
    store.upsertWorkspace({ id: "ws-released", name: "subagent-released", snapshot: { activeTaskId: "released-task", tasks: [task("released-task")], messagesByTask: {} } });
    // Two delegations as the coordinator records them: one completes with an answer, one is detached.
    const delegate = (key: string, workspaceId: string, taskId: string) => {
      const runId = buildDelegatedTaskRunId({ parentTaskId: "parent-task", delegationKey: key });
      const stepId = buildDelegatedTaskStepId(runId);
      store.claimRunStep({
        run: createPendingRun({ id: runId, kind: "delegated-task", origin: { kind: "task", id: "parent-task" }, ownership: { repositoryPath: repo, workspaceId, taskId },
          policy: { maxAttempts: 3, timeoutMs: 86_400_000, maxTurns: 200, maxOutputBytes: 1_048_576, maxEvents: 4_096 },
          provenance: { createdBy: "delegated-task-coordinator", schemaVersion: RUN_LEDGER_SCHEMA_VERSION }, now: NOW }),
        step: createPendingRunStep({ id: stepId, runId, kind: "delegated-task-turn", target: { taskId, workspaceId, turnId: null, providerId: "codex" }, dependencyIds: [], inputHash: "a".repeat(64), now: NOW }),
        executionId: `exec-${key}`, idempotencyKey: key, now: NOW,
      });
      return { runId, stepId, executionId: `exec-${key}` };
    };
    const childRun = delegate("key", "ws-child", "child-task");
    const releasedRun = delegate("released", "ws-released", "released-task");
    store.cancelRunStep({ ...releasedRun, idempotencyKey: "detach:released", error: DELEGATED_TASK_DETACHED_REASON, now: NOW });
    assert.deepEqual(store.delegatedAnswers.listWorkspaceLinks().map(link => [link.childWorkspaceId, link.parentWorkspaceId, link.phase]), [["ws-child", "ws-parent", "running"]],
      "Only the delegation that still owns its workspace nests it; the detached one is released");

    // The nesting is read from durable rows, so a restart sees it unchanged.
    store.close();
    store = new SqliteStore({ dbPath, runMaintenance: false });
    assert.deepEqual(store.delegatedAnswers.listWorkspaceLinks().map(link => [link.childWorkspaceId, link.parentWorkspaceId]), [["ws-child", "ws-parent"]]);

    const runtime = createWorkspaceCleanupRuntime({ store: () => store, hasTerminals: () => false,
      git: async (cwd, args) => {
        calls.push(args);
        try { return { ok: true, code: 0, stdout: execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), stderr: "" }; }
        catch (error) { return { ok: false, code: 1, stdout: "", stderr: String(error) }; }
      } });
    const kept = async () => (await runtime.annotateDelegatedChildren((await runtime.list()).rows)).find(row => row.id === "ws-child")?.subagent?.kept;

    // Still running: kept.
    assert.deepEqual(await runtime.sweepDelegatedChildren(), []);
    assert.deepEqual(await kept(), ["subagentActive"]);

    // Finished with an answer the parent has not received, and a commit of its own.
    writeFileSync(join(child, "result.txt"), "result");
    git(child, "add", "result.txt");
    git(child, "commit", "-m", "child result");
    store.completeRunStep({ ...childRun, idempotencyKey: "child:exec-key:completed", resultArtifactRef: "stave://workspace/ws-child/task/child-task/turn/t1",
      detail: { code: "child-turn-completed", responseText: "Done." }, now: NOW });
    assert.deepEqual(await runtime.sweepDelegatedChildren(), []);
    assert.deepEqual(await kept(), ["subagentResultPending", "subagentUniqueCommits"]);
    const listedRow = (await runtime.annotateDelegatedChildren((await runtime.list()).rows)).find(row => row.id === "ws-child")!;
    assert.equal(listedRow.subagent?.parentName, "Parent work", "Clean up workspaces names the parent");

    // The parent's next turn carries the answer; the commit is still only the child's.
    const sequence = store.listRunReceipts({ runId: childRun.runId }).find(receipt => receipt.type === "completed")!.sequence;
    store.delegatedAnswers.recordDelivered({ answers: [{ runId: childRun.runId, sequence }], parentTurnId: "parent-turn-2", now: NOW });
    assert.deepEqual(await runtime.sweepDelegatedChildren(), []);
    assert.deepEqual(await kept(), ["subagentUniqueCommits"]);
    assert.equal(existsSync(child), true);

    // An untracked file keeps it too, even once the commit is merged.
    git(parent, "merge", "--ff-only", "subagent-key");
    writeFileSync(join(child, "notes.md"), "draft");
    assert.deepEqual(await runtime.sweepDelegatedChildren(), []);
    assert.deepEqual(await kept(), ["subagentChangedFiles"]);
    rmSync(join(child, "notes.md"));

    // Every rule holds: archived through the ordinary archive, the branch kept.
    const results = await runtime.sweepDelegatedChildren();
    assert.deepEqual(results.map(result => [result.workspaceId, result.action, result.ok, result.reason]), [["ws-child", "archive", true, null]]);
    assert.equal(existsSync(child), false, "The worktree is removed");
    assert.equal(git(repo, "log", "-1", "--format=%s", "subagent-key").trim(), "child result", "The branch and its commit stay");
    assert.ok(store.listArchivedWorkspacesPersistence().some(record => record.workspaceId === "ws-child"), "Restorable from Clean up workspaces");
    assert.ok((await runtime.list()).recent.some(item => item.workspaceId === "ws-child" && item.automatic && item.ok), "Listed under Recent cleanup");
    assert.deepEqual(store.delegatedAnswers.listWorkspaceLinks(), [], "An archived child no longer nests");
    // The released workspace was never a candidate.
    assert.equal(existsSync(released), true);
    assert.deepEqual(calls.flat().filter(arg => arg === "--force" || arg === "-f" || arg === "-D"), []);
    store.close();
  } finally {
    workspaceExecutionGate.setArchiveReader(() => []);
    rmSync(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
