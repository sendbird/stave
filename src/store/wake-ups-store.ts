import { i18n } from "@/i18n/runtime";
/**
 * Renderer state for wake-ups in the active workspace: one entry per task,
 * with the summary the surfaces read. Refreshed on `wake-ups:changed`.
 *
 * Selectors return stored references only.
 */
import { useEffect } from "react";
import { create } from "zustand";
import type { WakeUpsBridgeApi } from "@/lib/supervision/wake-up-bridge";
import type { WakeUp, WakeUpSummary } from "@/lib/supervision/wake-up-policy";
import { useAppStore } from "@/store/app.store";

export interface TaskWakeUp {
  wakeUp: WakeUp;
  summary: WakeUpSummary;
}

interface WakeUpsState {
  workspaceId: string | null;
  /** `${workspaceId}:${taskId}` → the task's wake-up. */
  byTask: Record<string, TaskWakeUp>;
  pendingById: Record<string, boolean | undefined>;
  failureById: Record<string, string | undefined>;
  load: (workspaceId: string | null) => Promise<void>;
  setPaused: (id: string, paused: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

function wakeUpsApi(): WakeUpsBridgeApi | null {
  return typeof window === "undefined" ? null : (window.api?.wakeUps ?? null);
}

export function wakeUpTaskKey(workspaceId: string, taskId: string) {
  return `${workspaceId}:${taskId}`;
}

export const useWakeUpsStore = create<WakeUpsState>()((set, get) => {
  async function run(id: string, action: () => Promise<{ ok: boolean; message?: string }>) {
    set((state) => ({
      pendingById: { ...state.pendingById, [id]: true },
      failureById: { ...state.failureById, [id]: undefined },
    }));
    const result = await action().catch((error: unknown) => ({
      ok: false,
      message: error instanceof Error ? error.message : i18n.t("notifications:wakeUpsStore.theWakeUpRequestFailed"),
    }));
    set((state) => ({
      pendingById: { ...state.pendingById, [id]: undefined },
      failureById: { ...state.failureById, [id]: result.ok ? undefined : result.message },
    }));
    await get().load(get().workspaceId);
  }

  return {
    workspaceId: null,
    byTask: {},
    pendingById: {},
    failureById: {},
    load: async (workspaceId) => {
      if (workspaceId !== get().workspaceId) set({ workspaceId, byTask: {} });
      const api = wakeUpsApi();
      if (!api || !workspaceId) return;
      const listed = await api.list({ workspaceId }).catch(() => null);
      if (!listed?.ok || get().workspaceId !== workspaceId) return;
      const byTask: Record<string, TaskWakeUp> = {};
      listed.wakeUps.forEach((wakeUp, index) => {
        const summary = listed.summaries[index];
        if (summary) byTask[wakeUpTaskKey(workspaceId, wakeUp.taskId)] = { wakeUp, summary };
      });
      set({ byTask });
    },
    setPaused: (id, paused) =>
      run(id, () => wakeUpsApi()?.setPaused({ id, paused }) ?? Promise.resolve({ ok: false })),
    remove: (id) => run(id, () => wakeUpsApi()?.remove({ id }) ?? Promise.resolve({ ok: false })),
  };
});

export function useTaskWakeUp(workspaceId: string, taskId: string): TaskWakeUp | undefined {
  return useWakeUpsStore((state) => state.byTask[wakeUpTaskKey(workspaceId, taskId)]);
}

/** Keeps the store on the active workspace. Mount once, near the app root. */
export function useWakeUpSync() {
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  useEffect(() => {
    void useWakeUpsStore.getState().load(workspaceId || null);
  }, [workspaceId]);
  useEffect(() => {
    const subscribe = wakeUpsApi()?.subscribeChanged;
    if (!subscribe) return;
    return subscribe((event) => {
      const state = useWakeUpsStore.getState();
      if (event.workspaceId === state.workspaceId) void state.load(state.workspaceId);
    });
  }, []);
}
