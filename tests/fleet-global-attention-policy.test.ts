import { expect, test } from "bun:test";
import { classifyWorkQueueLane } from "@/lib/fleet/work-attention-order";
import { buildFleetAttentionProjection } from "@/lib/fleet/attention-projection";
import { createWorkGraph } from "@/lib/work-graph/work-graph-reducer";
import { createTurnReceipt, finishTurnReceipt } from "@/lib/providers/turn-terminal-receipt";
import { buildFleetTaskRows } from "@/lib/fleet/task-rows";
import { buildRepositorySidebarAttentionAlert, buildWorkspaceProgressTaskItems } from "@/components/layout/RepositoryWorkspaceSidebar.utils";
import { summarizeFleetRespondingTasks } from "@/lib/fleet/task-status";
import { FLEET_TASK_WORK_STATE } from "@/components/layout/fleet-attention-marks";
import { collectAgentsWithWork } from "@/lib/agents/agent-work";
import { summarizeAgentActivity } from "@/lib/agents/agent-activity";
import type { TaskAgent } from "@/store/agent-assignments-store";
import type { AgentAssignment } from "@/lib/agents/assign";
import type { FleetLiveWorkspaceInput } from "@/lib/fleet/attention-projection";
import type { ChatMessage, Task } from "@/types/chat";
test("raw failed status cannot recreate a blocking lane after its alert was read or snoozed", () => {
  expect(classifyWorkQueueLane({ status: "error" })).toBe("idle");
  expect(classifyWorkQueueLane({ status: "error", attentionKind: "run-failed" })).toBe("action-required");
});
test("quiet active work remains in progress and raw supervisor lanes cannot recreate snoozed requests", () => {
  expect(classifyWorkQueueLane({ status: "stalled" })).toBe("in-progress");
  expect(classifyWorkQueueLane({ status: "stalled", attentionKind: "turn-stalled" })).toBe("in-progress");
  expect(classifyWorkQueueLane({ status: "error", agentRunLane: "action-required" })).toBe("idle");
  expect(classifyWorkQueueLane({ status: "waiting-input" })).toBe("idle");
  expect(classifyWorkQueueLane({ status: "waiting-input", attentionKind: "user-input" })).toBe("action-required");
});
test("browser notification reads suppress their exact live failure without hiding unknown failures", () => {
  const task = { id: "task", title: "Task", provider: "codex" as const, updatedAt: "2026-10-01T00:00:00.000Z", unread: false };
  const base = {
    prWorkspaces: [],
    liveWorkspaces: [{ repositoryPath: "/tmp/repo", repositoryName: "Repo", workspaceId: "ws", workspaceName: "Workspace", tasks: [task], activeTurnIdsByTask: {}, providerTurnActivityByTask: {}, messagesByTask: { task: [{ id: "failure", role: "assistant" as const, providerId: "codex" as const, model: "model", content: "", parts: [], turnId: "turn", terminalReceipt: finishTurnReceipt(createTurnReceipt(), task.updatedAt, "runtime_failure") }] } }],
  };
  expect(buildFleetAttentionProjection({ ...base, notifications: [] }).blockingItems).toHaveLength(1);
  const notification = { id: "notice", kind: "task.turn_failed" as const, title: "Task", body: "Failed", repositoryPath: "/tmp/repo", repositoryName: "Repo", workspaceId: "ws", workspaceName: "Workspace", taskId: task.id, taskTitle: task.title, turnId: "turn", providerId: "codex" as const, action: null, payload: {}, createdAt: task.updatedAt, readAt: task.updatedAt };
  expect(buildFleetAttentionProjection({ ...base, notifications: [notification] }).blockingItems).toHaveLength(0);
  expect(buildFleetAttentionProjection({ ...base, notifications: [{ ...notification, turnId: "other-turn" }] }).blockingItems).toHaveLength(1);
});


