import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import { createSecondaryRunCoordinator } from "../electron/main/runs/secondary-run-coordinator";
import type {
  SecondaryProviderExecutionRequest,
  SecondaryProviderExecutionResult,
  SecondaryRunClaimArgs,
  SecondaryRunExecuteArgs,
} from "../src/lib/runs/secondary-run";

const NOW = "2026-07-26T03:00:00.000Z";

function createClaimArgs(): SecondaryRunClaimArgs {
  return {
    run: {
      id: "compare:run-1:judge",
      kind: "secondary-provider",
      origin: {
        kind: "compare-run",
        id: "run-1",
      },
      ownership: {
        projectPath: "/tmp/project",
        workspaceId: "workspace-1",
        taskId: "task-1",
      },
      policy: {
        maxAttempts: 2,
        timeoutMs: 60_000,
        maxTurns: 4,
        maxOutputBytes: 64 * 1024,
        maxEvents: 128,
      },
      provenance: {
        createdBy: "compare-judge",
        schemaVersion: 1,
        sourceVersion: "compare-run-v1",
      },
    },
    step: {
      id: "compare:run-1:judge:step",
      kind: "secondary-provider-turn",
      dependencyIds: [],
      idempotencyKey: "compare:run-1:judge:attempt:1",
    },
    input: {
      providerId: "codex",
      model: "gpt-test",
      prompt: "Return one structured verdict.",
      cwd: "/tmp/project/worktree",
      runtimeHints: {},
    },
  };
}

function completedExecution(
  request: SecondaryProviderExecutionRequest,
): SecondaryProviderExecutionResult {
  return {
    executionId: request.executionId,
    providerId: request.input.providerId,
    model: request.input.model,
    status: "completed",
    text: '{"winner":"candidate-a"}',
    eventCount: 2,
    collectedEventCount: 2,
    outputBytes: 24,
    truncated: false,
    stopReason: null,
    error: null,
  };
}

function createLedgerPort() {
  const database = new Database(":memory:");
  const ledger = new RunLedgerStore(database);
  return {
    database,
    port: {
      getRunAggregate: ledger.getAggregate.bind(ledger),
      claimRunStep: ledger.claimStep.bind(ledger),
      markRunStepWaiting: ledger.markStepWaiting.bind(ledger),
      completeRunStep: ledger.completeStep.bind(ledger),
      failRunStep: ledger.failStep.bind(ledger),
      cancelRunStep: ledger.cancelStep.bind(ledger),
      listRunReceipts: ledger.listReceipts.bind(ledger),
    },
  };
}

function toExecuteArgs(
  claim: SecondaryRunClaimArgs,
  executionId: string,
): SecondaryRunExecuteArgs {
  return {
    runId: claim.run.id,
    stepId: claim.step.id,
    executionId,
    input: claim.input,
  };
}

