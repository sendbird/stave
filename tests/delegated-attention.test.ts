import { describe, expect, test } from "bun:test";
import { buildFleetInbox } from "@/lib/fleet/inbox-model";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import {
  getDelegatedAttentionRoot,
  resolveNotificationOpenTarget,
  selectDelegatedInteractionRequests,
} from "@/lib/notifications/delegated-attention";
import type { AppNotification } from "@/lib/notifications/notification.types";

const NOW = "2026-10-01T00:00:00.000Z";
const root = { parentTaskId: "middle", ancestorTaskIds: ["middle", "root"], rootTaskId: "root", rootWorkspaceId: "root-workspace",
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
      childApproval({ id: "other-root", payload: { ...root, ancestorTaskIds: ["another-root"], rootTaskId: "another-root" } }),
      childApproval({ id: "no-turn", turnId: null }),
    ];
    const select = (taskId: string) => selectDelegatedInteractionRequests({ notifications, taskId,
      repositoryPath: "/tmp/project", now: Date.parse(NOW) });
    const requests = select("root");
    expect(requests.map((request) => request.notificationId)).toEqual(["child-approval", "newer"]);
    // The task between the root and the child sees the same requests; the child does not.
    expect(select("middle").map((request) => request.notificationId)).toEqual(["child-approval", "newer"]);
    expect(select("child")).toEqual([]);
    expect(requests[0]).toMatchObject({ childTaskTitle: "Review cache", providerId: "codex", identity: {
      repositoryPath: "/tmp/project", workspaceId: "child-workspace", taskId: "child", turnId: "child-turn",
      kind: "approval", requestId: "approval-1", messageId: "message-1" } });
  });

  test("the inbox entry reads as the root task and names the child, in the bell and in Fleet", () => {
    const describe = (entry: { taskId: string | null; title: string; detail: string | null; workspaceName: string | null }) =>
      ({ taskId: entry.taskId, title: entry.title, detail: entry.detail, workspaceName: entry.workspaceName });
    // A notification with no item left (the bell's history).
    expect(describe(buildFleetInbox({ items: [], notifications: [childApproval()] }).unlinkedEntries[0]!)).toEqual({
      taskId: "root", title: "Consult two models", detail: "Review cache · Shell: rg cache", workspaceName: "Root workspace" });
    // Fleet's item for the same request settles on the same title.
    const item: FleetAttentionItem = { id: "interaction:approval:child-workspace:child:approval-1", kind: "approval", priority: 1,
      repositoryPath: "/tmp/project", repositoryName: "project", workspaceId: "child-workspace", workspaceName: "Child workspace",
      taskId: "child", taskTitle: "Review cache", requestId: "approval-1", createdAt: NOW, source: "live", detail: "Shell: rg cache" };
    const inbox = buildFleetInbox({ items: [item], notifications: [childApproval()] });
    expect(inbox.unlinkedEntries).toEqual([]);
    expect(describe(inbox.itemEntries[0]!)).toEqual({
      taskId: "root", title: "Consult two models", detail: "Review cache · Shell: rg cache", workspaceName: "Root workspace" });
    expect(describe(buildFleetInbox({ items: [], notifications: [childApproval({ payload: { toolName: "Shell", description: "rg cache" } })] })
      .unlinkedEntries[0]!)).toEqual({ taskId: "child", title: "Review cache", detail: "Shell: rg cache", workspaceName: "Child workspace" });
  });
});

describe("finished composer reviews", () => {
  test("open the task they reviewed, not the review task", () => {
    const notification = childApproval({
      kind: "task.turn_completed",
      action: null,
      title: "Main Task",
      taskId: "review-task",
      taskTitle: "Review · Latest reply · GPT-5.5",
      workspaceId: "ws-main",
      payload: { reviewParentTaskId: "task-main", reviewParentTaskTitle: "Main Task" },
    });
    expect(resolveNotificationOpenTarget(notification, { "task-main": "ws-main" })).toMatchObject({
      taskId: "task-main",
      taskTitle: "Main Task",
      workspaceId: "ws-main",
    });
    const ordinary = childApproval({ kind: "task.turn_completed", action: null, payload: {} });
    expect(resolveNotificationOpenTarget(ordinary, {})).toBe(ordinary);
  });
});
