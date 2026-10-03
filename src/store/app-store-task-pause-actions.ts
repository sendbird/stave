import type { StoreApi } from "zustand";
import { resolveAccountUsageBlock } from "@/lib/providers/account-usage-block";
import { toast } from "@/lib/notifications/toast";
import { buildUsageLimitContinuationPrompt } from "@/lib/providers/usage-limit-stop";
import type { AppState } from "@/store/app-store.types";
import { removeRecordEntries } from "@/store/task-turn-runtime-cleanup";
import {
  resolveUsageLimitAutoResumeAt,
  type TaskUsageLimitPause,
} from "@/store/task-work-pause";
import { getWorkspaceSessionForState } from "@/store/workspace-runtime-state";

type TaskPauseActionKey =
  | "pauseTaskForUsageLimit"
  | "resumePausedTaskWork"
  | "setUsageLimitAutoResume"
  | "dismissUsageLimitPause";

type TaskPauseActions = Pick<AppState, TaskPauseActionKey>;

function readUsageLimitReset(args: {
  state: Pick<AppState, "rateLimitsSnapshot">;
  providerId: TaskUsageLimitPause["providerId"];
  model?: string;
}): { resetsAt: number | null; windowLabel: string } | null {
  const block = resolveAccountUsageBlock({
    providerId: args.providerId,
    model: args.model,
    snapshot: args.state.rateLimitsSnapshot,
  });
  if (!block) {
    return null;
  }
  return {
    resetsAt: block.resetsAt == null ? null : block.resetsAt * 1000,
    windowLabel: block.windowLabel,
  };
}

