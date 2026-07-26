import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import {
  createPendingRun,
  createPendingRunStep,
} from "../src/lib/runs/run-domain";

const CREATED_AT = "2026-07-26T03:00:00.000Z";

function createRecords(inputHash = "a".repeat(64)) {
  const run = createPendingRun({
    id: "run-1",
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
    provenance: {
      createdBy: "compare-judge",
      schemaVersion: 1,
      sourceVersion: "1",
    },
    now: CREATED_AT,
  });
  return {
    run,
    step: createPendingRunStep({
      id: "step-1",
      runId: run.id,
      kind: "secondary-provider-turn",
      dependencyIds: [],
      inputHash,
      now: CREATED_AT,
    }),
  };
}

describe("RunLedgerStore", () => {
  let rootDir = "";
  let dbPath = "";

  beforeEach(() => {
    rootDir = path.join(
      tmpdir(),
      `stave-run-ledger-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(rootDir, { recursive: true });
    dbPath = path.join(rootDir, "ledger.sqlite");
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  test("migrates tables and deduplicates an atomic claim", () => {
    const db = new Database(dbPath);
    const store = new RunLedgerStore(db);
    const records = createRecords();
    const first = store.claimStep({
      ...records,
      executionId: "execution-1",
      idempotencyKey: "claim-1",
      now: "2026-07-26T03:01:00.000Z",
    });
    const repeated = store.claimStep({
      ...records,
      executionId: "execution-2",
      idempotencyKey: "claim-1",
      now: "2026-07-26T03:02:00.000Z",
    });

    expect(first).toMatchObject({
      accepted: true,
      started: true,
      step: { attempt: 1, executionId: "execution-1" },
    });
    expect(repeated).toMatchObject({
      accepted: true,
      started: false,
      duplicate: true,
      step: { attempt: 1, executionId: "execution-1" },
    });
    expect(store.listReceipts({ runId: "run-1" })).toEqual([
      expect.objectContaining({ sequence: 1, type: "accepted" }),
      expect.objectContaining({ sequence: 2, type: "started" }),
    ]);

    const tableNames = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'run_%' ORDER BY name",
        )
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
    expect(tableNames).toEqual(["run_receipts", "run_steps", "runs"]);
    db.close();
  });

  test("orders retry receipts and rejects a stale completion", () => {
    const db = new Database(dbPath);
    const store = new RunLedgerStore(db);
    const records = createRecords();
    const first = store.claimStep({
      ...records,
      executionId: "execution-1",
      idempotencyKey: "claim-1",
      now: "2026-07-26T03:01:00.000Z",
    });
    if (!first.accepted) {
      throw new Error("Expected the first claim to be accepted.");
    }
    const failed = store.failStep({
      runId: "run-1",
      stepId: "step-1",
      executionId: "execution-1",
      idempotencyKey: "execution-1:failed",
      error: "Provider failed.",
      now: "2026-07-26T03:02:00.000Z",
    });
    expect(failed.accepted).toBe(true);

    const retried = store.claimStep({
      ...records,
      executionId: "execution-2",
      idempotencyKey: "claim-2",
      now: "2026-07-26T03:03:00.000Z",
    });
    expect(retried).toMatchObject({
      accepted: true,
      step: { attempt: 2, executionId: "execution-2" },
    });

    expect(
      store.completeStep({
        runId: "run-1",
        stepId: "step-1",
        executionId: "execution-1",
        idempotencyKey: "execution-1:late",
        resultArtifactRef: "stale-result",
        now: "2026-07-26T03:04:00.000Z",
      }),
    ).toMatchObject({
      accepted: false,
      reason: "stale-execution",
      step: { executionId: "execution-2", status: "running" },
    });

    expect(
      store.completeStep({
        runId: "run-1",
        stepId: "step-1",
        executionId: "execution-2",
        idempotencyKey: "execution-2:completed",
        resultArtifactRef: "compare-run:compare-1:judgment:2",
        now: "2026-07-26T03:05:00.000Z",
      }),
    ).toMatchObject({
      accepted: true,
      run: { status: "completed" },
      step: {
        status: "completed",
        resultArtifactRef: "compare-run:compare-1:judgment:2",
      },
    });
    expect(
      store
        .listReceipts({ runId: "run-1" })
        .map((receipt) => [receipt.sequence, receipt.type]),
    ).toEqual([
      [1, "accepted"],
      [2, "started"],
      [3, "failed"],
      [4, "accepted"],
      [5, "started"],
      [6, "completed"],
    ]);
    db.close();
  });

  test("reconciles active work as interrupted after restart", () => {
    {
      const db = new Database(dbPath);
      const store = new RunLedgerStore(db);
      const claimed = store.claimStep({
        ...createRecords(),
        executionId: "execution-1",
        idempotencyKey: "claim-1",
        now: "2026-07-26T03:01:00.000Z",
      });
      if (!claimed.accepted) {
        throw new Error("Expected the claim to be accepted.");
      }
      expect(
        store.markStepWaiting({
          runId: "run-1",
          stepId: "step-1",
          executionId: "execution-1",
          idempotencyKey: "execution-1:waiting",
          detail: { code: "awaiting-parser" },
          now: "2026-07-26T03:02:00.000Z",
        }),
      ).toMatchObject({
        accepted: true,
        step: { status: "waiting" },
      });
      db.close();
    }

    const reopenedDb = new Database(dbPath);
    const reopened = new RunLedgerStore(reopenedDb);
    expect(
      reopened.reconcileInterruptedRuns({
        now: "2026-07-26T04:00:00.000Z",
      }),
    ).toBe(1);
    expect(
      reopened.getAggregate({ runId: "run-1", stepId: "step-1" }),
    ).toMatchObject({
      run: { status: "interrupted" },
      step: {
        status: "interrupted",
        executionId: "execution-1",
        attempt: 1,
      },
    });
    expect(reopened.listReceipts({ runId: "run-1" }).at(-1)).toMatchObject({
      sequence: 4,
      type: "interrupted",
      detail: {
        message: "Stave restarted before the secondary provider step finished.",
      },
    });
    expect(
      reopened.reconcileInterruptedRuns({
        now: "2026-07-26T04:01:00.000Z",
      }),
    ).toBe(0);
    reopenedDb.close();
  });

  test("rejects a reused identity with a different bounded input hash", () => {
    const db = new Database(dbPath);
    const store = new RunLedgerStore(db);
    const first = createRecords("a".repeat(64));
    expect(
      store.claimStep({
        ...first,
        executionId: "execution-1",
        idempotencyKey: "claim-1",
        now: "2026-07-26T03:01:00.000Z",
      }).accepted,
    ).toBe(true);

    expect(
      store.claimStep({
        ...createRecords("b".repeat(64)),
        executionId: "execution-2",
        idempotencyKey: "claim-2",
        now: "2026-07-26T03:02:00.000Z",
      }),
    ).toMatchObject({
      accepted: false,
      reason: "input-mismatch",
      step: { inputHash: "a".repeat(64) },
    });
    expect(store.listReceipts({ runId: "run-1" })).toHaveLength(2);
    db.close();
  });
});
