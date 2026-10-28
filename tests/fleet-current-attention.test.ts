import { EMPTY_STAGE_FACTS } from "@/lib/agent-runs/domain";
import { describe, expect, test } from "bun:test";
import { buildFleetAttentionProjection, type FleetLiveWorkspaceInput } from "@/lib/fleet/attention-projection";
import { classifyTaskStatus } from "@/lib/fleet/task-status";
import { createTurnReceipt, finishTurnReceipt, observeTurnEvent } from "@/lib/providers/turn-terminal-receipt";
import type { AppNotification } from "@/lib/notifications/notification.types";
import type { ResultReview } from "@/lib/reviews/result-review";
import type { ChatMessage } from "@/types/chat";
import { createEmptyWorkspaceState } from "@/store/workspace-session-state";
import { buildTaskTurnFailedNotificationInput } from "@/store/app-notification-builders";
import { agentRunDetail, agentRunFixture, patchCurrent } from "./fixtures/agent-run-fixtures";

const earlier = "2026-10-01T00:00:00.000Z";
const later = "2026-10-01T01:00:00.000Z";
const task = { id: "task-1", title: "Task", provider: "codex" as const, updatedAt: later, unread: false };
const identity = { repositoryPath: "/tmp/repo", repositoryName: "Repo", workspaceId: "ws-1", workspaceName: "Workspace" };
const failure = finishTurnReceipt(observeTurnEvent(createTurnReceipt(), { type: "error", message: "Authentication failed", recoverable: false }), earlier, "runtime_failure");
function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { id: "failed-message", role: "assistant", providerId: "codex", model: "model", content: "", parts: [], turnId: "old-turn", completedAt: earlier, terminalReceipt: failure, ...overrides };
}
function workspace(overrides: Partial<FleetLiveWorkspaceInput> = {}): FleetLiveWorkspaceInput {
  return { ...identity, tasks: [task], messagesByTask: {}, activeTurnIdsByTask: {}, providerTurnActivityByTask: {}, ...overrides };
}
function result(overrides: Partial<ResultReview> = {}): ResultReview {
  return { ...identity, id: "old-result", taskId: task.id, taskTitle: task.title, turnId: "old-turn", outcome: "failed", summary: "Authentication failed", createdAt: earlier, reviewedAt: null, ...overrides };
}
function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return { ...identity, id: "old-notification", kind: "task.turn_failed", title: task.title, body: "Latest run failed", taskId: task.id, taskTitle: task.title, turnId: "old-turn", providerId: "codex", action: null, payload: { message: "Authentication failed", messageId: "failed-message" }, createdAt: earlier, readAt: null, ...overrides };
}
const base = { notifications: [], liveWorkspaces: [], prWorkspaces: [] };

