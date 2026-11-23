import { isUsageLimitReservationId } from "@/lib/providers/usage-limit-reservation";
import type { StoreApi } from "zustand";
import { listActiveWorkspaceTurns, listTaskTurns } from "@/lib/db/turns.db";
import { listWorkspaceSummaries, loadTaskMessagesPage, loadWorkspaceShellForRestore } from "@/lib/db/workspaces.db";
import { hostRunsTaskTurn, readProviderLiveTurns, type ProviderLiveTurns } from "@/lib/providers/live-turns";
import { isTaskArchived } from "@/lib/tasks";
import type { AppState } from "@/store/app-store.types";
import { buildWorkspaceSessionStateFromShell } from "@/store/workspace-session-state";
import { getWorkspaceSessionForState } from "@/store/workspace-runtime-state";
import { createTaskOwnershipReads, readTaskOwnership, type TaskOwnershipReads } from "@/store/task-recovery-ownership";
import {
  buildRestartContinuationPrompt,
  canRecoverOrdinaryTask,
  restartContinuationDecision,
  RESTART_CONTINUATION_MAX_AGE_MS,
  RESTART_RECOVERY_MESSAGE_WINDOW,
  type InterruptedTask,
} from "@/store/restart-continuation";

type Actions = Pick<AppState, "recoverInterruptedTasks" | "continueInterruptedTask" | "dismissInterruptedTasks">;
type Shell = NonNullable<Awaited<ReturnType<typeof loadWorkspaceShellForRestore>>>;

/**
 * - offer: an ordinary task the restart cut short; it may be continued.
 * - settle: decided for good (excluded, too old, superseded); never read again.
 * - skip: cannot decide now (the host still runs it, or a read failed).
 */
type Verdict =
  | { kind: "offer"; shell: Shell }
  | { kind: "settle" }
  | { kind: "skip" };

const SETTLE = { kind: "settle" } as const;
const SKIP = { kind: "skip" } as const;
const ABORTED_BY_SHUTDOWN = new Set(["user_abort", "runtime_failure"]);

function readLiveTurns() {
  return readProviderLiveTurns(window.api?.provider?.listLiveTurns);
}

/**
 * Only a turn the current host never ran can have been cut short by the
 * restart. A turn started after the host booted belongs to this session, and a
 * turn the host lists is still running; neither is ever started again.
 */
function classifyByHost(live: ProviderLiveTurns, item: Pick<InterruptedTask, "taskId" | "turnId">, createdAt: string, since: number, now: number) {
  if (hostRunsTaskTurn(live, item)) return SKIP;
  const started = Date.parse(createdAt);
  if (!Number.isFinite(started)) return SETTLE;
  if (started >= live.hostStartedAt) return SKIP;
  if (started < since || started < now - RESTART_CONTINUATION_MAX_AGE_MS) return SETTLE;
  return null;
}

