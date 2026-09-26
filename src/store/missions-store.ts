/**
 * Renderer state for missions: the latest mission of each task in the active
 * workspace, its detail and its transcript dividers.
 *
 * A store of its own rather than a slice of `app.store.ts`, which is at its
 * line ratchet, and because mission state changes on host events, not on the
 * turn stream. The host is the source of truth: every command returns the
 * mission as it is afterwards, and `missions:changed` refreshes the rest.
 *
 * Selectors must stay row-local and return stored references only (see
 * `docs/developer/zustand-selector-stability.md`).
 */
import { useEffect } from "react";
import { create } from "zustand";
import type {
  MissionChangedEvent,
  MissionCommandResponse,
  MissionDetail,
  MissionFailureCode,
  MissionsBridgeApi,
} from "@/lib/missions/api";
import { isActiveMissionState, type Mission } from "@/lib/missions/domain";
import { buildMissionTurnDividers } from "@/lib/missions/mission-view";
import { useAppStore } from "@/store/app.store";

type CommandName =
  | "signOff"
  | "requestChanges"
  | "skipStage"
  | "retryStage"
  | "pause"
  | "resume"
  | "takeOver"
  | "acceptRuntime"
  | "cancel";

export interface MissionCommandFailure {
  code: MissionFailureCode;
  message: string;
}

interface MissionsState {
  workspaceId: string | null;
  /** `${workspaceId}:${taskId}` → the task's active mission, else its newest. */
  missionIdByTask: Record<string, string>;
  details: Record<string, MissionDetail>;
  /** Turn id → divider text, per mission. Rebuilt with its detail. */
  dividersByMission: Record<string, ReadonlyMap<string, string>>;
  failureByMission: Record<string, MissionCommandFailure | undefined>;
  pendingByMission: Record<string, CommandName | undefined>;
  loadWorkspace: (workspaceId: string | null) => Promise<void>;
  refreshMission: (missionId: string) => Promise<void>;
  runCommand: <A extends CommandName>(
    command: A,
    args: Parameters<MissionsBridgeApi[A]>[0],
  ) => Promise<MissionCommandResponse>;
}

export function missionTaskKey(workspaceId: string, taskId: string) {
  return `${workspaceId}:${taskId}`;
}

function missionsApi(): MissionsBridgeApi | null {
  return typeof window === "undefined" ? null : (window.api?.missions ?? null);
}

const timeFormatter =
  typeof Intl === "undefined"
    ? null
    : new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

function formatTime(iso: string) {
  const date = new Date(iso);
  return timeFormatter ? timeFormatter.format(date) : date.toISOString().slice(11, 16);
}

/** The task's mission to show: an active one wins, else the newest. */
function pickMissionPerTask(missions: readonly Mission[]) {
  const picked = new Map<string, Mission>();
  for (const mission of missions) {
    const current = picked.get(mission.leadTaskId);
    if (
      !current ||
      (isActiveMissionState(mission.state) && !isActiveMissionState(current.state)) ||
      (isActiveMissionState(mission.state) === isActiveMissionState(current.state) &&
        mission.createdAt > current.createdAt)
    ) {
      picked.set(mission.leadTaskId, mission);
    }
  }
  return picked;
}

