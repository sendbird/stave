import type { StoreApi } from "zustand";
import { listActiveWorkspaceTurns, listTaskTurns } from "@/lib/db/turns.db";
import { listWorkspaceSummaries, loadTaskMessagesPage, loadWorkspaceShellForRestore } from "@/lib/db/workspaces.db";
import { isActiveAgentRunState } from "@/lib/agent-runs/domain";
import { isTaskArchived } from "@/lib/tasks";
import { tarsHoldsTask } from "@/store/tars-owned-control";
import type { AppState } from "@/store/app-store.types";
import { buildWorkspaceSessionStateFromShell } from "@/store/workspace-session-state";
import { getWorkspaceSessionForState } from "@/store/workspace-runtime-state";
import { RENDERER_SESSION_STARTED_AT } from "@/store/task-work-pause";
import { buildRestartContinuationPrompt, canRecoverOrdinaryTask, restartContinuationDecision, type InterruptedTask } from "@/store/restart-continuation";

type Actions = Pick<AppState, "recoverInterruptedTasks" | "continueInterruptedTask" | "dismissInterruptedTasks">;

export function createRestartContinuationActions({ set, get, flushPersistence }: { set: StoreApi<AppState>["setState"]; get: () => AppState; flushPersistence: () => boolean }): Actions {
  let recovering: Promise<void> | undefined;
  let recovered = false;
  const inFlight = new Set<string>();
  const consume = (turnId: string) => {
    set(state => ({ restartRecovery: { ...state.restartRecovery, consumedTurnIds: [...new Set([...state.restartRecovery.consumedTurnIds, turnId])].slice(-10000) } }));
    return flushPersistence();
  };
  const readCandidate = async (item: InterruptedTask) => {
    const [shell, page, turns, assignments, runs, latest] = await Promise.all([
      loadWorkspaceShellForRestore({ workspaceId: item.workspaceId }),
      loadTaskMessagesPage({ workspaceId: item.workspaceId, taskId: item.taskId, preserveStreaming: true, limit: 500 }),
      listActiveWorkspaceTurns({ workspaceId: item.workspaceId }),
      window.api?.agents?.listAssignments({ limit: 500 }),
      window.api?.agentRuns?.list({ workspaceId: item.workspaceId, includeActive: true }),
      window.api?.persistence?.listTaskTurns ? listTaskTurns({ workspaceId: item.workspaceId, taskId: item.taskId, limit: 1 }) : Promise.resolve(null),
    ]);
    const task = shell?.tasks.find(row => row.id === item.taskId);
    const interruptedByClosing = get().restartPendingTasks?.some(row => row.turnId === item.turnId) &&
      latest?.[0]?.id === item.turnId && ["user_abort", "runtime_failure"].includes(latest[0].terminalReceipt?.stopReason ?? "");
    if (!shell || !task || (!interruptedByClosing && !turns.some(turn => turn.id === item.turnId && !turn.completedAt))) return null;
    if (latest && latest[0]?.id !== item.turnId) return null;
    // Missing ownership information is not permission to start an ordinary turn.
    if ((window.api?.agents && !assignments?.ok) || (window.api?.agentRuns && !runs?.ok)) return null;
    if (assignments?.ok && assignments.value.length >= 500 && !assignments.value.some(row => row.taskId === item.taskId)) return null;
    const owned = Boolean(assignments?.ok && assignments.value.some(row => row.taskId === item.taskId && !row.endedAt)) ||
      Boolean(runs?.agentRuns.some(run => run.leadTaskId === item.taskId && isActiveAgentRunState(run.state))) ||
      await tarsHoldsTask({ taskId: item.taskId, workspaceId: item.workspaceId });
    if (!canRecoverOrdinaryTask({ task, messages: page.messages, stopped: get().restartRecovery.stoppedTurnIds.includes(item.turnId), owned })) return null;
    const session = getWorkspaceSessionForState({ state: get(), workspaceId: item.workspaceId });
    if (session?.activeTurnIdsByTask[item.taskId]) return null;
    const currentTask = session?.tasks.find(row => row.id === item.taskId) ?? task;
    if (!canRecoverOrdinaryTask({ task: currentTask, messages: session?.messagesByTask[item.taskId] ?? page.messages, stopped: get().restartRecovery.stoppedTurnIds.includes(item.turnId), owned })) return null;
    return { task, shell, page, session };
  };
  const continueInterruptedTask: Actions["continueInterruptedTask"] = async ({ taskId, automatic = false }) => {
    const item = get().interruptedTasks.find(row => row.taskId === taskId);
    if (!item || inFlight.has(taskId)) return;
    inFlight.add(taskId);
    try {
      const candidate = await readCandidate(item);
      if (!candidate || !get().interruptedTasks.some(row => row.turnId === item.turnId)) return;
      if (automatic && restartContinuationDecision(get().settings.restartContinuation, get().restartRecovery.automaticTimesByTask[taskId] ?? [], Date.now()) !== "continue") return;
      const session = candidate.session ?? buildWorkspaceSessionStateFromShell({ shell: candidate.shell });
      // Restore the owning session without replacing the visible workspace.
      set(state => ({
        taskWorkspaceIdById: { ...state.taskWorkspaceIdById, [taskId]: item.workspaceId },
        ...(item.workspaceId === state.activeWorkspaceId ? { messagesByTask: { ...state.messagesByTask, [taskId]: candidate.page.messages }, messageCountByTask: { ...state.messageCountByTask, [taskId]: candidate.page.totalCount } } : {}),
        ...(item.workspaceId !== state.activeWorkspaceId ? { workspaceRuntimeCacheById: { ...state.workspaceRuntimeCacheById, [item.workspaceId]: { ...session, messagesByTask: { ...session.messagesByTask, [taskId]: candidate.page.messages } } } } : {}),
        ...(automatic ? { restartRecovery: { ...state.restartRecovery, automaticTimesByTask: { ...state.restartRecovery.automaticTimesByTask, [taskId]: [...(state.restartRecovery.automaticTimesByTask[taskId] ?? []).filter(time => time > Date.now() - 300000), Date.now()].slice(-3) } } } : {}),
      }));
      // Consume durably before sending, so a second startup never catches this turn up twice.
      if (!consume(item.turnId)) return;
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
      const summaries = await listWorkspaceSummaries();
      const items: InterruptedTask[] = [];
      for (const workspace of summaries) {
        const [shell, turns] = await Promise.all([loadWorkspaceShellForRestore({ workspaceId: workspace.id }), listActiveWorkspaceTurns({ workspaceId: workspace.id })]);
        for (const turn of turns) {
          if (turn.completedAt || Date.parse(turn.createdAt) >= RENDERER_SESSION_STARTED_AT || get().restartRecovery.consumedTurnIds.includes(turn.id)) continue;
          const task = shell?.tasks.find(row => row.id === turn.taskId);
          if (!task || isTaskArchived(task)) continue;
          const item = { taskId: task.id, title: task.title, workspaceId: workspace.id, providerId: turn.providerId, turnId: turn.id };
          if (await readCandidate(item)) items.push(item);
        }
      }
      for (const item of get().restartPendingTasks ?? []) {
        if (!items.some(row => row.turnId === item.turnId) && !get().restartRecovery.consumedTurnIds.includes(item.turnId) && await readCandidate(item)) items.push(item);
      }
      recovered = true;
      set({ interruptedTasks: items });
      for (const item of items) {
        const decision = restartContinuationDecision(get().settings.restartContinuation, get().restartRecovery.automaticTimesByTask[item.taskId] ?? [], Date.now());
        if (decision === "ignore") { consume(item.turnId); set(state => ({ interruptedTasks: state.interruptedTasks.filter(row => row.turnId !== item.turnId) })); }
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
      for (const item of dismissed) consume(item.turnId);
      set(state => ({ interruptedTasks: state.interruptedTasks.filter(item => taskId && item.taskId !== taskId) }));
    },
  };
}
