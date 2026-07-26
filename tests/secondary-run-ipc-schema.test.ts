import { describe, expect, test } from "bun:test";
import {
  SecondaryRunCancelArgsSchema,
  SecondaryRunClaimArgsSchema,
  SecondaryRunCompleteArgsSchema,
  SecondaryRunExecuteArgsSchema,
  SecondaryRunFailArgsSchema,
  SecondaryRunLookupArgsSchema,
  SecondaryRunReceiptListArgsSchema,
} from "../electron/main/ipc/schemas";
import type { SecondaryRunClaimArgs } from "../src/lib/runs/secondary-run";

function createClaim(): SecondaryRunClaimArgs {
  return {
    run: {
      id: "run-1",
      kind: "secondary-provider",
      origin: { kind: "manual", id: "origin-1" },
      ownership: {
        projectPath: "/tmp/project",
        workspaceId: "workspace-1",
        taskId: null,
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
      providerId: "claude-code",
      model: "claude-test",
      prompt: "Inspect locally.",
      cwd: "/tmp/project",
      runtimeHints: {},
    },
  };
}

describe("secondary run IPC schemas", () => {
  test("reuses the strict shared contract for every request", () => {
    const claim = createClaim();
    expect(SecondaryRunClaimArgsSchema.parse(claim)).toEqual(claim);
    expect(
      SecondaryRunExecuteArgsSchema.safeParse({
        runId: "run-1",
        stepId: "step-1",
        executionId: "execution-1",
        input: claim.input,
      }).success,
    ).toBe(true);
    expect(
      SecondaryRunCompleteArgsSchema.safeParse({
        runId: "run-1",
        stepId: "step-1",
        executionId: "execution-1",
        idempotencyKey: "complete-1",
        resultArtifactRef: "artifact:1",
      }).success,
    ).toBe(true);
    expect(
      SecondaryRunFailArgsSchema.safeParse({
        runId: "run-1",
        stepId: "step-1",
        executionId: "execution-1",
        idempotencyKey: "fail-1",
        error: "Parser rejected output.",
      }).success,
    ).toBe(true);
    expect(
      SecondaryRunCancelArgsSchema.safeParse({
        runId: "run-1",
        stepId: "step-1",
        idempotencyKey: "cancel-1",
      }).success,
    ).toBe(true);
    expect(
      SecondaryRunLookupArgsSchema.safeParse({
        runId: "run-1",
        stepId: "step-1",
      }).success,
    ).toBe(true);
    expect(
      SecondaryRunReceiptListArgsSchema.safeParse({
        runId: "run-1",
      }).success,
    ).toBe(true);
  });

  test("rejects renderer-only extras instead of forwarding them", () => {
    expect(
      SecondaryRunClaimArgsSchema.safeParse({
        ...createClaim(),
        resumeSessionId: "session-from-renderer",
      }).success,
    ).toBe(false);
  });
});
