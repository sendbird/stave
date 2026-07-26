import { describe, expect, test } from "bun:test";
import {
  buildFleetAttentionProjection,
  collectFleetNotificationNeeds,
  mapFleetPrNeedKind,
  type FleetLiveWorkspaceInput,
} from "../src/lib/fleet/attention-projection";
import type { AppNotification } from "../src/lib/notifications/notification.types";
import type { ChatMessage, Task } from "../src/types/chat";

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Review checkout",
    provider: "codex",
    updatedAt: "2026-07-26T01:00:00.000Z",
    unread: false,
    archivedAt: null,
    controlMode: "interactive",
    controlOwner: "stave",
    ...overrides,
  };
}

function buildAssistantMessage(
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: "message-1",
    role: "assistant",
    model: "gpt-5.6-terra",
    providerId: "codex",
    content: "",
    isStreaming: false,
    parts: [],
    ...overrides,
  };
}

function buildNotification(
  overrides: Partial<AppNotification> = {},
): AppNotification {
  return {
    id: "notification-1",
    kind: "task.approval_requested",
    title: "Review checkout",
    body: "Bash: run tests",
    projectPath: "/workspace/project",
    projectName: "Project",
    workspaceId: "workspace-1",
    workspaceName: "checkout",
    taskId: "task-1",
    taskTitle: "Review checkout",
    turnId: "turn-1",
    providerId: "codex",
    action: {
      type: "approval",
      requestId: "approval-1",
      messageId: "message-1",
    },
    payload: {},
    createdAt: "2026-07-26T00:00:00.000Z",
    readAt: null,
    resolvedAt: null,
    expiresAt: null,
    ...overrides,
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
    tasks: [buildTask()],
    messagesByTask: {},
    activeTurnIdsByTask: {},
    providerTurnActivityByTask: {},
    ...overrides,
  };
}

