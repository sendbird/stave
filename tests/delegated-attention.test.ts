import { describe, expect, test } from "bun:test";
import { describeNotificationRow } from "@/components/layout/top-bar-notifications.utils";
import {
  getDelegatedAttentionRoot,
  resolveNotificationOpenTarget,
  selectDelegatedInteractionRequests,
} from "@/lib/notifications/delegated-attention";
import type { AppNotification } from "@/lib/notifications/notification.types";

const NOW = "2026-10-01T00:00:00.000Z";
const root = { parentTaskId: "middle", rootTaskId: "root", rootWorkspaceId: "root-workspace",
  rootWorkspaceName: "Root workspace", rootTaskTitle: "Consult two models" };

function childApproval(overrides: Partial<AppNotification> = {}): AppNotification {
  return { id: "child-approval", kind: "task.approval_requested", title: "Consult two models", body: "Shell: rg cache",
    repositoryPath: "/tmp/project", repositoryName: "project", workspaceId: "child-workspace", workspaceName: "Child workspace",
    taskId: "child", taskTitle: "Review cache", turnId: "child-turn", providerId: "codex",
    action: { type: "approval", requestId: "approval-1", messageId: "message-1" },
    payload: { ...root, toolName: "Shell", description: "rg cache" }, createdAt: NOW, readAt: null, resolvedAt: null, ...overrides };
}

describe("delegated attention", () => {
  test("reads the root from the payload, or the parent for an older child request", () => {
    expect(getDelegatedAttentionRoot(childApproval())).toEqual({ taskId: "root", workspaceId: "root-workspace",
      workspaceName: "Root workspace", taskTitle: "Consult two models" });
    expect(getDelegatedAttentionRoot(childApproval({ payload: { parentTaskId: "middle" } }))?.taskId).toBe("middle");
    expect(getDelegatedAttentionRoot(childApproval({ payload: {} }))).toBeNull();
    expect(getDelegatedAttentionRoot(childApproval({ kind: "task.turn_completed" }))).toBeNull();
  });

  test("opening a child request targets the root task, never the child workspace", () => {
    expect(resolveNotificationOpenTarget(childApproval(), {})).toMatchObject({
      taskId: "root", taskTitle: "Consult two models", workspaceId: "root-workspace", workspaceName: "Root workspace" });
    const unlocated = childApproval({ payload: { parentTaskId: "middle" } });
    expect(resolveNotificationOpenTarget(unlocated, { middle: "middle-workspace" })).toMatchObject({
      taskId: "middle", workspaceId: "middle-workspace" });
    expect(resolveNotificationOpenTarget(unlocated, {}).workspaceId).toBeNull();
    const own = childApproval({ payload: {} });
    expect(resolveNotificationOpenTarget(own, {})).toBe(own);
  });

  test("the root lists only its descendants' open requests, oldest first", () => {
    const notifications = [
      childApproval({ id: "newer", createdAt: "2026-10-01T00:00:02.000Z", action: { type: "approval", requestId: "approval-2" } }),
      childApproval(),
      childApproval({ id: "answered", resolvedAt: NOW }),
      childApproval({ id: "expired", expiresAt: "2026-09-30T00:00:00.000Z" }),
      childApproval({ id: "other-project", repositoryPath: "/tmp/other" }),
      childApproval({ id: "other-root", payload: { ...root, rootTaskId: "another-root" } }),
      childApproval({ id: "no-turn", turnId: null }),
    ];
    const requests = selectDelegatedInteractionRequests({ notifications, rootTaskId: "root",
      repositoryPath: "/tmp/project", now: Date.parse(NOW) });
    expect(requests.map((request) => request.notificationId)).toEqual(["child-approval", "newer"]);
    expect(requests[0]).toMatchObject({ childTaskTitle: "Review cache", providerId: "codex", identity: {
      repositoryPath: "/tmp/project", workspaceId: "child-workspace", taskId: "child", turnId: "child-turn",
      kind: "approval", requestId: "approval-1", messageId: "message-1" } });
  });

  test("the notification row reads as the root task and names the child", () => {
    expect(describeNotificationRow(childApproval())).toEqual({ taskId: "root", title: "Consult two models",
      detail: "Review cache · Shell: rg cache", workspaceName: "Root workspace" });
    expect(describeNotificationRow(childApproval({ payload: { toolName: "Shell", description: "rg cache" } }))).toEqual({
      taskId: "child", title: "Review cache", detail: "Shell: rg cache", workspaceName: "Child workspace" });
  });
});
