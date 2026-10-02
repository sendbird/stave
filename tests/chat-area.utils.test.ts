import { describe, expect, test } from "bun:test";
import {
  resolveChatAreaViewMode,
  resolveHydratingRepositoryCopy,
} from "@/components/session/chat-area.utils";
import { buildOutgoingUserMessage } from "@/store/chat-state-helpers";
import {
  beginPendingAgentRun,
  beginPendingAutoRoute,
  handOverPendingAgentRun,
  holdsComposerTurn,
  selectHasPendingSend,
  usePendingAutoRoutingStore,
} from "@/store/pending-auto-routing-store";

describe("chat area loading copy", () => {
  test("uses legacy cleanup messaging while persistence bootstrap is purging", () => {
    const copy = resolveHydratingRepositoryCopy({
      persistenceBootstrapPhase: "purging-legacy-turn-journal",
      persistenceBootstrapMessage:
        "Cleaning up legacy workspace data from a previous version. This only runs once.",
    });

    expect(copy).toEqual({
      title: "Preparing local data",
      description:
        "Cleaning up legacy workspace data from a previous version. This only runs once.",
    });
  });

  test("uses default workspace opening copy when no bootstrap cleanup is active", () => {
    const copy = resolveHydratingRepositoryCopy({
      persistenceBootstrapPhase: "idle",
      persistenceBootstrapMessage: "",
    });

    expect(copy).toEqual({
      title: "Opening workspace",
      description: "Loading tasks and recent conversation state for this repository.",
    });
  });
});

describe("chat area view mode", () => {
  test("reports hydrating_project while workspaces are still hydrating", () => {
    expect(
      resolveChatAreaViewMode({
        repositoryPath: "/tmp/project",
        hasHydratedWorkspaces: false,
        hasAnyWorkspace: false,
        hasSelectedWorkspace: false,
        hasSelectedTask: false,
        activeTaskMessageCount: 0,
      }),
    ).toBe("hydrating_project");
  });

  test("a new task's first prompt replaces the start screen before it is a message", () => {
    const base = {
      repositoryPath: "/tmp/project",
      hasHydratedWorkspaces: true,
      hasAnyWorkspace: true,
      hasSelectedWorkspace: true,
      hasSelectedTask: true,
      activeTaskMessageCount: 0,
    };
    expect(resolveChatAreaViewMode(base)).toBe("empty_task");
    // Waiting on Auto's classifier, or failed to send: the transcript draws it.
    expect(resolveChatAreaViewMode({ ...base, hasUnsentPrompt: true })).toBe(
      "conversation",
    );
  });

  test("an Agent-mode prompt waiting on its run counts as unsent, without holding the composer", () => {
    usePendingAutoRoutingStore.setState({ byTaskId: {} });
    expect(selectHasPendingSend(usePendingAutoRoutingStore.getState(), "task-1")).toBe(false);
    beginPendingAgentRun({
      id: "agent-run:1",
      taskId: "task-1",
      startedAt: 0,
      userMessage: buildOutgoingUserMessage({ id: "pending-agent-run:1", content: "Add CSV export." }),
    });
    const state = usePendingAutoRoutingStore.getState();
    expect(selectHasPendingSend(state, "task-1")).toBe(true);
    expect(holdsComposerTurn(state.byTaskId["task-1"])).toBe(false);
    expect(
      resolveChatAreaViewMode({
        repositoryPath: "/tmp/project",
        hasHydratedWorkspaces: true,
        hasAnyWorkspace: true,
        hasSelectedWorkspace: true,
        hasSelectedTask: true,
        activeTaskMessageCount: 0,
        hasUnsentPrompt: selectHasPendingSend(state, "task-1"),
      }),
    ).toBe("conversation");
    // A refused run hands its row to the single turn's send, which Auto may then begin again.
    handOverPendingAgentRun({ taskId: "task-1", id: "agent-run:1", turnId: "turn-1" });
    expect(holdsComposerTurn(usePendingAutoRoutingStore.getState().byTaskId["task-1"])).toBe(true);
    expect(
      beginPendingAutoRoute({
        id: "turn-1",
        taskId: "task-1",
        startedAt: 1,
        userMessage: buildOutgoingUserMessage({ id: "pending-auto-route:turn-1", content: "Add CSV export." }),
      }),
    ).toBe(true);
    expect(beginPendingAgentRun({ id: "agent-run:2", taskId: "task-1", startedAt: 2, userMessage: state.byTaskId["task-1"]!.userMessage })).toBe(false);
    usePendingAutoRoutingStore.setState({ byTaskId: {} });
  });
});