describe("Fleet attention projection", () => {
  test("keeps unresolved cold approval notifications even when read", () => {
    const projection = buildFleetAttentionProjection({
      notifications: [
        buildNotification({
          readAt: "2026-07-26T00:30:00.000Z",
        }),
      ],
      liveWorkspaces: [],
      prWorkspaces: [],
    });

    expect(projection.items).toHaveLength(1);
    expect(projection.items[0]).toMatchObject({
      kind: "approval",
      source: "notification",
      workspaceId: "workspace-1",
      requestId: "approval-1",
    });
  });

  test("deduplicates live and notification interactions while preserving actions", () => {
    const approvalMessage = buildAssistantMessage({
      parts: [
        {
          type: "approval",
          requestId: "approval-1",
          toolName: "Bash",
          description: "run tests",
          state: "approval-requested",
        },
      ],
    });
    const projection = buildFleetAttentionProjection({
      notifications: [buildNotification()],
      liveWorkspaces: [
        buildLiveWorkspace({
          messagesByTask: { "task-1": [approvalMessage] },
          activeTurnIdsByTask: { "task-1": "turn-1" },
        }),
      ],
      prWorkspaces: [],
    });

    expect(projection.items).toHaveLength(1);
    expect(projection.items[0]).toMatchObject({
      id: "interaction:approval:workspace-1:task-1:approval-1",
      source: "live",
      notificationId: "notification-1",
      turnId: "turn-1",
    });
  });

  test("drops resolved interactions and read terminal notifications", () => {
    const needs = collectFleetNotificationNeeds([
      buildNotification({
        id: "resolved",
        resolvedAt: "2026-07-26T01:00:00.000Z",
      }),
      buildNotification({
        id: "read-failure",
        kind: "task.turn_failed",
        action: null,
        readAt: "2026-07-26T01:00:00.000Z",
      }),
      buildNotification({
        id: "unread-result",
        kind: "task.turn_completed",
        action: null,
        turnId: "turn-result",
      }),
    ]);

    expect(needs).toHaveLength(1);
    expect(needs[0]).toMatchObject({
      kind: "result-ready",
      notificationId: "unread-result",
      turnId: "turn-result",
    });
  });

  test("orders input, approval, failure, PR blockers, results, and merge readiness", () => {
    const projection = buildFleetAttentionProjection({
      notifications: [
        buildNotification({
          id: "approval",
        }),
        buildNotification({
          id: "input",
          kind: "task.user_input_requested",
          action: null,
          payload: { requestId: "input-1" },
        }),
        buildNotification({
          id: "failure",
          kind: "task.turn_failed",
          action: null,
          turnId: "turn-failure",
        }),
        buildNotification({
          id: "result",
          kind: "task.turn_completed",
          action: null,
          turnId: "turn-result",
        }),
      ],
      liveWorkspaces: [],
      prWorkspaces: [
        {
          projectPath: "/workspace/project",
          projectName: "Project",
          workspaceId: "workspace-pr-blocker",
          workspaceName: "blocker",
          status: "checks_failed",
          url: "https://example.test/pr/1",
          updatedAt: "2026-07-26T00:00:00.000Z",
        },
        {
          projectPath: "/workspace/project",
          projectName: "Project",
          workspaceId: "workspace-pr-ready",
          workspaceName: "ready",
          status: "ready_to_merge",
          url: "https://example.test/pr/2",
          updatedAt: "2026-07-26T00:00:00.000Z",
        },
      ],
    });

    expect(projection.items.map((item) => item.kind)).toEqual([
      "user-input",
      "approval",
      "run-failed",
      "pr-checks-failed",
      "result-ready",
      "pr-ready-to-merge",
    ]);
  });

  test("excludes archived live tasks", () => {
    const projection = buildFleetAttentionProjection({
      notifications: [],
      liveWorkspaces: [
        buildLiveWorkspace({
          tasks: [
            buildTask({
              archivedAt: "2026-07-26T02:00:00.000Z",
            }),
          ],
          messagesByTask: {
            "task-1": [
              buildAssistantMessage({
                parts: [
                  {
                    type: "user_input",
                    requestId: "input-1",
                    toolName: "request_user_input",
                    questions: [],
                    state: "input-requested",
                  },
                ],
              }),
            ],
          },
        }),
      ],
      prWorkspaces: [],
    });

    expect(projection.items).toEqual([]);
  });

  test("maps only actionable PR states", () => {
    expect(mapFleetPrNeedKind("changes_requested")).toBe(
      "pr-changes-requested",
    );
    expect(mapFleetPrNeedKind("checks_failed")).toBe("pr-checks-failed");
    expect(mapFleetPrNeedKind("merge_conflict")).toBe("pr-merge-conflict");
    expect(mapFleetPrNeedKind("behind_base")).toBe("pr-behind-base");
    expect(mapFleetPrNeedKind("ready_to_merge")).toBe("pr-ready-to-merge");

    for (const status of [
      "no_pr",
      "draft",
      "review_required",
      "checks_pending",
      "merged",
      "closed_unmerged",
    ] as const) {
      expect(mapFleetPrNeedKind(status)).toBeNull();
    }
  });

  test("ignores leftover pending parts once the turn is over", () => {
    const approvalMessage = buildAssistantMessage({
      parts: [
        {
          type: "approval",
          requestId: "approval-1",
          toolName: "Bash",
          description: "run tests",
          state: "approval-requested",
        },
      ],
    });

    const projection = buildFleetAttentionProjection({
      notifications: [],
      liveWorkspaces: [
        buildLiveWorkspace({
          messagesByTask: { "task-1": [approvalMessage] },
          activeTurnIdsByTask: {},
        }),
      ],
      prWorkspaces: [],
    });

    expect(projection.items).toEqual([]);
  });

  test("keeps managed task requests actionable without a renderer turn", () => {
    const approvalMessage = buildAssistantMessage({
      parts: [
        {
          type: "approval",
          requestId: "approval-1",
          toolName: "Bash",
          description: "run tests",
          state: "approval-requested",
        },
      ],
    });

    const projection = buildFleetAttentionProjection({
      notifications: [],
      liveWorkspaces: [
        buildLiveWorkspace({
          tasks: [buildTask({ controlMode: "managed", controlOwner: "host" })],
          messagesByTask: { "task-1": [approvalMessage] },
          activeTurnIdsByTask: {},
        }),
      ],
      prWorkspaces: [],
    });

    expect(projection.items).toHaveLength(1);
    expect(projection.items[0]).toMatchObject({
      kind: "approval",
      source: "live",
      requestId: "approval-1",
    });
  });

  test("omits notifications without an exact navigation target", () => {
    expect(
      collectFleetNotificationNeeds([
        buildNotification({ projectPath: null }),
        buildNotification({ workspaceId: null }),
        buildNotification({ taskId: null }),
      ]),
    ).toEqual([]);
  });
});
