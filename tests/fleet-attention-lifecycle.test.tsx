import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ResultReviewStore } from "../electron/persistence/result-review-store";
import { TaskAttentionSummary } from "@/components/session/TaskAttentionSummary";
import { buildFleetAttentionProjection, collectFleetLiveAttentionItems, type FleetLiveWorkspaceInput } from "@/lib/fleet/attention-projection";
import { applyFleetBulkPlan, planFleetOutcomeRead, revertFleetBulkOutcome, type FleetBulkOperations } from "@/lib/fleet/attention-bulk";
import { buildFleetInbox, countHiddenFleetAttention, selectBellEntries } from "@/lib/fleet/inbox-model";
import { isFleetTaskRowInFlight } from "@/lib/fleet/task-rows";
import { summarizeFleetRespondingTasks } from "@/lib/fleet/task-status";
import { hasFleetLiveTask } from "@/lib/fleet/workspace-activity";
import { isSupervisedTaskTurn } from "@/lib/fleet/agent-run-attention";
import { pauseAgentRun } from "@/lib/agent-runs/commands";
import { decideAgentRunAction } from "@/lib/agent-runs/policy";
import { EMPTY_STAGE_FACTS } from "@/lib/agent-runs/domain";
import { describeAgentRunNotification } from "@/lib/agent-runs/notifications";
import { createTurnReceipt, observeTurnEvent, finishTurnReceipt } from "@/lib/providers/turn-terminal-receipt";
import { buildFleetTaskRows } from "@/lib/fleet/task-rows";
import { useAppStore } from "@/store/app.store";
import { EMPTY_FLEET_ATTENTION, useFleetAttentionStore } from "@/store/fleet-attention-store";
import { dropEndedAgentRuns, useFleetAgentRunsStore } from "@/store/fleet-agent-runs-store";
import { agentRunDetail, agentRunFixture, patchCurrent, applyChange, observe } from "./fixtures/agent-run-fixtures";

const at = "2026-10-01T01:00:00.000Z";
const identity = { repositoryPath: "/tmp/repo", repositoryName: "Repo", workspaceId: "ws-1", workspaceName: "Workspace" };
const task = { id: "task-1", title: "Task", provider: "codex" as const, updatedAt: at, unread: false };
const receipt = finishTurnReceipt(observeTurnEvent(createTurnReceipt(), { type: "error", message: "Authentication failed", recoverable: false }), at, "runtime_failure");
const message = { id: "failure", role: "assistant" as const, providerId: "codex", model: "model", content: "", parts: [], turnId: "manual-turn", completedAt: at, terminalReceipt: receipt };
const workspace: FleetLiveWorkspaceInput = { ...identity, tasks: [task], messagesByTask: { [task.id]: [message] }, activeTurnIdsByTask: {}, providerTurnActivityByTask: {} };
const base = { notifications: [], liveWorkspaces: [workspace], prWorkspaces: [] };
const appBefore = { ...useAppStore.getInitialState() };
const attentionBefore = { ...useFleetAttentionStore.getInitialState() };
const runsBefore = { ...useFleetAgentRunsStore.getInitialState() };
afterEach(() => {
  Object.assign(useAppStore.getInitialState(), appBefore);
  Object.assign(useFleetAttentionStore.getInitialState(), attentionBefore);
  Object.assign(useFleetAgentRunsStore.getInitialState(), runsBefore);
  useAppStore.setState(appBefore, true);
  useFleetAttentionStore.setState(attentionBefore, true);
  useFleetAgentRunsStore.setState(runsBefore, true);
});

