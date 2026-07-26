import { describe, expect, test } from "bun:test";
import {
  SecondaryRunClaimArgsSchema,
  SecondaryRunProviderInputSchema,
  serializeSecondaryRunInput,
} from "../src/lib/runs/secondary-run";

function createProviderInput() {
  return {
    providerId: "codex" as const,
    model: "gpt-5.6-sol",
    prompt: "Compare the candidate worktrees.",
    cwd: "/tmp/stave",
    runtimeHints: {
      codexBinaryPath: "/opt/codex",
      codexReasoningEffort: "high" as const,
    },
  };
}

describe("secondary run transport contract", () => {
  test("accepts one bounded provider input and stable run claim", () => {
    const input = createProviderInput();
    expect(SecondaryRunProviderInputSchema.parse(input)).toEqual(input);

    expect(
      SecondaryRunClaimArgsSchema.parse({
        run: {
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
        },
        step: {
          id: "step-1",
          kind: "secondary-provider-turn",
          dependencyIds: [],
          idempotencyKey: "compare-1:judge:attempt:1",
        },
        input,
      }),
    ).toMatchObject({
      run: { id: "run-1", kind: "secondary-provider" },
      step: { id: "step-1", idempotencyKey: "compare-1:judge:attempt:1" },
      input,
    });
  });

  test("rejects permission, write, network, and resume runtime hints", () => {
    for (const unsafeHint of [
      { codexFileAccess: "danger-full-access" },
      { codexNetworkAccess: true },
      { codexApprovalPolicy: "on-request" },
      { codexResumeThreadId: "thread-1" },
      { claudePermissionMode: "bypassPermissions" },
      { claudeResumeSessionId: "session-1" },
      { claudeAllowedTools: ["Write"] },
    ]) {
      expect(
        SecondaryRunProviderInputSchema.safeParse({
          ...createProviderInput(),
          runtimeHints: unsafeHint,
        }).success,
      ).toBe(false);
    }
  });

  test("serializes input deterministically without provider session cursors", () => {
    const first = serializeSecondaryRunInput(createProviderInput());
    const second = serializeSecondaryRunInput({
      cwd: "/tmp/stave",
      prompt: "Compare the candidate worktrees.",
      runtimeHints: {
        codexReasoningEffort: "high",
        codexBinaryPath: "/opt/codex",
      },
      model: "gpt-5.6-sol",
      providerId: "codex",
    });

    expect(first).toBe(second);
    expect(first).not.toContain("Resume");
    expect(first).not.toContain("resume");
  });
});
