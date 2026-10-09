import { formatTime as formatLocaleTime } from "@/i18n/format";
import { i18n } from "@/i18n/runtime";
/**
 * Renderer state for agent runs: the latest agent run of each task in the active
 * workspace, its detail and its transcript dividers.
 *
 * A store of its own rather than a slice of `app.store.ts`, which is at its
 * line ratchet, and because agent run state changes on host events, not on the
 * turn stream. The host is the source of truth: every command returns the
 * agent run as it is afterwards, and `agent-runs:changed` refreshes the rest.
 *
 * Selectors must stay row-local and return stored references only (see
 * `docs/developer/zustand-selector-stability.md`).
 */
import { useEffect } from "react";
import { create } from "zustand";
import type {
  AgentRunChangedEvent,
  AgentRunCommandResponse,
  AgentRunDetail,
  AgentRunFailureCode,
  AgentRunStartArgs,
  AgentRunsBridgeApi,
} from "@/lib/agent-runs/api";
import { isActiveAgentRunState, latestStageRecord, type AgentRun } from "@/lib/agent-runs/domain";
import { buildAgentRunTurnDividers, isOlderAgentRunDetail } from "@/lib/agent-runs/agent-run-view";
import { taskPanelLayoutPatch } from "@/lib/right-rail-panels";
import { hasAgentOrigin } from "@/lib/agent-runs/agent-run";
import { describeAgentRunStatus, resolveAgentRunFirstPrompt } from "@/lib/agent-runs/agent-run-status";
import { registerAgentRunBridge } from "@/store/agent-run-send";
import { useAppStore } from "@/store/app.store";
import { flushPendingSnapshotPersists, persistWorkspaceSnapshot } from "@/store/workspace-session-state";
import { getWorkspaceSessionForState } from "@/store/workspace-runtime-state";
import { resolveWorkspaceName } from "@/store/repository.utils";
import type { ChatMessage } from "@/types/chat";

const NO_MESSAGES: ChatMessage[] = [];

type CommandName =
  | "signOff"
  | "requestChanges"
  | "reply"
  | "skipStage"
  | "retryStage"
  | "pause"
  | "resume"
  | "takeOver"
  | "acceptRuntime"
  | "cancel";

export interface AgentRunCommandFailure {
  code: AgentRunFailureCode;
  message: string;
  /** The stage the command was about, as `stageId:attempt`, when known. */
  stageKey: string | null;
}

interface AgentRunsState {
  workspaceId: string | null;
  /** The workspace whose agent runs have finished loading. */
  loadedWorkspaceId: string | null;
  /** `${workspaceId}:${taskId}` → the task's active agent run, else its newest. */
  agentRunIdByTask: Record<string, string>;
  /** `${workspaceId}:${taskId}` → every agent run of the task seen here, oldest first. */
  agentRunIdsByTask: Record<string, readonly string[]>;
  details: Record<string, AgentRunDetail>;
  /** Turn id → divider text, per agent run. Rebuilt with its detail. */
  dividersByAgentRun: Record<string, ReadonlyMap<string, string>>;
  failureByAgentRun: Record<string, AgentRunCommandFailure | undefined>;
  pendingByAgentRun: Record<string, CommandName | undefined>;
  loadWorkspace: (workspaceId: string | null) => Promise<void>;
  refreshAgentRun: (agentRunId: string) => Promise<void>;
  runCommand: <A extends CommandName>(
    command: A,
    args: Parameters<AgentRunsBridgeApi[A]>[0],
  ) => Promise<AgentRunCommandResponse>;
  /**
   * Starts an agent run. When the answer is lost on the way back, it looks for
   * the agent run before reporting a failure, so a retry never starts a second.
   */
  startAgentRun: (input: AgentRunStartArgs) => Promise<AgentRunCommandResponse>;
}

export function agentRunTaskKey(workspaceId: string, taskId: string) {
  return `${workspaceId}:${taskId}`;
}

/** `stageId:attempt`, the key a command failure is scoped to. */
export function agentRunStageKey(stage: { stageId: string; attempt: number }) {
  return `${stage.stageId}:${stage.attempt}`;
}

function currentStageKey(detail: AgentRunDetail | undefined): string | null {
  const stage = detail?.agentRun.workflow.stages[detail.agentRun.currentStageIndex];
  const record = stage ? latestStageRecord(detail.stages, stage.id) : null;
  return record ? agentRunStageKey(record) : null;
}

function agentRunsApi(): AgentRunsBridgeApi | null {
  return typeof window === "undefined" ? null : (window.api?.agentRuns ?? null);
}

const formatTime = (iso: string) => formatLocaleTime(iso, { hour: "2-digit", minute: "2-digit" });

