import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import {
  buildDelegatedTaskRunId,
  buildDelegatedTaskStepId,
} from "../src/lib/runs/delegated-task";
import {
  createPendingRun,
  createPendingRunStep,
  RUN_LEDGER_SCHEMA_VERSION,
} from "../src/lib/runs/run-domain";

// Covers the temporary migration "delegated-task-ledger-kinds"; delete this
// file together with it (see config/temporary-migrations.json).

const NOW = "2026-09-20T10:00:00.000Z";

function seedDelegation(database: Database) {
  const store = new RunLedgerStore(database);
  const runId = buildDelegatedTaskRunId({
    parentTaskId: "parent-1",
    delegationKey: "docs-review",
  });
  const stepId = buildDelegatedTaskStepId(runId);
  store.claimStep({
    run: createPendingRun({
      id: runId,
      kind: "delegated-task",
      origin: { kind: "task", id: "parent-1" },
      ownership: { projectPath: "/tmp/stave", workspaceId: "ws-child", taskId: "child-1" },
      policy: {
        maxAttempts: 3,
        timeoutMs: 86_400_000,
        maxTurns: 1,
        maxOutputBytes: 1_048_576,
        maxEvents: 4_096,
      },
      provenance: {
        createdBy: "delegated-task-coordinator",
        schemaVersion: RUN_LEDGER_SCHEMA_VERSION,
      },
      now: NOW,
    }),
    step: createPendingRunStep({
      id: stepId,
      runId,
      kind: "delegated-task-turn",
      target: { taskId: "child-1", workspaceId: "ws-child", turnId: null, providerId: "codex" },
      dependencyIds: [],
      inputHash: "b".repeat(64),
      now: NOW,
    }),
    executionId: "execution-1",
    idempotencyKey: "docs-review",
    now: NOW,
  });
  store.failStep({
    runId,
    stepId,
    executionId: "execution-1",
    idempotencyKey: "docs-review:failed",
    error: "The delegated task failed.",
    detail: { code: "delegated-task-failure" },
    now: NOW,
  });
  // Rewind the rows to exactly what a pre-rename build wrote.
  database.exec(`
    UPDATE runs SET kind = 'child-task',
      provenance_json = REPLACE(provenance_json, 'delegated-task-coordinator', 'child-task-coordinator');
    UPDATE run_steps SET kind = 'child-task-turn';
    UPDATE run_receipts SET detail_json = REPLACE(detail_json, 'delegated-task-failure', 'child-task-failure');
  `);
  return { runId, stepId };
}

function column(database: Database, sql: string) {
  return (database.prepare(sql).all() as Array<Record<string, string>>).map(
    (row) => Object.values(row)[0],
  );
}

describe("delegated task ledger migration", () => {
  test("rewrites legacy kinds and bookkeeping strings, keeping the run id", () => {
    const database = new Database(":memory:");
    const { runId, stepId } = seedDelegation(database);
    expect(column(database, "SELECT kind FROM runs")).toEqual(["child-task"]);

    const store = new RunLedgerStore(database);

    expect(column(database, "SELECT kind FROM runs")).toEqual(["delegated-task"]);
    expect(column(database, "SELECT kind FROM run_steps")).toEqual(["delegated-task-turn"]);
    expect(column(database, "SELECT id FROM runs")).toEqual([runId]);
    expect(runId.startsWith("child-task:parent-1:")).toBe(true);
    const aggregate = store.getAggregate({ runId, stepId });
    expect(aggregate?.run.kind).toBe("delegated-task");
    expect(aggregate?.run.provenance.createdBy).toBe("delegated-task-coordinator");
    expect(
      column(database, "SELECT detail_json FROM run_receipts").some((detail) =>
        detail?.includes('"delegated-task-failure"'),
      ),
    ).toBe(true);
    expect(
      column(database, "SELECT detail_json FROM run_receipts").some((detail) =>
        detail?.includes("child-task-failure"),
      ),
    ).toBe(false);
  });

  test("is idempotent on already migrated rows", () => {
    const database = new Database(":memory:");
    seedDelegation(database);
    new RunLedgerStore(database);
    const before = column(database, "SELECT provenance_json FROM runs");
    new RunLedgerStore(database);
    expect(column(database, "SELECT provenance_json FROM runs")).toEqual(before);
    expect(column(database, "SELECT kind FROM runs")).toEqual(["delegated-task"]);
  });
});
