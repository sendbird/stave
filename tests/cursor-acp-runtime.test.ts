import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  streamCursorWorkerWithAcp,
  streamCursorWithAcp,
} from "../electron/providers/cursor/cursor-acp-profile";
import { mapCursorAcpModelCatalog } from "../electron/providers/cursor/cursor-model-catalog";
import type {
  BridgeEvent,
  ProviderResponderResult,
} from "../electron/providers/types";

const fixturePath = path.join(
  import.meta.dir,
  "fixtures",
  "fake-cursor-acp-agent.ts",
);

function createTurnArgs(
  scenario: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    providerId: "cursor" as const,
    prompt: "Run the fixture",
    cwd: import.meta.dir,
    runtimeOptions: {
      model: "auto",
      cursorMode: "agent" as const,
      cursorBinaryPath: process.execPath,
    },
    acpArgsForTest: [fixturePath, scenario],
    ...overrides,
  };
}

function waitForEvent(
  start: (onEvent: (event: BridgeEvent) => void) => void,
  predicate: (event: BridgeEvent) => boolean,
) {
  return new Promise<BridgeEvent>((resolve) => {
    start((event) => {
      if (predicate(event)) {
        resolve(event);
      }
    });
  });
}

describe("Cursor ACP runtime", () => {
  test("runs a Worker in a fresh scoped ACP session with its selected model", async () => {
    const events = await streamCursorWorkerWithAcp({
      prompt: "Do one bounded task",
      cwd: import.meta.dir,
      model: "fixture-model",
      runtimeOptions: { cursorBinaryPath: process.execPath },
      requestIdScope: "worker:fixture",
      acpArgsForTest: [fixturePath, "standard"],
    });

    expect(events).toContainEqual({
      type: "model_resolved",
      resolvedProviderId: "cursor",
      resolvedModel: "fixture-model",
    });
    expect(events).toContainEqual({
      type: "text",
      text: "Fixture response",
      segmentId: "message-1",
    });
  });

  test("maps only model values accepted by the ACP session", () => {
    expect(
      mapCursorAcpModelCatalog({
        configOptions: [
          {
            id: "model",
            name: "Model",
            type: "select",
            currentValue: "auto-smart[optimize_for=balanced]",
            options: [
              {
                value: "auto-smart[optimize_for=balanced]",
                name: "Auto Balance",
              },
              {
                value: "gpt-5.6-sol[context=272k,reasoning=high,fast=true]",
                name: "gpt-5.6-sol",
              },
            ],
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        model: "auto-smart[optimize_for=balanced]",
        displayName: "Auto Balance",
        isDefault: true,
      }),
      expect.objectContaining({
        model: "gpt-5.6-sol[context=272k,reasoning=high,fast=true]",
        displayName: "GPT 5.6 Sol · 272K · High · Fast",
        defaultEffort: "high",
      }),
    ]);
  });

  test("keeps the advertised Cursor catalog order", () => {
    expect(
      mapCursorAcpModelCatalog({
        configOptions: [
          {
            id: "model",
            name: "Model",
            type: "select",
            currentValue: "auto-smart[optimize_for=balanced]",
            options: [
              {
                value: "auto-smart[optimize_for=balanced]",
                name: "Auto Balance",
              },
              { value: "grok-4.6", name: "grok-4.6" },
              { value: "composer-2.5", name: "composer-2.5" },
              { value: "claude-fable-5", name: "claude-fable-5" },
              { value: "gpt-5.6-sol", name: "gpt-5.6-sol" },
              { value: "claude-opus-5", name: "claude-opus-5" },
            ],
          },
        ],
      }).map((entry) => entry.model),
    ).toEqual([
      "auto-smart[optimize_for=balanced]",
      "grok-4.6",
      "composer-2.5",
      "claude-fable-5",
      "gpt-5.6-sol",
      "claude-opus-5",
    ]);
  });

  test("maps stable ACP updates and Cursor notifications", async () => {
    const events = await streamCursorWithAcp(createTurnArgs("standard"));

    expect(events).toContainEqual({
      type: "provider_session",
      providerId: "cursor",
      nativeSessionId: "cursor-fixture-session",
    });
    expect(events).toContainEqual({
      type: "model_resolved",
      resolvedProviderId: "cursor",
      resolvedModel: "auto",
    });
    expect(events).toContainEqual({
      type: "text",
      text: "Fixture response",
      segmentId: "message-1",
    });
    expect(events.some((event) => event.type === "thinking")).toBe(true);
    expect(
      events.some(
        (event) => event.type === "tool" && event.toolUseId === "tool-1",
      ),
    ).toBe(true);
    expect(events).toContainEqual({
      type: "diff",
      filePath: "/tmp/fixture.txt",
      oldContent: "before",
      newContent: "after",
      status: "accepted",
    });
    expect(
      events.some(
        (event) => event.type === "tool" && event.toolName === "TodoWrite",
      ),
    ).toBe(true);
    expect(events).toContainEqual({
      type: "subagent_progress",
      toolUseId: "task-1",
      content: "Explored fixture",
      agentId: "agent-1",
    });
    expect(events).toContainEqual({
      type: "usage",
      inputTokens: 34,
      outputTokens: 21,
      thoughtTokens: 7,
      cacheReadTokens: 13,
      cacheCreationTokens: 5,
    });
    expect(events).toContainEqual({
      type: "context_usage",
      usedTokens: 233,
      sizeTokens: 2048,
      costAmount: 0.003,
      costCurrency: "USD",
    });
    expect(events.filter((event) => event.type === "done")).toHaveLength(1);
  });

  test("selects allow-once for an approved permission", async () => {
    let responder:
      | ((args: {
          requestId: string;
          approved: boolean;
          reason?: string;
        }) => ProviderResponderResult)
      | undefined;
    let turn!: Promise<BridgeEvent[]>;
    const approval = await waitForEvent(
      (onEvent) => {
        turn = streamCursorWithAcp({
          ...createTurnArgs("permission"),
          onEvent,
          registerApprovalResponder: (next) => {
            responder = next;
          },
        });
      },
      (event) => event.type === "approval",
    );
    expect(approval.type).toBe("approval");
    if (approval.type !== "approval") {
      throw new Error("Expected an approval event.");
    }
    expect(
      responder?.({ requestId: approval.requestId, approved: true }),
    ).toEqual({ ok: true });
    const events = await turn;
    expect(
      events.some(
        (event) =>
          event.type === "text" &&
          event.text.includes('"optionId":"allow-once"'),
      ),
    ).toBe(true);
  });

  test("selects allow-always only when the caller asks for the always scope", async () => {
    let responder:
      | ((args: {
          requestId: string;
          approved: boolean;
          reason?: string;
          scope?: "once" | "always";
        }) => ProviderResponderResult)
      | undefined;
    let turn!: Promise<BridgeEvent[]>;
    const approval = await waitForEvent(
      (onEvent) => {
        turn = streamCursorWithAcp({
          ...createTurnArgs("permission"),
          onEvent,
          registerApprovalResponder: (next) => {
            responder = next;
          },
        });
      },
      (event) => event.type === "approval",
    );
    if (approval.type !== "approval") {
      throw new Error("Expected an approval event.");
    }
    // The card can only offer the button when the runtime advertised the option.
    expect(approval.supportsAllowAlways).toBe(true);
    // Two independent changes meet in this one handler: the canonical tool name
    // comes from the ACP tool-naming split, `supportsAllowAlways` from the
    // approval-scope work. Assert them on the same event so a future merge
    // cannot keep one and quietly drop the other.
    expect(approval.toolName).toBe("Bash");
    expect(approval.description).toBe("Run fixture");
    expect(approval.input).toContain("fixture");
    expect(
      responder?.({
        requestId: approval.requestId,
        approved: true,
        scope: "always",
      }),
    ).toEqual({ ok: true });
    const events = await turn;
    expect(
      events.some(
        (event) =>
          event.type === "text" &&
          event.text.includes('"optionId":"allow-always"'),
      ),
    ).toBe(true);
  });

  test("submits stable option ids for Cursor questions", async () => {
    let responder:
      | ((args: {
          requestId: string;
          answers?: Record<string, string>;
          denied?: boolean;
        }) => ProviderResponderResult)
      | undefined;
    let turn!: Promise<BridgeEvent[]>;
    const questionEvent = await waitForEvent(
      (onEvent) => {
        turn = streamCursorWithAcp({
          ...createTurnArgs("question"),
          onEvent,
          registerUserInputResponder: (next) => {
            responder = next;
          },
        });
      },
      (event) => event.type === "user_input",
    );
    expect(questionEvent.type).toBe("user_input");
    if (questionEvent.type !== "user_input") {
      throw new Error("Expected a user-input event.");
    }
    expect(questionEvent.questions[0]?.options[0]).toMatchObject({
      label: "Agent",
      value: "agent",
    });
    expect(
      responder?.({
        requestId: questionEvent.requestId,
        answers: { mode: "plan" },
      }),
    ).toEqual({ ok: true });
    const events = await turn;
    expect(
      events.some(
        (event) =>
          event.type === "text" &&
          event.text.includes('"selectedOptionIds":["plan"]'),
      ),
    ).toBe(true);
  });

  test("keeps plan review blocking and forwards revision reasons", async () => {
    let responder:
      | ((args: {
          requestId: string;
          approved: boolean;
          reason?: string;
        }) => ProviderResponderResult)
      | undefined;
    let turn!: Promise<BridgeEvent[]>;
    const planEvent = await waitForEvent(
      (onEvent) => {
        turn = streamCursorWithAcp({
          ...createTurnArgs("plan"),
          onEvent,
          registerApprovalResponder: (next) => {
            responder = next;
          },
        });
      },
      (event) => event.type === "plan_ready",
    );
    expect(planEvent).toMatchObject({
      type: "plan_ready",
      review: { responseMode: "blocking" },
    });
    if (planEvent.type !== "plan_ready" || !planEvent.review) {
      throw new Error("Expected a blocking plan event.");
    }
    expect(
      responder?.({
        requestId: planEvent.review.requestId,
        approved: false,
        reason: "Add tests",
      }),
    ).toEqual({ ok: true });
    const events = await turn;
    expect(
      events.some(
        (event) =>
          event.type === "text" && event.text.includes('"reason":"Add tests"'),
      ),
    ).toBe(true);
  });

  /*
    Registration used to happen after the event was announced, and announcement
    is synchronous all the way to the listener. Answering from inside that call
    therefore reached the responder before the request existed and came back as
    `unknown-request`, which then hung the turn until the decision timer fired.
    These three cover each request kind that blocks a turn.
  */
  test("answers a permission decided inside the announcing call", async () => {
    let responder:
      | ((args: {
          requestId: string;
          approved: boolean;
        }) => ProviderResponderResult)
      | undefined;
    let decision: ProviderResponderResult | undefined;
    const events = await streamCursorWithAcp({
      ...createTurnArgs("permission"),
      onEvent: (event) => {
        if (event.type !== "approval" || decision) {
          return;
        }
        decision = responder?.({
          requestId: event.requestId,
          approved: true,
        });
      },
      registerApprovalResponder: (next) => {
        responder = next;
      },
    });
    expect(decision).toEqual({ ok: true });
    expect(
      events.some(
        (event) =>
          event.type === "text" &&
          event.text.includes('"optionId":"allow-once"'),
      ),
    ).toBe(true);
  });

  test("answers a question decided inside the announcing call", async () => {
    let responder:
      | ((args: {
          requestId: string;
          answers?: Record<string, string>;
        }) => ProviderResponderResult)
      | undefined;
    let decision: ProviderResponderResult | undefined;
    const events = await streamCursorWithAcp({
      ...createTurnArgs("question"),
      onEvent: (event) => {
        if (event.type !== "user_input" || decision) {
          return;
        }
        decision = responder?.({
          requestId: event.requestId,
          answers: { [event.questions[0]?.id ?? "q"]: "plan" },
        });
      },
      registerUserInputResponder: (next) => {
        responder = next;
      },
    });
    expect(decision).toEqual({ ok: true });
    expect(
      events.some(
        (event) =>
          event.type === "text" && event.text.includes("selectedOptionIds"),
      ),
    ).toBe(true);
  });

  test("answers a plan review decided inside the announcing call", async () => {
    let responder:
      | ((args: {
          requestId: string;
          approved: boolean;
          reason?: string;
        }) => ProviderResponderResult)
      | undefined;
    let decision: ProviderResponderResult | undefined;
    const events = await streamCursorWithAcp({
      ...createTurnArgs("plan"),
      onEvent: (event) => {
        if (event.type !== "plan_ready" || !event.review || decision) {
          return;
        }
        decision = responder?.({
          requestId: event.review.requestId,
          approved: true,
        });
      },
      registerApprovalResponder: (next) => {
        responder = next;
      },
    });
    expect(decision).toEqual({ ok: true });
    expect(events.some((event) => event.type === "done")).toBe(true);
  });

  test("loads a persisted session id", async () => {
    const events = await streamCursorWithAcp(
      createTurnArgs("standard", {
        runtimeOptions: {
          model: "fixture-model",
          cursorMode: "plan",
          cursorBinaryPath: process.execPath,
          cursorResumeSessionId: "saved-session",
        },
      }),
    );
    expect(events).toContainEqual({
      type: "provider_session",
      providerId: "cursor",
      nativeSessionId: "saved-session",
    });
    expect(events).toContainEqual({
      type: "model_resolved",
      resolvedProviderId: "cursor",
      resolvedModel: "fixture-model",
    });
  });

  test("does not attach session/load history replay to the follow-up turn", async () => {
    const events = await streamCursorWithAcp(
      createTurnArgs("standard", {
        runtimeOptions: {
          model: "auto",
          cursorMode: "agent",
          cursorBinaryPath: process.execPath,
          cursorResumeSessionId: "saved-session",
        },
      }),
    );

    expect(
      events.some(
        (event) =>
          (event.type === "text" && event.text === "Previous turn response") ||
          (event.type === "thinking" && event.text === "Previous thinking") ||
          (event.type === "tool" && event.toolUseId === "previous-tool-1") ||
          (event.type === "subagent_progress" &&
            event.toolUseId === "previous-task-1"),
      ),
    ).toBe(false);
    expect(events).toContainEqual({
      type: "text",
      text: "Fixture response",
      segmentId: "message-1",
    });
    const firstText = events.find((event) => event.type === "text");
    expect(firstText).toMatchObject({
      type: "text",
      text: "Fixture response",
    });
  });

  test("cancels the ACP prompt and emits one user-abort terminal", async () => {
    let abort: (() => void) | undefined;
    const turn = streamCursorWithAcp({
      ...createTurnArgs("cancel"),
      registerAbort: (next) => {
        abort = next;
      },
    });
    await Bun.sleep(30);
    abort?.();
    const events = await turn;
    expect(events.filter((event) => event.type === "done")).toEqual([
      { type: "done", stop_reason: "user_abort" },
    ]);
  });
});
