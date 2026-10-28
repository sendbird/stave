/**
 * Agent runs across every workspace, for Fleet: attention rows, work queue
 * lanes, stage rails on workspace cards, and the notifications an agent run
 * raises when it stops for the user or finishes.
 *
 * The per-workspace `agent-runs-store.ts` serves the task surfaces of the
 * workspace in view; this one keeps only what Fleet needs: the active
 * agent runs, unresolved expiries, and other recently ended runs for half an hour.
 */
import { useEffect } from "react";
import { create } from "zustand";
import type { AgentRunDetail, AgentRunsBridgeApi } from "@/lib/agent-runs/api";
import { currentStageRecord, isActiveAgentRunState } from "@/lib/agent-runs/domain";
import { describeAgentRunNotification, describeSignOffReminder } from "@/lib/agent-runs/notifications";
import { isOlderAgentRunDetail } from "@/lib/agent-runs/agent-run-view";
import { resolveAgentRunAttentionSince } from "@/lib/agent-runs/attention-since";
import { persistRendererNotifications } from "@/store/app-store-notification-runtime";
import { useAppStore } from "@/store/app.store";

const LIST_LIMIT = 100;
const REMINDER_CHECK_MS = 60_000;

/** How long an ended agent run stays in Fleet after it ends. */
export const ENDED_AGENT_RUN_RETENTION_MS = 30 * 60_000;
type RunHead = Pick<AgentRunDetail["agentRun"], "id" | "createdAt">;
const runTaskKey = (run: AgentRunDetail["agentRun"]) => JSON.stringify([run.repositoryPath, run.workspaceId, run.leadTaskId]);
const newerRun = (run: RunHead, previous?: RunHead) => !previous || run.createdAt > previous.createdAt ||
  (run.createdAt === previous.createdAt && run.id > previous.id);

function rememberRunHeads(previous: Record<string, RunHead>, details: readonly AgentRunDetail[]) {
  const heads = { ...previous };
  for (const { agentRun } of details) {
    if (newerRun(agentRun, heads[runTaskKey(agentRun)])) heads[runTaskKey(agentRun)] = { id: agentRun.id, createdAt: agentRun.createdAt };
  }
  return heads;
}

interface FleetAgentRunsState {
  /** Active runs, unresolved expiries, and other runs ended in the last half hour. */
  details: Record<string, AgentRunDetail>;
  /** Supersession survives detail eviction and late reads of an older run. */
  latestRunByTask: Record<string, RunHead>;
  loaded: boolean;
  load: () => Promise<void>;
  refresh: (agentRunId: string) => Promise<void>;
  /** Drops ended history and superseded expiries, retaining current requests. */
  pruneEnded: (now: number) => void;
}

function endedLongAgo(detail: AgentRunDetail, now: number, retentionMs: number) {
  const needsInstruction = detail.agentRun.state === "stopped" && detail.agentRun.stopReason === "expired";
  return !needsInstruction && !isActiveAgentRunState(detail.agentRun.state) && now - Date.parse(detail.agentRun.updatedAt) > retentionMs;
}

/**
 * The details without agent runs that ended more than `retentionMs` before
 * `now`, except current expired requests. Returns the same object when nothing is dropped.
 */
export function dropEndedAgentRuns(
  details: Record<string, AgentRunDetail>,
  now: number,
  retentionMs = ENDED_AGENT_RUN_RETENTION_MS,
  latestRunByTask: Record<string, RunHead> = {},
): Record<string, AgentRunDetail> {
  const newest = rememberRunHeads(latestRunByTask, Object.values(details));
  let kept: Record<string, AgentRunDetail> | null = null;
  for (const [id, detail] of Object.entries(details)) {
    const supersededExpiry = detail.agentRun.state === "stopped" && detail.agentRun.stopReason === "expired" &&
      newest[runTaskKey(detail.agentRun)]?.id !== id;
    if (supersededExpiry || endedLongAgo(detail, now, retentionMs)) {
      if (!kept) kept = { ...details };
      delete kept[id];
    }
  }
  return kept ?? details;
}

function agentRunsApi(): AgentRunsBridgeApi | null {
  return typeof window === "undefined" ? null : (window.api?.agentRuns ?? null);
}

/** Names the notification needs, from what the app already knows. */
function notificationContext(detail: AgentRunDetail) {
  const state = useAppStore.getState();
  const workspace = state.workspaces.find((candidate) => candidate.id === detail.agentRun.workspaceId);
  const task =
    state.tasks.find((candidate) => candidate.id === detail.agentRun.leadTaskId) ??
    state.workspaceRuntimeCacheById[detail.agentRun.workspaceId]?.tasks.find(
      (candidate) => candidate.id === detail.agentRun.leadTaskId,
    );
  return {
    repositoryPath: detail.agentRun.repositoryPath,
    repositoryName: detail.agentRun.repositoryPath.split(/[\\/]/).filter(Boolean).at(-1) ?? null,
    workspaceName: workspace?.name ?? null,
    taskTitle: task?.title ?? null,
  };
}

