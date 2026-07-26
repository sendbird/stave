import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import {
  createPendingRun,
  createPendingRunStep,
  type RunReceiptRecord,
  type RunRecord,
  type RunStepRecord,
} from "../../../src/lib/runs/run-domain";
import {
  SecondaryProviderExecutionResultSchema,
  SecondaryRunAggregateSchema,
  SecondaryRunCancelArgsSchema,
  SecondaryRunClaimArgsSchema,
  SecondaryRunCompleteArgsSchema,
  SecondaryRunExecuteArgsSchema,
  SecondaryRunExecuteResponseSchema,
  SecondaryRunFailArgsSchema,
  SecondaryRunLookupArgsSchema,
  SecondaryRunReceiptListArgsSchema,
  SecondaryRunReceiptListSchema,
  SecondaryRunTransitionResponseSchema,
  serializeSecondaryRunInput,
  type SecondaryProviderCancelRequest,
  type SecondaryProviderExecutionRequest,
  type SecondaryProviderExecutionResult,
  type SecondaryRunAggregate,
  type SecondaryRunExecuteResponse,
  type SecondaryRunRejectionReason,
  type SecondaryRunTransitionResponse,
} from "../../../src/lib/runs/secondary-run";
import type { RunLedgerTransitionResult } from "../../persistence/run-ledger-store";

export interface SecondaryRunLedgerPort {
  getRunAggregate(args: {
    runId: string;
    stepId: string;
  }): SecondaryRunAggregate | null;
  claimRunStep(args: {
    run: RunRecord;
    step: RunStepRecord;
    executionId: string;
    idempotencyKey: string;
    now: string;
  }): RunLedgerTransitionResult;
  markRunStepWaiting(args: {
    runId: string;
    stepId: string;
    executionId: string;
    idempotencyKey: string;
    detail?: unknown;
    now: string;
  }): RunLedgerTransitionResult;
  completeRunStep(args: {
    runId: string;
    stepId: string;
    executionId: string;
    idempotencyKey: string;
    resultArtifactRef: string;
    now: string;
  }): RunLedgerTransitionResult;
  failRunStep(args: {
    runId: string;
    stepId: string;
    executionId: string;
    idempotencyKey: string;
    error: string;
    detail?: unknown;
    now: string;
  }): RunLedgerTransitionResult;
  cancelRunStep(args: {
    runId: string;
    stepId: string;
    idempotencyKey: string;
    expectedExecutionId?: string;
    detail?: unknown;
    now: string;
  }): RunLedgerTransitionResult;
  listRunReceipts(args: { runId: string }): RunReceiptRecord[];
}

interface SecondaryRunCoordinatorDependencies {
  getLedger:
    | (() => SecondaryRunLedgerPort)
    | (() => Promise<SecondaryRunLedgerPort>);
  executeHost: (
    request: SecondaryProviderExecutionRequest,
  ) => Promise<SecondaryProviderExecutionResult>;
  cancelHost: (
    request: SecondaryProviderCancelRequest,
  ) => Promise<{ ok: boolean; message?: string }>;
  now?: () => string;
  createExecutionId?: () => string;
}

function hashSecondaryInput(input: SecondaryProviderExecutionRequest["input"]) {
  return createHash("sha256")
    .update(serializeSecondaryRunInput(input))
    .digest("hex");
}

