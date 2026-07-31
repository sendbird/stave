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