const now = "2026-10-01T00:00:00.000Z";
const failedTask: Task = { id: "failed", title: "Failed task", provider: "codex", updatedAt: now, unread: false, controlMode: "interactive", controlOwner: "stave" };
const failedMessage: ChatMessage = { id: "failure", role: "assistant", providerId: "codex", model: "model", content: "", parts: [], turnId: "turn", terminalReceipt: finishTurnReceipt(createTurnReceipt(), now, "runtime_failure") };
const live: FleetLiveWorkspaceInput = { repositoryPath: "/tmp/repo", repositoryName: "Repo", workspaceId: "ws", workspaceName: "Workspace", tasks: [failedTask], activeTurnIdsByTask: {}, providerTurnActivityByTask: {}, messagesByTask: { failed: [failedMessage] } };
const projectedFailure = buildFleetAttentionProjection({ notifications: [], liveWorkspaces: [live], prWorkspaces: [] }).items[0]!;

test("Fleet rows and repository indicators consume the acknowledged projection while preserving the actual failure", () => {
  const rows = (attentionItems: typeof projectedFailure[]) => buildFleetTaskRows({
    workspaces: [{ ...live, isActive: true, lastActiveAt: now, hasAttentionItems: attentionItems.length > 0, session: live, storedTasks: null }],
    attentionItems, providerTurnActivityByTask: {}, nowMs: Date.parse(now),
  });
  expect(rows([projectedFailure])[0]).toMatchObject({ status: "error", rank: { lane: "action-required" } });
  expect(rows([])[0]).toMatchObject({ status: "idle", need: null, rank: { lane: "idle" } });
  expect(buildRepositorySidebarAttentionAlert({ workspaces: [{ id: "ws" }], attentionItemsByWorkspaceId: { ws: [projectedFailure] } })).toMatchObject({ kind: "run-failed", attentionItemCount: 1 });
  expect(buildRepositorySidebarAttentionAlert({ workspaces: [{ id: "ws" }], attentionItemsByWorkspaceId: {} })).toBeNull();
  const retry = { ...live, activeTurnIdsByTask: { failed: "turn" } };
  const retryRows = buildFleetTaskRows({ workspaces: [{ ...retry, isActive: true, lastActiveAt: now, hasAttentionItems: false, session: retry, storedTasks: null }], attentionItems: [], providerTurnActivityByTask: {}, nowMs: Date.parse(now) });
  expect(retryRows[0]).toMatchObject({ status: "running", rank: { lane: "in-progress" } });
});

test("sidebar progress rows and Agents counts do not replay a hidden failure", () => {
  const runningTask: Task = { ...failedTask, id: "running", title: "Running" };
  const args = { tasks: [failedTask, runningTask], messagesByTask: live.messagesByTask, activeTurnIdsByTask: { running: "active" } };
  expect(buildWorkspaceProgressTaskItems(args).find((row) => row.taskId === "failed")?.status).toBe("idle");
  expect(buildWorkspaceProgressTaskItems({ ...args, attentionItems: [projectedFailure] }).find((row) => row.taskId === "failed")?.status).toBe("error");
  const agentArgs = { byTaskId: { failed: { agentConfigId: "agent", agentName: "Agent" } as TaskAgent }, tasks: [failedTask], messagesByTask: live.messagesByTask, activeTurnIdsByTask: {}, providerTurnActivityByTask: {}, limit: 5 };
  expect(collectAgentsWithWork(agentArgs).total).toBe(0);
  expect(collectAgentsWithWork({ ...agentArgs, attentionKindByTaskId: { failed: "run-failed" } }).agents[0]).toMatchObject({ count: 1, needsYou: true });
  const assignments = [{ taskId: "failed", createdAt: now, state: "started" }] as AgentAssignment[];
  expect(summarizeAgentActivity({ assignments, statusByTaskId: { failed: "error" } }).needsYou).toBe(0);
  expect(summarizeAgentActivity({ assignments, statusByTaskId: { failed: "error" }, attentionKindByTaskId: { failed: "run-failed" } }).needsYou).toBe(1);
});

test("quiet active tasks keep an activity indicator without a warning or blocking lane", () => {
  const snapshot = { turnId: "turn", providerId: "codex" as const, startedAt: 1, lastEventAt: 2, stalledAt: 3, pendingInteraction: null, workItemsById: {}, orderedWorkItemIds: [], workGraph: createWorkGraph({ turnId: "turn", providerId: "codex", startedAt: 1 }) };
  const summary = summarizeFleetRespondingTasks({ tasks: [failedTask], messagesByTask: {}, activeTurnIdsByTask: { failed: "turn" }, providerTurnActivityByTask: { failed: snapshot } });
  expect(summary).toMatchObject({ respondingTaskCount: 1, hasWarningTask: false });
  expect(FLEET_TASK_WORK_STATE.stalled).toBe("working");
});

