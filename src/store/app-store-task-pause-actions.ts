import { newUsageLimitReservationId } from "@/lib/providers/usage-limit-reservation";
import { listTaskTurns } from "@/lib/db/turns.db";
import { isTaskArchived } from "@/lib/tasks";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";
import { canRecoverOrdinaryTask } from "@/store/restart-continuation";
import { loadTaskMessagesPage, loadWorkspaceShellForRestore } from "@/lib/db/workspaces.db";
import { buildWorkspaceSessionStateFromShell } from "@/store/workspace-session-state";
import { hostRunsTaskTurn, readProviderLiveTurns } from "@/lib/providers/live-turns";
import { readTaskOwnership } from "@/store/task-recovery-ownership";
import { i18n } from "@/i18n/runtime";
import type { StoreApi } from "zustand";
import { collectProviderAccountUsageWindows, resolveAccountUsageBlock } from "@/lib/providers/account-usage-block";
import { selectedProviderAccount, snapshotProviderAccounts } from "@/lib/providers/provider-account-selection";
import type { RateLimitsSnapshotResponse } from "@/lib/providers/provider.types";
import { toast } from "@/lib/notifications/toast";
import { buildUsageLimitContinuationPrompt } from "@/lib/providers/usage-limit-stop";
import type { AppState } from "@/store/app-store.types";
import type { PromptDraft } from "@/types/chat";
import { removeRecordEntries } from "@/store/task-turn-runtime-cleanup";
import {
  resolveUsageLimitAutoResumeAt,
  type TaskUsageLimitPause,
} from "@/store/task-work-pause";
import { getWorkspaceSessionForState } from "@/store/workspace-runtime-state";
import { readProviderAccountUsage } from "@/store/account-usage-guard";
import { USAGE_LIMIT_UNAVAILABLE_RETRY_MS } from "@/lib/agent-runs/usage-limit";

type TaskPauseActionKey =
  | "pauseTaskForUsageLimit"
  | "resumePausedTaskWork"
  | "setUsageLimitAutoResume"
  | "dismissUsageLimitPause";

type TaskPauseActions = Pick<AppState, TaskPauseActionKey>;

/** How long after an armed resume a refusal keeps the pause armed. */
const AUTO_RESUME_RETRY_WINDOW_MS = 2 * 60_000;

/** The longest wait between usage reads while they keep failing. */
export const UNREADABLE_USAGE_RETRY_MAX_MS = 30 * 60_000;

/**
 * Ownership or host reads in a row an armed resume may fail before it gives
 * up and tells the user. With the usage backoff this spans about an hour.
 */
export const OWNERSHIP_READ_MAX_FAILURES = 6;

/**
 * How long an armed resume waits after its `failures`-th unreadable usage
 * read in a row. The first retry comes soon (the network is usually back a
 * few minutes after the machine wakes); later ones slow down, because each
 * forced read can launch a provider CLI and a lasting failure (signed out,
 * stale credentials) will not clear on its own.
 */
export function resolveUnreadableUsageRetryDelay(failures: number): number {
  const exponent = Math.max(0, Math.min(failures - 1, 10));
  return Math.min(USAGE_LIMIT_UNAVAILABLE_RETRY_MS * 2 ** exponent, UNREADABLE_USAGE_RETRY_MAX_MS);
}

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

async function restorePauseSession(
  get: () => AppState,
  set: StoreApi<AppState>["setState"],
  taskId: string,
  workspaceId: string,
) {
  if (getWorkspaceSessionForState({ state: get(), workspaceId })) return;
  const [shell, page] = await Promise.all([
    loadWorkspaceShellForRestore({ workspaceId }),
    loadTaskMessagesPage({ workspaceId, taskId }),
  ]);
  if (!shell || getWorkspaceSessionForState({ state: get(), workspaceId })) return;
  const session = buildWorkspaceSessionStateFromShell({ shell, messagesByTask: { [taskId]: page.messages } });
  set(state => ({
    workspaceRuntimeCacheById: { ...state.workspaceRuntimeCacheById, [workspaceId]: session },
    taskWorkspaceIdById: { ...state.taskWorkspaceIdById, [taskId]: workspaceId },
  }));
}

