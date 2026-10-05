import type { StoreApi } from "zustand";
import { collectProviderAccountUsageWindows, resolveAccountUsageBlock } from "@/lib/providers/account-usage-block";
import { selectedProviderAccount } from "@/lib/providers/provider-account-selection";
import type { RateLimitsSnapshotResponse } from "@/lib/providers/provider.types";
import { toast } from "@/lib/notifications/toast";
import { buildUsageLimitContinuationPrompt } from "@/lib/providers/usage-limit-stop";
import type { AppState } from "@/store/app-store.types";
import { removeRecordEntries } from "@/store/task-turn-runtime-cleanup";
import {
  resolveUsageLimitAutoResumeAt,
  type TaskUsageLimitPause,
} from "@/store/task-work-pause";
import { getWorkspaceSessionForState } from "@/store/workspace-runtime-state";
import { readProviderAccountUsage } from "@/store/account-usage-guard";

type TaskPauseActionKey =
  | "pauseTaskForUsageLimit"
  | "resumePausedTaskWork"
  | "setUsageLimitAutoResume"
  | "dismissUsageLimitPause";

type TaskPauseActions = Pick<AppState, TaskPauseActionKey>;

/** How long after an armed resume a refusal keeps the pause armed. */
const AUTO_RESUME_RETRY_WINDOW_MS = 2 * 60_000;