/** The task's agent run to show: an active one wins, else the newest. */
function pickAgentRunPerTask(agentRuns: readonly AgentRun[]) {
  const picked = new Map<string, AgentRun>();
  for (const agentRun of agentRuns) {
    const current = picked.get(agentRun.leadTaskId);
    if (
      !current ||
      (isActiveAgentRunState(agentRun.state) && !isActiveAgentRunState(current.state)) ||
      (isActiveAgentRunState(agentRun.state) === isActiveAgentRunState(current.state) &&
        agentRun.createdAt > current.createdAt)
    ) {
      picked.set(agentRun.leadTaskId, agentRun);
    }
  }
  return picked;
}

export const useAgentRunsStore = create<AgentRunsState>()((set, get) => {
  function storeDetail(detail: AgentRunDetail) {
    const { agentRun } = detail;
    // A response that left the host before the stored one must not replace it.
    if (isOlderAgentRunDetail(detail, get().details[agentRun.id])) return;
    set((state) => {
      const key = agentRunTaskKey(agentRun.workspaceId, agentRun.leadTaskId);
      const currentId = state.agentRunIdByTask[key];
      const current = currentId ? state.details[currentId]?.agentRun : undefined;
      const replaces =
        !current ||
        current.id === agentRun.id ||
        isActiveAgentRunState(agentRun.state) ||
        (!isActiveAgentRunState(current.state) && agentRun.createdAt > current.createdAt);
      const known = state.agentRunIdsByTask[key] ?? [];
      return {
        details: { ...state.details, [agentRun.id]: detail },
        dividersByAgentRun: {
          ...state.dividersByAgentRun,
          [agentRun.id]: buildAgentRunTurnDividers(detail, formatTime),
        },
        agentRunIdByTask: replaces
          ? { ...state.agentRunIdByTask, [key]: agentRun.id }
          : state.agentRunIdByTask,
        agentRunIdsByTask: known.includes(agentRun.id)
          ? state.agentRunIdsByTask
          : { ...state.agentRunIdsByTask, [key]: [...known, agentRun.id] },
      };
    });
  }

  return {
    workspaceId: null,
    loadedWorkspaceId: null,
    agentRunIdByTask: {},
    agentRunIdsByTask: {},
    details: {},
    dividersByAgentRun: {},
    failureByAgentRun: {},
    pendingByAgentRun: {},

    loadWorkspace: async (workspaceId) => {
      set({
        workspaceId,
        loadedWorkspaceId: null,
        agentRunIdByTask: {},
        agentRunIdsByTask: {},
        details: {},
        dividersByAgentRun: {},
      });
      const api = agentRunsApi();
      if (!api || !workspaceId) return;
      const listed = await api.list({ workspaceId, includeActive: true }).catch(() => null);
      if (!listed?.ok || get().workspaceId !== workspaceId) return;
      const picked = pickAgentRunPerTask(listed.agentRuns);
      await Promise.all(
        [...picked.values()].map(async (agentRun) => {
          const response = await api.get({ agentRunId: agentRun.id }).catch(() => null);
          if (response?.ok && response.agentRun && get().workspaceId === workspaceId) {
            storeDetail(response.agentRun);
          }
        }),
      );
      if (get().workspaceId === workspaceId) set({ loadedWorkspaceId: workspaceId });
    },

    refreshAgentRun: async (agentRunId) => {
      const api = agentRunsApi();
      if (!api) return;
      const response = await api.get({ agentRunId }).catch(() => null);
      const detail = response?.ok ? response.agentRun : null;
      if (detail && detail.agentRun.workspaceId === get().workspaceId) storeDetail(detail);
    },

    startAgentRun: async (input) => {
      const api = agentRunsApi();
      if (!api) return { ok: false, agentRun: null, code: "failed", message: i18n.t("agentRuns:agentRunsStore.message") };
      try {
        // Kickoff can create a task just before this send. The host must see
        // its acknowledged snapshot before it checks the lead task.
        const state = useAppStore.getState();
        const session = getWorkspaceSessionForState({ state, workspaceId: input.workspaceId });
        if (session?.tasks.some((task) => task.id === input.leadTaskId)) {
          // The renderer's autosave timer may not have enqueued this task yet.
          await persistWorkspaceSnapshot({
            ...session, workspaceId: input.workspaceId,
            workspaceName: resolveWorkspaceName({ state, workspaceId: input.workspaceId }),
          });
        }
        await flushPendingSnapshotPersists(input.workspaceId);
      } catch {
        return { ok: false, agentRun: null, code: "failed", message: i18n.t("agentRuns:agentRunsStore.saveFailed") };
      }
      try {
        const response = await api.start(input);
        if (response.ok && response.agentRun) storeDetail(response.agentRun);
        return response;
      } catch {
        // The start may have reached the host. Look before calling it failed.
        const listed = await api.list({ workspaceId: input.workspaceId, includeActive: true }).catch(() => null);
        const started = listed?.ok
          ? listed.agentRuns.find(
              (agentRun) => agentRun.leadTaskId === input.leadTaskId && isActiveAgentRunState(agentRun.state),
            )
          : undefined;
        const detail = started ? await api.get({ agentRunId: started.id }).catch(() => null) : null;
        if (detail?.ok && detail.agentRun) {
          storeDetail(detail.agentRun);
          return { ok: true, agentRun: detail.agentRun };
        }
        return {
          ok: false,
          agentRun: null,
          code: "failed",
          message: i18n.t("agentRuns:agentRunsStore.message2"),
        };
      }
    },

    runCommand: async (command, args) => {
      const api = agentRunsApi();
      const agentRunId = (args as { agentRunId: string }).agentRunId;
      if (!api) {
        return { ok: false, agentRun: null, code: "failed", message: i18n.t("agentRuns:agentRunsStore.message3") };
      }
      set((state) => ({
        pendingByAgentRun: { ...state.pendingByAgentRun, [agentRunId]: command },
        failureByAgentRun: { ...state.failureByAgentRun, [agentRunId]: undefined },
      }));
      const call = api[command] as (value: typeof args) => Promise<AgentRunCommandResponse>;
      const response = await call(args).catch(
        (error: unknown): AgentRunCommandResponse => ({
          ok: false,
          agentRun: null,
          code: "failed",
          message: error instanceof Error ? error.message : i18n.t("agentRuns:agentRunsStore.message4"),
        }),
      );
      set((state) => ({ pendingByAgentRun: { ...state.pendingByAgentRun, [agentRunId]: undefined } }));
      if (response.ok && response.agentRun) {
        storeDetail(response.agentRun);
      } else {
        // Scoped to the stage it was about, so it never shows on the next stage's card.
        const stage = args as { stageId?: unknown; attempt?: unknown };
        const stageKey =
          typeof stage.stageId === "string" && typeof stage.attempt === "number"
            ? agentRunStageKey({ stageId: stage.stageId, attempt: stage.attempt })
            : currentStageKey(get().details[agentRunId]);
        set((state) => ({
          failureByAgentRun: {
            ...state.failureByAgentRun,
            [agentRunId]: {
              code: response.code ?? "failed",
              message: response.message ?? i18n.t("agentRuns:agentRunsStore.message5"),
              stageKey,
            },
          },
        }));
        // A stale card means the agent run moved on: show where it is now.
        if (response.code === "stale-identity") void get().refreshAgentRun(agentRunId);
      }
      return response;
    },
  };
});

