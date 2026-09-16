import { describe, expect, test } from "bun:test";
import { createEmptyWorkspaceInformation } from "@/lib/workspace-information";
import {
  applyHostTaskTurnSync,
  restoreActiveTurnStreaming,
} from "@/store/host-task-turn-sync";
import {
  createEmptyWorkspaceState,
  type WorkspaceSessionState,
} from "@/store/workspace-session-state";
import type { Task } from "@/types/chat";

function buildTask(overrides: Partial<Task> & Pick<Task, "id">): Task {
  return {
    title: overrides.id,
    provider: "claude-code",
    updatedAt: "2026-03-10T00:00:00.000Z",
    unread: false,
    archivedAt: null,
    controlMode: "managed",
    controlOwner: "external",
    ...overrides,
  };
}

function emptySession(
  overrides: Partial<WorkspaceSessionState> = {},
): WorkspaceSessionState {
  return {
    ...createEmptyWorkspaceState(),
    activeTurnIdsByTask: {},
    nativeSessionReadyByTask: {},
    workspaceInformation: createEmptyWorkspaceInformation(),
    ...overrides,
  };
}

function buildState(args: {
  activeWorkspaceId?: string;
  session: WorkspaceSessionState;
  cache?: Record<string, WorkspaceSessionState>;
}) {
  const session = args.session;
  return {
    activeWorkspaceId: args.activeWorkspaceId ?? "ws-active",
    activeTaskId: session.activeTaskId,
    tasks: session.tasks,
    messagesByTask: session.messagesByTask,
    messageCountByTask: session.messageCountByTask,
    promptDraftByTask: session.promptDraftByTask,
    reviewCommentsByTask: session.reviewCommentsByTask,
    workspaceInformation: session.workspaceInformation,
    editorTabs: session.editorTabs,
    activeEditorTabId: session.activeEditorTabId,
    terminalTabs: session.terminalTabs,
    activeTerminalTabId: session.activeTerminalTabId,
    cliSessionTabs: session.cliSessionTabs,
    activeCliSessionTabId: session.activeCliSessionTabId,
    activeSurface: session.activeSurface,
    openTaskTabIds: session.openTaskTabIds,
    lensTabs: session.lensTabs,
    paneTabMeta: session.paneTabMeta,
    dockLayout: session.dockLayout,
    activeTurnIdsByTask: session.activeTurnIdsByTask,
    providerSessionByTask: session.providerSessionByTask,
    providerGoalByTask: session.providerGoalByTask,
    nativeSessionReadyByTask: session.nativeSessionReadyByTask,
    layout: { terminalDocked: session.terminalDocked },
    hostOwnedTurnIdsByTask: {},
    workspaceRuntimeCacheById: args.cache ?? {},
    taskWorkspaceIdById: {},
    providerTurnActivityByTask: {},
    retainedTurnActivityByTask: {},
    advisorExchangeByTask: {},
    advisorConsultLogByTask: {},
    workspaceSnapshotVersion: 4,
  };
}

function buildUpdate(args: { workspaceId?: string; taskId: string }) {
  return {
    workspaceId: args.workspaceId ?? "ws-active",
    taskId: args.taskId,
    turnId: "turn-1",
    providerId: "claude-code" as const,
    model: "claude-sonnet-4-5",
    sequence: 0,
    eventType: "started" as const,
    done: false,
  };
}

