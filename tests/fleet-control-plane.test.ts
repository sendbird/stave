import { describe, expect, it } from "bun:test";
import {
  resolveFleetCurrentTaskControlState,
  validateFleetInteractionAction,
  validateFleetQueueAction,
  validateFleetTurnAction,
} from "@/lib/fleet/control-plane";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";
import type { ChatMessage, Task } from "@/types/chat";

const task: Task = {
  id: "task-1",
  title: "Control Fleet",
  provider: "codex",
  updatedAt: "2026-07-31T00:00:00.000Z",
  unread: false,
  controlMode: "interactive",
  controlOwner: "stave",
};

const questionMessage: ChatMessage = {
  id: "message-1",
  role: "assistant",
  model: "gpt-5.6",
  providerId: "codex",
  content: "",
  parts: [
    {
      type: "user_input",
      requestId: "request-1",
      toolName: "request_user_input",
      questions: [
        {
          question: "Which option?",
          header: "Option",
          options: [],
        },
      ],
      state: "input-requested",
    },
  ],
};

function buildSession(): WorkspaceSessionState {
  return {
    activeTaskId: task.id,
    tasks: [task],
    messagesByTask: { [task.id]: [questionMessage] },
    messageCountByTask: { [task.id]: 1 },
    promptDraftByTask: {},
    workspaceInformation: {
      summary: "",
      notes: "",
      todos: [],
      links: [],
      customFields: [],
      resources: [],
    },
    editorTabs: [],
    activeEditorTabId: null,
    terminalTabs: [],
    activeTerminalTabId: null,
    terminalDocked: false,
    cliSessionTabs: [],
    activeCliSessionTabId: null,
    activeSurface: { kind: "task", taskId: task.id },
    openTaskTabIds: [task.id],
    lensTabs: [],
    paneTabMeta: {},
    dockLayout: null,
    activeTurnIdsByTask: { [task.id]: "turn-1" },
    providerSessionByTask: {},
    providerGoalByTask: {},
    nativeSessionReadyByTask: {},
  };
}

describe("Fleet control-plane identity validation", () => {
  it("resolves an inactive workspace from the runtime cache", () => {
    const session = buildSession();
    const current = resolveFleetCurrentTaskControlState({
      expected: {
        projectPath: "/repo",
        workspaceId: "workspace-1",
        taskId: task.id,
        turnId: "turn-1",
      },
      state: {
        projectPath: "/other",
        activeWorkspaceId: "workspace-other",
        workspaces: [],
        recentProjects: [
          {
            projectPath: "/repo",
            projectName: "repo",
            lastOpenedAt: "2026-07-31T00:00:00.000Z",
            defaultBranch: "main",
            workspaces: [{ id: "workspace-1", name: "feature" }],
            activeWorkspaceId: "workspace-1",
            workspaceBranchById: {},
            workspacePathById: {},
            workspaceDefaultById: {},
          },
        ],
        tasks: [],
        messagesByTask: {},
        activeTurnIdsByTask: {},
        workspaceRuntimeCacheById: { "workspace-1": session },
        taskWorkspaceIdById: { [task.id]: "workspace-1" },
      },
    });

    expect(current.turnId).toBe("turn-1");
    expect(current.messages).toEqual([questionMessage]);
  });

  it("accepts the exact pending request and returns its fresh message id", () => {
    const validation = validateFleetInteractionAction({
      expected: {
        projectPath: "/repo",
        workspaceId: "workspace-1",
        taskId: task.id,
        turnId: "turn-1",
        kind: "user-input",
        requestId: "request-1",
      },
      current: {
        projectPath: "/repo",
        workspaceId: "workspace-1",
        taskId: task.id,
        turnId: "turn-1",
        messages: [questionMessage],
      },
    });

    expect(validation).toEqual({ ok: true, messageId: "message-1" });
  });

  it("rejects a stale interaction and a replaced turn", () => {
    expect(
      validateFleetInteractionAction({
        expected: {
          projectPath: "/repo",
          workspaceId: "workspace-1",
          taskId: task.id,
          turnId: "turn-1",
          kind: "user-input",
          requestId: "expired",
        },
        current: {
          projectPath: "/repo",
          workspaceId: "workspace-1",
          taskId: task.id,
          turnId: "turn-1",
          messages: [questionMessage],
        },
      }).ok,
    ).toBe(false);
    expect(
      validateFleetTurnAction({
        expected: {
          projectPath: "/repo",
          workspaceId: "workspace-1",
          taskId: task.id,
          turnId: "turn-1",
        },
        current: {
          projectPath: "/repo",
          workspaceId: "workspace-1",
          taskId: task.id,
          turnId: "turn-2",
          messages: [],
        },
      }).ok,
    ).toBe(false);
  });

  it("rejects queueing when the displayed turn has already ended", () => {
    expect(
      validateFleetQueueAction({
        expected: {
          projectPath: "/repo",
          workspaceId: "workspace-1",
          taskId: task.id,
          turnId: "turn-1",
        },
        current: {
          projectPath: "/repo",
          workspaceId: "workspace-1",
          taskId: task.id,
          turnId: null,
          messages: [],
        },
      }),
    ).toMatchObject({ ok: false });
  });
});
