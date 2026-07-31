import { describe, expect, test } from "bun:test";
import { getProviderThreadActionCapabilities } from "@/lib/providers/model-catalog";
import {
  buildConversationTurnActionStateByMessageId,
  toProviderSessionTitle,
} from "@/lib/providers/thread-actions";
import type { ChatMessage } from "@/types/chat";

function assistant(args: {
  id: string;
  providerId: "claude-code" | "codex";
  nativeSessionId: string;
  nativeTurnId?: string;
}): ChatMessage {
  return {
    id: args.id,
    role: "assistant",
    model: args.providerId === "codex" ? "gpt-5.6-terra" : "claude-sonnet-5",
    providerId: args.providerId,
    nativeProviderSessionId: args.nativeSessionId,
    nativeProviderTurnId: args.nativeTurnId,
    content: args.id,
    parts: [{ type: "text", text: args.id }],
  };
}

describe("provider thread action capabilities", () => {
  test("keeps fork and rename symmetric while explaining Claude rollback", () => {
    const claude = getProviderThreadActionCapabilities({
      providerId: "claude-code",
    });
    const codex = getProviderThreadActionCapabilities({
      providerId: "codex",
    });

    expect(claude.forkFromTurn.supported).toBe(true);
    expect(claude.renameNativeSession.supported).toBe(true);
    expect(claude.rollbackToTurn).toMatchObject({
      supported: false,
    });
    expect(
      claude.rollbackToTurn.supported ? "" : claude.rollbackToTurn.reason,
    ).toContain("does not expose in-place session rollback");
    expect(codex.forkFromTurn.supported).toBe(true);
    expect(codex.rollbackToTurn.supported).toBe(true);
    expect(codex.renameNativeSession.supported).toBe(true);
  });

  test("keeps native titles inside the shared IPC limit without splitting emoji", () => {
    expect(toProviderSessionTitle(` ${"a".repeat(250)} `)).toHaveLength(200);
    expect(toProviderSessionTitle(`${"a".repeat(199)}😀tail`)).toBe(
      "a".repeat(199),
    );
  });
});

describe("conversation turn action availability", () => {
  const messages = [
    assistant({
      id: "codex-1",
      providerId: "codex",
      nativeSessionId: "thread-1",
      nativeTurnId: "turn-1",
    }),
    assistant({
      id: "codex-2",
      providerId: "codex",
      nativeSessionId: "thread-1",
      nativeTurnId: "turn-2",
    }),
    assistant({
      id: "claude-1",
      providerId: "claude-code",
      nativeSessionId: "session-1",
      nativeTurnId: "message-1",
    }),
    assistant({
      id: "codex-3",
      providerId: "codex",
      nativeSessionId: "thread-1",
      nativeTurnId: "turn-3",
    }),
  ];
  const providerSession = {
    codex: { nativeSessionId: "thread-1" },
    "claude-code": { nativeSessionId: "session-1" },
  };

  test("counts later Codex turns and keeps the latest rollback disabled", () => {
    const states = buildConversationTurnActionStateByMessageId({
      messages,
      providerSession,
      hasActiveTurn: false,
    });

    expect(states.get("codex-1")?.fork.enabled).toBe(true);
    expect(states.get("codex-1")?.rollback).toMatchObject({
      enabled: true,
      rollbackTurnCount: 2,
    });
    expect(states.get("codex-2")?.rollback).toMatchObject({
      enabled: true,
      rollbackTurnCount: 1,
    });
    expect(states.get("codex-3")?.rollback.enabled).toBe(false);
  });

  test("keeps Claude fork enabled and returns the unsupported rollback reason", () => {
    const state = buildConversationTurnActionStateByMessageId({
      messages,
      providerSession,
      hasActiveTurn: false,
    }).get("claude-1");

    expect(state?.fork.enabled).toBe(true);
    expect(state?.rollback.enabled).toBe(false);
    expect(state?.rollback.reason).toContain(
      "does not expose in-place session rollback",
    );
  });

  test("allows a local rollback when only another provider has later messages", () => {
    const state = buildConversationTurnActionStateByMessageId({
      messages: [
        assistant({
          id: "codex-target",
          providerId: "codex",
          nativeSessionId: "thread-1",
          nativeTurnId: "turn-1",
        }),
        assistant({
          id: "claude-later",
          providerId: "claude-code",
          nativeSessionId: "session-1",
          nativeTurnId: "message-1",
        }),
      ],
      providerSession,
      hasActiveTurn: false,
    }).get("codex-target");

    expect(state?.rollback).toMatchObject({
      enabled: true,
      rollbackTurnCount: 0,
    });
    expect(state?.rollback.reason).toContain("later task messages");
  });

  test("disables both mutations during a live turn", () => {
    const state = buildConversationTurnActionStateByMessageId({
      messages,
      providerSession,
      hasActiveTurn: true,
    }).get("codex-1");

    expect(state?.fork).toEqual({
      enabled: false,
      reason: "Wait for the current response to finish.",
    });
    expect(state?.rollback).toEqual({
      enabled: false,
      reason: "Wait for the current response to finish.",
    });
  });

  test("rejects a response from a stale native session", () => {
    const state = buildConversationTurnActionStateByMessageId({
      messages: [
        assistant({
          id: "stale",
          providerId: "codex",
          nativeSessionId: "thread-old",
          nativeTurnId: "turn-old",
        }),
      ],
      providerSession,
      hasActiveTurn: false,
    }).get("stale");

    expect(state?.fork.enabled).toBe(false);
    expect(state?.fork.reason).toContain("earlier native session");
  });

  test("explains why legacy responses cannot be targeted", () => {
    const state = buildConversationTurnActionStateByMessageId({
      messages: [
        assistant({
          id: "legacy",
          providerId: "codex",
          nativeSessionId: "thread-1",
        }),
      ],
      providerSession,
      hasActiveTurn: false,
    }).get("legacy");

    expect(state?.fork.enabled).toBe(false);
    expect(state?.fork.reason).toContain("predates native turn tracking");
  });
});