function readUsageLimitReset(args: {
  snapshot: RateLimitsSnapshotResponse | null;
  providerId: TaskUsageLimitPause["providerId"];
  model?: string;
}): { resetsAt: number | null; windowLabel: string } | null {
  const block = resolveAccountUsageBlock({
    providerId: args.providerId,
    model: args.model,
    snapshot: args.snapshot,
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
  /**
   * Tasks an armed resume just released. Releasing drops the pause, so a
   * refusal right after (the limit still holds, or a queued turn pinned to
   * another account is refused) re-creates it; within this window it comes
   * back armed for the next reset instead of waiting for the user again.
   */
  const autoResumeRetryUntil = new Map<string, number>();

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
  const applyUsageReading = (taskId: string, expected: TaskUsageLimitPause, snapshot: RateLimitsSnapshotResponse) => {
    patchPause(taskId, (pause) => {
      if (pause !== expected) return pause;
      const reading = readUsageLimitReset({
        snapshot,
        providerId: pause.providerId,
        model: pause.model,
      });
      const retry =
        pause.autoResumeAt == null &&
        (autoResumeRetryUntil.get(taskId) ?? 0) > Date.now();
      const armed = pause.autoResumeAt != null || retry;
      if (!reading || (reading.resetsAt === pause.resetsAt && !retry)) {
        return pause;
      }
      const autoResumeAt =
        armed
          ? resolveUsageLimitAutoResumeAt({
              resetsAt: reading.resetsAt,
              now: Date.now(),
            })
          : null;
      if (autoResumeAt != null) {
        autoResumeRetryUntil.delete(taskId);
      }
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
      const accountProfileId = pauseArgs.accountProfileId ?? pauseArgs.usageLimit?.accountProfileId ??
        (current?.providerId === pauseArgs.providerId ? current.accountProfileId : undefined);
      const reading = pauseArgs.usageLimit
        ? {
            resetsAt: pauseArgs.usageLimit.resetsAt,
            windowLabel: pauseArgs.usageLimit.windowLabel,
          }
        : readUsageLimitReset({
            snapshot: accountProfileId && accountProfileId === selectedProviderAccount(pauseArgs.providerId, state.settings)
              ? state.rateLimitsSnapshot : null,
            providerId: pauseArgs.providerId,
            model: pauseArgs.model,
          });
      const resetsAt = reading?.resetsAt ?? current?.resetsAt ?? null;
      // A pause that was armed stays armed: an automatic resume refused by a
      // still-exhausted window waits for the next reset instead.
      const keepArmed = current?.autoResumeAt != null || (autoResumeRetryUntil.get(pauseArgs.taskId) ?? 0) > now;
      const autoResumeAt = keepArmed
        ? resolveUsageLimitAutoResumeAt({ resetsAt, now })
        : null;
      if (autoResumeAt != null) {
        autoResumeRetryUntil.delete(pauseArgs.taskId);
      }
      const model = pauseArgs.model ?? current?.model;
      const windowLabel = reading?.windowLabel ?? current?.windowLabel;
      const next: TaskUsageLimitPause = {
        workspaceId: pauseArgs.workspaceId,
        providerId: pauseArgs.providerId,
        ...(accountProfileId ? { accountProfileId } : {}),
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
    const pause = get().usageLimitPauseByTask[pauseArgs.taskId];
    if (!pauseArgs.usageLimit && pause?.accountProfileId) {
      // A stopped turn only says it hit the limit. A fresh usage read says
      // which window ran out and when it resets.
      void readProviderAccountUsage(get, pause.providerId, pause.accountProfileId)
        .then((snapshot) => { if (snapshot) applyUsageReading(pauseArgs.taskId, pause, snapshot); });
    }
  };

  const resumePausedTaskWork: AppState["resumePausedTaskWork"] = async ({
    taskId,
    trigger = "user",
  }) => {
    let pause = get().usageLimitPauseByTask[taskId];
    if (trigger === "auto") {
      if (!pause || pause.autoResumeAt == null) {
        return;
      }
      if (!pause.accountProfileId) {
        get().setUsageLimitAutoResume({ taskId, enabled: false });
        toast.info("Paused account is unknown", { description: "Resume manually to use your currently selected account." });
        return;
      }
      const expected = pause;
      // Read usage once more before sending: the reset can move, and another
      // window (weekly after the 5-hour one) may still be out.
      const snapshot = await readProviderAccountUsage(get, pause.providerId, pause.accountProfileId);
      // The user may have resumed, cancelled or dismissed during the read.
      pause = get().usageLimitPauseByTask[taskId];
      if (!pause || pause !== expected || pause.autoResumeAt == null) {
        return;
      }
      if (!snapshot || collectProviderAccountUsageWindows({ providerId: pause.providerId, model: pause.model, snapshot }) == null) {
        get().setUsageLimitAutoResume({ taskId, enabled: false });
        toast.warning("Couldn't verify paused account usage", { description: "The task stays paused. Resume manually or reserve another reset-time resume." });
        return;
      }
      const reading = readUsageLimitReset({
        snapshot,
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
      autoResumeRetryUntil.set(taskId, Date.now() + AUTO_RESUME_RETRY_WINDOW_MS);
    } else {
      autoResumeRetryUntil.delete(taskId);
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
        accountProfileId: pause.accountProfileId,
        model: pause.model,
        stoppedTurn: true,
      });
    try {
      const result = await get().sendUserMessage({
        taskId,
        content: buildUsageLimitContinuationPrompt(),
        preservePromptDraft: true,
        providerOverride: pause.providerId,
        runtimeOverrides: {
          ...session.promptDraftByTask[taskId]?.runtimeOverrides,
          autoRouting: false,
          model: pause.model,
          modelProviderId: pause.providerId,
          ...(pause.providerId === "codex"
            ? { codexAccountProfileId: pause.accountProfileId ?? selectedProviderAccount(pause.providerId, get().settings) }
            : pause.providerId === "claude-code"
              ? { claudeAccountProfileId: pause.accountProfileId ?? selectedProviderAccount(pause.providerId, get().settings) }
              : {}),
        },
        turnOrigin: "conversation",
      });
      if (result.status === "blocked") {
        if (result.reason === "account-limit") {
          get().pauseTaskForUsageLimit({
            taskId,
            workspaceId,
            providerId: result.usageLimit?.providerId ?? pause.providerId,
            accountProfileId: result.usageLimit?.accountProfileId ?? pause.accountProfileId,
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
      if (!enabled) autoResumeRetryUntil.delete(taskId);
      if (enabled && get().usageLimitPauseByTask[taskId] && !get().usageLimitPauseByTask[taskId]?.accountProfileId) {
        toast.info("Paused account is unknown", { description: "Resume manually to use your currently selected account." });
        return;
      }
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
      autoResumeRetryUntil.delete(taskId);
      patchPause(taskId, () => null);
    },
  };
}
