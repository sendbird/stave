import { describe, expect, test } from "bun:test";
import { getTaskAttentionTier, mergeTaskAttention, selectTaskAttention, taskAttentionDestination } from "@/lib/fleet/task-attention";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import type { AppNotification } from "@/lib/notifications/notification.types";

const failure: FleetAttentionItem = {
  id: "turn:run-failed:workspace:task:turn", kind: "run-failed", priority: 2,
  repositoryPath: "/tmp/project", repositoryName: "Project", workspaceId: "workspace", workspaceName: "Workspace",
  taskId: "task", turnId: "turn", createdAt: "2026-10-28T00:00:00Z", source: "live", detail: "Authentication failed",
};

describe("task attention summary", () => {
  test("a delegated child's request appears in its root task without leaking across workspaces", () => {
    const child: FleetAttentionItem = { ...failure, id: "child-approval", taskId: "child", workspaceId: "child-workspace", kind: "approval", notificationId: "child-notification" };
    const notification: AppNotification = {
      id: "child-notification", kind: "task.approval_requested", title: "Child", body: "Allow command",
      repositoryPath: "/tmp/project", repositoryName: "Project", workspaceId: "child-workspace", workspaceName: "Child workspace",
      taskId: "child", taskTitle: "Check result", turnId: "child-turn", providerId: "codex", action: null,
      payload: { rootTaskId: "task", rootWorkspaceId: "workspace" }, createdAt: failure.createdAt, readAt: null,
    };
    expect(selectTaskAttention([child], "workspace", "task", [notification])).toEqual([child]);
    expect(selectTaskAttention([child], "other-workspace", "task", [notification])).toEqual([]);
    expect(selectTaskAttention([child], "workspace", "other-task", [notification])).toEqual([]);
  });
  test("only the task's decisions and workspace PR problems enter the summary", () => {
    const pr = { ...failure, id: "pr", kind: "pr-checks-failed" as const, taskId: undefined, source: "pr" as const };
    const selected = selectTaskAttention([
      failure, { ...failure, id: "other-task", taskId: "other" },
      { ...failure, id: "other-workspace", workspaceId: "other" },
      { ...failure, id: "done", kind: "result-ready" },
      { ...failure, id: "quiet", kind: "turn-stalled" }, pr,
    ], "workspace", "task");
    expect(selected.map((item) => item.id)).toEqual([failure.id, "pr"]);
  });
  test("the failed turn remains discoverable after reading without re-raising global attention", () => {
    const global: FleetAttentionItem[] = [];
    expect(mergeTaskAttention({ items: global, localItems: [failure], snoozedItems: [], supervised: false })).toEqual([{ ...failure, acknowledged: true }]);
    expect(global).toEqual([]);
    expect(getTaskAttentionTier({ ...failure, acknowledged: true })).toBe("review");
    expect(getTaskAttentionTier(failure)).toBe("blocking");
  });
  test("a snooze or supervised recovery prevents the task from re-raising a failure", () => {
    expect(mergeTaskAttention({ items: [], localItems: [failure], snoozedItems: [failure], supervised: false })).toEqual([]);
    expect(mergeTaskAttention({ items: [], localItems: [failure], snoozedItems: [], supervised: true })).toEqual([]);
    expect(mergeTaskAttention({ items: [failure], localItems: [failure], snoozedItems: [], supervised: false })).toEqual([failure]);
  });
  test("each cause routes to its request, exact turn or exact stage", () => {
    expect(taskAttentionDestination(failure)).toBe("reviewTurn");
    expect(taskAttentionDestination({ ...failure, kind: "approval", requestId: "req", messageId: "message" })).toBe("request");
    expect(taskAttentionDestination({ ...failure, kind: "user-input", requestId: "req" })).toBe("pendingRequest");
    const stage = { agentRunId: "run", stageId: "stage", attempt: 3 };
    expect(taskAttentionDestination({ ...failure, kind: "agent-run-sign-off", agentRunStage: stage })).toBe("reviewStage");
    expect(taskAttentionDestination({ ...failure, kind: "agent-run-blocked", agentRunStage: stage })).toBe("progress");
  });
});
