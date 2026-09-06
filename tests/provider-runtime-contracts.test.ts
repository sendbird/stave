import { describe, expect, test } from "bun:test";
import {
  ClaudeSessionForkArgsSchema,
  ClaudeSessionRenameArgsSchema,
  CodexThreadForkArgsSchema,
  RuntimeOptionsObjectSchema,
} from "../electron/main/ipc/schemas";
import {
  NORMALIZED_PROVIDER_EVENT_TYPES,
  PROVIDER_RUNTIME_OPTION_KEYS,
} from "@/lib/providers/runtime-option-contract";
import {
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE,
  NormalizedProviderEventSchema,
} from "@/lib/providers/schemas";

function sortStrings(values: readonly string[]) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

describe("provider runtime contracts", () => {
  test("preserves every primary provider on advisor activity while validating the advisor target", () => {
    for (const primaryProviderId of ["claude-code", "codex", "cursor", "kiro"]) {
      const event = {
        type: "advisor_activity",
        phase: "started",
        primaryProviderId,
        advisorProviderId: "codex",
        at: 1,
      };
      expect(NormalizedProviderEventSchema.safeParse(event).success).toBe(true);
      expect(NormalizedProviderEventSchema.safeParse({ ...event, advisorProviderId: "unsupported" }).success).toBe(false);
    }
  });

  test("keeps runtime option keys aligned with the IPC schema", () => {
    expect(sortStrings(PROVIDER_RUNTIME_OPTION_KEYS)).toEqual(
      sortStrings(Object.keys(RuntimeOptionsObjectSchema.shape)),
    );
  });

  test("keeps normalized provider event discriminants aligned with the Zod schema", () => {
    expect(sortStrings(NORMALIZED_PROVIDER_EVENT_TYPES)).toEqual(
      sortStrings(
        NormalizedProviderEventSchema.options.map(
          (option) => option.shape.type.value,
        ),
      ),
    );
    expect(sortStrings(NORMALIZED_PROVIDER_EVENT_TYPES)).toEqual(
      sortStrings(Object.keys(NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE)),
    );
  });

  test("accepts bounded auto-routing evidence while rejecting invalid targets", () => {
    const event = {
      type: "model_resolved",
      resolvedProviderId: "cursor",
      resolvedModel: "runtime-default",
      modelResolution: {
        selectedProviderId: "codex",
        selectedModel: "gpt-5.6",
        source: "classifier",
        rationale: "The task needs an implementation-capable model.",
        confidence: 0.91,
        taskType: "implementation",
      },
    } as const;

    expect(NormalizedProviderEventSchema.safeParse(event).success).toBe(true);
    expect(
      NormalizedProviderEventSchema.safeParse({
        ...event,
        modelResolution: { ...event.modelResolution, confidence: 1.01 },
      }).success,
    ).toBe(false);
    expect(
      NormalizedProviderEventSchema.safeParse({
        ...event,
        modelResolution: { ...event.modelResolution, selectedModel: "" },
      }).success,
    ).toBe(false);
  });

  test("accepts point-in-time fork and native rename payloads for both providers", () => {
    expect(
      ClaudeSessionForkArgsSchema.safeParse({
        sessionId: "session-1",
        upToMessageId: "assistant-message-1",
        title: "Forked task",
        cwd: "/tmp/workspace",
      }).success,
    ).toBe(true);
    expect(
      ClaudeSessionRenameArgsSchema.safeParse({
        sessionId: "session-1",
        title: "Renamed task",
      }).success,
    ).toBe(true);
    expect(
      CodexThreadForkArgsSchema.safeParse({
        threadId: "thread-1",
        lastTurnId: "turn-2",
      }).success,
    ).toBe(true);
  });
});
