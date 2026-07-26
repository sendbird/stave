import { describe, expect, test } from "bun:test";
import {
  cancelRunStep,
  claimRunStep,
  completeRunStep,
  createPendingRun,
  createPendingRunStep,
  failRunStep,
  markRunStepWaiting,
  sanitizeRunReceiptDetail,
} from "../src/lib/runs/run-domain";

const NOW = "2026-07-26T02:00:00.000Z";

function createAggregate(maxAttempts = 3) {
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
      maxAttempts,
      timeoutMs: 120_000,
      maxTurns: 16,
      maxOutputBytes: 64_000,
      maxEvents: 256,
    },
    provenance: {
      createdBy: "compare-judge",
      schemaVersion: 1,
    },
    now: NOW,
  });
  const step = createPendingRunStep({
    id: "step-1",
    runId: run.id,
    kind: "secondary-provider-turn",
    dependencyIds: [],
    inputHash: "a".repeat(64),
    now: NOW,
  });
  return { run, step };
}

describe("run domain", () => {
  test("claims and completes one secondary-provider step", () => {
    const pending = createAggregate();
    const claimed = claimRunStep({
      ...pending,
      executionId: "execution-1",
      idempotencyKey: "claim-1",
      now: "2026-07-26T02:01:00.000Z",
    });

    expect(claimed).toMatchObject({
      accepted: true,
      started: true,
      duplicate: false,
      run: { status: "running" },
      step: {
        status: "running",
        attempt: 1,
        executionId: "execution-1",
        claimIdempotencyKey: "claim-1",
      },
    });
    expect(claimed.receipts.map((receipt) => receipt.type)).toEqual([
      "accepted",
      "started",
    ]);

    if (!claimed.accepted) {
      throw new Error("Expected the step claim to be accepted.");
    }
    const waiting = markRunStepWaiting({
      run: claimed.run,
      step: claimed.step,
      executionId: "execution-1",
      idempotencyKey: "execution-1:waiting",
      detail: { code: "awaiting-parser", providerId: "codex" },
      now: "2026-07-26T02:02:00.000Z",
    });
    expect(waiting).toMatchObject({
      accepted: true,
      run: { status: "waiting" },
      step: { status: "waiting" },
    });

    if (!waiting.accepted) {
      throw new Error("Expected the waiting transition to be accepted.");
    }
    const completed = completeRunStep({
      run: waiting.run,
      step: waiting.step,
      executionId: "execution-1",
      idempotencyKey: "execution-1:completed",
      resultArtifactRef: "compare-run:compare-1:judgment:1",
      now: "2026-07-26T02:03:00.000Z",
    });

    expect(completed).toMatchObject({
      accepted: true,
      duplicate: false,
      run: { status: "completed" },
      step: {
        status: "completed",
        executionId: "execution-1",
        resultArtifactRef: "compare-run:compare-1:judgment:1",
      },
    });
    expect(completed.receipts.map((receipt) => receipt.type)).toEqual([
      "completed",
    ]);
  });

  test("rejects an older execution after a deterministic retry", () => {
    const pending = createAggregate();
    const first = claimRunStep({
      ...pending,
      executionId: "execution-1",
      idempotencyKey: "claim-1",
      now: "2026-07-26T02:01:00.000Z",
    });
    if (!first.accepted) {
      throw new Error("Expected the first claim to be accepted.");
    }
    const failed = failRunStep({
      run: first.run,
      step: first.step,
      executionId: "execution-1",
      idempotencyKey: "execution-1:failed",
      error: "The provider process exited.",
      now: "2026-07-26T02:02:00.000Z",
    });
    if (!failed.accepted) {
      throw new Error("Expected the failure to be accepted.");
    }
    const retried = claimRunStep({
      run: failed.run,
      step: failed.step,
      executionId: "execution-2",
      idempotencyKey: "claim-2",
      now: "2026-07-26T02:03:00.000Z",
    });

    expect(retried).toMatchObject({
      accepted: true,
      started: true,
      step: {
        status: "running",
        attempt: 2,
        executionId: "execution-2",
      },
    });

    if (!retried.accepted) {
      throw new Error("Expected the retry to be accepted.");
    }
    const stale = completeRunStep({
      run: retried.run,
      step: retried.step,
      executionId: "execution-1",
      idempotencyKey: "execution-1:late-completion",
      resultArtifactRef: "stale-result",
      now: "2026-07-26T02:04:00.000Z",
    });

    expect(stale).toMatchObject({
      accepted: false,
      reason: "stale-execution",
      run: { status: "running" },
      step: {
        status: "running",
        attempt: 2,
        executionId: "execution-2",
      },
    });
  });

  test("deduplicates a repeated claim without starting another attempt", () => {
    const pending = createAggregate();
    const first = claimRunStep({
      ...pending,
      executionId: "execution-1",
      idempotencyKey: "claim-1",
      now: "2026-07-26T02:01:00.000Z",
    });
    if (!first.accepted) {
      throw new Error("Expected the first claim to be accepted.");
    }

    const repeated = claimRunStep({
      run: first.run,
      step: first.step,
      executionId: "execution-2",
      idempotencyKey: "claim-1",
      now: "2026-07-26T02:02:00.000Z",
    });

    expect(repeated).toMatchObject({
      accepted: true,
      started: false,
      duplicate: true,
      step: {
        attempt: 1,
        executionId: "execution-1",
      },
      receipts: [],
    });
  });

  test("enforces retry and cancellation terminal rules", () => {
    const pending = createAggregate(1);
    const first = claimRunStep({
      ...pending,
      executionId: "execution-1",
      idempotencyKey: "claim-1",
      now: "2026-07-26T02:01:00.000Z",
    });
    if (!first.accepted) {
      throw new Error("Expected the first claim to be accepted.");
    }
    const failed = failRunStep({
      run: first.run,
      step: first.step,
      executionId: "execution-1",
      idempotencyKey: "execution-1:failed",
      error: "Invalid structured response.",
      now: "2026-07-26T02:02:00.000Z",
    });
    if (!failed.accepted) {
      throw new Error("Expected the failure to be accepted.");
    }

    expect(
      claimRunStep({
        run: failed.run,
        step: failed.step,
        executionId: "execution-2",
        idempotencyKey: "claim-2",
        now: "2026-07-26T02:03:00.000Z",
      }),
    ).toMatchObject({
      accepted: false,
      reason: "attempt-limit-reached",
    });

    const cancellable = createAggregate();
    const cancelled = cancelRunStep({
      ...cancellable,
      idempotencyKey: "cancel-1",
      now: "2026-07-26T02:01:00.000Z",
    });
    expect(cancelled).toMatchObject({
      accepted: true,
      run: { status: "cancelled" },
      step: { status: "cancelled" },
    });
    if (!cancelled.accepted) {
      throw new Error("Expected cancellation to be accepted.");
    }
    expect(
      claimRunStep({
        run: cancelled.run,
        step: cancelled.step,
        executionId: "execution-2",
        idempotencyKey: "claim-2",
        now: "2026-07-26T02:02:00.000Z",
      }),
    ).toMatchObject({
      accepted: false,
      reason: "cancelled",
    });
  });

  test("bounds sanitized receipt diagnostics", () => {
    const detail = sanitizeRunReceiptDetail({
      code: ` ${"c".repeat(200)} `,
      message: ` password=sample-value ${"m".repeat(2_000)} `,
      providerId: "codex",
      model: ` ${"x".repeat(400)} `,
      attempt: 2,
      ignored: "must not persist",
    });

    expect(detail).toEqual({
      code: "c".repeat(120),
      message: `password=[redacted] ${"m".repeat(980)}`,
      providerId: "codex",
      model: "x".repeat(200),
      attempt: 2,
    });
  });
});