for (const reason of ["taken-over", "paused-by-user"] as const) {
  test(`${reason}: a subsequent user failure remains actionable while the supervisor is idle`, () => {
    const original = patchCurrent(agentRunFixture(), { status: "running", facts: { ...EMPTY_STAGE_FACTS, currentTurnId: "run-turn" } });
    const aggregate = applyChange(original, pauseAgentRun({ aggregate: original, reason, now: new Date(at) }));
    const detail = agentRunDetail(aggregate);
    expect(decideAgentRunAction({ aggregate, observation: observe(), now: new Date(at) }).action).toBe("idle");
    expect(isSupervisedTaskTurn(detail, task.id, message.turnId)).toBe(false);
    const global = buildFleetAttentionProjection({ ...base, agentRuns: [{ ...identity, detail }] });
    expect(global.items).toMatchObject([{ kind: "run-failed", turnId: "manual-turn" }]);
    Object.assign(useAppStore.getInitialState(), { activeWorkspaceId: identity.workspaceId, tasks: [task], messagesByTask: workspace.messagesByTask, activeTurnIdsByTask: {} });
    Object.assign(useFleetAttentionStore.getInitialState(), { snapshot: { ...EMPTY_FLEET_ATTENTION, ...global } });
    Object.assign(useFleetAgentRunsStore.getInitialState(), { details: { [detail.agentRun.id]: detail } });
    expect(renderToStaticMarkup(createElement(TaskAttentionSummary, { taskId: task.id }))).toContain("open=\"\"");
  });
}

test("running supervisors suppress their own linked turn, not another turn on the same task", () => {
  const detail = agentRunDetail(patchCurrent(agentRunFixture(), { status: "running", facts: { ...EMPTY_STAGE_FACTS, currentTurnId: "run-turn" } }));
  expect(isSupervisedTaskTurn(detail, task.id, "run-turn")).toBe(true);
  expect(isSupervisedTaskTurn(detail, task.id, "manual-turn")).toBe(false);
  expect(isSupervisedTaskTurn(detail, "other-task", "run-turn")).toBe(false);
  // Stage evidence includes user turns after Resume; that is not run ownership.
  detail.events.push({ id: "user-event", agentRunId: detail.agentRun.id, sequence: 1,
    kind: "user-turn", idempotencyKey: null, detail: { turnId: "run-turn" }, createdAt: at });
  expect(isSupervisedTaskTurn(detail, task.id, "run-turn")).toBe(false);
});

test("expired run snoozes survive cache pruning and a cold start, then restore on expiry or clear", () => {
  const detail = agentRunDetail(patchCurrent(agentRunFixture(), { status: "running" }));
  Object.assign(detail.agentRun, { state: "stopped", stopReason: "expired", updatedAt: at });
  const draft = describeAgentRunNotification(detail, { ...identity, taskTitle: task.title })!;
  const notification = { ...draft, createdAt: at, readAt: null };
  const agentRuns = [{ ...identity, detail }];
  const first = buildFleetAttentionProjection({ notifications: [notification], liveWorkspaces: [], prWorkspaces: [], agentRuns });
  const snoozedAttentionIds = new Set([first.items[0]!.id]);
  const visible = (cached: boolean, ids: ReadonlySet<string>) => {
    const current = buildFleetAttentionProjection({ notifications: [notification], liveWorkspaces: [], prWorkspaces: [], agentRuns: cached ? agentRuns : [], snoozedAttentionIds: ids });
    return selectBellEntries(buildFleetInbox({ items: current.items, snoozedItems: current.snoozedItems, notifications: [notification], snoozedAttentionIds: ids, knownAgentRunIds: new Set(cached ? [detail.agentRun.id] : []) }), "all");
  };
  expect(visible(true, snoozedAttentionIds)).toEqual([]);
  expect(dropEndedAgentRuns({ [detail.agentRun.id]: detail }, Date.parse(at) + 31 * 60_000)).toEqual({ [detail.agentRun.id]: detail });
  expect(visible(false, snoozedAttentionIds)).toEqual([]);
  expect(visible(false, new Set())).toHaveLength(1);
  const nextEpisode = { ...notification, id: "next-episode" };
  expect(selectBellEntries(buildFleetInbox({ items: [], notifications: [nextEpisode], snoozedAttentionIds }), "all")).toHaveLength(1);
});