/** The send path and Stop reach agent runs through this bridge (`agent-run-send.ts`). */
registerAgentRunBridge({
  activeAgentRun: (workspaceId, taskId) => {
    const state = useAgentRunsStore.getState();
    if (state.loadedWorkspaceId !== workspaceId) return undefined;
    const id = state.agentRunIdByTask[agentRunTaskKey(workspaceId, taskId)];
    const agentRun = id ? state.details[id]?.agentRun : undefined;
    return agentRun && isActiveAgentRunState(agentRun.state) ? { id: agentRun.id, agentOrigin: hasAgentOrigin(agentRun) } : null;
  },
  start: (input) => useAgentRunsStore.getState().startAgentRun(input),
  cancel: (agentRunId) => useAgentRunsStore.getState().runCommand("cancel", { agentRunId }),
  watchFirstPrompt: ({ taskId, agentRunId }, onEnd) => {
    // Both stores notify synchronously, so the pending row ends in the same
    // render the run's row arrives in. Unchanged inputs skip the scan.
    let lastMessages: unknown = null;
    let lastDetail: unknown = null;
    let done = false;
    const check = () => {
      if (done) return;
      const messages = useAppStore.getState().messagesByTask[taskId] ?? NO_MESSAGES;
      const detail = useAgentRunsStore.getState().details[agentRunId];
      if (messages === lastMessages && detail === lastDetail) return;
      lastMessages = messages;
      lastDetail = detail;
      const state = resolveAgentRunFirstPrompt({ agentRunId, messages, detail });
      if (state === "pending") return;
      done = true;
      stopApp();
      stopAgentRuns();
      onEnd(
        state === "landed"
          ? { outcome: "landed" }
          : { outcome: "ended", reason: detail ? describeAgentRunStatus(detail).reason : null },
      );
    };
    const stopApp = useAppStore.subscribe(check);
    const stopAgentRuns = useAgentRunsStore.subscribe(check);
    check();
  },
});