export function createTaskPauseActions(args: {
  set: StoreApi<AppState>["setState"];
  get: StoreApi<AppState>["getState"];
  flushPersistence?: () => boolean;
  persistReleasedQueue?: (workspaceId: string, session: WorkspaceSessionState) => Promise<void>;
  isQueueItemHeld?: (taskId: string, queuedTurnId: string) => boolean;
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
  const resumeInFlight = new Set<string>();
  const settling = new Set<string>();
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

  /**
   * Work a usage limit held goes out on the accounts selected now: switching
   * accounts is how the user unblocks it. Turns queued later, behind a turn
   * that is still running, keep the accounts they were queued with.
   */
  const updateHeldQueue = (workspaceId: string, taskId: string, consumedId?: string) => {
    const accounts = snapshotProviderAccounts(get().settings);
    const updateDraft = (draft: PromptDraft | undefined) => {
      if (!draft?.queuedTurns?.length) return draft;
      const queuedTurns = consumedId
        ? draft.queuedTurns.filter((turn) => turn.id !== consumedId)
        : draft.queuedTurns.map((turn) => ({ ...turn, ...accounts }));
      return consumedId && queuedTurns.length === draft.queuedTurns.length ? draft : { ...draft, queuedTurns };
    };
    set((state) => {
      if (state.activeWorkspaceId === workspaceId) {
        const draft = state.promptDraftByTask[taskId];
        const next = updateDraft(draft);
        return next === draft || !next ? state : {
          promptDraftByTask: { ...state.promptDraftByTask, [taskId]: next },
          workspaceSnapshotVersion: state.workspaceSnapshotVersion + 1,
        };
      }
      const cached = state.workspaceRuntimeCacheById[workspaceId];
      const draft = cached?.promptDraftByTask[taskId];
      const next = updateDraft(draft);
      return !cached || next === draft || !next ? state : {
        workspaceRuntimeCacheById: { ...state.workspaceRuntimeCacheById, [workspaceId]: {
          ...cached, promptDraftByTask: { ...cached.promptDraftByTask, [taskId]: next } } },
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
      if (pauseArgs.origin && current?.origin?.kind === pauseArgs.origin.kind &&
          current.origin.id === pauseArgs.origin.id && !pauseArgs.usageLimit) return state;
      const next: TaskUsageLimitPause = {
        workspaceId: pauseArgs.workspaceId,
        providerId: pauseArgs.providerId,
        ...(accountProfileId ? { accountProfileId } : {}),
        ...(model ? { model } : {}),
        stoppedTurn: pauseArgs.stoppedTurn || (current?.stoppedTurn ?? false),
        origin: pauseArgs.origin ?? current?.origin,
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
    args.flushPersistence?.();
    const pause = get().usageLimitPauseByTask[pauseArgs.taskId];
    if (!pauseArgs.usageLimit && pause?.accountProfileId) {
      // A stopped turn only says it hit the limit. A fresh usage read says
      // which window ran out and when it resets.
      void readProviderAccountUsage(get, pause.providerId, pause.accountProfileId)
        .then((snapshot) => { if (snapshot) applyUsageReading(pauseArgs.taskId, pause, snapshot); });
    }
  };

  const releasePause = (taskId: string, workspaceId: string, releaseThrough?: true | number) => {
    set((state) => ({
      usageLimitPauseByTask: removeRecordEntries(state.usageLimitPauseByTask, [taskId]) ?? state.usageLimitPauseByTask,
      restoredQueueReleasedByTask: releaseThrough === undefined
        ? removeRecordEntries(state.restoredQueueReleasedByTask, [taskId]) ?? state.restoredQueueReleasedByTask
        : { ...state.restoredQueueReleasedByTask, [taskId]: releaseThrough },
    }));
    args.flushPersistence?.();
    if (releaseThrough !== undefined) args.dispatchNextQueuedTaskTurn({ workspaceId, taskId });
  };

  const settleReservation = async (taskId: string, pause: TaskUsageLimitPause, drain: boolean) => {
    const reservation = pause.reservation;
    if (!reservation || settling.has(reservation.id) || get().usageLimitPauseByTask[taskId]?.reservation?.id !== reservation.id) return;
    settling.add(reservation.id);
    try {
      if (reservation.queuedTurnId) {
        updateHeldQueue(pause.workspaceId, taskId, reservation.queuedTurnId);
        const session = getWorkspaceSessionForState({ state: get(), workspaceId: pause.workspaceId });
        if (!session) return;
        await args.persistReleasedQueue?.(pause.workspaceId, session);
      }
      if (get().usageLimitPauseByTask[taskId]?.reservation?.id === reservation.id) {
        autoResumeRetryUntil.set(taskId, Date.now() + AUTO_RESUME_RETRY_WINDOW_MS);
        releasePause(taskId, pause.workspaceId, drain ? Date.now() : undefined);
      }
    } finally {
      settling.delete(reservation.id);
    }
  };

  const resumePausedTaskWorkImpl: AppState["resumePausedTaskWork"] = async ({
    taskId,
    trigger = "user",
  }) => {
    let pause = get().usageLimitPauseByTask[taskId];
    const reservationRead = window.api?.persistence?.hasUsageLimitResume;
    if (pause?.reservation && reservationRead) {
      const expected = pause;
      try {
        const consumed = await reservationRead(pause.reservation.id);
        if (get().usageLimitPauseByTask[taskId] !== expected) return;
        if (consumed) {
          await restorePauseSession(get, set, taskId, pause.workspaceId);
          // A saved claim proves we cannot replay this turn. Only successful
          // terminal evidence lets us drain behind it after a restart.
          const live = await readProviderLiveTurns(window.api?.provider?.listLiveTurns);
          if (!live || hostRunsTaskTurn(live, { taskId })) {
            patchPause(taskId, (current) => current === expected && current.autoResumeAt != null
              ? { ...current, autoResumeAt: Date.now() + USAGE_LIMIT_UNAVAILABLE_RETRY_MS }
              : current);
            return;
          }
          const session = getWorkspaceSessionForState({ state: get(), workspaceId: pause.workspaceId });
          const task = session?.tasks.find(item => item.id === taskId);
          if (!task || isTaskArchived(task)) {
            if (get().usageLimitPauseByTask[taskId]?.reservation?.id === pause.reservation.id) {
              get().dismissUsageLimitPause({ taskId });
            }
            return;
          }
          const turns = await listTaskTurns({ workspaceId: pause.workspaceId, taskId, limit: 1 });
          await settleReservation(taskId, pause, turns[0]?.id === pause.reservation.id &&
            turns[0].terminalReceipt?.outcome === "completed");
          return;
        }
      } catch (error) {
        console.warn("[usage-limit-resume] could not reconcile reservation", { taskId, error });
        patchPause(taskId, (current) => current === expected && current.autoResumeAt != null
          ? { ...current, autoResumeAt: Date.now() + USAGE_LIMIT_UNAVAILABLE_RETRY_MS }
          : current);
        return;
      }
    }
    let checkedAccount: string | undefined;
    if (trigger === "auto") {
      if (!pause || pause.autoResumeAt == null) {
        return;
      }
      if (!pause.accountProfileId) {
        get().setUsageLimitAutoResume({ taskId, enabled: false });
        toast.info(i18n.t("notifications:appStoreTaskPauseActions.pausedAccountIsUnknown"), { description: i18n.t("notifications:appStoreTaskPauseActions.resumeManuallyToUseYourCurrentlySelectedAccount") });
        return;
      }
      let expected = pause;
      // Read usage once more before sending: the reset can move, and another
      // window (weekly after the 5-hour one) may still be out. The resume runs
      // on the account selected now, so that is the account read.
      checkedAccount = selectedProviderAccount(pause.providerId, get().settings);
      const snapshot = await readProviderAccountUsage(get, pause.providerId, checkedAccount);
      const [shell, page, ownership, live] = await Promise.all([
        window.api?.persistence ? loadWorkspaceShellForRestore({ workspaceId: expected.workspaceId }) : Promise.resolve(null),
        // The stopped turn is not running, so its messages load sealed as interrupted.
        window.api?.persistence ? loadTaskMessagesPage({ workspaceId: expected.workspaceId, taskId }) : Promise.resolve({ messages: getWorkspaceSessionForState({ state: get(), workspaceId: expected.workspaceId })?.messagesByTask[taskId] ?? [] }),
        readTaskOwnership({ taskId, workspaceId: expected.workspaceId }),
        readProviderLiveTurns(window.api?.provider?.listLiveTurns),
      ]);
      if (get().usageLimitPauseByTask[taskId] !== expected) return;
      // The host still runs a turn for this task (a reload empties the renderer's
      // copy): resume only after it ends, never beside it.
      if (live && hostRunsTaskTurn(live, { taskId })) {
        patchPause(taskId, (current) => current === expected && current.autoResumeAt != null
          ? { ...current, autoResumeAt: Date.now() + USAGE_LIMIT_UNAVAILABLE_RETRY_MS }
          : current);
        return;
      }
      // An unreadable answer is no verdict: read again later, backing off, and
      // tell the user only when the reads keep failing.
      if (ownership === "unreadable" || !live) {
        const failures = (expected.unreadableOwnershipReads ?? 0) + 1;
        if (failures >= OWNERSHIP_READ_MAX_FAILURES) {
          get().setUsageLimitAutoResume({ taskId, enabled: false });
          toast.info(i18n.t("notifications:appStoreTaskPauseActions.autoResumeStopped"), { description: i18n.t("notifications:appStoreTaskPauseActions.autoResumeStoppedDescription") });
          return;
        }
        patchPause(taskId, (current) => current === expected && current.autoResumeAt != null
          ? { ...current, autoResumeAt: Date.now() + resolveUnreadableUsageRetryDelay(failures), unreadableOwnershipReads: failures }
          : current);
        return;
      }
      const task = shell?.tasks.find(row => row.id === taskId) ?? getWorkspaceSessionForState({ state: get(), workspaceId: expected.workspaceId })?.tasks.find(row => row.id === taskId);
      if (!task || isTaskArchived(task)) {
        get().dismissUsageLimitPause({ taskId });
        return;
      }
      if (!canRecoverOrdinaryTask({ task, messages: page.messages, stopped: false, owned: ownership === "owned" })) {
        get().setUsageLimitAutoResume({ taskId, enabled: false });
        return;
      }
      if (expected.unreadableOwnershipReads != null) {
        patchPause(taskId, (current) => {
          if (current !== expected) return current;
          const { unreadableOwnershipReads: _failures, ...rest } = current;
          return rest;
        });
      }
      expected = get().usageLimitPauseByTask[taskId] ?? expected;
      if (shell && !getWorkspaceSessionForState({ state: get(), workspaceId: expected.workspaceId })) {
        const restored = buildWorkspaceSessionStateFromShell({ shell, messagesByTask: { [taskId]: page.messages } });
        set(state => ({ workspaceRuntimeCacheById: { ...state.workspaceRuntimeCacheById, [expected.workspaceId]: { ...restored, activeTurnIdsByTask: {} } }, taskWorkspaceIdById: { ...state.taskWorkspaceIdById, [taskId]: expected.workspaceId } }));
      }
      // The user may have resumed, cancelled or dismissed during the read.
      pause = get().usageLimitPauseByTask[taskId];
      if (!pause || pause !== expected || pause.autoResumeAt == null) {
        return;
      }
      if (checkedAccount !== selectedProviderAccount(pause.providerId, get().settings)) return;
      if (
        !snapshot ||
        snapshot.reads?.[pause.providerId]?.lastReadFailed ||
        collectProviderAccountUsageWindows({ providerId: pause.providerId, model: pause.model, snapshot }) == null
      ) {
        // An unreadable usage window is no verdict: right after the machine
        // wakes, the network is often not back yet. Keep the reservation and
        // read again later, as an agent run's usage-limit wait does, backing
        // off while the reads keep failing.
        const failures = (pause.unreadableUsageReads ?? 0) + 1;
        const retryAt = Date.now() + resolveUnreadableUsageRetryDelay(failures);
        patchPause(taskId, (current) =>
          current === pause && current.autoResumeAt != null
            ? { ...current, autoResumeAt: retryAt, unreadableUsageReads: failures }
            : current,
        );
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
          const { autoResumeAt: _armed, unreadableUsageReads: _failures, ...rest } = current;
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
    } else {
      autoResumeRetryUntil.delete(taskId);
    }

    const state = get();
    const workspaceId =
      pause?.workspaceId ??
      state.taskWorkspaceIdById[taskId] ??
      state.activeWorkspaceId;
    const session = getWorkspaceSessionForState({ state, workspaceId });
    if (session?.activeTurnIdsByTask[taskId] && trigger === "auto") {
      patchPause(taskId, (current) => ({ ...current, autoResumeAt: Date.now() + USAGE_LIMIT_UNAVAILABLE_RETRY_MS }));
      return;
    }
    const queued = pause && !pause.stoppedTurn
      ? session?.promptDraftByTask[taskId]?.queuedTurns?.[0]
      : undefined;
    const reserved = pause && reservationRead && (trigger === "auto" || pause.reservation) && (pause.stoppedTurn || queued);
    if (!reserved) {
      if (trigger === "auto") autoResumeRetryUntil.set(taskId, Date.now() + AUTO_RESUME_RETRY_WINDOW_MS);
      updateHeldQueue(workspaceId, taskId);
      if (!pause?.stoppedTurn || !session || session.activeTurnIdsByTask[taskId]) {
        releasePause(taskId, workspaceId, pause && trigger === "auto" ? Date.now() : true);
        return;
      }
      patchPause(taskId, () => null);
      set((current) => ({ restoredQueueReleasedByTask: { ...current.restoredQueueReleasedByTask, [taskId]: true } }));
      args.flushPersistence?.();
    }
    if (!pause || !session) return;
    // Never replace a reservation for an outstanding request while the host
    // still owns a turn, even when the renderer has no active-turn snapshot.
    if (reserved) {
      const live = await readProviderLiveTurns(window.api?.provider?.listLiveTurns);
      if (!live || hostRunsTaskTurn(live, { taskId }) || get().usageLimitPauseByTask[taskId] !== pause) return;
      if (queued && args.isQueueItemHeld?.(taskId, queued.id)) return;
      if (checkedAccount !== undefined && checkedAccount !== selectedProviderAccount(pause.providerId, get().settings)) return;
      const reservation = {
        id: !pause.reservation?.queuedTurnId || pause.reservation.queuedTurnId === queued?.id
          ? pause.reservation?.id ?? newUsageLimitReservationId()
          : newUsageLimitReservationId(),
        ...(queued ? { queuedTurnId: queued.id } : {}),
      };
      patchPause(taskId, (current) => ({
        ...current,
        reservation,
        ...(trigger === "auto" ? { autoResumeAt: Date.now() + USAGE_LIMIT_UNAVAILABLE_RETRY_MS } : {}),
      }));
      pause = get().usageLimitPauseByTask[taskId]!;
      if (args.flushPersistence && !args.flushPersistence()) return;
      if (session.promptDraftByTask[taskId]?.queuedTurns?.length) {
        updateHeldQueue(workspaceId, taskId);
        const updated = getWorkspaceSessionForState({ state: get(), workspaceId });
        if (updated) await args.persistReleasedQueue?.(workspaceId, updated);
      }
      if (get().usageLimitPauseByTask[taskId] !== pause ||
          (checkedAccount !== undefined && checkedAccount !== selectedProviderAccount(pause.providerId, get().settings))) return;
    }

    // The continuation runs on the account selected now, which may not be
    // the one the limit stopped.
    const resumeAccountProfileId = selectedProviderAccount(pause.providerId, get().settings);
    const sendingPause = pause;
    const reservation = reserved ? sendingPause.reservation : undefined;
    const repause = () =>
      get().pauseTaskForUsageLimit({
        taskId,
        workspaceId,
        providerId: sendingPause.providerId,
        accountProfileId: resumeAccountProfileId,
        model: sendingPause.model,
        stoppedTurn: sendingPause.stoppedTurn,
        origin: sendingPause.origin,
      });
    try {
      const result = await get().sendUserMessage({
        taskId,
        content: queued?.content ?? buildUsageLimitContinuationPrompt(),
        ...(queued ? { queuedTurnId: queued.id } : {}),
        ...(reservation ? { usageLimitResume: {
          turnId: reservation.id,
          isCurrent: () => get().usageLimitPauseByTask[taskId] === sendingPause &&
            resumeAccountProfileId === selectedProviderAccount(sendingPause.providerId, get().settings) &&
            (!queued || (!args.isQueueItemHeld?.(taskId, queued.id) &&
              getWorkspaceSessionForState({ state: get(), workspaceId })?.promptDraftByTask[taskId]?.queuedTurns?.some(item => item.id === queued.id) === true)),
          onAdmitted: () => settleReservation(taskId, sendingPause, true).catch(error => {
            console.warn("[usage-limit-resume] could not persist released queue", { taskId, error });
          }),
        } } : {}),
        preservePromptDraft: !queued,
        providerOverride: queued ? undefined : pause.providerId,
        runtimeOverrides: queued ? undefined : {
          ...session.promptDraftByTask[taskId]?.runtimeOverrides,
          autoRouting: false,
          model: pause.model,
          modelProviderId: pause.providerId,
          ...(pause.providerId === "codex"
            ? { codexAccountProfileId: resumeAccountProfileId }
            : pause.providerId === "claude-code"
              ? { claudeAccountProfileId: resumeAccountProfileId }
              : {}),
        },
        turnOrigin: "conversation",
      });
      if (reservation && get().usageLimitPauseByTask[taskId] !== sendingPause) return;
      if (result.status === "blocked") {
        if (reservation && !result.reason) return;
        if (result.reason === "account-limit") {
          get().pauseTaskForUsageLimit({
            taskId,
            workspaceId,
            providerId: result.usageLimit?.providerId ?? pause.providerId,
            accountProfileId: result.usageLimit?.accountProfileId ?? resumeAccountProfileId,
            model: result.usageLimit?.model ?? pause.model,
            stoppedTurn: sendingPause.stoppedTurn,
            origin: queued ? { kind: "queue", id: queued.id } : sendingPause.origin,
            usageLimit: result.usageLimit,
          });
          return;
        }
        repause();
        toast.warning(i18n.t("notifications:appStoreTaskPauseActions.couldnTResumeTheTask"), {
          description:
            result.message ??
            i18n.t("notifications:appStoreTaskPauseActions.theTaskIsBusyOrWaitingOnAnotherActionItStaysPaused"),
        });
      } else if (result.status === "send-failed") {
        repause();
        toast.error(i18n.t("notifications:appStoreTaskPauseActions.couldnTResumeTheTask"), { description: result.message });
      }
    } catch (error) {
      if (!reservation || get().usageLimitPauseByTask[taskId] === sendingPause) repause();
      toast.error(i18n.t("notifications:appStoreTaskPauseActions.couldnTResumeTheTask"), {
        description:
          error instanceof Error ? error.message : i18n.t("notifications:appStoreTaskPauseActions.theContinuationTurnDidNotStart"),
      });
    }
  };

  return {
    pauseTaskForUsageLimit,
    resumePausedTaskWork: async (input) => {
      if (resumeInFlight.has(input.taskId)) return;
      resumeInFlight.add(input.taskId);
      try {
        await resumePausedTaskWorkImpl(input);
      } finally {
        resumeInFlight.delete(input.taskId);
        args.flushPersistence?.();
      }
    },
    setUsageLimitAutoResume: ({ taskId, enabled }) => {
      const previous = get().usageLimitPauseByTask[taskId];
      if (!enabled) autoResumeRetryUntil.delete(taskId);
      if (enabled && get().usageLimitPauseByTask[taskId] && !get().usageLimitPauseByTask[taskId]?.accountProfileId) {
        toast.info(i18n.t("notifications:appStoreTaskPauseActions.pausedAccountIsUnknown"), { description: i18n.t("notifications:appStoreTaskPauseActions.resumeManuallyToUseYourCurrentlySelectedAccount") });
        return;
      }
      patchPause(taskId, (pause) => {
        if (!enabled) {
          if (pause.autoResumeAt == null && pause.unreadableUsageReads == null && pause.unreadableOwnershipReads == null) {
            return pause;
          }
          const { autoResumeAt: _armed, unreadableUsageReads: _failures, unreadableOwnershipReads: _ownershipFailures, ...rest } = pause;
          return rest;
        }
        const autoResumeAt = resolveUsageLimitAutoResumeAt({
          resetsAt: pause.resetsAt,
          now: Date.now(),
        });
        return autoResumeAt == null ? pause : {
          ...pause,
          autoResumeAt,
          reservation: pause.reservation ?? { id: newUsageLimitReservationId() },
        };
      });
      args.flushPersistence?.();
      if (!enabled && previous?.reservation && !settling.has(previous.reservation.id)) {
        const id = previous.reservation.id;
        void window.api?.persistence?.hasUsageLimitResume?.(id).then(consumed => {
          if (!consumed && get().usageLimitPauseByTask[taskId]?.autoResumeAt == null) {
            return window.api?.provider?.abortTurn?.({ turnId: id });
          }
        }).catch(error => console.warn("[usage-limit-resume] could not cancel admission", { taskId, error }));
      }
    },
    dismissUsageLimitPause: ({ taskId }) => {
      autoResumeRetryUntil.delete(taskId);
      patchPause(taskId, () => null);
      args.flushPersistence?.();
    },
  };
}
