import { describe, expect, test } from "bun:test";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import {
  buildFleetInbox,
  countUnansweredInteractions,
  selectBellEntries,
  selectBellHistory,
  unreadNotificationIds,
} from "@/lib/fleet/inbox-model";
import type { AppNotification } from "@/lib/notifications/notification.types";

const AT = "2026-10-22T01:00:00.000Z";

function notification(overrides: Partial<AppNotification> & Pick<AppNotification, "id" | "kind">): AppNotification {
  return {
    title: "Task", body: "", repositoryPath: "/tmp/project", repositoryName: "project", workspaceId: "ws-1",
    workspaceName: "deploy", taskId: "task-1", taskTitle: "Ship the release", turnId: "turn-1", providerId: "codex",
    action: null, payload: {}, createdAt: AT, readAt: null, resolvedAt: null, ...overrides,
  };
}

function item(overrides: Partial<FleetAttentionItem> & Pick<FleetAttentionItem, "id" | "kind">): FleetAttentionItem {
  return {
    priority: 1, repositoryPath: "/tmp/project", repositoryName: "project", workspaceId: "ws-1", workspaceName: "deploy",
    taskId: "task-1", taskTitle: "Ship the release", createdAt: AT, source: "live", ...overrides,
  };
}

const approvalNotification = notification({
  id: "n-approval", kind: "task.approval_requested", action: { type: "approval", requestId: "req-1", messageId: "m-1" },
  payload: { toolName: "Bash", description: "Publish" }, createdAt: "2026-10-22T01:05:00.000Z",
});
const approval = item({ id: "interaction:approval:ws-1:task-1:req-1", kind: "approval", requestId: "req-1", turnId: "turn-1" });
const result = item({ id: "turn:result-ready:ws-1:task-2:turn-9", kind: "result-ready", taskId: "task-2", turnId: "turn-9", priority: 4 });
const resultNotification = notification({ id: "n-result", kind: "task.turn_completed", taskId: "task-2", turnId: "turn-9",
  readAt: "2026-10-22T01:10:00.000Z" });
const signOff = item({ id: "agent-run:agent-run-sign-off:run-1:verify:2", kind: "agent-run-sign-off", source: "agentRun",
  agentRunStage: { agentRunId: "run-1", stageId: "verify", attempt: 2 } });
const signOffNotification = notification({ id: "n-sign-off", kind: "agent_run.sign_off_requested",
  payload: { source: "agent-run", agentRunId: "run-1", stageId: "verify", attempt: 2 } });
const staleSignOffNotification = notification({ id: "n-sign-off-old", kind: "agent_run.sign_off_requested",
  payload: { source: "agent-run", agentRunId: "run-1", stageId: "verify", attempt: 1 }, createdAt: "2026-10-21T01:00:00.000Z" });
const pr = item({ id: "pr:pr-checks-failed:ws-3", kind: "pr-checks-failed", taskId: undefined, source: "pr", prStatus: "checks_failed" });
const failedHistory = notification({ id: "n-failed", kind: "task.turn_failed", taskId: "task-4", turnId: "turn-4",
  createdAt: "2026-10-22T00:30:00.000Z" });
const readHistory = notification({ id: "n-done", kind: "agent_run.completed", taskId: "task-5", turnId: null,
  readAt: AT, createdAt: "2026-10-22T00:10:00.000Z" });

const inbox = buildFleetInbox({
  items: [approval, signOff, result, pr],
  notifications: [readHistory, approvalNotification, resultNotification, signOffNotification, staleSignOffNotification, failedHistory],
});

describe("one inbox for Fleet and the bell", () => {
  test("every item is one entry carrying the notifications that speak for it", () => {
    expect(inbox.itemEntries.map((entry) => [entry.id, entry.notifications.map((n) => n.id)])).toEqual([
      [approval.id, ["n-approval"]],
      [signOff.id, ["n-sign-off"]],
      [result.id, ["n-result"]],
      [pr.id, []],
    ]);
    // The same entry object is what Fleet looks up for a row.
    expect(inbox.entryByItemId.get(approval.id)).toBe(inbox.itemEntries[0]!);
  });

  test("notifications no item stands for are entries of their own, newest first", () => {
    expect(inbox.unlinkedEntries.map((entry) => entry.id)).toEqual([
      "notification:n-failed",
      "notification:n-done",
      "notification:n-sign-off-old",
    ]);
    expect(inbox.unlinkedEntries[0]).toMatchObject({ item: null, kind: "run-failed", tier: "history", error: true, unread: true });
  });

  test("an entry is unread while any of its notifications is; an item no notification speaks for has no read state", () => {
    const byId = new Map(inbox.itemEntries.map((entry) => [entry.id, entry]));
    expect(byId.get(approval.id)?.unread).toBe(true);
    expect(byId.get(result.id)?.unread).toBe(false);
    expect(byId.get(pr.id)?.unread).toBe(false);
    expect(unreadNotificationIds(byId.get(approval.id)!)).toEqual(["n-approval"]);
  });

  test("the bell filters the live inbox; History keeps what was read with no item left", () => {
    const ids = (entries: { id: string }[]) => entries.map((entry) => entry.id);
    expect(ids(selectBellEntries(inbox, "all"))).toEqual([
      approval.id, signOff.id, result.id, pr.id, "notification:n-failed", "notification:n-sign-off-old",
    ]);
    expect(ids(selectBellEntries(inbox, "unread"))).toEqual([
      approval.id, signOff.id, "notification:n-failed", "notification:n-sign-off-old",
    ]);
    expect(ids(selectBellEntries(inbox, "errors"))).toEqual([pr.id, "notification:n-failed"]);
    // History is every read notification, including one an item still stands
    // for, so clearing it removes exactly what it lists.
    expect(ids(selectBellHistory(inbox))).toEqual(["notification:n-result", "notification:n-done"]);
  });

  test("a pull request row names its status, and a workspace counts the requests waiting for an answer", () => {
    expect(inbox.entryByItemId.get(pr.id)?.detail).toBe("Checks failed");
    expect(countUnansweredInteractions([approval, signOff, result, pr, item({ id: "q", kind: "user-input" })])).toBe(3);
    expect(countUnansweredInteractions(undefined)).toBe(0);
  });
});