describe("current actionable turn boundaries", () => {
  for (const provider of ["claude-code", "codex", "cursor", "kiro"] as const) {
    test(`${provider}: a diagnostic during streaming is not a failed task`, () => {
      expect(classifyTaskStatus({ task: { ...task, provider }, activeTurnId: "old-turn", messages: [message({ providerId: provider, completedAt: undefined, terminalReceipt: undefined, isStreaming: true, parts: [{ type: "system_event", content: "[error] connection interrupted" }] })] })).toBe("running");
    });
  }
  test("a new turn supersedes the previous terminal failure before its first message", () => {
    expect(classifyTaskStatus({ task, activeTurnId: "new-turn", messages: [message()] })).toBe("running");
  });
  test("the current terminal failure stays visible and points at the failure message", () => {
    const projection = buildFleetAttentionProjection({ ...base, liveWorkspaces: [workspace({ messagesByTask: { [task.id]: [message()] } })] });
    expect(projection.blockingItems).toHaveLength(1);
    expect(projection.blockingItems[0]).toMatchObject({ kind: "run-failed", turnId: "old-turn", messageId: "failed-message", detail: "Authentication failed" });
  });
  test("a hard diagnostic without a terminal signal does not create a failure notification", () => {
    expect(buildTaskTurnFailedNotificationInput({ state: { repositoryPath: identity.repositoryPath, repositoryName: identity.repositoryName, workspaces: [], recentRepositories: [] }, session: { ...createEmptyWorkspaceState(), activeTurnIdsByTask: {}, tasks: [task], messagesByTask: { [task.id]: [message({ completedAt: undefined, terminalReceipt: undefined })] } }, workspaceId: identity.workspaceId, taskId: task.id, turnId: "old-turn", provider: "codex", events: [{ type: "error", message: "Temporary disconnect", recoverable: false }] })).toBeNull();
  });
  test("reviewed latest results suppress older unreviewed failures without deleting history", () => {
    const results = [result(), result({ id: "new", turnId: "new-turn", outcome: "completed", createdAt: later, reviewedAt: later })];
    expect(buildFleetAttentionProjection({ ...base, resultReviews: results }).items).toEqual([]);
    expect(results[0]!.reviewedAt).toBeNull();
  });
  test("a newer read terminal notification suppresses an old pending durable result", () => {
    expect(buildFleetAttentionProjection({ ...base, resultReviews: [result()], notifications: [notification({ id: "new", kind: "task.turn_completed", turnId: "new-turn", createdAt: later, readAt: later })] }).items).toEqual([]);
  });
  test("only the latest unresolved result is projected per task in a cold workspace", () => {
    const projection = buildFleetAttentionProjection({ ...base, resultReviews: [result(), result({ id: "new", turnId: "new-turn", outcome: "completed", createdAt: later })] });
    expect(projection.items.map((item) => item.turnId)).toEqual(["new-turn"]);
  });
  test("delayed old notifications cannot reorder known durable turns", () => {
    const projection = buildFleetAttentionProjection({ ...base,
      resultReviews: [result(), result({ id: "new", turnId: "new-turn", createdAt: later })],
      notifications: [notification({ createdAt: "2026-10-02T00:00:00.000Z" })],
    });
    expect(projection.items.map((item) => item.turnId)).toEqual(["new-turn"]);
  });
  test("equal result timestamps follow the actual transcript turn order", () => {
    const projection = buildFleetAttentionProjection({ ...base,
      resultReviews: [result(), result({ id: "new", turnId: "new-turn" })],
      liveWorkspaces: [workspace({ messagesByTask: { [task.id]: [message(), message({ id: "new-message", turnId: "new-turn" })] } })],
    });
    expect(projection.items.map((item) => item.turnId)).toEqual(["new-turn"]);
  });
  test("reading the durable failure does not let its live transcript recreate an alert", () => {
    expect(buildFleetAttentionProjection({ ...base,
      resultReviews: [result({ reviewedAt: later })],
      liveWorkspaces: [workspace({ messagesByTask: { [task.id]: [message()] } })],
    }).items).toEqual([]);
  });
  test("an active retry suppresses old failures and completion rows", () => {
    const projection = buildFleetAttentionProjection({ ...base, resultReviews: [result()], liveWorkspaces: [workspace({ messagesByTask: { [task.id]: [message()] }, activeTurnIdsByTask: { [task.id]: "new-turn" } })] });
    expect(projection.items).toEqual([]);
  });
  test("a later user message supersedes a failed terminal result", () => {
    const projection = buildFleetAttentionProjection({ ...base, resultReviews: [result()], liveWorkspaces: [workspace({ messagesByTask: { [task.id]: [message(), message({ id: "reply", role: "user", providerId: "user", turnId: undefined, terminalReceipt: undefined, completedAt: undefined, startedAt: later })] } })] });
    expect(projection.items).toEqual([]);
  });
  test("older hydrated messages cannot erase a current cold failure", () => {
    const projection = buildFleetAttentionProjection({ ...base, resultReviews: [result({ turnId: "new-turn", createdAt: later })], liveWorkspaces: [workspace({ messagesByTask: { [task.id]: [message()] } })] });
    expect(projection.items.map((item) => item.turnId)).toEqual(["new-turn"]);
  });
  test("a running supervisor owns continuation between retries", () => {
    const detail = agentRunDetail(patchCurrent(agentRunFixture(), { status: "running", facts: { ...EMPTY_STAGE_FACTS, currentTurnId: "old-turn" } }));
    expect(buildFleetAttentionProjection({ ...base, resultReviews: [result()], agentRuns: [{ ...identity, detail }] }).items).toEqual([]);
  });
  test("paused runs needing a decision get an actionable reason; deliberate pauses do not", () => {
    const detail = agentRunDetail(patchCurrent(agentRunFixture(), { status: "running" }));
    const paused = { ...detail, agentRun: { ...detail.agentRun, state: "paused" as const, pauseReason: "limit-reached" as const, reasonDetail: "Add more turns to continue." } };
    expect(buildFleetAttentionProjection({ ...base, agentRuns: [{ ...identity, detail: paused }] }).blockingItems[0]).toMatchObject({ kind: "agent-run-blocked", detail: "Add more turns to continue." });
    expect(buildFleetAttentionProjection({ ...base, agentRuns: [{ ...identity, detail: { ...paused, agentRun: { ...paused.agentRun, pauseReason: "paused-by-user" } } }] }).items).toEqual([]);
  });
  test("a known usage reset stays quiet while an unknown reset needs a decision", () => {
    const detail = agentRunDetail(patchCurrent(agentRunFixture(), { status: "running" }));
    const paused = { ...detail, agentRun: { ...detail.agentRun, state: "paused" as const, pauseReason: "usage-limit" as const } };
    expect(buildFleetAttentionProjection({ ...base, agentRuns: [{ ...identity, detail: paused }] }).blockingItems).toHaveLength(1);
    const waiting = { ...paused, agentRun: { ...paused.agentRun, usageLimit: { turnId: "old-turn", accountProfileId: "account", fingerprint: paused.agentRun.fingerprint, resetsAt: later, resumeAt: later } } };
    expect(buildFleetAttentionProjection({ ...base, agentRuns: [{ ...identity, detail: waiting }] }).items).toEqual([]);
  });
  test("expired primary runs need a decision until a newer run supersedes them", () => {
    const detail = agentRunDetail(patchCurrent(agentRunFixture(), { status: "running" }));
    const stopped = { ...detail, agentRun: { ...detail.agentRun, state: "stopped" as const, stopReason: "expired" as const, reasonDetail: "Run expired; give a new instruction." } };
    const expired = { ...identity, detail: stopped };
    const before = buildFleetAttentionProjection({ ...base, agentRuns: [expired] });
    expect(before.blockingItems[0]).toMatchObject({ kind: "agent-run-blocked", detail: "Run expired; give a new instruction." });
    expect(buildFleetAttentionProjection({ ...base, agentRuns: [expired, { ...identity, detail: { ...detail, agentRun: { ...detail.agentRun, id: "new-run", createdAt: later } } }] }).items).toEqual([]);
    expect(buildFleetAttentionProjection({ ...base, agentRuns: [expired], closedTaskKeys: new Set([JSON.stringify([identity.workspaceId, task.id])]) }).items).toEqual([]);
    expect(buildFleetAttentionProjection({ ...base, agentRuns: [expired], liveWorkspaces: [workspace({ tasks: [{ ...task, controlMode: "managed", controlOwner: "external", parentTaskId: "parent" }] })] }).items).toEqual([]);
    for (const stopReason of ["task-unavailable", "turn-cap-reached", "acceptance-unmet"] as const) {
      expect(buildFleetAttentionProjection({ ...base, agentRuns: [{ ...identity, detail: { ...stopped, agentRun: { ...stopped.agentRun, stopReason } } }] }).items).toEqual([]);
    }
  });
  test("PR issues are review status rather than blocking requests", () => {
    const projection = buildFleetAttentionProjection({ ...base, prWorkspaces: ["changes_requested", "checks_failed", "merge_conflict"].map((status, index) => ({ ...identity, workspaceId: `pr-${index}`, status: status as "checks_failed", updatedAt: later })) });
    expect(projection.blockingItems).toEqual([]);
    expect(projection.reviewItems).toHaveLength(3);
  });
  test("failure notifications preserve the concrete cause and message destination", () => {
    expect(buildFleetAttentionProjection({ ...base, notifications: [notification()] }).items[0]).toMatchObject({ detail: "Authentication failed", messageId: "failed-message" });
  });
});