function isPathOwnedByProject(args: { projectPath: string; cwd: string }) {
  if (!path.isAbsolute(args.projectPath) || !path.isAbsolute(args.cwd)) {
    return false;
  }
  const projectPath = path.resolve(args.projectPath);
  const cwd = path.resolve(args.cwd);
  if (projectPath === path.parse(projectPath).root) {
    return false;
  }
  const relative = path.relative(projectPath, cwd);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function toAggregate(
  transition: RunLedgerTransitionResult,
): SecondaryRunAggregate | null {
  const parsed = SecondaryRunAggregateSchema.safeParse({
    run: transition.run,
    step: transition.step,
  });
  return parsed.success ? parsed.data : null;
}

function toTransitionResponse(
  transition: RunLedgerTransitionResult,
): SecondaryRunTransitionResponse {
  return SecondaryRunTransitionResponseSchema.parse({
    accepted: transition.accepted,
    started: transition.accepted ? transition.started : false,
    duplicate: transition.accepted ? transition.duplicate : false,
    reason: transition.accepted ? null : transition.reason,
    aggregate: toAggregate(transition),
  });
}

function rejectedTransition(
  reason: SecondaryRunRejectionReason,
  aggregate: SecondaryRunAggregate | null = null,
): SecondaryRunTransitionResponse {
  return SecondaryRunTransitionResponseSchema.parse({
    accepted: false,
    started: false,
    duplicate: false,
    reason,
    aggregate,
  });
}

function rejectedExecution(
  reason: SecondaryRunRejectionReason,
  aggregate: SecondaryRunAggregate | null = null,
): SecondaryRunExecuteResponse {
  return SecondaryRunExecuteResponseSchema.parse({
    accepted: false,
    reason,
    execution: null,
    aggregate,
  });
}

function acceptedExecution(args: {
  execution: SecondaryProviderExecutionResult;
  transition: RunLedgerTransitionResult;
}): SecondaryRunExecuteResponse {
  if (!args.transition.accepted) {
    return rejectedExecution(
      args.transition.reason,
      toAggregate(args.transition),
    );
  }
  return SecondaryRunExecuteResponseSchema.parse({
    accepted: true,
    reason: null,
    execution: args.execution,
    aggregate: toAggregate(args.transition),
  });
}

function sanitizeHostError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message.trim()
      : typeof error === "string"
        ? error.trim()
        : "";
  return (message || "The secondary provider failed unexpectedly.").slice(
    0,
    1_000,
  );
}

function createFailedExecution(args: {
  request: SecondaryProviderExecutionRequest;
  error: string;
}): SecondaryProviderExecutionResult {
  return SecondaryProviderExecutionResultSchema.parse({
    executionId: args.request.executionId,
    providerId: args.request.input.providerId,
    model: args.request.input.model,
    status: "failed",
    text: "",
    eventCount: 0,
    collectedEventCount: 0,
    outputBytes: 0,
    truncated: false,
    stopReason: "runtime_failure",
    error: args.error,
  });
}