describe("secondary run main coordinator", () => {
  test("claims once, deduplicates provider dispatch, waits for parsing, and completes durably", async () => {
    const { database, port } = createLedgerPort();
    let executeCalls = 0;
    const coordinator = createSecondaryRunCoordinator({
      getLedger: () => port,
      now: () => NOW,
      createExecutionId: () => "execution-1",
      executeHost: async (request) => {
        executeCalls += 1;
        await Promise.resolve();
        return completedExecution(request);
      },
      cancelHost: async () => ({
        ok: true,
        message: "cancelled",
      }),
    });
    const claimArgs = createClaimArgs();

    const claim = await coordinator.claim(claimArgs);
    const duplicate = await coordinator.claim(claimArgs);
    expect(claim).toMatchObject({
      accepted: true,
      started: true,
      duplicate: false,
    });
    expect(duplicate).toMatchObject({
      accepted: true,
      started: false,
      duplicate: true,
    });
    expect(duplicate.aggregate?.step.executionId).toBe("execution-1");

    const executeArgs = toExecuteArgs(claimArgs, "execution-1");
    const [firstExecution, duplicateExecution] = await Promise.all([
      coordinator.execute(executeArgs),
      coordinator.execute(executeArgs),
    ]);
    expect(executeCalls).toBe(1);
    expect(firstExecution).toEqual(duplicateExecution);
    expect(firstExecution).toMatchObject({
      accepted: true,
      execution: {
        status: "completed",
        text: '{"winner":"candidate-a"}',
      },
      aggregate: {
        step: {
          status: "waiting",
        },
      },
    });

    const completion = await coordinator.complete({
      runId: claimArgs.run.id,
      stepId: claimArgs.step.id,
      executionId: "execution-1",
      idempotencyKey: "compare:run-1:judge:complete:1",
      resultArtifactRef: "compare-run:run-1:judge-result",
    });
    expect(completion).toMatchObject({
      accepted: true,
      aggregate: {
        run: { status: "completed" },
        step: {
          status: "completed",
          resultArtifactRef: "compare-run:run-1:judge-result",
        },
      },
    });
    expect(
      (await coordinator.listReceipts({ runId: claimArgs.run.id })).map(
        (receipt) => receipt.type,
      ),
    ).toEqual(["accepted", "started", "waiting", "completed"]);
    database.close();
  });

  test("persists cancellation before abort and rejects the late provider completion", async () => {
    const { database, port } = createLedgerPort();
    let resolveExecution:
      | ((result: SecondaryProviderExecutionResult) => void)
      | undefined;
    let hostRequest: SecondaryProviderExecutionRequest | undefined;
    const cancelledExecutionIds: string[] = [];
    const coordinator = createSecondaryRunCoordinator({
      getLedger: () => port,
      now: () => NOW,
      createExecutionId: () => "execution-race",
      executeHost: async (request) => {
        hostRequest = request;
        return new Promise<SecondaryProviderExecutionResult>((resolve) => {
          resolveExecution = resolve;
        });
      },
      cancelHost: async ({ executionId }) => {
        cancelledExecutionIds.push(executionId);
        return { ok: true, message: "cancelled" };
      },
    });
    const claimArgs = createClaimArgs();
    await coordinator.claim(claimArgs);

    const executionPromise = coordinator.execute(
      toExecuteArgs(claimArgs, "execution-race"),
    );
    while (!hostRequest) {
      await Promise.resolve();
    }
    const cancellation = await coordinator.cancel({
      runId: claimArgs.run.id,
      stepId: claimArgs.step.id,
      expectedExecutionId: "execution-race",
      idempotencyKey: "compare:run-1:judge:cancel:1",
    });
    expect(cancellation).toMatchObject({
      accepted: true,
      aggregate: {
        step: { status: "cancelled" },
      },
    });
    expect(cancelledExecutionIds).toEqual(["execution-race"]);
    expect(
      await coordinator.cancel({
        runId: claimArgs.run.id,
        stepId: claimArgs.step.id,
        expectedExecutionId: "execution-race",
        idempotencyKey: "compare:run-1:judge:cancel:1",
      }),
    ).toMatchObject({
      accepted: true,
      duplicate: true,
    });
    expect(cancelledExecutionIds).toEqual(["execution-race"]);

    resolveExecution?.(completedExecution(hostRequest));
    const lateCompletion = await executionPromise;
    expect(lateCompletion).toMatchObject({
      accepted: false,
      aggregate: {
        step: { status: "cancelled" },
      },
    });
    expect(
      (await coordinator.listReceipts({ runId: claimArgs.run.id })).map(
        (receipt) => receipt.type,
      ),
    ).toEqual(["accepted", "started", "cancelled"]);
    database.close();
  });

  test("rejects an input change and a cwd outside the owning project", async () => {
    const { database, port } = createLedgerPort();
    const coordinator = createSecondaryRunCoordinator({
      getLedger: () => port,
      now: () => NOW,
      createExecutionId: () => "execution-input",
      executeHost: async (request) => completedExecution(request),
      cancelHost: async () => ({ ok: true, message: "cancelled" }),
    });
    const invalidClaim = createClaimArgs();
    invalidClaim.input.cwd = "/tmp/other-project";
    expect(await coordinator.claim(invalidClaim)).toMatchObject({
      accepted: false,
      reason: "invalid-ownership",
    });

    const claimArgs = createClaimArgs();
    await coordinator.claim(claimArgs);
    const changedInput = structuredClone(claimArgs.input);
    changedInput.prompt = "A different request";
    expect(
      await coordinator.execute({
        ...toExecuteArgs(claimArgs, "execution-input"),
        input: changedInput,
      }),
    ).toMatchObject({
      accepted: false,
      reason: "input-mismatch",
    });
    database.close();
  });
});
