import { describe, expect, test } from "bun:test";
import {
  findSettledInteractionNotificationIds,
  findUnreadTurnNotificationIdsForTask,
  findUnresolvedInteractionNotificationIdsForTurn,
  hasUnresolvedInteractionNotificationForTask,
} from "../src/lib/notifications/attention-reconcile";
import type { AppNotification } from "../src/lib/notifications/notification.types";
import type { ChatMessage, MessagePart } from "../src/types/chat";
import { createNotificationAttentionSync } from "../src/store/notification-attention-sync";
import { appendInterruptedTurnNotices } from "../src/store/workspace-session-state";

function buildNotification(
  overrides: Partial<AppNotification> = {},
): AppNotification {
  return {
    id: "notification-1",
    kind: "task.approval_requested",
    title: "Review checkout",
    body: "Bash: run tests",
    repositoryPath: "/workspace/project",
    repositoryName: "Project",
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

function buildUserInputNotification(
  overrides: Partial<AppNotification> = {},
): AppNotification {
  return buildNotification({
    id: "notification-input",
    kind: "task.user_input_requested",
    action: null,
    payload: { requestId: "input-1", messageId: "message-1" },
    ...overrides,
  });
}

function buildMessage(args: {
  id?: string;
  parts: MessagePart[];
}): ChatMessage {
  return {
    id: args.id ?? "message-1",
    role: "assistant",
    model: "gpt-5.6-terra",
    providerId: "codex",
    content: "",
    isStreaming: false,
    parts: args.parts,
  };
}

const pendingApprovalPart: MessagePart = {
  type: "approval",
  requestId: "approval-1",
  toolName: "Bash",
  description: "run tests",
  state: "approval-requested",
};

const pendingInputPart: MessagePart = {
  type: "user_input",
  requestId: "input-1",
  toolName: "AskUserQuestion",
  questions: [],
  state: "input-requested",
};

describe("notification attention reconcile", () => {
  test("ending a turn settles its approval but keeps its still-answerable questions", () => {
    const runRequestId = "run-question:run:build:1:request";
    const notifications = [
      buildNotification(),
      buildUserInputNotification(),
      buildUserInputNotification({ id: "run", payload: { requestId: runRequestId, messageId: "message-1" } }),
    ];
    const settled: string[] = [];
    const sync = createNotificationAttentionSync({
      getNotifications: () => notifications,
      markRead: async ({ id }) => { settled.push(id); },
      getReviewSurface: () => ({ activeWorkspaceId: "", visibleTaskId: null, windowFocused: false }),
    });
    sync.syncTaskInteractions({
      taskId: "task-1",
      endedTurnId: "turn-1",
      messages: [buildMessage({ parts: [
        pendingApprovalPart,
        { ...pendingInputPart, delivery: "async" },
        { ...pendingInputPart, requestId: runRequestId },
      ] })],
    });
    expect(settled).toEqual(["notification-1"]);
  });

  test("loading an interrupted turn preserves the async question card", () => {
    const [message] = appendInterruptedTurnNotices({
      messagesByTask: { "task-1": [buildMessage({ parts: [
        pendingApprovalPart,
        { ...pendingInputPart, delivery: "async" },
      ] })] },
      latestTurns: [{
        id: "turn-1", taskId: "task-1", workspaceId: "workspace-1",
        providerId: "codex", createdAt: "2026-07-26T00:00:00.000Z", completedAt: null,
      }],
    })["task-1"]!;
    expect(message?.parts.map((part) => "state" in part ? part.state : null))
      .toEqual(["approval-interrupted", "input-requested"]);
  });

  test("restoring a managed or delegated task leaves its host-owned request open", () => {
    for (const ownership of [{ controlMode: "managed" as const }, { parentTaskId: "parent" }]) {
      const messages = [buildMessage({ parts: [pendingApprovalPart] })];
      const restored = appendInterruptedTurnNotices({
        tasks: [{ id: "task-1", ...ownership }],
        messagesByTask: { "task-1": messages },
        latestTurns: [{
          id: "turn-1", taskId: "task-1", workspaceId: "workspace-1",
          providerId: "codex", createdAt: "2026-07-26T00:00:00.000Z", completedAt: null,
        }],
      });
      expect(restored["task-1"]).toBe(messages);
    }
  });

  test("keeps a request that is still pending in the task window", () => {
    expect(
      findSettledInteractionNotificationIds({
        notifications: [buildNotification()],
        taskId: "task-1",
        messages: [buildMessage({ parts: [pendingApprovalPart] })],
      }),
    ).toEqual([]);
  });

  test("settles an interrupted question so it stops asking from Fleet", () => {
    expect(
      findSettledInteractionNotificationIds({
        notifications: [buildUserInputNotification()],
        taskId: "task-1",
        messages: [
          buildMessage({
            parts: [{ ...pendingInputPart, state: "input-interrupted" }],
          }),
        ],
      }),
    ).toEqual(["notification-input"]);
  });

  test("settles an approval answered outside the app", () => {
    expect(
      findSettledInteractionNotificationIds({
        notifications: [buildNotification()],
        taskId: "task-1",
        messages: [
          buildMessage({
            parts: [{ ...pendingApprovalPart, state: "approval-responded" }],
          }),
        ],
      }),
    ).toEqual(["notification-1"]);
  });

  test("leaves a request alone when its message is outside the loaded window", () => {
    expect(
      findSettledInteractionNotificationIds({
        notifications: [buildNotification()],
        taskId: "task-1",
        messages: [buildMessage({ id: "message-9", parts: [] })],
      }),
    ).toEqual([]);
  });

  test("never settles an already resolved or foreign notification", () => {
    expect(
      findSettledInteractionNotificationIds({
        notifications: [
          buildNotification({
            id: "resolved",
            resolvedAt: "2026-07-26T01:00:00.000Z",
          }),
          buildNotification({ id: "other-task", taskId: "task-2" }),
          buildNotification({
            id: "result",
            kind: "task.turn_completed",
            action: null,
          }),
        ],
        taskId: "task-1",
        messages: [buildMessage({ parts: [] })],
      }),
    ).toEqual([]);
  });

  test("collects unresolved interactions for a turn that ended", () => {
    expect(
      findUnresolvedInteractionNotificationIdsForTurn({
        notifications: [
          buildNotification(),
          buildUserInputNotification(),
          buildNotification({ id: "other-turn", turnId: "turn-2" }),
          buildNotification({
            id: "already-resolved",
            resolvedAt: "2026-07-26T01:00:00.000Z",
          }),
        ],
        taskId: "task-1",
        turnId: "turn-1",
      }),
    ).toEqual(["notification-1", "notification-input"]);
  });

  test("detects whether a task still owes an interaction", () => {
    expect(
      hasUnresolvedInteractionNotificationForTask({
        notifications: [buildNotification()],
        taskId: "task-1",
      }),
    ).toBe(true);
    expect(
      hasUnresolvedInteractionNotificationForTask({
        notifications: [
          buildNotification({ resolvedAt: "2026-07-26T01:00:00.000Z" }),
        ],
        taskId: "task-1",
      }),
    ).toBe(false);
  });

  test("collects unread turn outcomes for a reviewed task", () => {
    expect(
      findUnreadTurnNotificationIdsForTask({
        notifications: [
          buildNotification({
            id: "completed",
            kind: "task.turn_completed",
            action: null,
          }),
          buildNotification({
            id: "failed",
            kind: "task.turn_failed",
            action: null,
          }),
          buildNotification({
            id: "read",
            kind: "task.turn_completed",
            action: null,
            readAt: "2026-07-26T01:00:00.000Z",
          }),
          buildNotification({ id: "approval-pending" }),
        ],
        taskId: "task-1",
      }),
    ).toEqual(["completed", "failed"]);
  });
});
