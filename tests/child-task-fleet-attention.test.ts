import { describe, expect, test } from "bun:test";
import {
  buildFleetAttentionProjection,
  isFleetAttentionSuppressedTask,
  type FleetLiveWorkspaceInput,
} from "@/lib/fleet/attention-projection";
import type { AppNotification } from "@/lib/notifications/notification.types";
import type { ChatMessage, Task } from "@/types/chat";

/**
 * Externally managed tasks are kept out of Fleet attention on purpose. A
 * delegated child task is the single carve-out: nothing outside Stave is
 * watching it, and its approval auto-denies if the person who owns the parent
 * never sees the request. These lock both halves — the child gets through, and
 * an ordinary externally managed task still does not.
 */

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-external",
    title: "Externally driven run",
    provider: "codex",
    updatedAt: "2026-08-10T01:00:00.000Z",
    unread: false,
    archivedAt: null,
    controlMode: "managed",
    controlOwner: "external",
    ...overrides,
  };
}

function buildChildTask(overrides: Partial<Task> = {}): Task {
  return buildTask({
    id: "task-child",
    title: "Review the checkout fix",
    parentTaskId: "task-parent",
    ...overrides,
  });
}

function buildApprovalMessage(): ChatMessage {
  return {
    id: "message-approval",
    role: "assistant",
    model: "gpt-5.6-terra",
    providerId: "codex",
    content: "",
    isStreaming: false,
    parts: [
      {
        type: "approval",
        requestId: "approval-1",
        toolName: "Bash",
        description: "run tests",
        state: "approval-requested",
      },
    ],
  };
}

function buildUserInputMessage(): ChatMessage {
  return {
    id: "message-input",
    role: "assistant",
    model: "gpt-5.6-terra",
    providerId: "codex",
    content: "",
    isStreaming: false,
    parts: [
      {
        type: "user_input",
        requestId: "input-1",
        toolName: "AskUser",
        questions: [{ id: "q1", question: "Which branch should I target?" }],
        state: "input-requested",
      },
    ],
  };
}

function buildLiveWorkspace(
  overrides: Partial<FleetLiveWorkspaceInput> = {},
): FleetLiveWorkspaceInput {
  return {
    projectPath: "/workspace/project",
    projectName: "Project",
    workspaceId: "workspace-1",
    workspaceName: "checkout",
    tasks: [],
    messagesByTask: {},
    activeTurnIdsByTask: {},
    providerTurnActivityByTask: {},
    ...overrides,
  };
}

function buildNotification(
  overrides: Partial<AppNotification> = {},
): AppNotification {
  return {
    id: "notification-1",
    kind: "task.approval_requested",
    title: "Review the checkout fix",
    body: "Bash: run tests",
    projectPath: "/workspace/project",
    projectName: "Project",
    workspaceId: "workspace-1",
    workspaceName: "checkout",
    taskId: "task-child",
    taskTitle: "Review the checkout fix",
    turnId: "turn-1",
    providerId: "codex",
    action: {
      type: "approval",
      requestId: "approval-1",
      messageId: "message-approval",
    },
    payload: {
      controlMode: "managed",
      controlOwner: "external",
      parentTaskId: "task-parent",
    },
    createdAt: "2026-08-10T00:00:00.000Z",
    readAt: null,
    resolvedAt: null,
    expiresAt: null,
    ...overrides,
  };
}

describe("isFleetAttentionSuppressedTask", () => {
  test("suppresses an externally managed task but not a delegated child", () => {
    expect(isFleetAttentionSuppressedTask(buildTask())).toBe(true);
    expect(isFleetAttentionSuppressedTask(buildChildTask())).toBe(false);
    expect(
      isFleetAttentionSuppressedTask(
        buildTask({ controlMode: "interactive", controlOwner: "stave" }),
      ),
    ).toBe(false);
  });
});

