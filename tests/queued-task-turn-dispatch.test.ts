import { describe, expect, test } from "bun:test";
import {
  createQueuedTaskTurnDispatcher,
  type QueuedTurnAutoDispatchHold,
} from "@/store/queued-task-turn-dispatch";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";
import type { PromptDraft } from "@/types/chat";

function buildSessionWithDraft(draft: PromptDraft | undefined) {
  return {
    promptDraftByTask: draft ? { "task-1": draft } : {},
  } as unknown as WorkspaceSessionState;
}

function buildQueuedTurn(id: string, content: string, queuedAt: string) {
  return {
    id,
    queuedAt,
    content,
    attachedFilePaths: [],
    attachments: [],
  };
}

const TARGET = { workspaceId: "ws-1", taskId: "task-1" };

describe("queued task turn dispatcher", () => {
  test("dispatches the queue head through the queued-turn path so its stored provider/model apply", () => {
    const sent: Array<{
      taskId: string;
      content: string;
      turnOrigin: string;
      queuedTurnId: string;
    }> = [];
    const dispatch = createQueuedTaskTurnDispatcher({
      getSession: () =>
        buildSessionWithDraft({
          text: "Composer draft in progress",
          attachedFilePaths: [],
          attachments: [],
          queuedTurns: [
            {
              id: "queued-claude",
              queuedAt: "2026-08-01T00:00:00.000Z",
              sourceTurnId: "turn-1",
              content: "Run on Claude",
              attachedFilePaths: [],
              attachments: [],
              providerId: "claude-code",
              model: "claude-opus-4-6",
            },
            {
              id: "queued-codex",
              queuedAt: "2026-08-01T00:00:01.000Z",
              sourceTurnId: "turn-1",
              content: "Run on Codex",
              attachedFilePaths: [],
              attachments: [],
              providerId: "codex",
              model: "gpt-5.4",
            },
          ],
        }),
      getActions: () => ({
        sendUserMessage: (args) => {
          sent.push(args);
          return Promise.resolve({ status: "started" });
        },
      }),
      getAutoDispatchHold: () => undefined,
    });

    dispatch(TARGET);

    // FIFO: only the head is dispatched, by id, so `sendUserMessage` resolves
    // the stored providerId/model from the queued item itself and leaves the
    // composer draft (and the rest of the queue) to the send path.
    expect(sent).toEqual([
      {
        taskId: "task-1",
        content: "Run on Claude",
        turnOrigin: "conversation",
        queuedTurnId: "queued-claude",
      },
    ]);
  });

  test("does nothing when the queue is empty or the session is missing", () => {
    const sent: unknown[] = [];
    const actions = {
      sendUserMessage: (args: unknown) => {
        sent.push(args);
        return Promise.resolve({ status: "started" });
      },
    };

    createQueuedTaskTurnDispatcher({
      getSession: () =>
        buildSessionWithDraft({
          text: "No queue",
          attachedFilePaths: [],
          attachments: [],
        }),
      getActions: () => actions,
      getAutoDispatchHold: () => undefined,
    })(TARGET);

    createQueuedTaskTurnDispatcher({
      getSession: () => null,
      getActions: () => actions,
      getAutoDispatchHold: () => undefined,
    })(TARGET);

    expect(sent).toEqual([]);
  });

  test("waits in place for an in-flight steer instead of letting the item behind it jump the line", async () => {
    const sent: Array<{ queuedTurnId: string }> = [];
    const draft: PromptDraft = {
      text: "",
      attachedFilePaths: [],
      attachments: [],
      queuedTurns: [
        buildQueuedTurn(
          "queued-steering",
          "Being steered into the running turn",
          "2026-08-01T00:00:00.000Z",
        ),
        buildQueuedTurn(
          "queued-waiting",
          "Still waiting its turn",
          "2026-08-01T00:00:01.000Z",
        ),
      ],
    };
    const holds = new Map<string, QueuedTurnAutoDispatchHold>([
      ["queued-steering", "wait"],
    ]);
    const dispatch = createQueuedTaskTurnDispatcher({
      getSession: () => buildSessionWithDraft(draft),
      getActions: () => ({
        sendUserMessage: (args: { queuedTurnId: string }) => {
          sent.push(args);
          return Promise.resolve({ status: "started" });
        },
      }),
      getAutoDispatchHold: ({ queuedTurnId }) => holds.get(queuedTurnId),
    });

    // The head is mid-steer and that hold resolves on a deadline, so the queue
    // holds its order rather than running the user's second prompt first.
    dispatch(TARGET);
    expect(sent).toEqual([]);

    // Steer rejected: the hold lifts and the head runs, still ahead of the
    // item queued after it.
    holds.delete("queued-steering");
    dispatch(TARGET);
    await Promise.resolve();
    expect(sent.map((item) => item.queuedTurnId)).toEqual(["queued-steering"]);
  });

  test("skips an unconfirmed steer, which only a user action can clear", async () => {
    const sent: Array<{ queuedTurnId: string }> = [];
    const draft: PromptDraft = {
      text: "",
      attachedFilePaths: [],
      attachments: [],
      queuedTurns: [
        buildQueuedTurn(
          "queued-unconfirmed",
          "Delivery never acknowledged",
          "2026-08-01T00:00:00.000Z",
        ),
        buildQueuedTurn(
          "queued-waiting",
          "Still waiting its turn",
          "2026-08-01T00:00:01.000Z",
        ),
      ],
    };
    const holds = new Map<string, QueuedTurnAutoDispatchHold>([
      ["queued-unconfirmed", "skip"],
      ["queued-waiting", "skip"],
    ]);
    const dispatch = createQueuedTaskTurnDispatcher({
      getSession: () => buildSessionWithDraft(draft),
      getActions: () => ({
        sendUserMessage: (args: { queuedTurnId: string }) => {
          sent.push(args);
          return Promise.resolve({ status: "started" });
        },
      }),
      getAutoDispatchHold: ({ queuedTurnId }) => holds.get(queuedTurnId),
    });

    // Nothing dispatchable at all: the queue simply waits.
    dispatch(TARGET);
    expect(sent).toEqual([]);

    // Nothing will resolve an unconfirmed hold on its own, so the queue must
    // not stall behind it — draining moves on to the next item.
    holds.delete("queued-waiting");
    dispatch(TARGET);
    await Promise.resolve();
    expect(sent.map((item) => item.queuedTurnId)).toEqual(["queued-waiting"]);
  });

  test("never runs two dispatches for one task at once, even when completion is signalled twice", async () => {
    const sent: Array<{ queuedTurnId: string }> = [];
    let resolveFirstSend: (value: { status: string }) => void = () => {};
    const queuedTurns = [
      buildQueuedTurn("queued-1", "First", "2026-08-01T00:00:00.000Z"),
      buildQueuedTurn("queued-2", "Second", "2026-08-01T00:00:01.000Z"),
    ];
    const draft: PromptDraft = {
      text: "",
      attachedFilePaths: [],
      attachments: [],
      queuedTurns,
    };
    const dispatch = createQueuedTaskTurnDispatcher({
      getSession: () => buildSessionWithDraft(draft),
      getActions: () => ({
        sendUserMessage: (args: { queuedTurnId: string }) => {
          sent.push(args);
          // Mirror the real send: the item leaves the queue immediately, long
          // before the provider turn is registered in the store.
          draft.queuedTurns = (draft.queuedTurns ?? []).filter(
            (item) => item.id !== args.queuedTurnId,
          );
          return new Promise<{ status: string }>((resolve) => {
            resolveFirstSend = resolve;
          });
        },
      }),
      getAutoDispatchHold: () => undefined,
    });

    dispatch(TARGET);
    // Provider events and host turn sync can both report the same completion.
    // The first dispatch has not registered a turn yet, so the second signal
    // would otherwise start "queued-2" concurrently with "queued-1".
    dispatch(TARGET);
    expect(sent.map((item) => item.queuedTurnId)).toEqual(["queued-1"]);

    resolveFirstSend({ status: "started" });
    await Promise.resolve();
    await Promise.resolve();
    // The started turn owns the drain from here; its completion dispatches the
    // rest of the queue.
    expect(sent.map((item) => item.queuedTurnId)).toEqual(["queued-1"]);
  });

  test("resumes the drain when a mid-flight completion signal arrives and the send never started a turn", async () => {
    const sent: Array<{ queuedTurnId: string }> = [];
    let resolveFirstSend: (value: { status: string }) => void = () => {};
    let sendCount = 0;
    const draft: PromptDraft = {
      text: "",
      attachedFilePaths: [],
      attachments: [],
      queuedTurns: [
        buildQueuedTurn("queued-1", "First", "2026-08-01T00:00:00.000Z"),
      ],
    };
    const dispatch = createQueuedTaskTurnDispatcher({
      getSession: () => buildSessionWithDraft(draft),
      getActions: () => ({
        sendUserMessage: (args: { queuedTurnId: string }) => {
          sent.push(args);
          sendCount += 1;
          if (sendCount === 1) {
            return new Promise<{ status: string }>((resolve) => {
              resolveFirstSend = resolve;
            });
          }
          return Promise.resolve({ status: "started" });
        },
      }),
      getAutoDispatchHold: () => undefined,
    });

    dispatch(TARGET);
    dispatch(TARGET);
    // The send lost a race (a turn was already active) and put the item back,
    // so the completion seen mid-flight has to be honoured after it settles.
    resolveFirstSend({ status: "blocked" });
    await Promise.resolve();
    await Promise.resolve();
    expect(sent.map((item) => item.queuedTurnId)).toEqual([
      "queued-1",
      "queued-1",
    ]);
  });

  test("reports and retries once when the send rejects, then stops", async () => {
    const failures: Array<{ queuedTurnId: string; error: unknown }> = [];
    let sendCount = 0;
    const draft: PromptDraft = {
      text: "",
      attachedFilePaths: [],
      attachments: [],
      queuedTurns: [
        buildQueuedTurn("queued-1", "First", "2026-08-01T00:00:00.000Z"),
      ],
    };
    const dispatch = createQueuedTaskTurnDispatcher({
      getSession: () => buildSessionWithDraft(draft),
      getActions: () => ({
        sendUserMessage: () => {
          sendCount += 1;
          return Promise.reject(new Error("context resolution failed"));
        },
      }),
      getAutoDispatchHold: () => undefined,
      onDispatchFailed: ({ queuedTurnId, error }) =>
        failures.push({ queuedTurnId, error }),
    });

    dispatch(TARGET);
    // A crashed dispatch restores the item but leaves no completion event to
    // wake it, so exactly one retry runs — and a deterministic failure stops
    // there instead of spinning.
    for (let tick = 0; tick < 8; tick += 1) {
      await Promise.resolve();
    }
    expect(sendCount).toBe(2);
    expect(failures).toHaveLength(2);
    expect(failures[0]?.queuedTurnId).toBe("queued-1");
  });
});
