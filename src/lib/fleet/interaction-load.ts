import { i18n } from "@/i18n/runtime";
import { loadTaskMessagesPage, loadWorkspaceShell } from "@/lib/db/workspaces.db";
import { listActiveWorkspaceTurns } from "@/lib/db/turns.db";
import {
  resolveFleetCurrentTaskControlState,
  validateFleetInteractionAction,
  type FleetInteractionControlIdentity,
} from "@/lib/fleet/control-plane";
import { useAppStore } from "@/store/app.store";
import { buildWorkspaceSessionStateFromShell } from "@/store/workspace-session-state";
import {
  evictColdWorkspaceRuntimeCacheEntries,
  getWorkspaceSessionForState,
} from "@/store/workspace-runtime-state";

const persistenceReads = {
  loadWorkspaceShell,
  loadTaskMessagesPage,
  listActiveWorkspaceTurns,
};
export type FleetInteractionReads = typeof persistenceReads;

/** True when the request's repository is not the one this window has open. */
export function isOtherRepositoryInteraction(
  expected: Pick<FleetInteractionControlIdentity, "repositoryPath">,
  state: { repositoryPath: string | null } = useAppStore.getState(),
) {
  return state.repositoryPath !== expected.repositoryPath;
}

/**
 * Loads the task that owns a pending request so it can be answered where the
 * request is shown — a Fleet row, a parent's slot for a delegated child —
 * without selecting the task or switching workspaces.
 *
 * Bounded and on demand: nothing is read when the request is already loaded
 * and pending, and only the task's shell, one page of its messages and the
 * workspace's active turns are read otherwise. The read lands in the runtime
 * cache (or the active session); provider events that arrive during the read
 * win over the persisted snapshot. Only a task of the open repository can be
 * loaded; another repository's request is answered by opening it.
 */
export async function loadFleetInteraction(
  expected: FleetInteractionControlIdentity,
  reads: FleetInteractionReads = persistenceReads,
) {
  let before = useAppStore.getState();
  if (
    validateFleetInteractionAction({
      expected,
      current: resolveFleetCurrentTaskControlState({ state: before, expected }),
    }).ok
  ) {
    return;
  }
  if (isOtherRepositoryInteraction(expected, before)) {
    throw new Error(i18n.t("fleet:inlineAnswer.otherRepository"));
  }
  if (!before.workspaces.some((workspace) => workspace.id === expected.workspaceId)) {
    await before.refreshWorkspaces();
    before = useAppStore.getState();
  }
  const beforeSession = getWorkspaceSessionForState({
    state: before,
    workspaceId: expected.workspaceId,
  });
  const [shell, page, turns] = await Promise.all([
    reads.loadWorkspaceShell({ workspaceId: expected.workspaceId }),
    reads.loadTaskMessagesPage({
      workspaceId: expected.workspaceId,
      taskId: expected.taskId,
      limit: 120,
      preserveStreaming: true,
    }),
    reads.listActiveWorkspaceTurns({
      workspaceId: expected.workspaceId,
      limit: 200,
    }),
  ]);
  const task = shell?.tasks.find((candidate) => candidate.id === expected.taskId);
  if (!shell || !task) {
    throw new Error(i18n.t("fleet:inlineAnswer.taskUnavailable"));
  }
  const loaded = buildWorkspaceSessionStateFromShell({
    shell,
    messagesByTask: { [expected.taskId]: page.messages },
    latestTurns: turns,
  });
  useAppStore.setState((state) => {
    const ownership = state.taskWorkspaceIdById[expected.taskId];
    if (
      state.repositoryPath !== expected.repositoryPath ||
      (ownership && ownership !== expected.workspaceId)
    ) {
      return {};
    }
    const current = getWorkspaceSessionForState({
      state,
      workspaceId: expected.workspaceId,
    });
    // Provider events arriving during the read win over persisted messages.
    if (
      current?.tasks.find((item) => item.id === expected.taskId) !==
        beforeSession?.tasks.find((item) => item.id === expected.taskId) ||
      current?.messagesByTask[expected.taskId] !==
        beforeSession?.messagesByTask[expected.taskId] ||
      current?.activeTurnIdsByTask[expected.taskId] !==
        beforeSession?.activeTurnIdsByTask[expected.taskId]
    ) {
      return {};
    }
    const next = {
      ...(current ?? loaded),
      tasks: current
        ? current.tasks.some((item) => item.id === task.id)
          ? current.tasks.map((item) => (item.id === task.id ? task : item))
          : [...current.tasks, task]
        : loaded.tasks,
      messagesByTask: {
        ...current?.messagesByTask,
        [expected.taskId]: page.messages,
      },
      messageCountByTask: {
        ...current?.messageCountByTask,
        [expected.taskId]: page.totalCount,
      },
      activeTurnIdsByTask: {
        ...current?.activeTurnIdsByTask,
        [expected.taskId]: loaded.activeTurnIdsByTask[expected.taskId],
      },
    };
    const mapping = {
      ...state.taskWorkspaceIdById,
      [expected.taskId]: expected.workspaceId,
    };
    return state.activeWorkspaceId === expected.workspaceId
      ? {
          tasks: next.tasks,
          messagesByTask: next.messagesByTask,
          messageCountByTask: next.messageCountByTask,
          activeTurnIdsByTask: next.activeTurnIdsByTask,
          taskWorkspaceIdById: mapping,
        }
      : {
          workspaceRuntimeCacheById: evictColdWorkspaceRuntimeCacheEntries({
            cache: {
              ...state.workspaceRuntimeCacheById,
              [expected.workspaceId]: next,
            },
            activeWorkspaceId: state.activeWorkspaceId,
          }),
          taskWorkspaceIdById: mapping,
        };
  });
}
