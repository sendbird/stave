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
    })({ workspaceId: "ws-1", taskId: "task-1" });

    createQueuedTaskTurnDispatcher({
      getSession: () => null,
      getActions: () => actions,
    })({ workspaceId: "ws-1", taskId: "task-1" });

    expect(sent).toEqual([]);
  });
});