describe("a delegated child's blocked request reaches Fleet", () => {
  test("a pending question on a child produces a live user-input item", () => {
    const projection = buildFleetAttentionProjection({
      notifications: [],
      liveWorkspaces: [
        buildLiveWorkspace({
          tasks: [buildChildTask()],
          messagesByTask: { "task-child": [buildUserInputMessage()] },
        }),
      ],
      prWorkspaces: [],
    });

    expect(projection.items).toHaveLength(1);
    expect(projection.items[0]).toMatchObject({
      kind: "user-input",
      source: "live",
      // Attributed to the child, and routed to the workspace it runs in so the
      // user can open it and answer.
      taskId: "task-child",
      taskTitle: "Review the checkout fix",
      workspaceId: "workspace-1",
      requestId: "input-1",
    });
    expect(projection.blockingItems).toHaveLength(1);
  });

  test("a pending approval on a child produces a live approval item", () => {
    const projection = buildFleetAttentionProjection({
      notifications: [],
      liveWorkspaces: [
        buildLiveWorkspace({
          tasks: [buildChildTask()],
          messagesByTask: { "task-child": [buildApprovalMessage()] },
        }),
      ],
      prWorkspaces: [],
    });

    expect(projection.items).toHaveLength(1);
    expect(projection.items[0]).toMatchObject({
      kind: "approval",
      source: "live",
      taskId: "task-child",
      requestId: "approval-1",
    });
  });

  test("a child's approval notification survives on its own", () => {
    const projection = buildFleetAttentionProjection({
      notifications: [buildNotification()],
      liveWorkspaces: [],
      prWorkspaces: [],
    });

    expect(projection.items).toHaveLength(1);
    expect(projection.items[0]).toMatchObject({
      kind: "approval",
      source: "notification",
      taskId: "task-child",
      requestId: "approval-1",
    });
  });

  test("a child's notification is not dropped by the live external-task sweep", () => {
    // Both blockers at once: the notification carries the parent link, and the
    // live task it belongs to is externally managed.
    const projection = buildFleetAttentionProjection({
      notifications: [buildNotification()],
      liveWorkspaces: [buildLiveWorkspace({ tasks: [buildChildTask()] })],
      prWorkspaces: [],
    });

    expect(projection.items).toHaveLength(1);
    expect(projection.items[0]).toMatchObject({
      kind: "approval",
      taskId: "task-child",
    });
  });

  test("a child's user-input notification survives too", () => {
    const projection = buildFleetAttentionProjection({
      notifications: [
        buildNotification({
          id: "notification-input",
          kind: "task.user_input_requested",
          action: null,
          payload: {
            controlMode: "managed",
            controlOwner: "external",
            parentTaskId: "task-parent",
            requestId: "input-1",
          },
        }),
      ],
      liveWorkspaces: [buildLiveWorkspace({ tasks: [buildChildTask()] })],
      prWorkspaces: [],
    });

    expect(projection.items).toHaveLength(1);
    expect(projection.items[0]).toMatchObject({
      kind: "user-input",
      taskId: "task-child",
      requestId: "input-1",
    });
  });
});

describe("the carve-out does not weaken the general rule", () => {
  test("a non-child externally managed task still produces nothing live", () => {
    const projection = buildFleetAttentionProjection({
      notifications: [],
      liveWorkspaces: [
        buildLiveWorkspace({
          tasks: [buildTask()],
          messagesByTask: {
            "task-external": [buildUserInputMessage(), buildApprovalMessage()],
          },
          activeTurnIdsByTask: { "task-external": "turn-1" },
        }),
      ],
      prWorkspaces: [],
    });

    expect(projection.items).toHaveLength(0);
  });

  test("a non-child externally managed notification is still dropped", () => {
    const projection = buildFleetAttentionProjection({
      notifications: [
        buildNotification({
          taskId: "task-external",
          payload: { controlMode: "managed", controlOwner: "external" },
        }),
      ],
      liveWorkspaces: [],
      prWorkspaces: [],
    });

    expect(projection.items).toHaveLength(0);
  });

  test("a notification payload with a blank parent link stays suppressed", () => {
    const projection = buildFleetAttentionProjection({
      notifications: [
        buildNotification({
          taskId: "task-external",
          payload: {
            controlMode: "managed",
            controlOwner: "external",
            parentTaskId: "   ",
          },
        }),
      ],
      liveWorkspaces: [],
      prWorkspaces: [],
    });

    expect(projection.items).toHaveLength(0);
  });

  test("an archived child is still closed, carve-out or not", () => {
    const projection = buildFleetAttentionProjection({
      notifications: [buildNotification()],
      liveWorkspaces: [
        buildLiveWorkspace({
          tasks: [buildChildTask({ archivedAt: "2026-08-10T02:00:00.000Z" })],
          messagesByTask: { "task-child": [buildApprovalMessage()] },
        }),
      ],
      prWorkspaces: [],
    });

    expect(projection.items).toHaveLength(0);
  });
});