export const useMissionsStore = create<MissionsState>()((set, get) => {
  function storeDetail(detail: MissionDetail) {
    const { mission } = detail;
    set((state) => {
      const key = missionTaskKey(mission.workspaceId, mission.leadTaskId);
      const currentId = state.missionIdByTask[key];
      const current = currentId ? state.details[currentId]?.mission : undefined;
      const replaces =
        !current ||
        current.id === mission.id ||
        isActiveMissionState(mission.state) ||
        (!isActiveMissionState(current.state) && mission.createdAt > current.createdAt);
      return {
        details: { ...state.details, [mission.id]: detail },
        dividersByMission: {
          ...state.dividersByMission,
          [mission.id]: buildMissionTurnDividers(detail, formatTime),
        },
        missionIdByTask: replaces
          ? { ...state.missionIdByTask, [key]: mission.id }
          : state.missionIdByTask,
      };
    });
  }

  return {
    workspaceId: null,
    missionIdByTask: {},
    details: {},
    dividersByMission: {},
    failureByMission: {},
    pendingByMission: {},

    loadWorkspace: async (workspaceId) => {
      set({ workspaceId, missionIdByTask: {}, details: {}, dividersByMission: {} });
      const api = missionsApi();
      if (!api || !workspaceId) return;
      const listed = await api.list({ workspaceId }).catch(() => null);
      if (!listed?.ok || get().workspaceId !== workspaceId) return;
      const picked = pickMissionPerTask(listed.missions);
      await Promise.all(
        [...picked.values()].map(async (mission) => {
          const response = await api.get({ missionId: mission.id }).catch(() => null);
          if (response?.ok && response.mission && get().workspaceId === workspaceId) {
            storeDetail(response.mission);
          }
        }),
      );
    },

    refreshMission: async (missionId) => {
      const api = missionsApi();
      if (!api) return;
      const response = await api.get({ missionId }).catch(() => null);
      const detail = response?.ok ? response.mission : null;
      if (detail && detail.mission.workspaceId === get().workspaceId) storeDetail(detail);
    },

    runCommand: async (command, args) => {
      const api = missionsApi();
      const missionId = (args as { missionId: string }).missionId;
      if (!api) {
        return { ok: false, mission: null, code: "failed", message: "Missions are unavailable here." };
      }
      set((state) => ({
        pendingByMission: { ...state.pendingByMission, [missionId]: command },
        failureByMission: { ...state.failureByMission, [missionId]: undefined },
      }));
      const call = api[command] as (value: typeof args) => Promise<MissionCommandResponse>;
      const response = await call(args).catch(
        (error: unknown): MissionCommandResponse => ({
          ok: false,
          mission: null,
          code: "failed",
          message: error instanceof Error ? error.message : "The mission request failed.",
        }),
      );
      set((state) => ({ pendingByMission: { ...state.pendingByMission, [missionId]: undefined } }));
      if (response.ok && response.mission) {
        storeDetail(response.mission);
      } else {
        set((state) => ({
          failureByMission: {
            ...state.failureByMission,
            [missionId]: {
              code: response.code ?? "failed",
              message: response.message ?? "The mission request failed.",
            },
          },
        }));
        // A stale card means the mission moved on: show where it is now.
        if (response.code === "stale-identity") void get().refreshMission(missionId);
      }
      return response;
    },
  };
});

/** The task's mission detail, or undefined. Returns the stored reference. */
export function useTaskMission(workspaceId: string, taskId: string): MissionDetail | undefined {
  return useMissionsStore((state) => {
    const id = state.missionIdByTask[missionTaskKey(workspaceId, taskId)];
    return id ? state.details[id] : undefined;
  });
}

/** The divider text for a turn a mission started, or null. */
export function useMissionTurnDivider(workspaceId: string, taskId: string, turnId: string | undefined) {
  return useMissionsStore((state) => {
    if (!turnId) return null;
    const id = state.missionIdByTask[missionTaskKey(workspaceId, taskId)];
    return (id && state.dividersByMission[id]?.get(turnId)) || null;
  });
}

/**
 * Keeps the store on the active workspace and applies host changes. Mount
 * once, near the app root.
 */
export function useMissionSync() {
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  useEffect(() => {
    void useMissionsStore.getState().loadWorkspace(workspaceId || null);
  }, [workspaceId]);
  useEffect(() => {
    const subscribe = missionsApi()?.subscribeChanged;
    if (!subscribe) return;
    return subscribe((event: MissionChangedEvent) => {
      const missions = useMissionsStore.getState();
      if (event.workspaceId !== missions.workspaceId) return;
      const known =
        missions.missionIdByTask[missionTaskKey(event.workspaceId, event.leadTaskId)] === event.missionId;
      void missions.refreshMission(event.missionId).then(() => {
        // A mission that just started opens its panel on the task in view.
        const app = useAppStore.getState();
        if (!known && event.state === "running" && app.activeTaskId === event.leadTaskId) {
          app.setLayout({ patch: { sidebarOverlayVisible: true, sidebarOverlayTab: "mission" } });
        }
      });
    });
  }, []);
}