export function createRestartContinuationActions({ set, get, flushPersistence }: { set: StoreApi<AppState>["setState"]; get: () => AppState; flushPersistence: () => boolean }): Actions {
  let recovering: Promise<void> | undefined;
  let recovered = false;
  const inFlight = new Set<string>();
  const consume = (turnIds: readonly string[]) => {
    if (turnIds.length === 0) return true;
    set(state => ({ restartRecovery: { ...state.restartRecovery, consumedTurnIds: [...new Set([...state.restartRecovery.consumedTurnIds, ...turnIds])].slice(-10000) } }));
    return flushPersistence();
  };
  const unlist = (turnId: string) => set(state => ({ interruptedTasks: state.interruptedTasks.filter(row => row.turnId !== turnId) }));

  const readCandidate = async (item: InterruptedTask, context: { live: ProviderLiveTurns; reads: TaskOwnershipReads; shells: Map<string, Promise<Shell | null>> }): Promise<Verdict> => {
    // Usage-limit recovery owns these delivery attempts. The generic restart
    // policy must never start a second continuation for an ambiguous send.
    if (isUsageLimitReservationId(item.turnId)) return SETTLE;
    const recovery = get().restartRecovery;
    if (recovery.consumedTurnIds.includes(item.turnId)) return SETTLE;
    if (hostRunsTaskTurn(context.live, item)) return SKIP;
    // Without the task's latest turn there is no proof nothing newer started.
    if (!window.api?.persistence?.listTaskTurns) return SKIP;
    let shellRead = context.shells.get(item.workspaceId);
    if (!shellRead) {
      shellRead = loadWorkspaceShellForRestore({ workspaceId: item.workspaceId });
      context.shells.set(item.workspaceId, shellRead);
    }
    const [shell, latestTurns] = await Promise.all([shellRead, listTaskTurns({ workspaceId: item.workspaceId, taskId: item.taskId, limit: 1 })]);
    const latest = latestTurns[0];
    // A later turn of the task means the work already moved on.
    if (!latest || latest.id !== item.turnId) return SETTLE;
    const byHost = classifyByHost(context.live, item, latest.createdAt, recovery.since, Date.now());
    if (byHost) return byHost;
    const task = shell?.tasks.find(row => row.id === item.taskId);
    if (!shell || !task || isTaskArchived(task)) return SETTLE;
    if (latest.completedAt) {
      // Closed during shutdown counts only when this renderer saw it running and it ended by abort or failure.
      const closedByShutdown = get().restartPendingTasks?.some(row => row.turnId === item.turnId) &&
        ABORTED_BY_SHUTDOWN.has(latest.terminalReceipt?.stopReason ?? "");
      if (!closedByShutdown) return SETTLE;
    }
    // Only the latest messages decide whether the task waits on the user.
    const [page, ownership] = await Promise.all([
      loadTaskMessagesPage({ workspaceId: item.workspaceId, taskId: item.taskId, limit: RESTART_RECOVERY_MESSAGE_WINDOW }),
      readTaskOwnership({ taskId: item.taskId, workspaceId: item.workspaceId, reads: context.reads }),
    ]);
    // Missing ownership information is not permission to start an ordinary turn.
    if (ownership === "unreadable") return SKIP;
    const stopped = get().restartRecovery.stoppedTurnIds.includes(item.turnId);
    const owned = ownership === "owned";
    if (!canRecoverOrdinaryTask({ task, messages: page.messages, stopped, owned })) return SETTLE;
    const session = getWorkspaceSessionForState({ state: get(), workspaceId: item.workspaceId });
    if (session?.activeTurnIdsByTask[item.taskId]) return SKIP;
    const currentTask = session?.tasks.find(row => row.id === item.taskId) ?? task;
    const currentMessages = session?.messagesByTask[item.taskId]?.length ? session.messagesByTask[item.taskId]! : page.messages;
    if (!canRecoverOrdinaryTask({ task: currentTask, messages: currentMessages, stopped, owned })) return SETTLE;
    return { kind: "offer", shell };
  };
  const newContext = (live: ProviderLiveTurns) => ({ live, reads: createTaskOwnershipReads(), shells: new Map<string, Promise<Shell | null>>() });

  const continueInterruptedTask: Actions["continueInterruptedTask"] = async ({ taskId, automatic = false }) => {
    const item = get().interruptedTasks.find(row => row.taskId === taskId);
    if (!item || inFlight.has(taskId)) return;
    inFlight.add(taskId);
    try {
      const live = await readLiveTurns();
      if (!live) return;
      const verdict = await readCandidate(item, newContext(live));
      if (verdict.kind === "settle") { consume([item.turnId]); unlist(item.turnId); return; }
      if (verdict.kind !== "offer" || !get().interruptedTasks.some(row => row.turnId === item.turnId)) return;
      if (automatic && restartContinuationDecision(get().settings.restartContinuation, get().restartRecovery.automaticTimesByTask[taskId] ?? [], Date.now()) !== "continue") return;
      // The interrupted turn is not running, so its messages load sealed as interrupted.
      const page = await loadTaskMessagesPage({ workspaceId: item.workspaceId, taskId });
      // Check the host once more right before sending: the reads above took time.
      const latestLive = await readLiveTurns();
      if (!latestLive || hostRunsTaskTurn(latestLive, item)) return;
      const session = getWorkspaceSessionForState({ state: get(), workspaceId: item.workspaceId }) ?? buildWorkspaceSessionStateFromShell({ shell: verdict.shell });
      if (session.activeTurnIdsByTask[taskId]) return;
      // Restore the owning session without replacing the visible workspace.
      set(state => ({
        taskWorkspaceIdById: { ...state.taskWorkspaceIdById, [taskId]: item.workspaceId },
        ...(item.workspaceId === state.activeWorkspaceId ? { messagesByTask: { ...state.messagesByTask, [taskId]: page.messages }, messageCountByTask: { ...state.messageCountByTask, [taskId]: page.totalCount } } : {}),
        ...(item.workspaceId !== state.activeWorkspaceId ? { workspaceRuntimeCacheById: { ...state.workspaceRuntimeCacheById, [item.workspaceId]: { ...session, messagesByTask: { ...session.messagesByTask, [taskId]: page.messages } } } } : {}),
        ...(automatic ? { restartRecovery: { ...state.restartRecovery, automaticTimesByTask: { ...state.restartRecovery.automaticTimesByTask, [taskId]: [...(state.restartRecovery.automaticTimesByTask[taskId] ?? []).filter(time => time > Date.now() - 300000), Date.now()].slice(-3) } } } : {}),
      }));
      // Consume durably before sending, so a second startup never catches this turn up twice.
      if (!consume([item.turnId])) return;
      set(state => ({ interruptedTasks: state.interruptedTasks.filter(row => row.turnId !== item.turnId), restoredQueueReleasedByTask: { ...state.restoredQueueReleasedByTask, [taskId]: true } }));
      const result = await get().sendUserMessage({ taskId, content: buildRestartContinuationPrompt(), providerOverride: item.providerId, preservePromptDraft: true, runtimeOverrides: { autoRouting: false }, turnOrigin: "conversation" });
      if (result.status === "blocked" || result.status === "send-failed") set(state => ({ interruptedTasks: [...state.interruptedTasks, item] }));
    } finally {
      inFlight.delete(taskId);
    }
  };

  const recoverInterruptedTasks: Actions["recoverInterruptedTasks"] = () => {
    if (recovering) return recovering;
    if (recovered) return Promise.resolve();
    recovering = (async () => {
      const live = await readLiveTurns();
      if (!live) {
        // Without the host's answer a running turn looks interrupted; offer nothing.
        console.warn("[restart-recovery] the host runtime did not report its live turns; nothing is offered");
        recovered = true;
        return;
      }
      const context = newContext(live);
      const now = Date.now();
      const items: InterruptedTask[] = [];
      const settled: string[] = [];
      const seen = new Set<string>();
      const consider = async (item: InterruptedTask, createdAt?: string) => {
        if (seen.has(item.turnId) || get().restartRecovery.consumedTurnIds.includes(item.turnId)) return;
        seen.add(item.turnId);
        const byHost = createdAt === undefined ? null : classifyByHost(live, item, createdAt, get().restartRecovery.since, now);
        const verdict = byHost ?? await readCandidate(item, context);
        if (verdict.kind === "settle") settled.push(item.turnId);
        if (verdict.kind === "offer") items.push(item);
      };
      for (const workspace of await listWorkspaceSummaries()) {
        const turns = await listActiveWorkspaceTurns({ workspaceId: workspace.id });
        for (const turn of turns) {
          if (turn.completedAt) continue;
          await consider({ taskId: turn.taskId, title: "", workspaceId: workspace.id, providerId: turn.providerId, turnId: turn.id }, turn.createdAt);
        }
      }
      for (const item of get().restartPendingTasks ?? []) await consider(item);
      consume(settled);
      // Titles come from the saved task, not the turn row.
      const titled = await Promise.all(items.map(async item => {
        const shell = await context.shells.get(item.workspaceId);
        return { ...item, title: shell?.tasks.find(row => row.id === item.taskId)?.title ?? item.title };
      }));
      recovered = true;
      set({ interruptedTasks: titled });
      for (const item of titled) {
        const decision = restartContinuationDecision(get().settings.restartContinuation, get().restartRecovery.automaticTimesByTask[item.taskId] ?? [], Date.now());
        if (decision === "ignore") { consume([item.turnId]); unlist(item.turnId); }
        if (decision === "continue") await continueInterruptedTask({ taskId: item.taskId, automatic: true });
      }
    })().finally(() => { recovering = undefined; });
    return recovering;
  };
  return {
    recoverInterruptedTasks,
    continueInterruptedTask,
    dismissInterruptedTasks: ({ taskId } = {}) => {
      const dismissed = get().interruptedTasks.filter(item => !taskId || item.taskId === taskId);
      consume(dismissed.map(item => item.turnId));
      set(state => ({ interruptedTasks: state.interruptedTasks.filter(item => taskId && item.taskId !== taskId) }));
    },
  };
}
