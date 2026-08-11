import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import {
  buildChildTaskRunId,
  buildChildTaskStepId,
  extractChildTaskDelegationKey,
  toChildTaskSummary,
} from "../src/lib/runs/child-task";
import {
  createPendingRun,
  createPendingRunStep,
  RUN_LEDGER_SCHEMA_VERSION,
  type RunRecord,
  type RunStepRecord,
} from "../src/lib/runs/run-domain";

const NOW = "2026-08-10T03:00:00.000Z";
const PARENT_TASK_ID = "parent-task-1";

function createChildRecords(
  overrides: { delegationKey?: string; maxTurns?: number } = {},
) {
  const delegationKey = overrides.delegationKey ?? "review-docs";
  const runId = buildChildTaskRunId({
    parentTaskId: PARENT_TASK_ID,
    delegationKey,
  });
  const run = createPendingRun({
    id: runId,
    kind: "child-task",
    origin: { kind: "task", id: PARENT_TASK_ID },
    ownership: {
      projectPath: "/tmp/stave",
      workspaceId: "workspace-child",
      taskId: "child-task-1",
    },
    policy: {
      maxAttempts: 3,
      timeoutMs: 86_400_000,
      maxTurns: overrides.maxTurns ?? 1,
      maxOutputBytes: 1_048_576,
      maxEvents: 4_096,
    },
    provenance: {
      createdBy: "child-task-coordinator",
      schemaVersion: RUN_LEDGER_SCHEMA_VERSION,
    },
    now: NOW,
  });
  const step = createPendingRunStep({
    id: buildChildTaskStepId(runId),
    runId,
    kind: "child-task-turn",
    target: {
      taskId: "child-task-1",
      workspaceId: "workspace-child",
      turnId: null,
      providerId: "codex",
    },
    dependencyIds: [],
    inputHash: "b".repeat(64),
    now: NOW,
  });
  return { run, step, runId, delegationKey };
}

function createSecondaryRecords(): { run: RunRecord; step: RunStepRecord } {
  const run = createPendingRun({
    id: "run-secondary",
    kind: "secondary-provider",
    origin: { kind: "compare-run", id: "compare-1" },
    ownership: {
      projectPath: "/tmp/stave",
      workspaceId: "workspace-1",
      taskId: "task-1",
    },
    policy: {
      maxAttempts: 3,
      timeoutMs: 120_000,
      maxTurns: 16,
      maxOutputBytes: 64_000,
      maxEvents: 256,
    },
    provenance: { createdBy: "compare-judge", schemaVersion: 1 },
    now: NOW,
  });
  return {
    run,
    step: createPendingRunStep({
      id: "step-secondary",
      runId: run.id,
      kind: "secondary-provider-turn",
      dependencyIds: [],
      inputHash: "a".repeat(64),
      now: NOW,
    }),
  };
}

