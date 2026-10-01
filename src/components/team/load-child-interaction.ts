import { loadTaskMessagesPage, loadWorkspaceShell } from "@/lib/db/workspaces.db";
import { listActiveWorkspaceTurns } from "@/lib/db/turns.db";
import { resolveFleetCurrentTaskControlState, validateFleetInteractionAction, type FleetInteractionControlIdentity } from "@/lib/fleet/control-plane";
import { useAppStore } from "@/store/app.store";
import { buildWorkspaceSessionStateFromShell } from "@/store/workspace-session-state";
import { evictColdWorkspaceRuntimeCacheEntries, getWorkspaceSessionForState } from "@/store/workspace-runtime-state";

/** Bounded, on-demand request read. Never selects a task or switches a workspace. */
const persistenceReads = { loadWorkspaceShell, loadTaskMessagesPage, listActiveWorkspaceTurns };
export async function loadChildInteraction(expected: FleetInteractionControlIdentity, reads = persistenceReads) {
  let before = useAppStore.getState();
  if (validateFleetInteractionAction({ expected, current: resolveFleetCurrentTaskControlState({ state: before, expected }) }).ok) return;
  if (before.repositoryPath !== expected.repositoryPath) throw new Error("The parent repository changed. Reopen the request from its parent.");
  if (!before.workspaces.some(workspace => workspace.id === expected.workspaceId)) {
    await before.refreshWorkspaces();
    before = useAppStore.getState();
  }
  const beforeSession = getWorkspaceSessionForState({ state: before, workspaceId: expected.workspaceId });
  const [shell, page, turns] = await Promise.all([
    reads.loadWorkspaceShell({ workspaceId: expected.workspaceId }),
    reads.loadTaskMessagesPage({ workspaceId: expected.workspaceId, taskId: expected.taskId, limit: 120, preserveStreaming: true }),
    reads.listActiveWorkspaceTurns({ workspaceId: expected.workspaceId, limit: 200 }),
  ]);
  const task = shell?.tasks.find(task => task.id === expected.taskId);
  if (!shell || !task) throw new Error("This child task is no longer available.");
  const loaded = buildWorkspaceSessionStateFromShell({ shell, messagesByTask: { [expected.taskId]: page.messages }, latestTurns: turns });
  useAppStore.setState(state => {
    const ownership = state.taskWorkspaceIdById[expected.taskId];
    if (state.repositoryPath !== expected.repositoryPath || (ownership && ownership !== expected.workspaceId)) return {};
    const current = getWorkspaceSessionForState({ state, workspaceId: expected.workspaceId });
    // Provider events arriving during the read win over persisted messages.
    if (current?.tasks.find(item => item.id === expected.taskId) !== beforeSession?.tasks.find(item => item.id === expected.taskId) ||
      current?.messagesByTask[expected.taskId] !== beforeSession?.messagesByTask[expected.taskId] ||
      current?.activeTurnIdsByTask[expected.taskId] !== beforeSession?.activeTurnIdsByTask[expected.taskId]) return {};
    const next = { ...(current ?? loaded),
      tasks: current ? current.tasks.some(item => item.id === task.id) ? current.tasks.map(item => item.id === task.id ? task : item) : [...current.tasks, task] : loaded.tasks,
      messagesByTask: { ...current?.messagesByTask, [expected.taskId]: page.messages },
      messageCountByTask: { ...current?.messageCountByTask, [expected.taskId]: page.totalCount },
      activeTurnIdsByTask: { ...current?.activeTurnIdsByTask, [expected.taskId]: loaded.activeTurnIdsByTask[expected.taskId] },
    };
    const mapping = { ...state.taskWorkspaceIdById, [expected.taskId]: expected.workspaceId };
    return state.activeWorkspaceId === expected.workspaceId
      ? { tasks: next.tasks, messagesByTask: next.messagesByTask, messageCountByTask: next.messageCountByTask, activeTurnIdsByTask: next.activeTurnIdsByTask, taskWorkspaceIdById: mapping }
      : { workspaceRuntimeCacheById: evictColdWorkspaceRuntimeCacheEntries({ cache: { ...state.workspaceRuntimeCacheById, [expected.workspaceId]: next }, activeWorkspaceId: state.activeWorkspaceId }), taskWorkspaceIdById: mapping };
  });
}
