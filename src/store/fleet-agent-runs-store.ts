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

interface FleetAgentRunsState {
  /** Active runs, unresolved expiries, and other runs ended in the last half hour. */
  details: Record<string, AgentRunDetail>;
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
): Record<string, AgentRunDetail> {
  const taskKey = (detail: AgentRunDetail) => JSON.stringify([detail.agentRun.repositoryPath, detail.agentRun.workspaceId, detail.agentRun.leadTaskId]);
  const newest = new Map<string, AgentRunDetail>();
  for (const detail of Object.values(details)) {
    const previous = newest.get(taskKey(detail))?.agentRun;
    const run = detail.agentRun;
    if (!previous || run.createdAt > previous.createdAt || (run.createdAt === previous.createdAt && run.id > previous.id)) newest.set(taskKey(detail), detail);
  }
  let kept: Record<string, AgentRunDetail> | null = null;
  for (const [id, detail] of Object.entries(details)) {
    const supersededExpiry = detail.agentRun.state === "stopped" && detail.agentRun.stopReason === "expired" &&
      newest.get(taskKey(detail)) !== detail;
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
    // A change to an agent run that ended long ago (a shared report) does not bring it back.
    if (!endedLongAgo(detail, Date.now(), ENDED_AGENT_RUN_RETENTION_MS)) {
      set((state) => ({ details: dropEndedAgentRuns({ ...state.details, [detail.agentRun.id]: detail }, Date.now()) }));
    }
    if (!announce) return;
    const notification = describeAgentRunNotification(detail, notificationContext(detail));
    // State advancement resolves old episodes durably, so cache eviction cannot
    // revive a blocker that this run already recovered from.
    for (const previous of useAppStore.getState().notifications) {
      if (previous.payload.agentRunId === detail.agentRun.id && previous.id !== notification?.id &&
          previous.kind.startsWith("agent_run.") && previous.kind !== "agent_run.completed" && !previous.readAt) {
        void useAppStore.getState().markNotificationRead({ id: previous.id, resolvedAt: detail.agentRun.updatedAt }).catch(() => {});
      }
    }
    if (notification) void persistRendererNotifications([notification]);
  }

  return {
    details: {},
    loaded: false,

    load: async () => {
      const api = agentRunsApi();
      if (!api) return;
      const listed = await api.list({ limit: LIST_LIMIT, includeActive: true, includeAttention: true }).catch(() => null);
      if (!listed?.ok) return;
      await Promise.all(
        listed.agentRuns.map(async (agentRun) => {
          const response = await api.get({ agentRunId: agentRun.id }).catch(() => null);
          // A sign-off that was waiting before Stave opened still deserves a
          // notification; the dedupe key keeps it to one.
          if (response?.ok && response.agentRun) store(response.agentRun, true);
        }),
      );
      set({ loaded: true });
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
      const kept = dropEndedAgentRuns(details, now);
      if (kept !== details) set({ details: kept });
    },
  };
});

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
      window.clearInterval(timer);
    };
  }, []);
}