describe("run ledger widening for child tasks", () => {
  test("persists and reads back a child step's delegation target", () => {
    const store = new RunLedgerStore(new Database(":memory:"));
    const records = createChildRecords();

    const claim = store.claimStep({
      run: records.run,
      step: records.step,
      executionId: "execution-1",
      idempotencyKey: records.delegationKey,
      now: NOW,
    });

    expect(claim.accepted).toBe(true);
    const aggregate = store.getAggregate({
      runId: records.run.id,
      stepId: records.step.id,
    });
    expect(aggregate?.step.target).toEqual({
      taskId: "child-task-1",
      workspaceId: "workspace-child",
      turnId: null,
      providerId: "codex",
    });
    expect(aggregate?.run.kind).toBe("child-task");
    expect(aggregate?.run.origin).toEqual({
      kind: "task",
      id: PARENT_TASK_ID,
    });
  });

  test("a retry attempt may carry revised inputs; a duplicate initial claim may not", () => {
    const store = new RunLedgerStore(new Database(":memory:"));
    const records = createChildRecords();

    const claim = store.claimStep({
      run: records.run,
      step: records.step,
      executionId: "execution-1",
      idempotencyKey: records.delegationKey,
      detail: {
        providerId: "codex",
        model: "gpt-5.3-codex",
        permissionProfile: "auto",
        workspaceMode: "new-worktree",
      },
      now: NOW,
    });
    expect(claim.accepted).toBe(true);
    // The claim receipt records the delegation's original inputs so a retry
    // can read them back — the step row only keeps a hash.
    const acceptedReceipt = store
      .listReceipts({ runId: records.run.id })
      .find((receipt) => receipt.type === "accepted");
    expect(acceptedReceipt?.detail).toMatchObject({
      model: "gpt-5.3-codex",
      permissionProfile: "auto",
      workspaceMode: "new-worktree",
    });

    const failed = store.failStep({
      runId: records.run.id,
      stepId: records.step.id,
      executionId: "execution-1",
      idempotencyKey: "child:execution-1:failed",
      error: "Provider exploded",
      now: NOW,
    });
    expect(failed.accepted).toBe(true);

    const revisedStep = { ...records.step, inputHash: "c".repeat(64) };

    // Re-sending the *initial* claim with different inputs is a different
    // delegation wearing the same key: still refused.
    const duplicateInitial = store.claimStep({
      run: records.run,
      step: revisedStep,
      executionId: "execution-2",
      idempotencyKey: records.delegationKey,
      now: NOW,
    });
    expect(duplicateInitial).toMatchObject({
      accepted: false,
      reason: "input-mismatch",
    });

    // A fresh attempt (a new idempotency key) on the failed step may revise
    // its inputs — a retry's prompt is expected to change — and the stored
    // hash moves with it.
    const retry = store.claimStep({
      run: records.run,
      step: revisedStep,
      executionId: "execution-3",
      idempotencyKey: `${records.delegationKey}:attempt-2`,
      now: NOW,
    });
    expect(retry.accepted).toBe(true);
    const aggregate = store.getAggregate({
      runId: records.run.id,
      stepId: records.step.id,
    });
    expect(aggregate?.step.attempt).toBe(2);
    expect(aggregate?.step.inputHash).toBe("c".repeat(64));
  });

  test("a v1 database gains the target column without rewriting its rows", () => {
    const db = new Database(":memory:");
    // The exact schema version 1 shape: no `target_json`.
    db.exec(`
      CREATE TABLE run_steps (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        dependency_ids_json TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 0,
        execution_id TEXT,
        claim_idempotency_key TEXT,
        input_hash TEXT NOT NULL,
        result_artifact_ref TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        error TEXT
      );
    `);
    const legacy = createSecondaryRecords();
    db.prepare(
      `INSERT INTO run_steps (
        id, run_id, kind, dependency_ids_json, status, attempt, execution_id,
        claim_idempotency_key, input_hash, result_artifact_ref, created_at,
        updated_at, started_at, completed_at, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      legacy.step.id,
      legacy.step.runId,
      legacy.step.kind,
      JSON.stringify(legacy.step.dependencyIds),
      "completed",
      1,
      "execution-legacy",
      "claim-legacy",
      legacy.step.inputHash,
      "artifact://legacy",
      NOW,
      NOW,
      NOW,
      NOW,
      null,
    );

    const store = new RunLedgerStore(db);
    store.claimStep({
      run: legacy.run,
      step: legacy.step,
      executionId: "execution-legacy",
      idempotencyKey: "claim-legacy",
      now: NOW,
    });

    const aggregate = store.getAggregate({
      runId: legacy.run.id,
      stepId: legacy.step.id,
    });
    expect(aggregate?.step.target).toBeNull();
    expect(aggregate?.step.resultArtifactRef).toBe("artifact://legacy");
    expect(aggregate?.step.status).toBe("completed");
    // The Compare Judge row keeps the version it was written with.
    expect(aggregate?.run.provenance.schemaVersion).toBe(1);
  });

  test("restart reconciliation interrupts secondary steps and leaves child steps to the coordinator", () => {
    const store = new RunLedgerStore(new Database(":memory:"));
    const child = createChildRecords();
    const secondary = createSecondaryRecords();
    store.claimStep({
      run: child.run,
      step: child.step,
      executionId: "execution-child",
      idempotencyKey: child.delegationKey,
      now: NOW,
    });
    store.claimStep({
      run: secondary.run,
      step: secondary.step,
      executionId: "execution-secondary",
      idempotencyKey: "claim-secondary",
      now: NOW,
    });

    const reconciled = store.reconcileInterruptedRuns({
      now: "2026-08-10T04:00:00.000Z",
    });

    expect(reconciled).toBe(1);
    expect(
      store.getAggregate({
        runId: secondary.run.id,
        stepId: secondary.step.id,
      })?.step.status,
    ).toBe("interrupted");
    expect(
      store.getAggregate({ runId: child.run.id, stepId: child.step.id })?.step
        .status,
    ).toBe("running");
  });

  test("a step's target may be elaborated but never repointed at another task", () => {
    const store = new RunLedgerStore(new Database(":memory:"));
    const records = createChildRecords();
    store.claimStep({
      run: records.run,
      step: records.step,
      executionId: "execution-1",
      idempotencyKey: records.delegationKey,
      now: NOW,
    });

    const elaborated = store.setStepTarget({
      runId: records.run.id,
      stepId: records.step.id,
      target: {
        taskId: "child-task-1",
        workspaceId: "workspace-child",
        turnId: "turn-9",
        providerId: "codex",
      },
    });
    const repointed = store.setStepTarget({
      runId: records.run.id,
      stepId: records.step.id,
      target: {
        taskId: "some-other-task",
        workspaceId: "workspace-child",
        turnId: "turn-10",
        providerId: "codex",
      },
    });

    expect(elaborated).toBe(true);
    expect(repointed).toBe(false);
    expect(
      store.getAggregate({ runId: records.run.id, stepId: records.step.id })
        ?.step.target,
    ).toEqual({
      taskId: "child-task-1",
      workspaceId: "workspace-child",
      turnId: "turn-9",
      providerId: "codex",
    });
  });

  test("listing by origin returns the parent's delegations only", () => {
    const store = new RunLedgerStore(new Database(":memory:"));
    const first = createChildRecords({ delegationKey: "one" });
    const second = createChildRecords({ delegationKey: "two" });
    const secondary = createSecondaryRecords();
    for (const records of [first, second]) {
      store.claimStep({
        run: records.run,
        step: records.step,
        executionId: `execution-${records.delegationKey}`,
        idempotencyKey: records.delegationKey,
        now: NOW,
      });
    }
    store.claimStep({
      run: secondary.run,
      step: secondary.step,
      executionId: "execution-secondary",
      idempotencyKey: "claim-secondary",
      now: NOW,
    });

    const aggregates = store.listAggregatesByOrigin({
      originKind: "task",
      originId: PARENT_TASK_ID,
      limit: 50,
    });
    const keys = aggregates
      .flatMap((aggregate) => {
        const summary = toChildTaskSummary(aggregate);
        return summary ? [summary.delegationKey] : [];
      })
      .sort();

    expect(keys).toEqual(["one", "two"]);
  });

  test("a Compare Judge row is never projected as a child task", () => {
    const secondary = createSecondaryRecords();
    expect(toChildTaskSummary(secondary)).toBeNull();
  });

  test("a delegation key round-trips through the run id", () => {
    const runId = buildChildTaskRunId({
      parentTaskId: PARENT_TASK_ID,
      delegationKey: "docs.review-2",
    });
    expect(
      extractChildTaskDelegationKey({ runId, parentTaskId: PARENT_TASK_ID }),
    ).toBe("docs.review-2");
    expect(
      extractChildTaskDelegationKey({ runId, parentTaskId: "other-parent" }),
    ).toBeNull();
  });
});