test("externally managed terminal outcomes belong to the controller while child approvals remain actionable", () => {
  for (const parentTaskId of [undefined, "parent"]) {
    const managed = { ...live, tasks: [{ ...failedTask, controlMode: "managed" as const, controlOwner: "external" as const, parentTaskId }] };
    expect(buildFleetAttentionProjection({ notifications: [], liveWorkspaces: [managed], prWorkspaces: [] }).items).toEqual([]);
  }
  const managedChild = { ...live, tasks: [{ ...failedTask, controlMode: "managed" as const, controlOwner: "external" as const, parentTaskId: "parent" }], messagesByTask: { failed: [{ ...failedMessage, parts: [{ type: "approval" as const, requestId: "request", toolName: "Bash", description: "Run tests", state: "approval-requested" as const }] }] } };
  expect(buildFleetAttentionProjection({ notifications: [], liveWorkspaces: [managedChild], prWorkspaces: [] }).blockingItems[0]?.kind).toBe("approval");
  const key = JSON.stringify(["ws", "failed"]);
  const result = { id: "result", repositoryPath: "/tmp/repo", repositoryName: "Repo", workspaceId: "ws", workspaceName: "Workspace", taskId: "failed", taskTitle: "Failed", turnId: "turn", outcome: "failed" as const, summary: "Failed", createdAt: now, reviewedAt: null };
  expect(buildFleetAttentionProjection({ notifications: [], resultReviews: [result], liveWorkspaces: [], prWorkspaces: [], suppressedOutcomeTaskKeys: new Set([key]) }).items).toEqual([]);
  expect(result.reviewedAt).toBeNull();
  expect(buildFleetAttentionProjection({ notifications: [], resultReviews: [result], liveWorkspaces: [live], prWorkspaces: [], suppressedOutcomeTaskKeys: new Set([key]) }).blockingItems[0]?.kind).toBe("run-failed");
});

for (const kind of ["approval", "user-input"] as const) {
  test(`snoozing ${kind} hides global waiting marks while its unresolved card is preserved`, () => {
    const part = kind === "approval"
      ? { type: "approval" as const, requestId: "request", toolName: "Bash", description: "Run tests", state: "approval-requested" as const }
      : { type: "user_input" as const, requestId: "request", toolName: "request_user_input", questions: [], state: "input-requested" as const };
    const pending = { ...live, activeTurnIdsByTask: { failed: "turn" }, messagesByTask: { failed: [{ ...failedMessage, terminalReceipt: undefined, parts: [part] }] } };
    const before = buildFleetAttentionProjection({ notifications: [], liveWorkspaces: [pending], prWorkspaces: [] });
    expect(before.blockingItems[0]?.kind).toBe(kind);
    const hidden = buildFleetAttentionProjection({ notifications: [], liveWorkspaces: [pending], prWorkspaces: [], snoozedAttentionIds: new Set([before.items[0]!.id]) });
    const rows = (attentionItems: typeof projectedFailure[]) => buildFleetTaskRows({
      workspaces: [{ ...pending, isActive: true, lastActiveAt: now, hasAttentionItems: attentionItems.length > 0, session: pending, storedTasks: null }],
      attentionItems, providerTurnActivityByTask: {}, nowMs: Date.parse(now),
    });
    expect(rows(before.items)[0]).toMatchObject({ status: kind === "approval" ? "waiting-approval" : "waiting-input", rank: { lane: "action-required" } });
    expect(rows(hidden.items)[0]).toMatchObject({ status: kind === "approval" ? "waiting-approval" : "waiting-input", need: null, rank: { lane: "idle" } });
    expect(hidden.blockingItems).toHaveLength(0);
    expect(pending.messagesByTask.failed[0]!.parts[0]!.state).toBe(kind === "approval" ? "approval-requested" : "input-requested");
  });
}
