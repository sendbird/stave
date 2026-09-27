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
  MissionStartArgs,
  MissionsBridgeApi,
} from "@/lib/missions/api";
import { isActiveMissionState, latestStageRecord, type Mission } from "@/lib/missions/domain";
import { buildMissionTurnDividers, isOlderMissionDetail } from "@/lib/missions/mission-view";
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
  /** The stage the command was about, as `stageId:attempt`, when known. */
  stageKey: string | null;
}

interface MissionsState {
  workspaceId: string | null;
  /** The workspace whose missions have finished loading. */
  loadedWorkspaceId: string | null;
  /** `${workspaceId}:${taskId}` → the task's active mission, else its newest. */
  missionIdByTask: Record<string, string>;
  /** `${workspaceId}:${taskId}` → every mission of the task seen here, oldest first. */
  missionIdsByTask: Record<string, readonly string[]>;
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
  /**
   * Starts a mission. When the answer is lost on the way back, it looks for
   * the mission before reporting a failure, so a retry never starts a second.
   */
  startMission: (input: MissionStartArgs) => Promise<MissionCommandResponse>;
}

export function missionTaskKey(workspaceId: string, taskId: string) {
  return `${workspaceId}:${taskId}`;
}

/** `stageId:attempt`, the key a command failure is scoped to. */
export function missionStageKey(stage: { stageId: string; attempt: number }) {
  return `${stage.stageId}:${stage.attempt}`;
}