describe("applyHostTaskTurnSync", () => {
  test("opens and activates a tab for a host-created managed task", () => {
    const existing = buildTask({
      id: "task-existing",
      controlMode: "interactive",
      controlOwner: "stave",
    });
    const created = buildTask({ id: "task-created" });
    const result = applyHostTaskTurnSync({
      state: buildState({
        session: emptySession({
          activeTaskId: existing.id,
          tasks: [existing],
          openTaskTabIds: [existing.id],
          activeSurface: { kind: "task", taskId: existing.id },
        }),
      }),
      loaded: {
        persistedSession: emptySession({
          activeTaskId: created.id,
          tasks: [created, existing],
          openTaskTabIds: [existing.id],
          activeTurnIdsByTask: { [created.id]: "turn-1" },
        }),
        persistedActiveTurnId: "turn-1",
        messages: [],
        messageCount: 1,
      },
      update: buildUpdate({ taskId: created.id }),
    });

    expect(result.statePatch.openTaskTabIds).toEqual([
      existing.id,
      created.id,
    ]);
    expect(result.statePatch.activeTaskId).toBe(created.id);
    expect(result.statePatch.activeSurface).toEqual({
      kind: "task",
      taskId: created.id,
    });
    expect(result.statePatch.activeAppSurface).toEqual({ kind: "workspace" });
    expect(result.statePatch.workspaceSnapshotVersion).toBe(5);
    expect(result.syncedSession.tasks.map((task) => task.id)).toEqual([
      created.id,
      existing.id,
    ]);
  });

  test("does not reopen a closed tab on later host events for the same task", () => {
    const existing = buildTask({ id: "task-existing" });
    const result = applyHostTaskTurnSync({
      state: buildState({
        session: emptySession({
          activeTaskId: "",
          tasks: [existing],
          openTaskTabIds: [],
          activeSurface: { kind: "task", taskId: "" },
          activeTurnIdsByTask: { [existing.id]: "turn-1" },
        }),
      }),
      loaded: {
        persistedSession: emptySession({
          tasks: [existing],
          openTaskTabIds: [],
          activeTurnIdsByTask: { [existing.id]: "turn-1" },
        }),
        persistedActiveTurnId: "turn-1",
        messages: [],
        messageCount: 2,
      },
      update: buildUpdate({ taskId: existing.id }),
    });

    expect(result.statePatch.openTaskTabIds).toBeUndefined();
    expect(result.statePatch.activeTaskId).toBeUndefined();
    expect(result.statePatch.workspaceSnapshotVersion).toBeUndefined();
  });

  test("does not steal the active workspace when a background workspace gets a new task", () => {
    const local = buildTask({
      id: "task-local",
      controlMode: "interactive",
      controlOwner: "stave",
    });
    const created = buildTask({ id: "task-background" });
    const result = applyHostTaskTurnSync({
      state: buildState({
        activeWorkspaceId: "ws-active",
        session: emptySession({
          activeTaskId: local.id,
          tasks: [local],
          openTaskTabIds: [local.id],
          activeSurface: { kind: "task", taskId: local.id },
        }),
      }),
      loaded: {
        persistedSession: emptySession({
          tasks: [created],
          openTaskTabIds: [],
          activeTurnIdsByTask: { [created.id]: "turn-1" },
        }),
        persistedActiveTurnId: "turn-1",
        messages: [],
        messageCount: 1,
      },
      update: buildUpdate({
        workspaceId: "ws-background",
        taskId: created.id,
      }),
    });

    expect(result.statePatch.openTaskTabIds).toBeUndefined();
    expect(result.statePatch.activeTaskId).toBeUndefined();
    expect(
      result.statePatch.workspaceRuntimeCacheById?.["ws-background"]
        ?.openTaskTabIds,
    ).toEqual([created.id]);
    expect(
      result.statePatch.workspaceRuntimeCacheById?.["ws-background"]
        ?.activeTaskId,
    ).toBe(created.id);
  });

  test("reopens the live assistant bubble after snapshot sealing", () => {
    const task = buildTask({ id: "task-managed" });
    const sealedAssistant = {
      id: "msg-assistant",
      role: "assistant" as const,
      model: "claude-sonnet",
      providerId: "claude-code" as const,
      content: "Inspecting the repo.",
      turnId: "turn-1",
      isStreaming: false,
      parts: [
        {
          type: "text" as const,
          text: "Inspecting the repo.",
          segmentId: "commentary-1",
        },
      ],
    };
    const result = applyHostTaskTurnSync({
      state: buildState({
        session: emptySession({
          activeTaskId: task.id,
          tasks: [task],
          openTaskTabIds: [task.id],
          activeSurface: { kind: "task", taskId: task.id },
          activeTurnIdsByTask: { [task.id]: "turn-1" },
        }),
      }),
      loaded: {
        persistedSession: emptySession({
          activeTaskId: task.id,
          tasks: [task],
          openTaskTabIds: [task.id],
          activeTurnIdsByTask: { [task.id]: "turn-1" },
        }),
        persistedActiveTurnId: "turn-1",
        messages: [sealedAssistant],
        messageCount: 1,
      },
      update: buildUpdate({ taskId: task.id }),
    });

    expect(result.statePatch.messagesByTask?.[task.id]?.[0]).toMatchObject({
      id: "msg-assistant",
      isStreaming: true,
    });
  });

  test("does not reopen a finished turn after the host reports done", () => {
    const task = buildTask({ id: "task-managed" });
    const finishedAssistant = {
      id: "msg-assistant",
      role: "assistant" as const,
      model: "claude-sonnet",
      providerId: "claude-code" as const,
      content: "Patched the issue.",
      turnId: "turn-1",
      completedAt: "2026-03-10T00:01:00.000Z",
      isStreaming: false,
      parts: [
        {
          type: "text" as const,
          text: "Patched the issue.",
          segmentId: "final-1",
        },
      ],
    };
    const result = applyHostTaskTurnSync({
      state: buildState({
        session: emptySession({
          activeTaskId: task.id,
          tasks: [task],
          openTaskTabIds: [task.id],
          activeSurface: { kind: "task", taskId: task.id },
          activeTurnIdsByTask: { [task.id]: "turn-1" },
        }),
      }),
      loaded: {
        persistedSession: emptySession({
          activeTaskId: task.id,
          tasks: [task],
          openTaskTabIds: [task.id],
          activeTurnIdsByTask: {},
        }),
        persistedActiveTurnId: undefined,
        messages: [finishedAssistant],
        messageCount: 1,
      },
      update: {
        ...buildUpdate({ taskId: task.id }),
        eventType: "done",
        done: true,
      },
    });

    expect(result.statePatch.messagesByTask?.[task.id]?.[0]).toMatchObject({
      id: "msg-assistant",
      isStreaming: false,
    });
  });
});

describe("restoreActiveTurnStreaming", () => {
  const commentary = {
    id: "msg-interim",
    role: "assistant" as const,
    model: "claude-sonnet",
    providerId: "claude-code" as const,
    content: "Inspecting the repo.",
    turnId: "turn-1",
    isStreaming: false,
    parts: [{ type: "text" as const, text: "Inspecting the repo." }],
  };

  test("leaves a sealed prior plan bubble closed", () => {
    const plan = {
      ...commentary,
      id: "msg-plan",
      completedAt: "2026-03-10T00:00:30.000Z",
      isPlanResponse: true,
    };
    const followUp = {
      ...commentary,
      id: "msg-follow-up",
    };
    const restored = restoreActiveTurnStreaming({
      messages: [plan, followUp],
      activeTurnId: "turn-1",
    });

    expect(restored[0]).toBe(plan);
    expect(restored[1]).toMatchObject({ id: "msg-follow-up", isStreaming: true });
  });

  test("does not reopen an assistant from a different turn", () => {
    const previous = {
      ...commentary,
      turnId: "turn-0",
    };
    expect(
      restoreActiveTurnStreaming({
        messages: [previous],
        activeTurnId: "turn-1",
      }),
    ).toEqual([previous]);
  });
});
