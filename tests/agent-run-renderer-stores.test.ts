import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { AgentRunChangedEvent, AgentRunCommandResponse, AgentRunDetail } from "../src/lib/agent-runs/api";
import { isOlderAgentRunDetail } from "../src/lib/agent-runs/agent-run-view";
import { describeAgentRunNotification } from "../src/lib/agent-runs/notifications";
import type { AppNotification } from "../src/lib/notifications/notification.types";
import { useAppStore } from "../src/store/app.store";
import { buildFleetAttentionProjection } from "../src/lib/fleet/attention-projection";
import {
  dropEndedAgentRuns,
  ENDED_AGENT_RUN_RETENTION_MS,
  subscribeFleetRunNotificationReconciliation,
  useFleetAgentRunsStore,
} from "../src/store/fleet-agent-runs-store";
import {
  agentRunTaskKey,
  selectAgentRunFailure,
  selectAgentRunTurnDivider,
  useAgentRunsStore,
} from "../src/store/agent-runs-store";
import { AGENT_RUN_NOW, agentRunDetail, agentRunEvent, agentRunFixture } from "./fixtures/agent-run-fixtures";

const originalWindow = globalThis.window;
const at = (minutes: number) => new Date(AGENT_RUN_NOW.getTime() + minutes * 60_000).toISOString();

/** An agent run detail as read at `minutes` past the start, with the given events. */
function readAt(
  minutes: number,
  events: AgentRunDetail["events"] = [],
  overrides: { id?: string; state?: AgentRunDetail["agentRun"]["state"]; createdAt?: string } = {},
): AgentRunDetail {
  const aggregate = agentRunFixture({ id: overrides.id ?? "agent-run-1" });
  return agentRunDetail(
    {
      ...aggregate,
      agentRun: {
        ...aggregate.agentRun,
        state: overrides.state ?? aggregate.agentRun.state,
        createdAt: overrides.createdAt ?? aggregate.agentRun.createdAt,
        updatedAt: at(minutes),
      },
    },
    events,
  );
}

/** Installs `window.api.agentRuns` with the given answers. */
function installAgentRunsApi(api: Record<string, (...args: never[]) => Promise<unknown>>) {
  Object.assign(globalThis, { window: { api: { agentRuns: { subscribeChanged: () => () => {}, ...api } } } });
}

function captureNotificationCreates() {
  const created: string[] = [];
  Object.assign(window.api!, { persistence: {
    listNotifications: async () => ({ ok: true, notifications: [] }),
    createNotification: async ({ notification }: { notification: { kind: string } }) => {
      created.push(notification.kind);
      return { ok: true, inserted: true, notification: null };
    },
    markNotificationRead: async () => ({ ok: true, notification: null }),
    markAllNotificationsRead: async () => ({ ok: true, count: 0 }),
  } });
  return created;
}

function resetStores() {
  useAgentRunsStore.setState({
    workspaceId: "ws-1",
    loadedWorkspaceId: "ws-1",
    agentRunIdByTask: {},
    agentRunIdsByTask: {},
    details: {},
    dividersByAgentRun: {},
    failureByAgentRun: {},
    pendingByAgentRun: {},
  });
  useFleetAgentRunsStore.setState({ details: {}, latestRunByTask: {}, loaded: false });
}

beforeEach(resetStores);
afterEach(() => {
  Object.assign(globalThis, { window: originalWindow });
  resetStores();
});

