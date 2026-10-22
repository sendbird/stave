import { i18n } from "@/i18n/runtime";
import { loadTaskMessagesPage, loadWorkspaceShell } from "@/lib/db/workspaces.db";
import { listActiveWorkspaceTurns } from "@/lib/db/turns.db";
import {
  resolveFleetCurrentTaskControlState,
  validateFleetInteractionAction,
  type FleetInteractionControlIdentity,
} from "@/lib/fleet/control-plane";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage, Task } from "@/types/chat";
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

/** One task's state as a load left it, and when. */
interface LoadWrite {
  seq: number;
  task: Task | undefined;
  messages: ChatMessage[] | undefined;
  turnId: string | undefined;
}

// Loads of one workspace can overlap (two Fleet rows, a row and a delegated
// child's slot). Each write is remembered while another load of the same
// workspace is still reading, so that load can tell this hydration from a
// provider update that landed during its read. Dropped once none is reading.
let loadWriteSeq = 0;
const lastLoadWrites = new Map<string, Map<string, LoadWrite>>();
const loadsInFlight = new Map<string, number>();

function rememberLoadWrite(
  workspaceId: string,
  session: { tasks: Task[]; messagesByTask: Record<string, ChatMessage[]>; activeTurnIdsByTask: Record<string, string | undefined> },
) {
  loadWriteSeq += 1;
  const writes = lastLoadWrites.get(workspaceId) ?? new Map<string, LoadWrite>();
  for (const task of session.tasks) {
    writes.set(task.id, {
      seq: loadWriteSeq,
      task,
      messages: session.messagesByTask[task.id],
      turnId: session.activeTurnIdsByTask[task.id],
    });
  }
  lastLoadWrites.set(workspaceId, writes);
}

function finishLoad(workspaceId: string) {
  const left = (loadsInFlight.get(workspaceId) ?? 1) - 1;
  if (left > 0) {
    loadsInFlight.set(workspaceId, left);
    return;
  }
  loadsInFlight.delete(workspaceId);
  lastLoadWrites.delete(workspaceId);
}

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
  loadsInFlight.set(expected.workspaceId, (loadsInFlight.get(expected.workspaceId) ?? 0) + 1);
  try {
    await readAndMerge(expected, reads, before);
  } finally {
    finishLoad(expected.workspaceId);
  }
}

async function readAndMerge(
  expected: FleetInteractionControlIdentity,
  reads: FleetInteractionReads,
  before: ReturnType<typeof useAppStore.getState>,
) {
  const beforeSession = getWorkspaceSessionForState({
    state: before,
    workspaceId: expected.workspaceId,
  });
  const seqAtStart = loadWriteSeq;
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
  const loadedTask = loaded.tasks.find((candidate) => candidate.id === expected.taskId) ?? task;
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
    // The baseline is the task as this read found it, or as another load of
    // the workspace left it since: that load's hydration is not an update.
    const written = lastLoadWrites.get(expected.workspaceId)?.get(expected.taskId);
    const baseline: Omit<LoadWrite, "seq"> =
      written && written.seq > seqAtStart
        ? written
        : {
            task: beforeSession?.tasks.find((item) => item.id === expected.taskId),
            messages: beforeSession?.messagesByTask[expected.taskId],
            turnId: beforeSession?.activeTurnIdsByTask[expected.taskId],
          };
    if (
      current?.tasks.find((item) => item.id === expected.taskId) !== baseline.task ||
      current?.messagesByTask[expected.taskId] !== baseline.messages ||
      current?.activeTurnIdsByTask[expected.taskId] !== baseline.turnId
    ) {
      return {};
    }
    // A workspace nobody had loaded takes the whole read (every task's turn
    // and count); a loaded one keeps its live state and gains this task.
    const next = current
      ? {
          ...current,
          tasks: current.tasks.some((item) => item.id === loadedTask.id)
            ? current.tasks.map((item) => (item.id === loadedTask.id ? loadedTask : item))
            : [...current.tasks, loadedTask],
          messagesByTask: {
            ...current.messagesByTask,
            [expected.taskId]: page.messages,
          },
          messageCountByTask: {
            ...current.messageCountByTask,
            [expected.taskId]: page.totalCount,
          },
          activeTurnIdsByTask: {
            ...current.activeTurnIdsByTask,
            [expected.taskId]: loaded.activeTurnIdsByTask[expected.taskId],
          },
        }
      : {
          ...loaded,
          messageCountByTask: {
            ...loaded.messageCountByTask,
            [expected.taskId]: page.totalCount,
          },
        };
    rememberLoadWrite(expected.workspaceId, next);
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
