import { describe, expect, test } from "bun:test";
import { createQueuedTaskTurnDispatcher } from "@/store/queued-task-turn-dispatch";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";
import type { PromptDraft } from "@/types/chat";

function buildSessionWithDraft(draft: PromptDraft | undefined) {
  return {
    promptDraftByTask: draft ? { "task-1": draft } : {},
  } as unknown as WorkspaceSessionState;
}

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
      blocksAutoDispatch: () => false,
    });

    dispatch({ workspaceId: "ws-1", taskId: "task-1" });

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
      blocksAutoDispatch: () => false,
    })({ workspaceId: "ws-1", taskId: "task-1" });

    createQueuedTaskTurnDispatcher({
      getSession: () => null,
      getActions: () => actions,
      blocksAutoDispatch: () => false,
    })({ workspaceId: "ws-1", taskId: "task-1" });

    expect(sent).toEqual([]);
  });

  test("skips items reserved by an in-flight steer so an accepted steer never runs twice", () => {
    const sent: Array<{ queuedTurnId: string }> = [];
    const draft: PromptDraft = {
      text: "",
      attachedFilePaths: [],
      attachments: [],
      queuedTurns: [
        {
          id: "queued-steering",
          queuedAt: "2026-08-01T00:00:00.000Z",
          content: "Being steered into the running turn",
          attachedFilePaths: [],
          attachments: [],
        },
        {
          id: "queued-waiting",
          queuedAt: "2026-08-01T00:00:01.000Z",
          content: "Still waiting its turn",
          attachedFilePaths: [],
          attachments: [],
        },
      ],
    };
    const actions = {
      sendUserMessage: (args: { queuedTurnId: string }) => {
        sent.push(args);
        return Promise.resolve({ status: "started" });
      },
    };
    const reserved = new Set(["queued-steering"]);
    const dispatch = createQueuedTaskTurnDispatcher({
      getSession: () => buildSessionWithDraft(draft),
      getActions: () => actions,
      blocksAutoDispatch: ({ queuedTurnId }) => reserved.has(queuedTurnId),
    });

    // The head is mid-steer: the turn that just settled must not start it as a
    // fresh turn, so draining moves on to the next unreserved item.
    dispatch({ workspaceId: "ws-1", taskId: "task-1" });
    expect(sent.map((item) => item.queuedTurnId)).toEqual(["queued-waiting"]);

    // Nothing dispatchable at all: the queue simply waits.
    reserved.add("queued-waiting");
    dispatch({ workspaceId: "ws-1", taskId: "task-1" });
    expect(sent.map((item) => item.queuedTurnId)).toEqual(["queued-waiting"]);
  });
});