test("completed run notifications are available with and without a cached detail", () => {
  const detail = agentRunDetail(patchCurrent(agentRunFixture(), { status: "completed" }));
  detail.agentRun.state = "completed";
  const draft = describeAgentRunNotification(detail, { ...identity, taskTitle: task.title })!;
  const notification = { ...draft, createdAt: at, readAt: null };
  for (const known of [true, false]) {
    expect(selectBellEntries(buildFleetInbox({ items: [], notifications: [notification], knownAgentRunIds: new Set(known ? [detail.agentRun.id] : []) }), "unread")).toHaveLength(1);
  }
});

test("acknowledged failures are collapsed context and managed child failures do not reappear locally", () => {
  Object.assign(useAppStore.getInitialState(), { activeWorkspaceId: identity.workspaceId, tasks: [task], messagesByTask: workspace.messagesByTask, activeTurnIdsByTask: {} });
  Object.assign(useFleetAttentionStore.getInitialState(), { snapshot: EMPTY_FLEET_ATTENTION });
  Object.assign(useFleetAgentRunsStore.getInitialState(), { details: {} });
  const html = renderToStaticMarkup(createElement(TaskAttentionSummary, { taskId: task.id }));
  expect(html).toContain("Authentication failed");
  expect(html).not.toContain("open=\"\"");
  Object.assign(useAppStore.getInitialState(), { tasks: [{ ...task, parentTaskId: "parent", controlMode: "managed", controlOwner: "external" }] });
  expect(renderToStaticMarkup(createElement(TaskAttentionSummary, { taskId: task.id }))).toBe("");
});

test("a simultaneous run blocker cannot turn an approval into a running task", () => {
  const pending = { ...workspace, messagesByTask: { [task.id]: [{ ...message, terminalReceipt: undefined, completedAt: undefined, parts: [{ type: "approval" as const, toolName: "Bash", description: "Publish", requestId: "request", state: "approval-requested" as const }] }] }, activeTurnIdsByTask: { [task.id]: message.turnId } };
  const detail = agentRunDetail(patchCurrent(agentRunFixture(), { status: "blocked", detail: "Needs a decision" }));
  const projected = buildFleetAttentionProjection({ ...base, liveWorkspaces: [pending], agentRuns: [{ ...identity, detail }] });
  expect(projected.items.map((item) => item.kind)).toEqual(["agent-run-blocked", "approval"]);
  const rows = buildFleetTaskRows({ workspaces: [{ ...identity, isActive: true, lastActiveAt: at, hasAttentionItems: true, session: { ...pending, openTaskTabIds: [task.id] }, storedTasks: null }], attentionItems: projected.items, providerTurnActivityByTask: {}, nowMs: Date.parse(at) });
  expect(rows[0]).toMatchObject({ status: "waiting-approval", rank: { lane: "action-required" } });
  const snoozed = buildFleetTaskRows({ workspaces: [{ ...identity, isActive: true, lastActiveAt: at, hasAttentionItems: false,
    session: { ...pending, openTaskTabIds: [task.id] }, storedTasks: null }], attentionItems: [], providerTurnActivityByTask: {}, nowMs: Date.parse(at) });
  expect(isFleetTaskRowInFlight(snoozed[0]!)).toBe(false);
  expect(hasFleetLiveTask({ rows: [{ taskId: task.id, status: "waiting-approval" }], activeTurnIdsByTask: pending.activeTurnIdsByTask })).toBe(false);
  expect(summarizeFleetRespondingTasks({ tasks: [task], messagesByTask: pending.messagesByTask,
    activeTurnIdsByTask: pending.activeTurnIdsByTask, providerTurnActivityByTask: {} }).respondingTaskCount).toBe(0);
});

test("a higher-priority blocker cannot hide the current failure glyph", () => {
  const detail = agentRunDetail(patchCurrent(agentRunFixture(), { status: "blocked", detail: "Needs a decision" }));
  const projected = buildFleetAttentionProjection({ ...base, agentRuns: [{ ...identity, detail }] });
  expect(projected.items.map((item) => item.kind)).toEqual(["agent-run-blocked", "run-failed"]);
  const rows = buildFleetTaskRows({ workspaces: [{ ...identity, isActive: true, lastActiveAt: at, hasAttentionItems: true,
    session: { ...workspace, openTaskTabIds: [task.id] }, storedTasks: null }], attentionItems: projected.items,
    providerTurnActivityByTask: {}, nowMs: Date.parse(at) });
  expect(rows[0]).toMatchObject({ status: "error", rank: { lane: "action-required" } });
});

