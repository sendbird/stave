import { describe, expect, test } from "bun:test";
import { createQueuedTaskTurnDispatcher } from "@/store/queued-task-turn-dispatch";
import {
  createQueuedTurnEditActions,
  createQueuedTurnEditHolds,
} from "@/store/queued-turn-edit-holds";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";

function sessionWithQueue(
  items: Array<{ id: string; content: string }>,
): WorkspaceSessionState {
  return {
    activeTurnIdsByTask: {},
    promptDraftByTask: {
      "task-1": {
        text: "",
        attachedFilePaths: [],
        attachments: [],
        queuedTurns: items.map((item) => ({
          ...item,
          queuedAt: "2026-10-21T00:00:00.000Z",
        })),
      },
    },
  } as unknown as WorkspaceSessionState;
}

describe("queued turn edit holds", () => {
  test("a held item is not auto-dispatched and keeps its place", () => {
    const holds = createQueuedTurnEditHolds();
    const sent: string[] = [];
    let session = sessionWithQueue([
      { id: "q-1", content: "original text" },
      { id: "q-2", content: "second" },
    ]);
    const dispatch = createQueuedTaskTurnDispatcher({
      getSession: () => session,
      getActions: () => ({
        sendUserMessage: (args) => {
          sent.push(args.content);
          return { status: "started" };
        },
      }),
      getAutoDispatchHold: (target) => holds.getAutoDispatchHold(target),
    });

    holds.hold({ workspaceId: "ws-1", taskId: "task-1", queuedTurnId: "q-1" });
    dispatch({ workspaceId: "ws-1", taskId: "task-1" });
    expect(sent).toEqual([]);

    // Save replaces the content, then the release drains the edited text.
    session = sessionWithQueue([
      { id: "q-1", content: "edited text" },
      { id: "q-2", content: "second" },
    ]);
    expect(holds.release({ taskId: "task-1", queuedTurnId: "q-1" })).toEqual({
      workspaceId: "ws-1",
      suppressedDispatch: true,
    });
    dispatch({ workspaceId: "ws-1", taskId: "task-1" });
    expect(sent).toEqual(["edited text"]);
  });

  test("editing a later item does not hold the head", () => {
    const holds = createQueuedTurnEditHolds();
    const sent: string[] = [];
    const session = sessionWithQueue([
      { id: "q-1", content: "head" },
      { id: "q-2", content: "being edited" },
    ]);
    const dispatch = createQueuedTaskTurnDispatcher({
      getSession: () => session,
      getActions: () => ({
        sendUserMessage: (args) => {
          sent.push(args.content);
          return { status: "started" };
        },
      }),
      getAutoDispatchHold: (target) => holds.getAutoDispatchHold(target),
    });

    holds.hold({ workspaceId: "ws-1", taskId: "task-1", queuedTurnId: "q-2" });
    dispatch({ workspaceId: "ws-1", taskId: "task-1" });
    expect(sent).toEqual(["head"]);
  });

  test("release of an unknown hold reports no workspace", () => {
    const holds = createQueuedTurnEditHolds();
    expect(holds.release({ taskId: "task-1", queuedTurnId: "missing" })).toBeNull();
  });
  test("releasing an edit drains only after it stopped a send, in its own workspace", () => {
    const holds = createQueuedTurnEditHolds();
    let activeWorkspaceId = "ws-1";
    const drained: Array<{ workspaceId: string; taskId: string }> = [];
    const actions = createQueuedTurnEditActions({
      holds,
      get: () => ({ activeWorkspaceId }),
      drain: (target) => drained.push(target),
    });
    const target = { taskId: "task-1", queuedTurnId: "q-1" };

    // Open and close without a turn completing: nothing was held back.
    actions.holdQueuedTurnForEdit(target);
    actions.releaseQueuedTurnEditHold(target);
    expect(drained).toEqual([]);

    // A turn completes mid-edit (the dispatcher asks and is told to wait),
    // and the user has moved to another workspace before saving.
    actions.holdQueuedTurnForEdit(target);
    expect(holds.getAutoDispatchHold(target)).toBe("wait");
    activeWorkspaceId = "ws-2";
    actions.releaseQueuedTurnEditHold(target);
    expect(drained).toEqual([{ workspaceId: "ws-1", taskId: "task-1" }]);
    expect(holds.getAutoDispatchHold(target)).toBeUndefined();

    // Released again: a no-op.
    actions.releaseQueuedTurnEditHold(target);
    expect(drained).toHaveLength(1);
  });

  test("an item emptied away mid-edit does not strand the queue behind it", () => {
    const holds = createQueuedTurnEditHolds();
    const sent: string[] = [];
    let session = sessionWithQueue([
      { id: "q-1", content: "first" },
      { id: "q-2", content: "second" },
    ]);
    const dispatch = createQueuedTaskTurnDispatcher({
      getSession: () => session,
      getActions: () => ({
        sendUserMessage: (args) => {
          sent.push(args.content);
          return { status: "started" };
        },
      }),
      getAutoDispatchHold: (target) => holds.getAutoDispatchHold(target),
    });
    const actions = createQueuedTurnEditActions({
      holds,
      get: () => ({ activeWorkspaceId: "ws-1" }),
      drain: (target) => dispatch(target),
    });
    const target = { taskId: "task-1", queuedTurnId: "q-1" };

    actions.holdQueuedTurnForEdit(target);
    // The running turn completes while q-1 is open: the queue waits.
    dispatch({ workspaceId: "ws-1", taskId: "task-1" });
    expect(sent).toEqual([]);
    // Saving an empty edit removes q-1; closing the editor must resume q-2.
    session = sessionWithQueue([{ id: "q-2", content: "second" }]);
    actions.releaseQueuedTurnEditHold(target);
    expect(sent).toEqual(["second"]);
  });
});