export const useFleetAgentRunsStore = create<FleetAgentRunsState>()((set, get) => {
  function store(detail: AgentRunDetail, announce: boolean) {
    // An answer that left the host before the stored one must not replace it.
    if (isOlderAgentRunDetail(detail, get().details[detail.agentRun.id])) return;
    // Apply supersession before retention, even when the successor ended long ago.
    const latestRunByTask = rememberRunHeads(get().latestRunByTask, [detail]);
    set((state) => ({ latestRunByTask, details: dropEndedAgentRuns({ ...state.details, [detail.agentRun.id]: detail }, Date.now(), ENDED_AGENT_RUN_RETENTION_MS, latestRunByTask) }));
    if (detail.agentRun.stopReason === "expired" && get().details[detail.agentRun.id] !== detail) return;
    if (!announce) return;
    const notification = describeAgentRunNotification(detail, notificationContext(detail));
    if (notification) void persistRendererNotifications([notification]);
  }

  return {
    details: {},
    latestRunByTask: {},
    loaded: false,

    load: async () => {
      const api = agentRunsApi();
      if (!api) return;
      const listed = await api.list({ limit: LIST_LIMIT, includeActive: true, includeAttention: true }).catch(() => null);
      if (!listed?.ok) return;
      const responses = await Promise.all(
        listed.agentRuns.map(async (agentRun) => {
          return api.get({ agentRunId: agentRun.id }).catch(() => null);
        }),
      );
      // Compare the entire read before dropping ended history. Otherwise an old
      // successor can be discarded before its expired predecessor arrives.
      const details = { ...get().details };
      for (const response of responses) {
        if (response?.ok && response.agentRun && !isOlderAgentRunDetail(response.agentRun, details[response.agentRun.agentRun.id])) {
          details[response.agentRun.agentRun.id] = response.agentRun;
        }
      }
      const latestRunByTask = rememberRunHeads(get().latestRunByTask, Object.values(details));
      const kept = dropEndedAgentRuns(details, Date.now(), ENDED_AGENT_RUN_RETENTION_MS, latestRunByTask);
      set({ details: kept, latestRunByTask, loaded: responses.every((response) => response?.ok && response.agentRun) });
      for (const response of responses) {
        const detail = response?.ok ? response.agentRun : null;
        if (!detail || kept[detail.agentRun.id] !== detail) continue;
        // Restore pending decisions, without replaying completed history after
        // its notification dedupe row has expired.
        if (isActiveAgentRunState(detail.agentRun.state) || detail.agentRun.stopReason === "expired") store(detail, true);
      }
    },

    refresh: async (agentRunId) => {
      const api = agentRunsApi();
      if (!api) return;
      const response = await api.get({ agentRunId }).catch(() => null);
      if (response?.ok && response.agentRun) store(response.agentRun, true);
      else if (response?.ok && get().details[agentRunId]) {
        set((state) => {
          const { [agentRunId]: _gone, ...rest } = state.details;
          return { details: rest };
        });
      }
    },

    pruneEnded: (now) => {
      const details = get().details;
      const kept = dropEndedAgentRuns(details, now, ENDED_AGENT_RUN_RETENTION_MS, get().latestRunByTask);
      if (kept !== details) set({ details: kept });
    },
  };
});

/** Reconcile both hydration orders and subsequent run/notification changes. */
export function subscribeFleetRunNotificationReconciliation() {
  const pending = new Set<string>();
  const reconcile = () => {
    const runs = useFleetAgentRunsStore.getState();
    if (!runs.loaded) return;
    const currentIds = new Set(Object.values(runs.details).flatMap((detail) => {
      const notification = describeAgentRunNotification(detail, notificationContext(detail));
      return notification ? [notification.id] : [];
    }));
    const state = useAppStore.getState();
    for (const notification of state.notifications) {
      if (notification.readAt || notification.kind === "agent_run.completed" || !notification.kind.startsWith("agent_run.") ||
          typeof notification.payload.agentRunId !== "string" || currentIds.has(notification.id) || pending.has(notification.id)) continue;
      pending.add(notification.id);
      void state.markNotificationRead({ id: notification.id, resolvedAt: new Date().toISOString() })
        .catch(() => {})
        .finally(() => pending.delete(notification.id));
    }
  };
  const offNotifications = useAppStore.subscribe((state, previous) => {
    if (state.notifications !== previous.notifications) reconcile();
  });
  const offRuns = useFleetAgentRunsStore.subscribe((state, previous) => {
    if (state.details !== previous.details || state.loaded !== previous.loaded) reconcile();
  });
  reconcile();
  return () => { offNotifications(); offRuns(); };
}

/** Active agent runs whose current stage waits for the user, with since when. */
export function listWaitingSignOffs(details: Record<string, AgentRunDetail>) {
  return Object.values(details).flatMap((detail) => {
    if (detail.agentRun.state !== "running") return [];
    const record = currentStageRecord(detail);
    if (record.status !== "awaiting-sign-off") return [];
    return [{ detail, since: resolveAgentRunAttentionSince(detail) }];
  });
}

/**
 * Mounted once in `App.tsx`: loads the agent runs, follows `agent-runs:changed`
 * for every workspace, and sends the batched sign-off reminder.
 */
export function useFleetAgentRunSync() {
  useEffect(() => {
    const api = agentRunsApi();
    if (!api) return;
    const { load, refresh } = useFleetAgentRunsStore.getState();
    const unsubscribeNotifications = subscribeFleetRunNotificationReconciliation();
    void load();
    const unsubscribe = api.subscribeChanged((event) => void refresh(event.agentRunId));
    let lastRemindedAt: number | null = null;
    const timer = window.setInterval(() => {
      const now = new Date();
      useFleetAgentRunsStore.getState().pruneEnded(now.getTime());
      const minutes = Math.max(0, Math.min(1_440, useAppStore.getState().settings.runSignOffReminderMinutes || 0));
      const waiting = listWaitingSignOffs(useFleetAgentRunsStore.getState().details).map((entry) => ({
        ...entry,
        taskTitle: notificationContext(entry.detail).taskTitle,
      }));
      const reminder = describeSignOffReminder({ waiting, now, intervalMinutes: minutes, lastRemindedAt });
      if (!reminder) return;
      lastRemindedAt = now.getTime();
      void persistRendererNotifications([reminder]);
    }, REMINDER_CHECK_MS);
    return () => {
      unsubscribe();
      unsubscribeNotifications();
      window.clearInterval(timer);
    };
  }, []);
}