export function createTaskPauseActions(args: {
  set: StoreApi<AppState>["setState"];
  get: StoreApi<AppState>["getState"];
  /** Drains a task's queue; it honours every pause, so release first. */
  dispatchNextQueuedTaskTurn: (target: { workspaceId: string; taskId: string }) => void;
}): TaskPauseActions {
  const { set, get } = args;

  const patchPause = (
    taskId: string,
    update: (pause: TaskUsageLimitPause) => TaskUsageLimitPause | null,
  ) => {
    set((state) => {
      const current = state.usageLimitPauseByTask[taskId];
      if (!current) {
        return state;
      }
      const next = update(current);
      if (next === current) {
        return state;
      }
      if (!next) {
        return {
          usageLimitPauseByTask:
            removeRecordEntries(state.usageLimitPauseByTask, [taskId]) ??
            state.usageLimitPauseByTask,
        };
      }
      return {
        usageLimitPauseByTask: { ...state.usageLimitPauseByTask, [taskId]: next },
      };
    });
  };

  /** Fill in, or move, the reset time from the latest usage reading. */
  const applyUsageReading = (taskId: string) => {
    patchPause(taskId, (pause) => {
      const reading = readUsageLimitReset({
        state: get(),
        providerId: pause.providerId,
        model: pause.model,
      });
      if (!reading || reading.resetsAt === pause.resetsAt) {
        return pause;
      }
      const autoResumeAt =
        pause.autoResumeAt != null
          ? resolveUsageLimitAutoResumeAt({
              resetsAt: reading.resetsAt,
              now: Date.now(),
            })
          : null;
      const { autoResumeAt: _armed, ...rest } = pause;
      return {
        ...rest,
        resetsAt: reading.resetsAt,
        windowLabel: reading.windowLabel,
        ...(autoResumeAt != null ? { autoResumeAt } : {}),
      };
    });
  };

  const pauseTaskForUsageLimit: AppState["pauseTaskForUsageLimit"] = (pauseArgs) => {
    const now = Date.now();
    set((state) => {
      const current = state.usageLimitPauseByTask[pauseArgs.taskId];
      const reading = pauseArgs.usageLimit
        ? {
            resetsAt: pauseArgs.usageLimit.resetsAt,
            windowLabel: pauseArgs.usageLimit.windowLabel,
          }
        : readUsageLimitReset({
            state,
            providerId: pauseArgs.providerId,
            model: pauseArgs.model,
          });
      const resetsAt = reading?.resetsAt ?? current?.resetsAt ?? null;
      // A pause that was armed stays armed: an automatic resume refused by a
      // still-exhausted window waits for the next reset instead.
      const autoResumeAt =
        current?.autoResumeAt != null
          ? resolveUsageLimitAutoResumeAt({ resetsAt, now })
          : null;
      const model = pauseArgs.model ?? current?.model;
      const windowLabel = reading?.windowLabel ?? current?.windowLabel;
      const next: TaskUsageLimitPause = {
        workspaceId: pauseArgs.workspaceId,
        providerId: pauseArgs.providerId,
        ...(model ? { model } : {}),
        stoppedTurn: pauseArgs.stoppedTurn || (current?.stoppedTurn ?? false),
        pausedAt: current?.pausedAt ?? now,
        resetsAt,
        ...(windowLabel ? { windowLabel } : {}),
        ...(autoResumeAt != null ? { autoResumeAt } : {}),
      };
      return {
        usageLimitPauseByTask: {
          ...state.usageLimitPauseByTask,
          [pauseArgs.taskId]: next,
        },
      };
    });
    if (!pauseArgs.usageLimit) {
      // A stopped turn only says it hit the limit. A fresh usage read says
      // which window ran out and when it resets.
      void get()
        .refreshRateLimits({ providers: [pauseArgs.providerId], force: true })
        .then(() => applyUsageReading(pauseArgs.taskId))
        .catch(() => undefined);
    }
  };

  const resumePausedTaskWork: AppState["resumePausedTaskWork"] = async ({
    taskId,
    trigger = "user",
  }) => {
    const pause = get().usageLimitPauseByTask[taskId];
    if (trigger === "auto") {
      if (!pause || pause.autoResumeAt == null) {
        return;
      }
      // Read usage once more before sending: the reset can move, and another
      // window (weekly after the 5-hour one) may still be out.
      await get()
        .refreshRateLimits({ providers: [pause.providerId], force: true })
        .catch(() => undefined);
      const reading = readUsageLimitReset({
        state: get(),
        providerId: pause.providerId,
        model: pause.model,
      });
      if (reading) {
        const autoResumeAt = resolveUsageLimitAutoResumeAt({
          resetsAt: reading.resetsAt,
          now: Date.now(),
        });
        patchPause(taskId, (current) => {
          const { autoResumeAt: _armed, ...rest } = current;
          return {
            ...rest,
            resetsAt: reading.resetsAt,
            windowLabel: reading.windowLabel,
            // An exhausted window with no reset time cannot be waited for;
            // the pause stays for the user to resume by hand.
            ...(autoResumeAt != null ? { autoResumeAt } : {}),
          };
        });
        return;
      }
    }

    const state = get();
    const workspaceId =
      pause?.workspaceId ??
      state.taskWorkspaceIdById[taskId] ??
      state.activeWorkspaceId;
    set((current) => ({
      usageLimitPauseByTask:
        removeRecordEntries(current.usageLimitPauseByTask, [taskId]) ??
        current.usageLimitPauseByTask,
      restoredQueueReleasedByTask: current.restoredQueueReleasedByTask[taskId]
        ? current.restoredQueueReleasedByTask
        : { ...current.restoredQueueReleasedByTask, [taskId]: true },
    }));

    const session = getWorkspaceSessionForState({ state: get(), workspaceId });
    if (!session || session.activeTurnIdsByTask[taskId]) {
      // The running turn drains the released queue when it finishes.
      return;
    }
    if (!pause?.stoppedTurn) {
      args.dispatchNextQueuedTaskTurn({ workspaceId, taskId });
      return;
    }

    const repause = () =>
      get().pauseTaskForUsageLimit({
        taskId,
        workspaceId,
        providerId: pause.providerId,
        model: pause.model,
        stoppedTurn: true,
      });
    try {
      const result = await get().sendUserMessage({
        taskId,
        content: buildUsageLimitContinuationPrompt(),
        preservePromptDraft: true,
        runtimeOverrides: session.promptDraftByTask[taskId]?.runtimeOverrides,
        turnOrigin: "conversation",
      });
      if (result.status === "blocked") {
        if (result.reason === "account-limit") {
          get().pauseTaskForUsageLimit({
            taskId,
            workspaceId,
            providerId: result.usageLimit?.providerId ?? pause.providerId,
            model: result.usageLimit?.model ?? pause.model,
            stoppedTurn: true,
            usageLimit: result.usageLimit,
          });
          return;
        }
        repause();
        toast.warning("Couldn't resume the task", {
          description:
            result.message ??
            "The task is busy or waiting on another action. It stays paused.",
        });
      } else if (result.status === "send-failed") {
        repause();
        toast.error("Couldn't resume the task", { description: result.message });
      }
    } catch (error) {
      repause();
      toast.error("Couldn't resume the task", {
        description:
          error instanceof Error ? error.message : "The continuation turn did not start.",
      });
    }
  };

  return {
    pauseTaskForUsageLimit,
    resumePausedTaskWork,
    setUsageLimitAutoResume: ({ taskId, enabled }) => {
      patchPause(taskId, (pause) => {
        if (!enabled) {
          if (pause.autoResumeAt == null) {
            return pause;
          }
          const { autoResumeAt: _armed, ...rest } = pause;
          return rest;
        }
        const autoResumeAt = resolveUsageLimitAutoResumeAt({
          resetsAt: pause.resetsAt,
          now: Date.now(),
        });
        return autoResumeAt == null ? pause : { ...pause, autoResumeAt };
      });
    },
    dismissUsageLimitPause: ({ taskId }) => {
      patchPause(taskId, () => null);
    },
  };
}