test("resolved snoozes do not inflate the hidden count; cold expired episodes still count", () => {
  const current = collectFleetLiveAttentionItems([workspace])[0]!;
  const activeIds = new Set([current.id]);
  expect(countHiddenFleetAttention({ snoozedItems: [], notifications: [], activeIds, knownAgentRunIds: new Set() })).toBe(0);
  expect(countHiddenFleetAttention({ snoozedItems: [current], notifications: [], activeIds, knownAgentRunIds: new Set() })).toBe(1);
  const detail = agentRunDetail(patchCurrent(agentRunFixture(), { status: "running" }));
  Object.assign(detail.agentRun, { state: "stopped", stopReason: "expired", updatedAt: at });
  const notification = { ...describeAgentRunNotification(detail, { ...identity, taskTitle: task.title })!, createdAt: at, readAt: null };
  const projected = buildFleetAttentionProjection({ notifications: [notification], liveWorkspaces: [], prWorkspaces: [], agentRuns: [{ ...identity, detail }] });
  const episodeIds = new Set([projected.items[0]!.id]);
  expect(countHiddenFleetAttention({ snoozedItems: [], notifications: [notification], activeIds: episodeIds, knownAgentRunIds: new Set() })).toBe(1);
  expect(countHiddenFleetAttention({ snoozedItems: [], notifications: [notification], activeIds: episodeIds, knownAgentRunIds: new Set(), agentRunsAuthoritative: true })).toBe(0);
  expect(countHiddenFleetAttention({ snoozedItems: [], notifications: [notification], activeIds: episodeIds, knownAgentRunIds: new Set([detail.agentRun.id]) })).toBe(0);
  expect(countHiddenFleetAttention({ snoozedItems: [], notifications: [{ ...notification, readAt: at }], activeIds: episodeIds, knownAgentRunIds: new Set() })).toBe(0);
});

test("bulk read never undoes a concurrent explicit review in real SQLite", async () => {
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE notifications (id TEXT PRIMARY KEY, kind TEXT, title TEXT, body TEXT, project_path TEXT, project_name TEXT, workspace_id TEXT, workspace_name TEXT, task_id TEXT, task_title TEXT, turn_id TEXT, created_at TEXT, read_at TEXT, payload_json TEXT)");
    const store = new ResultReviewStore(db);
    db.prepare("INSERT INTO notifications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("n", "task.turn_failed", "Failure", "Authentication failed", identity.repositoryPath, "Repo", identity.workspaceId, "Workspace", task.id, "Task", message.turnId, at, null, null);
    const result = store.list().results[0]!;
    const operations: FleetBulkOperations = {
      listPendingResults: async (scopes) => scopes,
      setResultsReviewed: async (args) => { store.setMarkedReviewed({ ...result, markedReviewed: true }); return store.setManyReviewed(args); },
      markNotificationRead: async () => false,
      snoozeFleetAttention: async () => {},
      clearFleetAttentionSnoozes: async () => {},
    };
    const outcome = await applyFleetBulkPlan({ plan: planFleetOutcomeRead([{ ...collectFleetLiveAttentionItems([workspace])[0]!, resultReview: result }]), operations, resolvedAt: at, snoozedUntil: at });
    expect(outcome.readResults).toBe(1);
    expect(await revertFleetBulkOutcome(outcome, operations)).toBe(true);
    const saved = store.list().results[0]!;
    expect(saved.markedReviewedAt).toBeTruthy();
    expect(saved.reviewedAt).toBeTruthy();
    expect(store.list({ pendingOnly: true }).results).toEqual([]);
  } finally { db.close(); }
});