export function createSecondaryRunCoordinator(
  dependencies: SecondaryRunCoordinatorDependencies,
) {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const createExecutionId = dependencies.createExecutionId ?? randomUUID;
  const activeExecutions = new Map<
    string,
    Promise<SecondaryRunExecuteResponse>
  >();

  const getLedger = async () => dependencies.getLedger();

  const dispatchExecution = async (
    request: SecondaryProviderExecutionRequest,
    ledger: SecondaryRunLedgerPort,
  ): Promise<SecondaryRunExecuteResponse> => {
    let execution: SecondaryProviderExecutionResult;
    try {
      execution = SecondaryProviderExecutionResultSchema.parse(
        await dependencies.executeHost(request),
      );
      if (execution.executionId !== request.executionId) {
        throw new Error(
          "The secondary provider returned a mismatched execution identity.",
        );
      }
    } catch (error) {
      const current = ledger.getRunAggregate({
        runId: request.runId,
        stepId: request.stepId,
      });
      if (current?.step.status === "cancelled") {
        return rejectedExecution("cancelled", current);
      }
      execution = createFailedExecution({
        request,
        error: sanitizeHostError(error),
      });
    }

    if (execution.status === "completed") {
      return acceptedExecution({
        execution,
        transition: ledger.markRunStepWaiting({
          runId: request.runId,
          stepId: request.stepId,
          executionId: request.executionId,
          idempotencyKey: `provider:${request.executionId}`,
          detail: {
            providerId: execution.providerId,
            model: execution.model,
          },
          now: now(),
        }),
      });
    }
    if (execution.status === "cancelled") {
      return acceptedExecution({
        execution,
        transition: ledger.cancelRunStep({
          runId: request.runId,
          stepId: request.stepId,
          expectedExecutionId: request.executionId,
          idempotencyKey: `provider:${request.executionId}:cancelled`,
          detail: {
            providerId: execution.providerId,
            model: execution.model,
          },
          now: now(),
        }),
      });
    }
    return acceptedExecution({
      execution,
      transition: ledger.failRunStep({
        runId: request.runId,
        stepId: request.stepId,
        executionId: request.executionId,
        idempotencyKey: `provider:${request.executionId}:failed`,
        error: execution.error ?? "The secondary provider failed.",
        detail: {
          code: execution.stopReason ?? "provider-failure",
          providerId: execution.providerId,
          model: execution.model,
        },
        now: now(),
      }),
    });
  };

  return {
    async claim(rawArgs: unknown) {
      const args = SecondaryRunClaimArgsSchema.parse(rawArgs);
      if (
        !isPathOwnedByProject({
          projectPath: args.run.ownership.projectPath,
          cwd: args.input.cwd,
        })
      ) {
        return rejectedTransition("invalid-ownership");
      }
      const ledger = await getLedger();
      const timestamp = now();
      const transition = ledger.claimRunStep({
        run: createPendingRun({
          ...args.run,
          now: timestamp,
        }),
        step: createPendingRunStep({
          id: args.step.id,
          runId: args.run.id,
          kind: args.step.kind,
          dependencyIds: args.step.dependencyIds,
          inputHash: hashSecondaryInput(args.input),
          now: timestamp,
        }),
        executionId: createExecutionId(),
        idempotencyKey: args.step.idempotencyKey,
        now: timestamp,
      });
      return toTransitionResponse(transition);
    },

    async execute(rawArgs: unknown) {
      const args = SecondaryRunExecuteArgsSchema.parse(rawArgs);
      const ledger = await getLedger();
      const aggregate = ledger.getRunAggregate({
        runId: args.runId,
        stepId: args.stepId,
      });
      if (!aggregate) {
        return rejectedExecution("not-found");
      }
      if (
        !isPathOwnedByProject({
          projectPath: aggregate.run.ownership.projectPath,
          cwd: args.input.cwd,
        })
      ) {
        return rejectedExecution("invalid-ownership", aggregate);
      }
      if (hashSecondaryInput(args.input) !== aggregate.step.inputHash) {
        return rejectedExecution("input-mismatch", aggregate);
      }
      if (aggregate.step.executionId !== args.executionId) {
        return rejectedExecution("stale-execution", aggregate);
      }
      if (aggregate.step.status !== "running") {
        return rejectedExecution(
          aggregate.step.status === "cancelled" ? "cancelled" : "invalid-state",
          aggregate,
        );
      }

      const active = activeExecutions.get(args.executionId);
      if (active) {
        return active;
      }
      const request: SecondaryProviderExecutionRequest = {
        runId: args.runId,
        stepId: args.stepId,
        executionId: args.executionId,
        input: args.input,
        policy: aggregate.run.policy,
      };
      const executionPromise = dispatchExecution(request, ledger);
      activeExecutions.set(args.executionId, executionPromise);
      try {
        return await executionPromise;
      } finally {
        if (activeExecutions.get(args.executionId) === executionPromise) {
          activeExecutions.delete(args.executionId);
        }
      }
    },

    async complete(rawArgs: unknown) {
      const args = SecondaryRunCompleteArgsSchema.parse(rawArgs);
      const ledger = await getLedger();
      return toTransitionResponse(
        ledger.completeRunStep({
          ...args,
          now: now(),
        }),
      );
    },

    async fail(rawArgs: unknown) {
      const args = SecondaryRunFailArgsSchema.parse(rawArgs);
      const ledger = await getLedger();
      return toTransitionResponse(
        ledger.failRunStep({
          runId: args.runId,
          stepId: args.stepId,
          executionId: args.executionId,
          idempotencyKey: args.idempotencyKey,
          error: args.error,
          detail: {
            code: args.code ?? "parser-failure",
          },
          now: now(),
        }),
      );
    },

    async cancel(rawArgs: unknown) {
      const args = SecondaryRunCancelArgsSchema.parse(rawArgs);
      const ledger = await getLedger();
      const transition = ledger.cancelRunStep({
        ...args,
        now: now(),
      });
      const response = toTransitionResponse(transition);
      const executionId = response.aggregate?.step.executionId;
      if (response.accepted && !response.duplicate && executionId) {
        await dependencies
          .cancelHost({ executionId })
          .catch(() => ({ ok: false }));
      }
      return response;
    },

    async get(rawArgs: unknown) {
      const args = SecondaryRunLookupArgsSchema.parse(rawArgs);
      const ledger = await getLedger();
      const aggregate = ledger.getRunAggregate(args);
      return aggregate ? SecondaryRunAggregateSchema.parse(aggregate) : null;
    },

    async listReceipts(rawArgs: unknown) {
      const args = SecondaryRunReceiptListArgsSchema.parse(rawArgs);
      const ledger = await getLedger();
      return SecondaryRunReceiptListSchema.parse(ledger.listRunReceipts(args));
    },
  };
}
