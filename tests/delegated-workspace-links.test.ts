import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import { DelegatedAnswerStore } from "../electron/persistence/delegated-answer-store";
import { WorkspaceArchiveStore } from "../electron/persistence/workspace-archive-store";
import {
  buildDelegatedTaskRunId,
  buildDelegatedTaskStepId,
  DELEGATED_TASK_DETACHED_REASON,
  DELEGATED_TASK_STOPPED_REASON,
} from "../src/lib/runs/delegated-task";
import { createPendingRun, createPendingRunStep, RUN_LEDGER_SCHEMA_VERSION } from "../src/lib/runs/run-domain";

const NOW = "2026-11-25T00:00:00.000Z";

/**
 * The ledger, archive and answer stores on one database, plus the two index
 * tables `SqliteStore` creates (same columns) that the link query reads.
 */
function open() {
  const db = new Database(":memory:");
  const ledger = new RunLedgerStore(db as never);
  const archives = new WorkspaceArchiveStore(db as never);
  const answers = new DelegatedAnswerStore(db, { now: () => "2026-01-01T00:00:00.000Z" });
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_meta (id TEXT PRIMARY KEY, name TEXT NOT NULL, updated_at TEXT NOT NULL, shell_lite_json TEXT, shell_summary_json TEXT);
    CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, title TEXT NOT NULL, provider TEXT NOT NULL, updated_at TEXT NOT NULL, unread INTEGER NOT NULL DEFAULT 0, archived_at TEXT);
  `);
  const workspace = (id: string, ...taskIds: string[]) => {
    db.prepare("INSERT INTO workspace_meta (id, name, updated_at) VALUES (?, ?, ?)").run(id, id, NOW);
    for (const taskId of taskIds) db.prepare("INSERT INTO tasks (id, workspace_id, title, provider, updated_at) VALUES (?, ?, ?, 'codex', ?)").run(`${id}:${taskId}`, id, taskId, NOW);
  };
  /** A delegation of `parentTaskId`, the way the coordinator claims it, into `childWorkspaceId`. */
  const delegate = (parentTaskId: string, key: string, childWorkspaceId: string, childTaskId = `child-${key}`, createdAt = NOW) => {
    const runId = buildDelegatedTaskRunId({ parentTaskId, delegationKey: key });
    const stepId = buildDelegatedTaskStepId(runId);
    ledger.claimStep({
      run: createPendingRun({ id: runId, kind: "delegated-task", origin: { kind: "task", id: parentTaskId },
        ownership: { repositoryPath: "/tmp/project", workspaceId: childWorkspaceId, taskId: childTaskId },
        policy: { maxAttempts: 3, timeoutMs: 86_400_000, maxTurns: 200, maxOutputBytes: 1_048_576, maxEvents: 4_096 },
        provenance: { createdBy: "delegated-task-coordinator", schemaVersion: RUN_LEDGER_SCHEMA_VERSION }, now: createdAt }),
      step: createPendingRunStep({ id: stepId, runId, kind: "delegated-task-turn", target: { taskId: childTaskId, workspaceId: childWorkspaceId, turnId: null, providerId: "codex" },
        dependencyIds: [], inputHash: "a".repeat(64), now: createdAt }),
      executionId: `exec-${key}`, idempotencyKey: key, now: createdAt,
    });
    return { runId, stepId, executionId: `exec-${key}` };
  };
  return { db, ledger, archives, answers, workspace, delegate };
}

describe("delegated workspace links from the run ledger", () => {
  test("a new-worktree child links to the parent task's workspace; a same-workspace child does not", () => {
    const { answers, workspace, delegate } = open();
    workspace("ws-parent", "parent-task");
    workspace("ws-child", "child-writer");
    delegate("parent-task", "writer", "ws-child", "child-writer");
    delegate("parent-task", "review", "ws-parent", "child-review");
    expect(answers.listWorkspaceLinks().map((link) => [link.childWorkspaceId, link.parentWorkspaceId, link.parentTaskId, link.childTaskId, link.phase])).toEqual([
      ["ws-child", "ws-parent", "parent-task", "child-writer", "running"],
    ]);
  });

  test("a grandchild links to its own parent's workspace", () => {
    const { answers, workspace, delegate } = open();
    workspace("ws-parent", "parent-task");
    workspace("ws-child", "child-a");
    workspace("ws-grandchild", "child-b");
    delegate("parent-task", "a", "ws-child", "child-a", "2026-11-25T00:00:01.000Z");
    delegate("child-a", "b", "ws-grandchild", "child-b", "2026-11-25T00:00:02.000Z");
    expect(answers.listWorkspaceLinks().map((link) => [link.childWorkspaceId, link.parentWorkspaceId])).toEqual([
      ["ws-child", "ws-parent"], ["ws-grandchild", "ws-child"],
    ]);
  });

  test("detaching releases the child; a parent's stop keeps it nested with its phase", () => {
    const { ledger, answers, workspace, delegate } = open();
    workspace("ws-parent", "parent-task");
    workspace("ws-detached", "child-detached");
    workspace("ws-stopped", "child-stopped");
    const detached = delegate("parent-task", "detached", "ws-detached", "child-detached");
    const stopped = delegate("parent-task", "stopped", "ws-stopped", "child-stopped");
    ledger.cancelStep({ ...detached, idempotencyKey: "detach:detached", error: DELEGATED_TASK_DETACHED_REASON, now: NOW });
    ledger.cancelStep({ ...stopped, idempotencyKey: "stop:stopped", error: DELEGATED_TASK_STOPPED_REASON, now: NOW });
    expect(answers.listWorkspaceLinks().map((link) => [link.childWorkspaceId, link.phase])).toEqual([["ws-stopped", "cancelled"]]);
  });

  test("an archived or deleted parent, or an archived child, leaves no link", () => {
    const { db, answers, workspace, delegate } = open();
    // The archive marker `WorkspaceArchiveStore.archive` writes; the query reads only its id.
    const archive = (id: string) => db.prepare("INSERT INTO workspace_archives (workspace_id, repository_path, path, branch, name, archived_at) VALUES (?, '/tmp/project', ?, ?, ?, ?)").run(id, `/tmp/project/${id}`, id, id, NOW);
    workspace("ws-parent", "parent-task");
    workspace("ws-child", "child-a");
    workspace("ws-other-parent", "other-task");
    workspace("ws-other-child", "child-b");
    workspace("ws-third-child", "child-c");
    delegate("parent-task", "a", "ws-child", "child-a");
    delegate("other-task", "b", "ws-other-child", "child-b");
    delegate("other-task", "c", "ws-third-child", "child-c");
    expect(answers.listWorkspaceLinks()).toHaveLength(3);
    archive("ws-parent");
    archive("ws-third-child");
    expect(answers.listWorkspaceLinks().map((link) => link.childWorkspaceId)).toEqual(["ws-other-child"]);
    // Cleanup still sees the child of an archived parent; an archived child stays out.
    expect(answers.listWorkspaceLinks({ includeArchivedParents: true }).map((link) => [link.childWorkspaceId, link.parentWorkspaceId])).toEqual([
      ["ws-other-child", "ws-other-parent"], ["ws-child", "ws-parent"],
    ]);
    // A permanently deleted parent task removes its task row.
    db.prepare("DELETE FROM tasks WHERE id = ?").run("ws-other-parent:other-task");
    expect(answers.listWorkspaceLinks()).toEqual([]);
  });

  test("an answer is owed until a parent turn carries it", () => {
    const { ledger, answers, workspace, delegate } = open();
    workspace("ws-parent", "parent-task");
    workspace("ws-child", "child-a");
    const run = delegate("parent-task", "a", "ws-child", "child-a");
    expect(answers.hasOwedAnswer(run.runId)).toBe(false);
    ledger.completeStep({ ...run, idempotencyKey: "child:exec-a:completed", resultArtifactRef: "stave://workspace/ws-child/task/child-a/turn/t1",
      detail: { code: "child-turn-completed", responseText: "done" }, now: NOW });
    expect(answers.hasOwedAnswer(run.runId)).toBe(true);
    const sequence = ledger.listReceipts({ runId: run.runId }).find((receipt) => receipt.type === "completed")!.sequence;
    answers.recordDelivered({ answers: [{ runId: run.runId, sequence }], parentTurnId: "parent-turn-2", now: NOW });
    expect(answers.hasOwedAnswer(run.runId)).toBe(false);
    expect(answers.listWorkspaceLinks()[0]!.phase).toBe("completed");
  });
});
