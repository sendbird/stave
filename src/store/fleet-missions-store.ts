/**
 * Missions across every workspace, for Fleet: attention rows, work queue
 * lanes, stage rails on workspace cards, and the notifications a mission
 * raises when it stops for the user or finishes.
 *
 * The per-workspace `missions-store.ts` serves the task surfaces of the
 * workspace in view; this one keeps only what Fleet needs: the active
 * missions and the ones that ended while Stave was open.
 */
import { useEffect } from "react";
import { create } from "zustand";
import type { MissionDetail, MissionsBridgeApi } from "@/lib/missions/api";
import { currentStageRecord, isActiveMissionState } from "@/lib/missions/domain";
import { describeMissionNotification, describeSignOffReminder } from "@/lib/missions/notifications";
import { persistRendererNotifications } from "@/store/app-store-notification-runtime";
import { useAppStore } from "@/store/app.store";

const LIST_LIMIT = 100;
const REMINDER_CHECK_MS = 60_000;

interface FleetMissionsState {
  /** Mission id → detail, for active missions and those that ended this session. */
  details: Record<string, MissionDetail>;
  loaded: boolean;
  load: () => Promise<void>;
  refresh: (missionId: string) => Promise<void>;
}

function missionsApi(): MissionsBridgeApi | null {
  return typeof window === "undefined" ? null : (window.api?.missions ?? null);
}

/** Names the notification needs, from what the app already knows. */
function notificationContext(detail: MissionDetail) {
  const state = useAppStore.getState();
  const workspace = state.workspaces.find((candidate) => candidate.id === detail.mission.workspaceId);
  const task =
    state.tasks.find((candidate) => candidate.id === detail.mission.leadTaskId) ??
    state.workspaceRuntimeCacheById[detail.mission.workspaceId]?.tasks.find(
      (candidate) => candidate.id === detail.mission.leadTaskId,
    );
  return {
    repositoryPath: detail.mission.repositoryPath,
    repositoryName: detail.mission.repositoryPath.split(/[\\/]/).filter(Boolean).at(-1) ?? null,
    workspaceName: workspace?.name ?? null,
    taskTitle: task?.title ?? null,
  };
}

export const useFleetMissionsStore = create<FleetMissionsState>()((set, get) => {
  function store(detail: MissionDetail, announce: boolean) {
    set((state) => ({ details: { ...state.details, [detail.mission.id]: detail } }));
    if (!announce) return;
    const notification = describeMissionNotification(detail, notificationContext(detail));
    if (notification) void persistRendererNotifications([notification]);
  }

  return {
    details: {},
    loaded: false,

    load: async () => {
      const api = missionsApi();
      if (!api) return;
      const listed = await api.list({ limit: LIST_LIMIT }).catch(() => null);
      if (!listed?.ok) return;
      const active = listed.missions.filter((mission) => isActiveMissionState(mission.state));
      await Promise.all(
        active.map(async (mission) => {
          const response = await api.get({ missionId: mission.id }).catch(() => null);
          // A sign-off that was waiting before Stave opened still deserves a
          // notification; the dedupe key keeps it to one.
          if (response?.ok && response.mission) store(response.mission, true);
        }),
      );
      set({ loaded: true });
    },

    refresh: async (missionId) => {
      const api = missionsApi();
      if (!api) return;
      const response = await api.get({ missionId }).catch(() => null);
      if (response?.ok && response.mission) store(response.mission, true);
      else if (get().details[missionId]) {
        set((state) => {
          const { [missionId]: _gone, ...rest } = state.details;
          return { details: rest };
        });
      }
    },
  };
});

/** Active missions whose current stage waits for the user, with since when. */
export function listWaitingSignOffs(details: Record<string, MissionDetail>) {
  return Object.values(details).flatMap((detail) => {
    if (detail.mission.state !== "running") return [];
    const record = currentStageRecord(detail);
    if (record.status !== "awaiting-sign-off") return [];
    let since = detail.mission.updatedAt;
    for (let index = detail.events.length - 1; index >= 0; index -= 1) {
      const event = detail.events[index]!;
      // The wait began when the stage before it ended, or when the mission resumed.
      if (event.kind === "stage-completed" || event.kind === "stage-skipped" || event.kind === "resumed") {
        since = event.createdAt;
        break;
      }
    }
    return [{ detail, since }];
  });
}

/**
 * Mounted once in `App.tsx`: loads the missions, follows `missions:changed`
 * for every workspace, and sends the batched sign-off reminder.
 */
export function useFleetMissionSync() {
  useEffect(() => {
    const api = missionsApi();
    if (!api) return;
    const { load, refresh } = useFleetMissionsStore.getState();
    void load();
    const unsubscribe = api.subscribeChanged((event) => void refresh(event.missionId));
    const timer = window.setInterval(() => {
      const minutes = Math.max(0, Math.min(1_440, useAppStore.getState().settings.missionSignOffReminderMinutes || 0));
      const waiting = listWaitingSignOffs(useFleetMissionsStore.getState().details).map((entry) => ({
        ...entry,
        taskTitle: notificationContext(entry.detail).taskTitle,
      }));
      const reminder = describeSignOffReminder({ waiting, now: new Date(), intervalMinutes: minutes });
      if (reminder) void persistRendererNotifications([reminder]);
    }, REMINDER_CHECK_MS);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, []);
}