function currentStageKey(detail: MissionDetail | undefined): string | null {
  const stage = detail?.mission.playbook.stages[detail.mission.currentStageIndex];
  const record = stage ? latestStageRecord(detail.stages, stage.id) : null;
  return record ? missionStageKey(record) : null;
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
    // A response that left the host before the stored one must not replace it.
    if (isOlderMissionDetail(detail, get().details[mission.id])) return;
    set((state) => {
      const key = missionTaskKey(mission.workspaceId, mission.leadTaskId);
      const currentId = state.missionIdByTask[key];
      const current = currentId ? state.details[currentId]?.mission : undefined;
      const replaces =
        !current ||
        current.id === mission.id ||
        isActiveMissionState(mission.state) ||
        (!isActiveMissionState(current.state) && mission.createdAt > current.createdAt);
      const known = state.missionIdsByTask[key] ?? [];
      return {
        details: { ...state.details, [mission.id]: detail },
        dividersByMission: {
          ...state.dividersByMission,
          [mission.id]: buildMissionTurnDividers(detail, formatTime),
        },
        missionIdByTask: replaces
          ? { ...state.missionIdByTask, [key]: mission.id }
          : state.missionIdByTask,
        missionIdsByTask: known.includes(mission.id)
          ? state.missionIdsByTask
          : { ...state.missionIdsByTask, [key]: [...known, mission.id] },
      };
    });
  }

  return {
    workspaceId: null,
    loadedWorkspaceId: null,
    missionIdByTask: {},
    missionIdsByTask: {},
    details: {},
    dividersByMission: {},
    failureByMission: {},
    pendingByMission: {},

    loadWorkspace: async (workspaceId) => {
      set({
        workspaceId,
        loadedWorkspaceId: null,
        missionIdByTask: {},
        missionIdsByTask: {},
        details: {},
        dividersByMission: {},
      });
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
      if (get().workspaceId === workspaceId) set({ loadedWorkspaceId: workspaceId });
    },

    refreshMission: async (missionId) => {
      const api = missionsApi();
      if (!api) return;
      const response = await api.get({ missionId }).catch(() => null);
      const detail = response?.ok ? response.mission : null;
      if (detail && detail.mission.workspaceId === get().workspaceId) storeDetail(detail);
    },

    startMission: async (input) => {
      const api = missionsApi();
      if (!api) return { ok: false, mission: null, code: "failed", message: "Missions need the desktop app." };
      try {
        const response = await api.start(input);
        if (response.ok && response.mission) storeDetail(response.mission);
        return response;
      } catch {
        // The start may have reached the host. Look before calling it failed.
        const listed = await api.list({ workspaceId: input.workspaceId }).catch(() => null);
        const started = listed?.ok
          ? listed.missions.find(
              (mission) => mission.leadTaskId === input.leadTaskId && isActiveMissionState(mission.state),
            )
          : undefined;
        const detail = started ? await api.get({ missionId: started.id }).catch(() => null) : null;
        if (detail?.ok && detail.mission) {
          storeDetail(detail.mission);
          return { ok: true, mission: detail.mission };
        }
        return {
          ok: false,
          mission: null,
          code: "failed",
          message: "Stave could not confirm that the mission started. Check the Mission panel before trying again.",
        };
      }
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
        // Scoped to the stage it was about, so it never shows on the next stage's card.
        const stage = args as { stageId?: unknown; attempt?: unknown };
        const stageKey =
          typeof stage.stageId === "string" && typeof stage.attempt === "number"
            ? missionStageKey({ stageId: stage.stageId, attempt: stage.attempt })
            : currentStageKey(get().details[missionId]);
        set((state) => ({
          failureByMission: {
            ...state.failureByMission,
            [missionId]: {
              code: response.code ?? "failed",
              message: response.message ?? "The mission request failed.",
              stageKey,
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

/**
 * The mission's last command failure while it is about the stage in view
 * (`stageId:attempt`), else null. A failure without a known stage, or a
 * caller without one, always shows.
 */
export function selectMissionFailure(
  state: Pick<MissionsState, "failureByMission">,
  missionId: string,
  stageKey: string | null,
): string | null {
  const failure = state.failureByMission[missionId];
  if (!failure) return null;
  return !failure.stageKey || !stageKey || failure.stageKey === stageKey ? failure.message : null;
}

export function useMissionFailure(missionId: string, stageKey: string | null): string | null {
  return useMissionsStore((state) => selectMissionFailure(state, missionId, stageKey));
}

/** The divider text for a turn any of the task's missions started, or null. */
export function selectMissionTurnDivider(
  state: Pick<MissionsState, "missionIdsByTask" | "dividersByMission">,
  workspaceId: string,
  taskId: string,
  turnId: string | undefined,
): string | null {
  if (!turnId) return null;
  for (const id of state.missionIdsByTask[missionTaskKey(workspaceId, taskId)] ?? []) {
    const text = state.dividersByMission[id]?.get(turnId);
    if (text) return text;
  }
  return null;
}

export function useMissionTurnDivider(workspaceId: string, taskId: string, turnId: string | undefined) {
  return useMissionsStore((state) => selectMissionTurnDivider(state, workspaceId, taskId, turnId));
}

/**
 * Whether a change event announces a mission that just started, as opposed
 * to one this store has not loaded yet. Until the workspace has loaded,
 * nothing counts as new.
 */
export function isNewlyStartedMission(
  state: Pick<MissionsState, "workspaceId" | "loadedWorkspaceId" | "missionIdByTask">,
  event: MissionChangedEvent,
): boolean {
  return (
    event.state === "running" &&
    state.workspaceId === event.workspaceId &&
    state.loadedWorkspaceId === event.workspaceId &&
    state.missionIdByTask[missionTaskKey(event.workspaceId, event.leadTaskId)] !== event.missionId
  );
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
      const started = isNewlyStartedMission(missions, event);
      void missions.refreshMission(event.missionId).then(() => {
        // A mission that just started opens its panel on the task in view,
        // unless the user has moved to another workspace meanwhile.
        const app = useAppStore.getState();
        if (
          started &&
          useMissionsStore.getState().workspaceId === event.workspaceId &&
          app.activeWorkspaceId === event.workspaceId &&
          app.activeTaskId === event.leadTaskId
        ) {
          app.setLayout({ patch: { sidebarOverlayVisible: true, sidebarOverlayTab: "mission" } });
        }
      });
    });
  }, []);
}
