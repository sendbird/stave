import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  streamKiroWorkerWithAcp,
  streamKiroWithAcp,
  buildKiroAcpCommandArgs,
} from "../electron/providers/kiro/kiro-acp-profile";
import { parseKiroModelCatalog } from "../electron/providers/kiro/kiro-model-catalog";
import type {
  BridgeEvent,
  ProviderResponderResult,
} from "../electron/providers/types";

const fixturePath = path.join(
  import.meta.dir,
  "fixtures",
  "fake-kiro-acp-agent.ts",
);

function createTurnArgs(
  scenario: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    providerId: "kiro" as const,
    prompt: "Run the Kiro fixture",
    cwd: import.meta.dir,
    runtimeOptions: {
      model: "auto",
      kiroBinaryPath: process.execPath,
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

describe("Kiro ACP runtime", () => {
  test("passes the selected effort to the ACP process", () => {
    expect(buildKiroAcpCommandArgs("xhigh")).toEqual([
      "acp",
      "--effort",
      "xhigh",
    ]);
  });

  test("runs a Worker in a fresh scoped ACP session with its selected model", async () => {
    const events = await streamKiroWorkerWithAcp({
      prompt: "Do one bounded task",
      cwd: import.meta.dir,
      model: "fixture-model",
      runtimeOptions: { kiroBinaryPath: process.execPath },
      requestIdScope: "worker:fixture",
      acpArgsForTest: [fixturePath, "standard"],
    });

    expect(events).toContainEqual({
      type: "model_resolved",
      resolvedProviderId: "kiro",
      resolvedModel: "fixture-model",
    });
    expect(events).toContainEqual({
      type: "text",
      text: "Kiro response:fixture-model",
      segmentId: "kiro-message-1",
    });
  });

  test("parses the JSON model catalog without retaining account data", () => {
    expect(
      parseKiroModelCatalog(
        JSON.stringify({
          models: [
            "auto",
            {
              modelId: "fixture-model",
              displayName: "Fixture Model",
              defaultEffort: "high",
              supportedEfforts: ["low", "high", "unsupported"],
            },
          ],
        }),
      ),
    ).toEqual([
      expect.objectContaining({ model: "auto", isDefault: true }),
      expect.objectContaining({
        model: "fixture-model",
        displayName: "Fixture Model",
        defaultEffort: "high",
        supportedEfforts: ["low", "high"],
      }),
    ]);
  });

  test("maps stable ACP updates and isolated Kiro notifications", async () => {
    const events = await streamKiroWithAcp(createTurnArgs("standard"));
    expect(events).toContainEqual({
      type: "provider_session",
      providerId: "kiro",
      nativeSessionId: "kiro-fixture-session",
    });
    expect(events).toContainEqual({
      type: "text",
      text: "Kiro response:auto",
      segmentId: "kiro-message-1",
    });
    expect(events).toContainEqual({
      type: "system",
      content: "Context compaction completed.",
    });
    expect(events.filter((event) => event.type === "done")).toHaveLength(1);
    expect(events).toContainEqual({
      type: "usage",
      inputTokens: 21,
      outputTokens: 13,
      thoughtTokens: 5,
      cacheReadTokens: 8,
      cacheCreationTokens: 3,
    });
    expect(events).toContainEqual({
      type: "context_usage",
      usedTokens: 144,
      sizeTokens: 1024,
      costAmount: 0.002,
      costCurrency: "USD",
    });
  });

  test("reports Kiro's namespaced metadata as context usage", async () => {
    const events = await streamKiroWithAcp(createTurnArgs("standard"));
    expect(events).toContainEqual({
      type: "context_usage",
      usedPercent: 3.6710002422332764,
      costAmount: 0.05413,
      costCurrency: "credits",
    });
  });

  test("loads a saved session and selects a Kiro model", async () => {
    const events = await streamKiroWithAcp(
      createTurnArgs("standard", {
        runtimeOptions: {
          model: "fixture-model",
          kiroBinaryPath: process.execPath,
          kiroResumeSessionId: "saved-kiro-session",
        },
      }),
    );
    expect(events).toContainEqual({
      type: "provider_session",
      providerId: "kiro",
      nativeSessionId: "saved-kiro-session",
    });
    expect(events).toContainEqual({
      type: "model_resolved",
      resolvedProviderId: "kiro",
      resolvedModel: "fixture-model",
    });
    expect(events).toContainEqual({
      type: "text",
      text: "Kiro response:fixture-model",
      segmentId: "kiro-message-1",
    });
  });

  test("answers Kiro's underscore-cased allow_once permission option", async () => {
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
        turn = streamKiroWithAcp({
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
    expect(responder?.({ requestId: approval.requestId, approved: true })).toEqual(
      { ok: true },
    );
    const events = await turn;
    // Kiro advertises `allow_once`, Cursor advertises `allow-once`. Selection
    // keys off the protocol `kind`, so both runtimes resolve.
    expect(
      events.some(
        (event) =>
          event.type === "text" && event.text.includes('"optionId":"allow_once"'),
      ),
    ).toBe(true);
  });

  test("falls back to allow_once when the runtime advertises no allow_always", async () => {
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
        turn = streamKiroWithAcp({
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
    // No advertised option means no button, and an `always` scope that arrives
    // anyway must narrow to allow-once rather than stall the turn.
    expect(approval.supportsAllowAlways).toBeUndefined();
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
          event.type === "text" && event.text.includes('"optionId":"allow_once"'),
      ),
    ).toBe(true);
  });

  test("cancels the ACP prompt and emits one terminal event", async () => {
    let abort: (() => void) | undefined;
    const turn = streamKiroWithAcp({
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
