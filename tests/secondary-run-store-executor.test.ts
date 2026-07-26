import { describe, expect, test } from "bun:test";
import {
  executeSecondaryRun,
  type SecondaryRunBridge,
} from "../src/store/secondary-run-executor";
import type {
  SecondaryRunAggregate,
  SecondaryRunClaimArgs,
  SecondaryRunTransitionResponse,
} from "../src/lib/runs/secondary-run";

const claimArgs: SecondaryRunClaimArgs = {
  run: {
    id: "run-1",
    kind: "secondary-provider",
    origin: { kind: "manual", id: "origin-1" },
    ownership: {
      projectPath: "/tmp/project",
      workspaceId: "workspace-1",
      taskId: "task-1",
    },
    policy: {
      maxAttempts: 2,
      timeoutMs: 30_000,
      maxTurns: 4,
      maxOutputBytes: 16_384,
      maxEvents: 64,
    },
    provenance: { createdBy: "test", schemaVersion: 1 },
  },
  step: {
    id: "step-1",
    kind: "secondary-provider-turn",
    dependencyIds: [],
    idempotencyKey: "claim-1",
  },
  input: {
    providerId: "codex",
    model: "gpt-test",
    prompt: "Return JSON.",
    cwd: "/tmp/project",
    runtimeHints: {},
  },
};

function aggregate(
  status: SecondaryRunAggregate["step"]["status"],
): SecondaryRunAggregate {
  return {
    run: {
      ...claimArgs.run,
      status,
      createdAt: "2026-07-26T00:00:00.000Z",
      updatedAt: "2026-07-26T00:00:00.000Z",
      completedAt: status === "completed" ? "2026-07-26T00:00:00.000Z" : null,
      error: null,
    },
    step: {
      id: claimArgs.step.id,
      runId: claimArgs.run.id,
      kind: claimArgs.step.kind,
      dependencyIds: [],
      status,
      attempt: 1,
      executionId: "execution-1",
      claimIdempotencyKey: claimArgs.step.idempotencyKey,
      inputHash: "a".repeat(64),
      resultArtifactRef: status === "completed" ? "artifact:result" : null,
      createdAt: "2026-07-26T00:00:00.000Z",
      updatedAt: "2026-07-26T00:00:00.000Z",
      startedAt: "2026-07-26T00:00:00.000Z",
      completedAt: status === "completed" ? "2026-07-26T00:00:00.000Z" : null,
      error: null,
    },
  };
}

function transition(
  status: SecondaryRunAggregate["step"]["status"],
  overrides: Partial<SecondaryRunTransitionResponse> = {},
): SecondaryRunTransitionResponse {
  return {
    accepted: true,
    started: false,
    duplicate: false,
    reason: null,
    aggregate: aggregate(status),
    ...overrides,
  };
}

describe("renderer SecondaryRunExecutor", () => {
  test("claims, executes, parses, and durably completes one result", async () => {
    const calls: string[] = [];
    const bridge: SecondaryRunBridge = {
      claimSecondary: async () => {
        calls.push("claim");
        return transition("running", { started: true });
      },
      executeSecondary: async () => {
        calls.push("execute");
        return {
          accepted: true,
          reason: null,
          execution: {
            executionId: "execution-1",
            providerId: "codex",
            model: "gpt-test",
            status: "completed",
            text: '{"value":42}',
            eventCount: 2,
            collectedEventCount: 2,
            outputBytes: 12,
            truncated: false,
            stopReason: null,
            error: null,
          },
          aggregate: aggregate("waiting"),
        };
      },
      completeSecondary: async (args) => {
        calls.push(`complete:${args.resultArtifactRef}`);
        return transition("completed");
      },
      failSecondary: async () => {
        throw new Error("unexpected fail");
      },
      cancelSecondary: async () => {
        throw new Error("unexpected cancel");
      },
    };
    const claimedIds: string[] = [];

    const result = await executeSecondaryRun({
      bridge,
      claim: claimArgs,
      resultArtifactRef: "artifact:result",
      parse: (text) => JSON.parse(text) as { value: number },
      onClaimed: ({ executionId }) => claimedIds.push(executionId),
    });

    expect(result).toEqual({
      ok: true,
      value: { value: 42 },
      executionId: "execution-1",
      model: "gpt-test",
    });
    expect(claimedIds).toEqual(["execution-1"]);
    expect(calls).toEqual(["claim", "execute", "complete:artifact:result"]);
  });

  test("records parser failure instead of completing the durable step", async () => {
    let failure:
      | {
          executionId: string;
          error: string;
          code?: string;
        }
      | undefined;
    const bridge: SecondaryRunBridge = {
      claimSecondary: async () => transition("running", { started: true }),
      executeSecondary: async () => ({
        accepted: true,
        reason: null,
        execution: {
          executionId: "execution-1",
          providerId: "codex",
          model: "gpt-test",
          status: "completed",
          text: "not-json",
          eventCount: 1,
          collectedEventCount: 1,
          outputBytes: 8,
          truncated: false,
          stopReason: null,
          error: null,
        },
        aggregate: aggregate("waiting"),
      }),
      completeSecondary: async () => {
        throw new Error("unexpected complete");
      },
      failSecondary: async (args) => {
        failure = args;
        return transition("failed");
      },
      cancelSecondary: async () => {
        throw new Error("unexpected cancel");
      },
    };

    const result = await executeSecondaryRun({
      bridge,
      claim: claimArgs,
      resultArtifactRef: "artifact:result",
      parse: () => null,
      parserError: "Structured output was invalid.",
    });

    expect(result).toEqual({
      ok: false,
      error: "Structured output was invalid.",
    });
    expect(failure).toMatchObject({
      executionId: "execution-1",
      error: "Structured output was invalid.",
      code: "parser-failure",
    });
  });

  test("does not dispatch a duplicate claim or a cancelled caller", async () => {
    let executeCalls = 0;
    let cancelCalls = 0;
    const duplicateBridge: SecondaryRunBridge = {
      claimSecondary: async () =>
        transition("running", {
          started: false,
          duplicate: true,
        }),
      executeSecondary: async () => {
        executeCalls += 1;
        throw new Error("unexpected execute");
      },
      completeSecondary: async () => transition("completed"),
      failSecondary: async () => transition("failed"),
      cancelSecondary: async () => {
        cancelCalls += 1;
        return transition("cancelled");
      },
    };
    expect(
      await executeSecondaryRun({
        bridge: duplicateBridge,
        claim: claimArgs,
        resultArtifactRef: "artifact:result",
        parse: () => ({ value: 1 }),
      }),
    ).toEqual({
      ok: false,
      error: "The secondary run request was already claimed.",
    });

    duplicateBridge.claimSecondary = async () =>
      transition("running", { started: true, duplicate: false });
    expect(
      await executeSecondaryRun({
        bridge: duplicateBridge,
        claim: claimArgs,
        resultArtifactRef: "artifact:result",
        parse: () => ({ value: 1 }),
        shouldContinue: () => false,
      }),
    ).toEqual({
      ok: false,
      error: "The secondary run was cancelled.",
    });
    expect(executeCalls).toBe(0);
    expect(cancelCalls).toBe(1);
  });
});