describe("run details in the renderer", () => {
  test.each(["completed", "stopped"] as const)("cold load does not replay %s history, while live changes still announce", async (state) => {
    const ended = readAt(0, [], { state });
    const recent = readAt(1, [], { id: "recent", state });
    recent.agentRun.updatedAt = new Date().toISOString();
    installAgentRunsApi({
      list: async () => ({ ok: true, agentRuns: [ended.agentRun, recent.agentRun] }),
      get: async ({ agentRunId }: { agentRunId: string }) => ({ ok: true, agentRun: agentRunId === "recent" ? recent : ended }),
    });
    const created = captureNotificationCreates();
    await useFleetAgentRunsStore.getState().load();
    expect(created).toEqual([]);
    expect(Object.keys(useFleetAgentRunsStore.getState().details)).toEqual(["recent"]);
    await useFleetAgentRunsStore.getState().refresh("recent");
    expect(created).toEqual([state === "completed" ? "agent_run.completed" : "agent_run.blocked"]);
  });

  test.each([true, false])("cold load discards a superseded expiry before old successor retention (expiry first: %s)", async (expiryFirst) => {
    const expired = readAt(0, [], { id: "old", state: "stopped" });
    expired.agentRun.stopReason = "expired";
    const successor = readAt(2, [], { id: "new", state: "completed", createdAt: at(1) });
    const runs = expiryFirst ? [expired, successor] : [successor, expired];
    installAgentRunsApi({ list: async () => ({ ok: true, agentRuns: runs.map((detail) => detail.agentRun) }),
      get: async ({ agentRunId }: { agentRunId: string }) => ({ ok: true, agentRun: runs.find((detail) => detail.agentRun.id === agentRunId) }) });
    const created = captureNotificationCreates();
    await useFleetAgentRunsStore.getState().load();
    expect(useFleetAgentRunsStore.getState().details).toEqual({});
    expect(created).toEqual([]);
    // A delayed read after the successor was pruned cannot resurrect the expiry.
    await useFleetAgentRunsStore.getState().refresh("old");
    expect(useFleetAgentRunsStore.getState().details).toEqual({});
    expect(created).toEqual([]);
  });

  test.each([true, false])("obsolete episodes resolve across either hydration order (notifications first: %s)", async (notificationsFirst) => {
    const before = useAppStore.getState();
    const current = readAt(2, [], { id: "current", state: "stopped", createdAt: at(1) });
    current.agentRun.stopReason = "expired";
    const draft = describeAgentRunNotification(current, { repositoryPath: "/tmp/repo", repositoryName: "Repo", workspaceName: "Workspace", taskTitle: "Task" })!;
    const currentNotification = { ...draft, createdAt: at(2), readAt: null } as AppNotification;
    const obsolete = { ...currentNotification, id: "old-blocker", payload: { agentRunId: "old" } };
    const completion = { ...obsolete, id: "completion", kind: "agent_run.completed" } as AppNotification;
    const read: string[] = [];
    useAppStore.setState({ notifications: [], markNotificationRead: async ({ id, resolvedAt }) => {
      read.push(id);
      useAppStore.setState((state) => ({ notifications: state.notifications.map((notification) => notification.id === id
        ? { ...notification, readAt: at(3), resolvedAt } : notification) }));
    } });
    const off = subscribeFleetRunNotificationReconciliation();
    try {
      const hydrate = () => useAppStore.setState({ notifications: [obsolete, currentNotification, completion] });
      if (notificationsFirst) hydrate();
      expect(read).toEqual([]);
      useFleetAgentRunsStore.setState({ details: { current }, loaded: true });
      if (!notificationsFirst) hydrate();
      expect(read).toEqual(["old-blocker"]);
      expect(useAppStore.getState().notifications.find((notification) => notification.id === "old-blocker")?.resolvedAt).toBeDefined();
      useFleetAgentRunsStore.getState().pruneEnded(Date.now());
      expect(read).toEqual(["old-blocker"]);
    } finally { off(); useAppStore.setState(before, true); }
  });

  test("cold Fleet restores an old expired request regardless of notification reads or cache age", async () => {
    const pending = readAt(0, [], { id: "expired", state: "stopped" });
    pending.agentRun.stopReason = "expired";
    let requested: unknown;
    installAgentRunsApi({
      list: async (args: unknown) => { requested = args; return { ok: true, agentRuns: [pending.agentRun] }; },
      get: async () => ({ ok: true, agentRun: pending }),
    });
    const created = captureNotificationCreates();
    await useFleetAgentRunsStore.getState().load();
    expect(created).toEqual(["agent_run.blocked"]);
    expect(requested).toMatchObject({ includeAttention: true });
    useFleetAgentRunsStore.getState().pruneEnded(AGENT_RUN_NOW.getTime() + 60 * 60_000);
    const detail = useFleetAgentRunsStore.getState().details.expired!;
    expect(detail).toBeDefined();
    const input = { notifications: [], liveWorkspaces: [], prWorkspaces: [], agentRuns: [{ detail,
      repositoryPath: "/tmp/repo", repositoryName: "Repo", workspaceId: "ws-1", workspaceName: "Workspace" }] };
    const current = buildFleetAttentionProjection(input);
    expect(current.blockingItems).toHaveLength(1);
    expect(buildFleetAttentionProjection({ ...input, snoozedAttentionIds: new Set([current.items[0]!.id]) }).items).toEqual([]);
    expect(buildFleetAttentionProjection(input).blockingItems).toHaveLength(1);
    expect(buildFleetAttentionProjection({ ...input, suppressedOutcomeTaskKeys: new Set([JSON.stringify(["ws-1", "task-1"])]) }).items).toEqual([]);
  });

  test("an incomplete run read does not claim authority over missing requests", async () => {
    installAgentRunsApi({ list: async () => ({ ok: true, agentRuns: [readAt(0).agentRun] }),
      get: async () => ({ ok: false, agentRun: null }) });
    await useFleetAgentRunsStore.getState().load();
    expect(useFleetAgentRunsStore.getState().loaded).toBe(false);
  });

  test("state advancement marks stale blocker episodes read before cache eviction", async () => {
    const before = useAppStore.getState();
    const blocked = readAt(1, [], { state: "paused" });
    blocked.agentRun.pauseReason = "limit-reached";
    const draft = describeAgentRunNotification(blocked, { repositoryPath: "/tmp/repo", repositoryName: "Repo", workspaceName: "Workspace", taskTitle: "Task" })!;
    const completion = readAt(2, [], { state: "completed" });
    const read: string[] = [];
    useAppStore.setState({ notifications: [{ id: draft.id, kind: "agent_run.blocked", title: "Blocked", body: "Need input",
      repositoryPath: "/tmp/repo", repositoryName: "Repo", workspaceId: "ws-1", workspaceName: "Workspace", taskId: "task-1", taskTitle: "Task",
      turnId: null, providerId: "codex", action: null, payload: { agentRunId: completion.agentRun.id }, createdAt: at(0), readAt: null }],
      markNotificationRead: async ({ id, resolvedAt }) => {
        read.push(id);
        useAppStore.setState((state) => ({ notifications: state.notifications.map((notification) => ({ ...notification, readAt: at(3), resolvedAt })) }));
      } });
    useFleetAgentRunsStore.setState({ loaded: true, details: { [blocked.agentRun.id]: blocked } });
    const off = subscribeFleetRunNotificationReconciliation();
    try {
      installAgentRunsApi({ get: async () => ({ ok: true, agentRun: completion }) });
      await useFleetAgentRunsStore.getState().refresh(completion.agentRun.id);
      expect(read).toEqual([draft.id]);
    } finally { off(); useAppStore.setState(before, true); }
  });

  test("an older read of a run is recognized, with equal times settled by the last event", () => {
    const newer = readAt(5, [agentRunEvent("agent-run-started", {}), agentRunEvent("stage-completed", {})]);
    const older = readAt(3, newer.events.slice(0, 1));
    expect(isOlderAgentRunDetail(older, newer)).toBe(true);
    expect(isOlderAgentRunDetail(newer, older)).toBe(false);
    expect(isOlderAgentRunDetail(older, undefined)).toBe(false);
    // Same time: fewer events is older; the same read replaces itself (it may carry the report).
    expect(isOlderAgentRunDetail(readAt(5, newer.events.slice(0, 1)), newer)).toBe(true);
    expect(isOlderAgentRunDetail(readAt(5, newer.events), newer)).toBe(false);
    expect(isOlderAgentRunDetail(readAt(1, [], { id: "agent-run-2" }), newer)).toBe(false);
  });

  test("a response that arrives after a newer one does not replace it, in either store", async () => {
    const newer = readAt(5);
    const older = readAt(3);
    installAgentRunsApi({
      signOff: async () => ({ ok: true, agentRun: newer }) satisfies AgentRunCommandResponse,
      get: async () => ({ ok: true, agentRun: older }) satisfies AgentRunCommandResponse,
    });
    await useAgentRunsStore.getState().runCommand("signOff", { agentRunId: "agent-run-1", stageId: "understand", attempt: 1 });
    await useAgentRunsStore.getState().refreshAgentRun("agent-run-1");
    expect(useAgentRunsStore.getState().details["agent-run-1"]).toBe(newer);

    useFleetAgentRunsStore.setState({ details: { "agent-run-1": newer } });
    await useFleetAgentRunsStore.getState().refresh("agent-run-1");
    expect(useFleetAgentRunsStore.getState().details["agent-run-1"]).toBe(newer);
  });

  test("a failed command belongs to the stage it was about, not to the next stage's card", async () => {
    installAgentRunsApi({
      signOff: async () => ({ ok: false, agentRun: null, code: "failed", message: "gh is signed out." }),
      pause: async () => ({ ok: false, agentRun: null, code: "failed", message: "Could not pause." }),
      get: async () => ({ ok: true, agentRun: readAt(1) }),
    });
    const store = useAgentRunsStore.getState();
    await store.runCommand("signOff", { agentRunId: "agent-run-1", stageId: "understand", attempt: 1 });
    let state = useAgentRunsStore.getState();
    expect(selectAgentRunFailure(state, "agent-run-1", "understand:1")).toBe("gh is signed out.");
    expect(selectAgentRunFailure(state, "agent-run-1", "build:1")).toBeNull();
    expect(selectAgentRunFailure(state, "agent-run-1", "understand:2")).toBeNull();
    expect(selectAgentRunFailure(state, "agent-run-1", null)).toBe("gh is signed out.");

    // An agent-run-wide command is scoped to the stage the agent run was on.
    await store.refreshAgentRun("agent-run-1");
    await store.runCommand("pause", { agentRunId: "agent-run-1" });
    state = useAgentRunsStore.getState();
    expect(state.failureByAgentRun["agent-run-1"]?.stageKey).toBe("understand:1");
    expect(selectAgentRunFailure(state, "agent-run-1", "build:1")).toBeNull();
  });

  test("an earlier run's transcript dividers stay once a second run starts on the task", async () => {
    const first = readAt(
      10,
      [
        agentRunEvent("agent-run-started", {}),
        agentRunEvent("turn-started", { stageId: "understand", attempt: 1, reason: "stage-start" }, { idempotencyKey: "m:understand:1:turn:1" }),
        agentRunEvent("turn-linked", { stageId: "understand", attempt: 1, turnId: "turn-1" }, { idempotencyKey: "m:understand:1:turn:1:linked" }),
      ],
      { state: "cancelled" },
    );
    const second = readAt(
      20,
      [
        agentRunEvent("agent-run-started", {}),
        agentRunEvent("turn-started", { stageId: "understand", attempt: 1, reason: "stage-start" }, { idempotencyKey: "n:understand:1:turn:1" }),
        agentRunEvent("turn-linked", { stageId: "understand", attempt: 1, turnId: "turn-9" }, { idempotencyKey: "n:understand:1:turn:1:linked" }),
      ],
      { id: "agent-run-2", createdAt: at(15) },
    );
    const byId: Record<string, AgentRunDetail> = { "agent-run-1": first, "agent-run-2": second };
    installAgentRunsApi({ get: async ({ agentRunId }: { agentRunId: string }) => ({ ok: true, agentRun: byId[agentRunId] }) });
    await useAgentRunsStore.getState().refreshAgentRun("agent-run-1");
    await useAgentRunsStore.getState().refreshAgentRun("agent-run-2");
    const state = useAgentRunsStore.getState();
    expect(state.agentRunIdByTask[agentRunTaskKey("ws-1", "task-1")]).toBe("agent-run-2");
    expect(selectAgentRunTurnDivider(state, "ws-1", "task-1", "turn-1")).toBe("Stage 1 · Understand — run started");
    expect(selectAgentRunTurnDivider(state, "ws-1", "task-1", "turn-9")).toBe("Stage 1 · Understand — run started");
    expect(selectAgentRunTurnDivider(state, "ws-1", "task-1", "turn-unknown")).toBeNull();
  });

  test("Fleet keeps an ended run for half an hour after it ends, and active ones always", () => {
    const ended = readAt(0, [], { id: "ended", state: "stopped" });
    const running = readAt(0, [], { id: "running" });
    const details = { ended, running };
    const end = AGENT_RUN_NOW.getTime();
    expect(dropEndedAgentRuns(details, end + ENDED_AGENT_RUN_RETENTION_MS)).toBe(details);
    expect(Object.keys(dropEndedAgentRuns(details, end + ENDED_AGENT_RUN_RETENTION_MS + 1))).toEqual(["running"]);

    useFleetAgentRunsStore.setState({ details });
    useFleetAgentRunsStore.getState().pruneEnded(end + 2 * ENDED_AGENT_RUN_RETENTION_MS);
    expect(Object.keys(useFleetAgentRunsStore.getState().details)).toEqual(["running"]);
  });

  test("a superseded expiry is discarded before the newer run leaves the cache", () => {
    const expired = readAt(0, [], { id: "old", state: "stopped" });
    expired.agentRun.stopReason = "expired";
    const completed = readAt(2, [], { id: "new", state: "completed", createdAt: at(1) });
    expect(dropEndedAgentRuns({ old: expired, new: completed }, AGENT_RUN_NOW.getTime() + 60 * 60_000)).toEqual({});
  });
});
