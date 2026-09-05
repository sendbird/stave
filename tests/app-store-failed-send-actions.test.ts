import { describe, expect, test } from "bun:test";
import { createFailedSendActions } from "@/store/app-store-failed-send-actions";
import {
  appendFailedOutgoingSend,
  buildFailedOutgoingSend,
} from "@/store/failed-send-recovery";
import type { AppState, SendUserMessageResult } from "@/store/app-store.types";

type SendArgs = Parameters<AppState["sendUserMessage"]>[0];

function buildHarness(args: {
  sendUserMessage: (sendArgs: SendArgs) => Promise<SendUserMessageResult>;
}) {
  const parked = buildFailedOutgoingSend({
    id: "failed-1",
    taskId: "task-1",
    failedAt: "2026-09-04T00:00:00.000Z",
    draft: {
      text: "Fix the login form",
      attachedFilePaths: ["src/app.ts"],
      attachments: [{ kind: "file", filePath: "src/app.ts" }],
      runtimeOverrides: { thinking: true },
    },
    error: new Error("provider unavailable"),
  });
  const state = {
    failedSendsByTask: appendFailedOutgoingSend({}, parked),
    promptDraftByTask: {
      "task-1": {
        text: "something typed after the failure",
        attachedFilePaths: [],
        attachments: [],
      },
    },
    sendUserMessage: args.sendUserMessage,
  } as unknown as AppState;
  const set: Parameters<typeof createFailedSendActions>[0]["set"] = ((
    updater: unknown,
  ) => {
    const patch =
      typeof updater === "function"
        ? (updater as (current: AppState) => Partial<AppState>)(state)
        : (updater as Partial<AppState>);
    Object.assign(state, patch);
  }) as Parameters<typeof createFailedSendActions>[0]["set"];
  const actions = createFailedSendActions({ set, get: () => state });
  return { actions, state, parked };
}

describe("retryFailedSend", () => {
  test("resends the same text and attachments without touching the composer", async () => {
    const sent: SendArgs[] = [];
    const { actions, state } = buildHarness({
      sendUserMessage: async (sendArgs) => {
        sent.push(sendArgs);
        return {
          status: "started",
          taskId: "task-1",
          workspaceId: "ws-1",
          turnId: "turn-1",
        };
      },
    });

    const result = await actions.retryFailedSend({
      taskId: "task-1",
      id: "failed-1",
    });

    expect(result?.status).toBe("started");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.content).toBe("Fix the login form");
    expect(sent[0]?.attachedFilePaths).toEqual(["src/app.ts"]);
    expect(sent[0]?.attachments).toEqual([
      { kind: "file", filePath: "src/app.ts" },
    ]);
    expect(sent[0]?.runtimeOverrides).toEqual({ thinking: true });
    expect(sent[0]?.preservePromptDraft).toBe(true);
    expect(sent[0]?.turnOrigin).toBe("conversation");
    // The draft the user typed after the failure survives the retry.
    expect(state.promptDraftByTask["task-1"]?.text).toBe(
      "something typed after the failure",
    );
    // The bubble is gone once the retry is on its way.
    expect(state.failedSendsByTask["task-1"]).toBeUndefined();
  });

  test("puts the bubble back when a guard blocks the retry", async () => {
    const { actions, state } = buildHarness({
      sendUserMessage: async () => ({ status: "blocked" }),
    });

    const result = await actions.retryFailedSend({
      taskId: "task-1",
      id: "failed-1",
    });

    expect(result?.status).toBe("blocked");
    const parked = state.failedSendsByTask["task-1"] ?? [];
    expect(parked).toHaveLength(1);
    expect(parked[0]?.id).toBe("failed-1");
    expect(parked[0]?.text).toBe("Fix the login form");
  });

  test("does nothing when the bubble is already gone", async () => {
    let sends = 0;
    const { actions } = buildHarness({
      sendUserMessage: async () => {
        sends += 1;
        return { status: "blocked" };
      },
    });

    expect(
      await actions.retryFailedSend({ taskId: "task-1", id: "missing" }),
    ).toBeNull();
    expect(sends).toBe(0);
  });

  test("parks the payload again when the retry itself throws", async () => {
    const { actions, state } = buildHarness({
      sendUserMessage: async () => {
        throw new Error("still offline");
      },
    });

    expect(
      await actions.retryFailedSend({ taskId: "task-1", id: "failed-1" }),
    ).toBeNull();

    const parked = state.failedSendsByTask["task-1"] ?? [];
    expect(parked).toHaveLength(1);
    expect(parked[0]?.id).not.toBe("failed-1");
    expect(parked[0]?.text).toBe("Fix the login form");
    expect(parked[0]?.attachments).toEqual([
      { kind: "file", filePath: "src/app.ts" },
    ]);
    expect(parked[0]?.reason).toBe("still offline");
  });
});

describe("dismissFailedSend", () => {
  test("drops the bubble and leaves the composer draft alone", () => {
    const { actions, state } = buildHarness({
      sendUserMessage: async () => ({ status: "blocked" }),
    });

    actions.dismissFailedSend({ taskId: "task-1", id: "failed-1" });

    expect(state.failedSendsByTask["task-1"]).toBeUndefined();
    expect(state.promptDraftByTask["task-1"]?.text).toBe(
      "something typed after the failure",
    );
  });
});
