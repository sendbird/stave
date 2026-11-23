import { expect, test } from "bun:test";
import { countFleetNeedsYouTasks, deriveTaskHeaderAttention } from "@/lib/attention/task-header-attention";
import { collectFleetAgentRunAttentionItems, collectFleetTarsAttentionItems, type FleetAttentionItem } from "@/lib/fleet/attention-projection";
import { buildFleetInbox } from "@/lib/fleet/inbox-model";
import { describeTarsNotifications } from "@/lib/tars/notifications";
import { collectTarsAttention } from "@/lib/tars/attention";
import type { AppNotification } from "@/lib/notifications/notification.types";
import type { TarsPendingDecision, TarsResponsibility } from "@/lib/tars/types";
import { agentRunDetail, agentRunFixture, patchCurrent } from "./fixtures/agent-run-fixtures";
import { tarsResponsibility } from "./fixtures/tars-host-bridge";
import { describeAgentRunNotification } from "@/lib/agent-runs/notifications";

const time = "2026-11-23T00:00:00Z";
const identity = { repositoryPath: "/tmp/repo", repositoryName: "repo", workspaceId: "ws-1", workspaceName: "ws" };
const taskId = "task-1";
const item = (kind: FleetAttentionItem["kind"], details: Partial<FleetAttentionItem> = {}): FleetAttentionItem => ({
  ...identity, id: kind, kind, priority: 0, taskId, createdAt: time, source: "live", ...details,
});
const header = (args: Partial<Parameters<typeof deriveTaskHeaderAttention>[0]> = {}) => deriveTaskHeaderAttention({
  workspaceId: identity.workspaceId, taskId, liveItems: [], fleetItems: [], notifications: [], ...args,
});

test("needs-you points to the exact question over a competing approval", () => {
  const approval = item("approval", { requestId: "approval-id" });
  const question = item("user-input", { requestId: "question-id", messageId: "question-message" });
  expect(header({ liveItems: [approval, question] })).toMatchObject({
    attention: { state: "needs-you" },
    target: { kind: "request", messageId: "question-message", requestId: "question-id" },
  });
  expect(header({ liveItems: [approval] }).target).toEqual({ kind: "approval", requestId: "approval-id" });
});

test("a delegated request points to the parent's composer slot", () => {
  const child = item("approval", { taskId: "child", workspaceId: "child-ws", requestId: "child-request", notificationId: "delegated" });
  const notification = { id: "delegated", kind: "task.approval_requested", taskId: "child", payload: { rootTaskId: taskId, rootWorkspaceId: identity.workspaceId } } as AppNotification;
  expect(header({ fleetItems: [child], notifications: [notification] })).toMatchObject({
    attention: { state: "needs-you" }, target: { kind: "delegated", requestId: "child-request", notificationId: "delegated" },
  });
  expect(header({ fleetItems: [child], notifications: [{ ...notification, resolvedAt: time }] }).target).toBeNull();
});

test("a sign-off opens its stage attempt, and a failed turn opens that turn", () => {
  const stage = { agentRunId: "run-2", stageId: "stage-3", attempt: 4 };
  expect(header({ fleetItems: [item("agent-run-sign-off", { agentRunStage: stage })] }).target).toEqual({ kind: "stage", stage });
  expect(header({ liveItems: [item("run-failed", { turnId: "failed-turn" })] })).toMatchObject({
    attention: { state: "problem" }, target: { kind: "turn", turnId: "failed-turn" },
  });
});

test("an expired run opens its detail until its exact episode is read", () => {
  const detail = agentRunDetail(patchCurrent(agentRunFixture(), { status: "blocked" }));
  const context = { ...identity, taskTitle: "Task" };
  const runs = () => collectFleetAgentRunAttentionItems([{ ...identity, detail }]);
  expect(header({ fleetItems: runs() }).attention.state).toBe("needs-you");
  detail.agentRun.state = "stopped";
  detail.agentRun.stopReason = "expired";
  const fleetItems = runs();
  expect(header({ fleetItems })).toMatchObject({
    attention: { state: "problem" }, target: { kind: "run", agentRunId: detail.agentRun.id },
  });
  const notification = { ...describeAgentRunNotification(detail, context)!, createdAt: time, readAt: time };
  expect(header({ fleetItems, notifications: [notification] }).attention.state).toBe("idle");
  expect(header({
    fleetItems: [{ ...fleetItems[0]!, agentRunNotificationId: "new-episode" }],
    notifications: [notification],
  }).attention.state).toBe("problem");
});

test.each(["pullRequest", "merge", "confirmation"] as const)("Tars %s result and pending decision have separate routes", (completionGoal) => {
  const row = tarsResponsibility({ ...identity, taskId, completionGoal, state: "resultReady" });
  const decision: TarsPendingDecision = {
    responsibilityId: row.id, expectedRevision: row.revision, messageId: "message", actionIndex: 0,
    operation: "message", proposedAt: time,
  };
  const rows = (responsibility: TarsResponsibility, pendingDecisions: TarsPendingDecision[] = []) =>
    collectFleetTarsAttentionItems(collectTarsAttention({ responsibilities: [responsibility], pendingDecisions }));
  const result = header({ fleetItems: rows(row) });
  expect(result.attention.state).toBe(completionGoal === "confirmation" ? "needs-you" : "done-unseen");
  expect(result.target).toEqual(completionGoal === "confirmation"
    ? { kind: "tars", responsibilityId: row.id, decisionId: undefined } : null);
  expect(header({ fleetItems: rows(row, [decision]) })).toMatchObject({
    attention: { state: "needs-you" }, target: { kind: "tars", responsibilityId: row.id, decisionId: expect.any(String) },
  });
  expect(header({ fleetItems: rows({ ...row, executionPending: true }) }).attention.state).toBe("done-unseen");
  if (completionGoal !== "confirmation") {
    const [notification] = describeTarsNotifications({
      identity: { id: "personal", name: "Tars", instructions: "", updatedAt: time },
      responsibilities: [row], runtime: "desktop",
    });
    const notifications = [{ ...notification!, readAt: time, createdAt: time }];
    expect(header({ fleetItems: rows({ ...row, revision: row.revision + 1 }), notifications }).attention.state).toBe("idle");
    expect(header({ fleetItems: rows({ ...row, agentRunId: "next-run", revision: row.revision + 1 }), notifications }).attention.state).toBe("done-unseen");
  }
});

test.each([
  ["working", { activeTurnId: "active" }],
  ["done-unseen", { fleetItems: [item("result-ready", { turnId: "complete" })] }],
  ["idle", { fleetItems: [item("pr-checks-failed", { source: "pr" })] }],
] as const)("%s is a passive label", (state, args) => {
  expect(header(args)).toMatchObject({ attention: { state }, target: null });
});

test("badges count tasks with answerable rows and exclude passive results, failures and PRs", () => {
  const items = [
    item("approval", { requestId: "approval" }), item("user-input", { requestId: "question" }),
    item("agent-run-blocked", { taskId: "expired", agentRunRecoveryAvailable: false }),
    item("result-ready", { taskId: "result", tarsResult: { canAcceptCompletion: false } }),
    item("pr-checks-failed", { taskId: "pr" }),
    item("run-failed", { taskId: "failed", turnId: "failed-turn" }),
  ];
  expect(countFleetNeedsYouTasks(buildFleetInbox({ items, notifications: [] }).itemEntries)).toBe(1);
});