/** The task's agent run detail, or undefined. Returns the stored reference. */
export function useTaskAgentRun(workspaceId: string, taskId: string): AgentRunDetail | undefined {
  return useAgentRunsStore((state) => {
    const id = state.agentRunIdByTask[agentRunTaskKey(workspaceId, taskId)];
    return id ? state.details[id] : undefined;
  });
}

/**
 * The agent run's last command failure while it is about the stage in view
 * (`stageId:attempt`), else null. A failure without a known stage, or a
 * caller without one, always shows.
 */
export function selectAgentRunFailure(
  state: Pick<AgentRunsState, "failureByAgentRun">,
  agentRunId: string,
  stageKey: string | null,
): string | null {
  const failure = state.failureByAgentRun[agentRunId];
  if (!failure) return null;
  return !failure.stageKey || !stageKey || failure.stageKey === stageKey ? failure.message : null;
}

export function useAgentRunFailure(agentRunId: string, stageKey: string | null): string | null {
  return useAgentRunsStore((state) => selectAgentRunFailure(state, agentRunId, stageKey));
}

/** The divider text for a turn any of the task's agent runs started, or null. */
export function selectAgentRunTurnDivider(
  state: Pick<AgentRunsState, "agentRunIdsByTask" | "dividersByAgentRun">,
  workspaceId: string,
  taskId: string,
  turnId: string | undefined,
): string | null {
  if (!turnId) return null;
  for (const id of state.agentRunIdsByTask[agentRunTaskKey(workspaceId, taskId)] ?? []) {
    const text = state.dividersByAgentRun[id]?.get(turnId);
    if (text) return text;
  }
  return null;
}

export function useAgentRunTurnDivider(workspaceId: string, taskId: string, turnId: string | undefined) {
  return useAgentRunsStore((state) => selectAgentRunTurnDivider(state, workspaceId, taskId, turnId));
}

/**
 * The agent run that started a turn of the task, or null when no agent run did
 * or the agent run is a workflow's. Returns the stored agent run, so it is safe as
 * a selector result.
 */
export function selectAgentRunForTurn(
  state: Pick<AgentRunsState, "agentRunIdsByTask" | "dividersByAgentRun" | "details">,
  workspaceId: string,
  taskId: string,
  turnId: string | undefined,
): AgentRun | null {
  if (!turnId) return null;
  for (const id of state.agentRunIdsByTask[agentRunTaskKey(workspaceId, taskId)] ?? []) {
    if (!state.dividersByAgentRun[id]?.has(turnId)) continue;
    const agentRun = state.details[id]?.agentRun;
    return agentRun && hasAgentOrigin(agentRun) ? agentRun : null;
  }
  return null;
}

export function useAgentRunForTurn(workspaceId: string, taskId: string, turnId: string | undefined) {
  return useAgentRunsStore((state) => selectAgentRunForTurn(state, workspaceId, taskId, turnId));
}

/**
 * Whether a change event announces an agent run that just started, as opposed
 * to one this store has not loaded yet. Until the workspace has loaded,
 * nothing counts as new.
 */
export function isNewlyStartedAgentRun(
  state: Pick<AgentRunsState, "workspaceId" | "loadedWorkspaceId" | "agentRunIdByTask">,
  event: AgentRunChangedEvent,
): boolean {
  return (
    event.state === "running" &&
    state.workspaceId === event.workspaceId &&
    state.loadedWorkspaceId === event.workspaceId &&
    state.agentRunIdByTask[agentRunTaskKey(event.workspaceId, event.leadTaskId)] !== event.agentRunId
  );
}

/**
 * Keeps the store on the active workspace and applies host changes. Mount
 * once, near the app root.
 */
export function useAgentRunSync() {
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  useEffect(() => {
    void useAgentRunsStore.getState().loadWorkspace(workspaceId || null);
  }, [workspaceId]);
  useEffect(() => {
    const subscribe = agentRunsApi()?.subscribeChanged;
    if (!subscribe) return;
    return subscribe((event: AgentRunChangedEvent) => {
      const agentRuns = useAgentRunsStore.getState();
      if (event.workspaceId !== agentRuns.workspaceId) return;
      const started = isNewlyStartedAgentRun(agentRuns, event);
      void agentRuns.refreshAgentRun(event.agentRunId).then(() => {
        // An agent run that just started opens its panel on the task in view,
        // unless the user has moved to another workspace meanwhile.
        const app = useAppStore.getState();
        if (
          started &&
          useAgentRunsStore.getState().workspaceId === event.workspaceId &&
          app.activeWorkspaceId === event.workspaceId &&
          app.activeTaskId === event.leadTaskId
        ) {
          app.setLayout({ patch: taskPanelLayoutPatch("progress") });
        }
      });
    });
  }, []);
}
